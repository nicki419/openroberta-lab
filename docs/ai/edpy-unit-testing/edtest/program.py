"""Loading and running a generated EdPy program.

    program = EdProgram.from_file('clap_counter.py')   # parse, EdPy-subset check, transform
    result = program.run(robot)                         # whole program, top-level code included
    session = program.load(robot)                       # only helpers, setup, globals and functions; then
    session.call('clampSpeed', 150)                     # call a NEPO function by its NEPO name

Names: the Lab generates `___x` for a NEPO variable (or parameter) `x` and `____f` for a NEPO function `f`. This module
maps them back, so tests use the names the learner sees.
"""

import ast
import linecache
import sys

from .containers import EdList, TuneString
from .ed_module import EdModule
from .errors import EdPyCompatibilityError, EdPyRuntimeError, EdTestError, StepLimitExceeded, StopProgram
from .robot import Robot
from .transform import FOLD, RUNTIME, check_and_transform
from . import values as V

VAR_PREFIX = '___'
FUNC_PREFIX = '____'


class Runtime(object):
    """The `__edtest__` object the transformed program calls for arithmetic, loop ticks and the setup marker."""

    def __init__(self, robot, overflow='raise'):
        if overflow not in ('raise', 'wrap'):
            raise ValueError("overflow must be 'raise' or 'wrap'")
        self.robot = robot
        self.overflow = overflow

    def binop(self, op, a, b):
        _operand(a, op)
        _operand(b, op)
        if op in ('Div', 'FloorDiv', 'Mod') and b == 0:
            raise EdPyRuntimeError('division by zero (%s %s 0); the robot behaviour is unspecified' % (a, _SYMBOL[op]))
        if op in ('LShift', 'RShift') and not 0 <= b <= 15:
            raise EdPyRuntimeError('shift count %d out of range (the firmware raises OutOfRange)' % b)
        # Div and FloorDiv are floor division: the EdPy spec, and Python 2 on the Edison website
        return self._fit(FOLD[op](a, b), '%s %s %s' % (a, _SYMBOL[op], b))

    def unop(self, op, a):
        _operand(a, op)
        value = {'USub': -a, 'UAdd': +a, 'Invert': ~a}[op]
        return self._fit(value, '%s%s' % ({'USub': '-', 'UAdd': '+', 'Invert': '~'}[op], a))

    def abs(self, a):
        _operand(a, 'abs')
        return self._fit(abs(a), 'abs(%s)' % a)

    def _fit(self, value, expr):
        if isinstance(value, bool) or V.INT_MIN <= value <= V.INT_MAX:
            return value
        if self.overflow == 'wrap':
            return ((value - V.INT_MIN) & 0xFFFF) + V.INT_MIN
        raise EdPyRuntimeError('16-bit overflow: %s = %d, outside -32768..32767 (the robot behaviour is unspecified)'
                               % (expr, value))

    def tick(self):
        self.robot._tick()

    def setup_done(self):
        self.robot._mark_setup_done()


_SYMBOL = {'Add': '+', 'Sub': '-', 'Mult': '*', 'Div': '/', 'FloorDiv': '//', 'Mod': '%', 'LShift': '<<', 'RShift': '>>',
           'BitAnd': '&', 'BitOr': '|', 'BitXor': '^', 'USub': '-', 'UAdd': '+', 'Invert': '~', 'abs': 'abs'}


def _operand(v, op):
    if isinstance(v, (EdList, TuneString)):
        raise EdPyRuntimeError("operator '%s' used on a list or tune string" % _SYMBOL.get(op, op))
    if not isinstance(v, int):
        raise EdPyRuntimeError("operator '%s' used on %r, EdPy only has ints" % (_SYMBOL.get(op, op), v))


class RunResult(object):
    """Outcome of EdProgram.run().

    status    'finished' (the program ended), 'time_limit' or 'step_limit' (it was still running when the budget ran out;
              normal for programs with a forever loop or a wait that never ends)
    vars      final values of the declared NEPO variables, by NEPO name (lists as EdList, which compares equal to a list)
    robot     the Robot, with its trace and final state
    """

    def __init__(self, status, robot, variables):
        self.status = status
        self.robot = robot
        self.vars = variables
        self.time_ms = robot.now
        self.steps = robot.steps

    @property
    def finished(self):
        return self.status == 'finished'

    def __repr__(self):
        return 'RunResult(status=%r, time_ms=%.1f, steps=%d, vars=%r)' % (self.status, self.time_ms, self.steps, self.vars)


