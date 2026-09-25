"""Turns EdPy source into a CPython 3 module with EdPy semantics.

1. check()     a static guard against constructs EdPy rejects (best effort; the real compiler is the authority)
2. fold        constant folding like the EdPy optimiser, then EdPy's literal range check (-32767 .. 32767)
3. rewrite     every arithmetic operator becomes a call into the runtime, which applies 16-bit and floor-division
               semantics; every loop body starts with a tick (step budget, virtual time); a marker call is inserted
               after the fixed setup block of generated programs

The runtime object is available to the program as the global name `__edtest__`.
"""

import ast
import copy
import operator

from . import values as V
from .errors import EdPyCompatibilityError

RUNTIME = '__edtest__'

_BINOPS = {
    ast.Add: 'Add', ast.Sub: 'Sub', ast.Mult: 'Mult', ast.Div: 'Div', ast.FloorDiv: 'FloorDiv', ast.Mod: 'Mod',
    ast.LShift: 'LShift', ast.RShift: 'RShift', ast.BitAnd: 'BitAnd', ast.BitOr: 'BitOr', ast.BitXor: 'BitXor',
}
_UNOPS = {ast.USub: 'USub', ast.UAdd: 'UAdd', ast.Invert: 'Invert'}

# EdPy folds with Python 2.7 semantics on the Edison website (floor division for ints); see edpy-reference.md 4.2/4.3
FOLD = {
    'Add': operator.add, 'Sub': operator.sub, 'Mult': operator.mul, 'Div': operator.floordiv, 'FloorDiv': operator.floordiv,
    'Mod': operator.mod, 'LShift': operator.lshift, 'RShift': operator.rshift, 'BitAnd': operator.and_,
    'BitOr': operator.or_, 'BitXor': operator.xor,
}
FOLD_UNARY = {'USub': operator.neg, 'UAdd': operator.pos, 'Invert': operator.invert}

_ALLOWED_STMTS = (ast.Expr, ast.Assign, ast.AugAssign, ast.If, ast.While, ast.For, ast.Break, ast.Continue, ast.Pass,
                  ast.Return, ast.Global, ast.FunctionDef, ast.Import)


def _is_int(node):
    return isinstance(node, ast.Constant) and isinstance(node.value, int)


def _is_ed_call(node, name=None):
    return (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name)
            and node.func.value.id == 'Ed' and (name is None or node.func.attr == name))


# ---------------------------------------------------------------------- 1. static EdPy-subset guard

class _Checker(ast.NodeVisitor):
    def __init__(self):
        self.problems = []
        self.functions = set()
        self._depth = 0
        self._allowed_strings = set()
        self._allowed_lists = set()

    def problem(self, node, msg):
        self.problems.append((getattr(node, 'lineno', None), msg))

    def visit_Module(self, node):
        self.functions = set(s.name for s in node.body if isinstance(s, ast.FunctionDef))
        seen_def = False
        for stmt in node.body:
            if isinstance(stmt, ast.FunctionDef):
                seen_def = True
            elif isinstance(stmt, ast.Import) and seen_def:
                self.problem(stmt, 'imports must be before functions and classes')
        self._statements(node.body)

    def _statements(self, body):
        for stmt in body:
            if not isinstance(stmt, _ALLOWED_STMTS):
                self.problem(stmt, '%s statement not supported in Ed.Py' % type(stmt).__name__)
            else:
                self.visit(stmt)

    def visit_Import(self, node):
        if self._depth or [(a.name, a.asname) for a in node.names] != [('Ed', None)]:
            self.problem(node, 'only the Ed module can be imported (as "import Ed", at the top)')

    def visit_FunctionDef(self, node):
        if self._depth:
            self.problem(node, 'nested functions are not supported in Ed.Py')
        a = node.args
        if (node.decorator_list or a.vararg or a.kwarg or a.kwonlyargs or a.defaults or a.kw_defaults
                or getattr(a, 'posonlyargs', [])):
            self.problem(node, 'function %s: only plain positional parameters are supported in Ed.Py' % node.name)
        for i, stmt in enumerate(node.body):
            if isinstance(stmt, ast.Global) and i != 0:
                self.problem(stmt, 'globals must be first in functions')
        self._depth += 1
        self._statements(node.body)
        self._depth -= 1

    def visit_If(self, node):
        self.visit(node.test)
        self._statements(node.body)
        self._statements(node.orelse)

    def visit_While(self, node):
        if node.orelse:
            self.problem(node, 'WHILE code too complex for Ed.Py (while ... else)')
        self.visit(node.test)
        self._statements(node.body)

    def visit_For(self, node):
        if node.orelse:
            self.problem(node, 'FOR code too complex for Ed.Py (for ... else)')
        if not isinstance(node.target, ast.Name):
            self.problem(node, 'the loop variable of a for loop must be a plain name')
        it = node.iter
        if isinstance(it, ast.Call) and isinstance(it.func, ast.Name) and it.func.id == 'range':
            if not 1 <= len(it.args) <= 3 or it.keywords:
                self.problem(it, 'range() takes 1 to 3 arguments')
            for arg in it.args:
                self.visit(arg)
        elif not isinstance(it, ast.Name):
            self.problem(it, 'a for loop must iterate over range(...) or a list/tune string variable')
        self._statements(node.body)

    def visit_Assign(self, node):
        if len(node.targets) != 1:
            self.problem(node, 'chained assignment is not supported in Ed.Py')
        for t in node.targets:
            self._target(t)
            if isinstance(t, ast.Attribute) and self._depth:
                self.problem(node, 'Ed.%s can only be set in __main__' % t.attr)
        if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str) and len(node.value.value) == 1 \
                and isinstance(node.targets[0], ast.Subscript):
            self._allowed_strings.add(id(node.value))  # ts[i] = 'a'
        self.visit(node.value)

    def visit_AugAssign(self, node):
        self._target(node.target)
        if isinstance(node.op, (ast.Pow, ast.MatMult)):
            self.problem(node, '%s is not supported in Ed.Py' % type(node.op).__name__)
        self.visit(node.value)

    def _target(self, t):
        if isinstance(t, ast.Name):
            return
        if isinstance(t, ast.Subscript):
            self.visit(t)
        elif isinstance(t, ast.Attribute) and isinstance(t.value, ast.Name) and t.value.id == 'Ed':
            if t.attr not in V.SETUP_VARIABLES:
                self.problem(t, 'Ed.Py constant Ed.%s can not be written' % t.attr)
        else:
            self.problem(t, '%s assignment target not supported in Ed.Py' % type(t).__name__)

    def visit_Return(self, node):
        if node.value is not None:
            self.visit(node.value)

    def visit_Global(self, node):
        if not self._depth:
            self.problem(node, 'global is only valid inside a function')

    def visit_Expr(self, node):
        self.visit(node.value)

    def visit_Break(self, node):
        pass

    visit_Continue = visit_Pass = visit_Break

    # expressions

    def generic_visit(self, node):
        if isinstance(node, ast.expr):
            self.problem(node, _unsupported_expr_message(node))
            return
        super(_Checker, self).generic_visit(node)

    def visit_Constant(self, node):
        v = node.value
        if isinstance(v, bool) or isinstance(v, int):
            return
        if isinstance(v, str) and id(node) in self._allowed_strings:
            return
        if isinstance(v, float):
            self.problem(node, 'constant %r must be an integer value' % v)
        elif isinstance(v, str):
            self.problem(node, 'String not allowed here (only in Ed.TuneString)')
        else:
            self.problem(node, 'constant %r not supported in Ed.Py' % (v,))

    def visit_Name(self, node):
        pass

    def visit_Attribute(self, node):
        if not (isinstance(node.value, ast.Name) and node.value.id == 'Ed'):
            self.problem(node, 'attribute access is only supported on the Ed module')
        elif node.attr not in V.CONSTANTS and node.attr not in V.SIGNATURES and node.attr not in V.SETUP_VARIABLES:
            self.problem(node, 'Unknown Ed function or constant Ed.%s' % node.attr)

    def visit_BinOp(self, node):
        if type(node.op) not in _BINOPS:
            self.problem(node, '%s is not supported in Ed.Py (the Lab uses a _pow helper for powers)' % type(node.op).__name__)
        self.visit(node.left)
        self.visit(node.right)

    def visit_UnaryOp(self, node):
        self.visit(node.operand)

    def visit_BoolOp(self, node):
        self.problem(node, "'and'/'or' don't compile in Ed.Py (the Lab generates '&'/'|' instead)")

    def visit_Compare(self, node):
        if len(node.ops) != 1:
            self.problem(node, 'COMPARE code too complex for Ed.Py (chained comparison)')
        for op in node.ops:
            if isinstance(op, (ast.In, ast.NotIn, ast.Is, ast.IsNot)):
                self.problem(node, 'In/Is not supported in Ed.Py')
        self.visit(node.left)
        for c in node.comparators:
            self.visit(c)

    def visit_Subscript(self, node):
        index = node.slice.value if isinstance(node.slice, getattr(ast, 'Index', ())) else node.slice
        if isinstance(index, ast.Slice):
            self.problem(node, 'slices are not supported in Ed.Py')
        self.visit(node.value)
        self.visit(index)

    def visit_Call(self, node):
        if node.keywords:
            self.problem(node, 'keyword arguments are not supported in Ed.Py')
        f = node.func
        if isinstance(f, ast.Name):
            if f.id == 'range':
                self.problem(node, 'range() is only allowed as the iterable of a for loop')
            elif f.id not in self.functions and f.id not in V.BUILTINS:
                self.problem(node, 'Unknown function %s' % f.id)
        elif isinstance(f, ast.Attribute):
            self.visit(f)
            if _is_ed_call(node, 'TuneString') and len(node.args) == 2 and isinstance(node.args[1], ast.Constant):
                self._allowed_strings.add(id(node.args[1]))
            if _is_ed_call(node, 'RegisterEventHandler') and len(node.args) == 2 and isinstance(node.args[1], ast.Constant):
                self._allowed_strings.add(id(node.args[1]))
            if _is_ed_call(node, 'List') and len(node.args) == 2 and isinstance(node.args[1], ast.List):
                self._allowed_lists.add(id(node.args[1]))
        else:
            self.problem(node, 'only functions and Ed functions can be called')
        for arg in node.args:
            self.visit(arg)

    def visit_List(self, node):
        if id(node) not in self._allowed_lists:
            self.problem(node, 'list literals are only supported as the initial values of Ed.List')
        for e in node.elts:
            if not (_is_int(e) or (isinstance(e, ast.UnaryOp) and _is_int(e.operand))):
                self.problem(e, 'Ed.List initial values must be int constants')