class Session(object):
    """A loaded program whose main code hasn't run: helpers, setup block, global variables and NEPO functions exist.

    session.call('f', 1, 2)      call NEPO function f; lists may be passed as Python lists
    session['x'] / session['x'] = 5
    session.vars                  {NEPO name: value} of the declared global variables
    session.robot                 the Robot (trace, LEDs, odometer, ...)
    """

    def __init__(self, program, robot, namespace):
        self.program = program
        self.robot = robot
        self._ns = namespace

    @property
    def functions(self):
        return dict(self.program.functions)

    @property
    def vars(self):
        return self.program._variables(self._ns)

    def __getitem__(self, name):
        try:
            return self._ns[VAR_PREFIX + name]
        except KeyError:
            raise KeyError('no NEPO variable %r (declared: %s)' % (name, ', '.join(self.program.variables) or 'none'))

    def __setitem__(self, name, value):
        if name not in self.program.variables:
            raise KeyError('no NEPO variable %r (declared: %s)' % (name, ', '.join(self.program.variables) or 'none'))
        self._ns[VAR_PREFIX + name] = _to_ed(value)

    def call(self, name, *args, **kwargs):
        """Calls NEPO function `name`. Budget: max_steps (default 100000) and max_time_ms of virtual time (default
        60000); if the function doesn't return within it, StepLimitExceeded is raised."""
        max_steps = kwargs.pop('max_steps', 100000)
        max_time_ms = kwargs.pop('max_time_ms', 60000)
        if kwargs:
            raise TypeError('unexpected arguments %r' % list(kwargs))
        if name not in self.program.functions:
            raise KeyError('no NEPO function %r (defined: %s)' % (name, ', '.join(self.program.functions) or 'none'))
        params = self.program.functions[name]
        if len(args) != len(params):
            raise TypeError('%s(%s) takes %d arguments, %d given' % (name, ', '.join(params), len(params), len(args)))
        fn = self._ns[FUNC_PREFIX + name]
        ed_args = [_to_ed(a) for a in args]
        self.robot._set_budget(max_time_ms, max_steps)
        try:
            return self.program._guarded(lambda: fn(*ed_args))
        except StopProgram as stop:
            raise StepLimitExceeded('%s() did not return within %s' % (
                name, '%d steps' % max_steps if stop.reason == 'step_limit' else '%d ms of virtual time' % max_time_ms))
        finally:
            self.robot._set_budget(None, None)


def _to_ed(value):
    if isinstance(value, (list, tuple)):
        return EdList(max(len(value), 1), list(value))
    if isinstance(value, bool) or isinstance(value, (EdList, TuneString)):
        return value
    if isinstance(value, int):
        if not V.INT_MIN <= value <= V.INT_MAX:
            raise ValueError('%d is outside the 16-bit range' % value)
        return value
    raise TypeError('EdPy values are ints, booleans and lists of ints, not %r' % (value,))