def _unsupported_expr_message(node):
    names = {'IfExp': 'IfExp expr', 'ListComp': 'ListComp expr', 'Tuple': 'Tuple expr', 'Lambda': 'lambda',
             'Dict': 'dict', 'Set': 'set', 'JoinedStr': 'f-string', 'Starred': 'starred expression'}
    kind = type(node).__name__
    return 'Syntax Error, %s not supported in Ed.Py' % names.get(kind, kind)


def check(tree):
    """Returns [(line, message)] for constructs EdPy rejects. Empty doesn't prove the program compiles."""
    c = _Checker()
    c.visit(tree)
    return sorted(c.problems, key=lambda p: (p[0] or 0))


# ---------------------------------------------------------------------- 2. + 3. folding and rewriting

class _Rewriter(ast.NodeTransformer):
    def __init__(self):
        self.problems = []

    def _runtime_call(self, method, args, like):
        call = ast.Call(func=ast.Attribute(value=ast.Name(id=RUNTIME, ctx=ast.Load()), attr=method, ctx=ast.Load()),
                        args=args, keywords=[])
        return ast.copy_location(call, like)

    def visit_BinOp(self, node):
        self.generic_visit(node)
        op = _BINOPS.get(type(node.op))
        if op is None:
            return node  # reported by the checker
        if _is_int(node.left) and _is_int(node.right):
            try:
                return ast.copy_location(ast.Constant(value=FOLD[op](node.left.value, node.right.value)), node)
            except ZeroDivisionError:
                self.problems.append((node.lineno, 'division by zero in a constant expression (the EdPy compiler crashes)'))
                return node
            except ValueError:
                self.problems.append((node.lineno, 'invalid constant shift'))
                return node
        return self._runtime_call('binop', [ast.Constant(value=op), node.left, node.right], node)

    def visit_UnaryOp(self, node):
        self.generic_visit(node)
        op = _UNOPS.get(type(node.op))
        if op is None:
            return node  # `not`: CPython returns a bool, EdPy 0/1, which compare equal
        if _is_int(node.operand):
            return ast.copy_location(ast.Constant(value=FOLD_UNARY[op](node.operand.value)), node)
        return self._runtime_call('unop', [ast.Constant(value=op), node.operand], node)

    def visit_AugAssign(self, node):
        # x op= v  ->  x = x op v  (a subscript target's index is evaluated twice)
        load_target = _as_load(node.target)
        assign = ast.Assign(targets=[node.target], value=ast.copy_location(ast.BinOp(left=load_target, op=node.op, right=node.value), node))
        ast.copy_location(assign, node)
        return self.visit(assign)

    def _tick_body(self, node):
        self.generic_visit(node)
        tick = ast.copy_location(ast.Expr(value=self._runtime_call('tick', [], node)), node)
        node.body.insert(0, tick)
        return node

    visit_While = _tick_body
    visit_For = _tick_body