class EdProgram(object):
    """A generated (or hand-written) EdPy program, checked and prepared for running under CPython.

    strict=True (default) raises EdPyCompatibilityError when the static check finds constructs EdPy rejects;
    strict=False keeps them in `problems` and runs anyway (CPython may still fail on them).
    """

    def __init__(self, source, filename='<edpy>', strict=True):
        self.source = source
        self.filename = filename
        self.lines = source.splitlines()
        tree, self.problems = check_and_transform(source, filename)
        if strict and self.problems:
            line, msg = self.problems[0]
            err = EdPyCompatibilityError(msg, line, self._source_line(line))
            err.problems = self.problems
            raise err
        self._analyse(tree)
        # make tracebacks and error locations show the EdPy source, also for programs that aren't files
        linecache.cache[filename] = (len(source), None, [l + '\n' for l in self.lines], filename)

    @classmethod
    def from_file(cls, path, strict=True):
        with open(path, encoding='utf-8') as f:
            return cls(f.read(), filename=str(path), strict=strict)

    # ------------------------------------------------------------------ structure of a generated program

    def _analyse(self, tree):
        body = tree.body
        marker = next((i for i, s in enumerate(body) if _is_runtime_call(s, 'setup_done')), None)
        if marker is not None:
            decl_start = marker + 1
        else:  # hand-written EdPy: after the last `Ed.X = ...`, or after the leading imports/defs
            ed_assigns = [i for i, s in enumerate(body) if isinstance(s, ast.Assign) and isinstance(s.targets[0], ast.Attribute)]
            decl_start = ed_assigns[-1] + 1 if ed_assigns else next(
                (i for i, s in enumerate(body) if not isinstance(s, (ast.Import, ast.FunctionDef))), len(body))
        self.variables = []
        decl_end = decl_start
        for stmt in body[decl_start:]:
            name = _declared_name(stmt)
            if name is None or name in self.variables:
                break
            self.variables.append(name)
            decl_end += 1
        self.functions = {}
        last_def = -1
        for i, stmt in enumerate(body):
            if isinstance(stmt, ast.FunctionDef) and stmt.name.startswith(FUNC_PREFIX):
                self.functions[stmt.name[len(FUNC_PREFIX):]] = [_nepo_var(a.arg) for a in stmt.args.args]
                last_def = i
        prelude_end = max(decl_end, last_def + 1)
        self._prelude = compile(ast.Module(body=body[:prelude_end], type_ignores=[]), self.filename, 'exec')
        self._main = compile(ast.Module(body=body[prelude_end:], type_ignores=[]), self.filename, 'exec')

    def _variables(self, ns):
        """Declared NEPO variables first, then any other ___x global (e.g. of hand-written programs, or the loop
        counter ___k0 of a repeat block at top level)."""
        result = dict((v, ns[VAR_PREFIX + v]) for v in self.variables if VAR_PREFIX + v in ns)
        for name, value in ns.items():
            if name.startswith(VAR_PREFIX) and not name.startswith(FUNC_PREFIX) and not callable(value):
                result.setdefault(name[len(VAR_PREFIX):], value)
        return result

    # ------------------------------------------------------------------ running

    def run(self, robot=None, max_time_ms=60000, max_steps=2000000, overflow='raise'):
        """Runs the whole program. Returns a RunResult; raises EdTestError subclasses for real problems."""
        robot = robot or Robot()
        ns = self._namespace(robot, overflow)
        robot._begin(max_time_ms, max_steps)
        status = 'finished'
        try:
            self._guarded(lambda: exec(self._prelude, ns))
            self._guarded(lambda: exec(self._main, ns))
        except StopProgram as stop:
            status = stop.reason
        return RunResult(status, robot, self._variables(ns))

    def load(self, robot=None, overflow='raise', max_time_ms=60000, max_steps=2000000):
        """Runs only the prelude (helpers, setup block, global declarations, function definitions). Returns a Session."""
        robot = robot or Robot()
        ns = self._namespace(robot, overflow)
        robot._begin(max_time_ms, max_steps)
        try:
            self._guarded(lambda: exec(self._prelude, ns))
        except StopProgram as stop:
            raise StepLimitExceeded('the program prelude did not finish (%s)' % stop.reason)
        robot._set_budget(None, None)
        return Session(self, robot, ns)

    def _namespace(self, robot, overflow):
        ed = EdModule(robot)
        runtime = Runtime(robot, overflow)

        def edpy_import(name, globals=None, locals=None, fromlist=(), level=0):
            if name == 'Ed' and not fromlist and level == 0:
                return ed
            raise EdPyCompatibilityError('only the Ed module can be imported')

        builtins = {'abs': runtime.abs, 'len': len, 'ord': ord, 'chr': chr, 'range': range,
                    'True': True, 'False': False, 'None': None, '__import__': edpy_import}
        return {'__builtins__': builtins, '__name__': '__edpy__', RUNTIME: runtime}

    def _guarded(self, fn):
        """Runs fn; turns Python errors raised by program code into EdPyRuntimeError and adds the EdPy line."""
        try:
            return fn()
        except StopProgram:
            raise
        except EdTestError as e:
            if e.line is None:
                e.line = self._line_of(sys.exc_info()[2])
                e.source_line = self._source_line(e.line)
            raise
        except RecursionError as e:
            line = self._line_of(sys.exc_info()[2])
            raise EdPyRuntimeError('recursion too deep (CPython limit; the robot stack is smaller and unknown)',
                                   line, self._source_line(line)) from e
        except Exception as e:
            line = self._line_of(sys.exc_info()[2])
            raise EdPyRuntimeError('%s: %s' % (type(e).__name__, e), line, self._source_line(line)) from e

    def _line_of(self, tb):
        line = None
        while tb is not None:
            if tb.tb_frame.f_code.co_filename == self.filename:
                line = tb.tb_lineno
            tb = tb.tb_next
        return line

    def _source_line(self, line):
        if line is None or not 1 <= line <= len(self.lines):
            return None
        return self.lines[line - 1]


def _is_runtime_call(stmt, method):
    return (isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Call) and isinstance(stmt.value.func, ast.Attribute)
            and isinstance(stmt.value.func.value, ast.Name) and stmt.value.func.value.id == RUNTIME
            and stmt.value.func.attr == method)


def _declared_name(stmt):
    if (isinstance(stmt, ast.Assign) and len(stmt.targets) == 1 and isinstance(stmt.targets[0], ast.Name)
            and stmt.targets[0].id.startswith(VAR_PREFIX) and not stmt.targets[0].id.startswith(FUNC_PREFIX)):
        return stmt.targets[0].id[len(VAR_PREFIX):]
    return None


def _nepo_var(py_name):
    return py_name[len(VAR_PREFIX):] if py_name.startswith(VAR_PREFIX) else py_name