def _as_load(target):
    load = copy.deepcopy(target)
    load.ctx = ast.Load()
    return load


def _literal_range_problems(tree):
    problems = []
    for node in ast.walk(tree):
        if _is_int(node) and not isinstance(node.value, bool) and abs(node.value) > V.LITERAL_MAX:
            problems.append((getattr(node, 'lineno', None), 'constant %d is out of range' % node.value))
    return problems


def setup_end_index(body):
    """Index after the fixed setup block of a generated program (EdisonPythonVisitor.visitorGenerateGlobalVariables):
    the first top-level `Ed.TimeWait(...)` after `Ed.EdisonVersion = ...`. None if there's no such block."""
    version = None
    for i, stmt in enumerate(body):
        if (isinstance(stmt, ast.Assign) and isinstance(stmt.targets[0], ast.Attribute)
                and stmt.targets[0].attr == 'EdisonVersion'):
            version = i
        elif version is not None and isinstance(stmt, ast.Expr) and _is_ed_call(stmt.value, 'TimeWait'):
            return i + 1
    return None


def transform(tree):
    """Folds and rewrites `tree` in place. Returns [(line, message)] of compile-time problems found while folding."""
    rewriter = _Rewriter()
    rewriter.visit(tree)
    problems = rewriter.problems + _literal_range_problems(tree)
    end = setup_end_index(tree.body)
    if end is not None:
        anchor = tree.body[end - 1]
        marker = ast.copy_location(ast.Expr(value=rewriter._runtime_call('setup_done', [], anchor)), anchor)
        tree.body.insert(end, marker)
    ast.fix_missing_locations(tree)
    return problems


def _is_runtime_stmt(stmt):
    return (isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Call) and isinstance(stmt.value.func, ast.Attribute)
            and isinstance(stmt.value.func.value, ast.Name) and stmt.value.func.value.id == RUNTIME)


def instrument_statements(tree):
    """Inserts `__edtest__.stmt(k)` before every statement of the program (not before `global` and not before the
    statements the transformer added). Returns the positions of the statements: a list, index k ->
    (lineno, end_lineno, col_offset, end_col_offset), with col offsets in UTF-8 bytes like CPython's."""
    positions = []

    def suite(body):
        result = []
        for stmt in body:
            for field in ('body', 'orelse'):
                if isinstance(getattr(stmt, field, None), list) and not isinstance(stmt, ast.Module):
                    setattr(stmt, field, suite(getattr(stmt, field)))
            if not isinstance(stmt, ast.Global) and not _is_runtime_stmt(stmt):
                hook = ast.Expr(value=ast.Call(func=ast.Attribute(value=ast.Name(id=RUNTIME, ctx=ast.Load()), attr='stmt',
                                                                  ctx=ast.Load()), args=[ast.Constant(value=len(positions))], keywords=[]))
                positions.append((stmt.lineno, stmt.end_lineno, stmt.col_offset, stmt.end_col_offset))
                result.append(ast.copy_location(hook, stmt))
            result.append(stmt)
        return result

    tree.body = suite(tree.body)
    ast.fix_missing_locations(tree)
    return positions


def check_and_transform(source, filename, instrument=False):
    """Parses, checks and transforms. Returns (tree, problems, statement positions or None)."""
    try:
        tree = ast.parse(source, filename)
    except SyntaxError as e:
        raise EdPyCompatibilityError('Syntax error: %s' % e.msg, e.lineno, e.text, kind='syntax')
    problems = check(tree)
    problems += transform(tree)
    statements = instrument_statements(tree) if instrument else None
    return tree, sorted(problems, key=lambda p: (p[0] or 0)), statements
