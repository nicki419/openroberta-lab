"""Test suites built from NEPO test blocks (the Lab's Tests tab), translated into the JSON test format of spec.py.

The blocks (all types start with `nepoTest_`; the frontend defines them in nepoTest.blocks.ts):

    nepoTest_suite                      the red start block; `nepoTest_run` blocks below it choose the tests to run
    nepoTest_run          NAME          run the test NAME
    nepoTest_test         NAME          a test: statement inputs GIVEN (the world), WHEN (one action), THEN (expectations)
  GIVEN
    nepoTest_given_clap       AT                      a clap at AT ms
    nepoTest_given_key        AT PORT                 key PLAY/REC pressed at AT ms
    nepoTest_given_obstacle   FROM DURATION PORT      obstacle FRONT/LEFT/RIGHT from FROM ms for DURATION ms (0: until the end)
    nepoTest_given_light      AT PORT VALUE           light sensor LLIGHT/RLIGHT/LINETRACKER reads VALUE (%) from AT ms
    nepoTest_given_line       AT COLOR                the line tracker sees black/white from AT ms
    nepoTest_given_remote     AT CODE                 remote control code 0..7 at AT ms
    nepoTest_given_ir         AT VALUE                IR message VALUE at AT ms
    nepoTest_given_variable   VAR, input VALUE        global variable VAR has VALUE before the call (function tests)
  WHEN
    nepoTest_when_run         SECONDS                 run the whole program, for at most SECONDS s
    nepoTest_when_call        FUNCTION, inputs ARG0.. call a NEPO function (mutation: name + <arg name type/>)
  THEN
    nepoTest_expect_result    OP, input VALUE         the function's result
    nepoTest_expect_variable  VAR OP, input VALUE     a global variable at the end
    nepoTest_expect_status    STATUS                  finished / running
    nepoTest_expect_action    input ACTION            this action happened (consecutive ones: in this order)
    nepoTest_expect_no_action input ACTION            this action never happened
    nepoTest_expect_count     OP COUNT, input ACTION  this action happened OP COUNT times
    nepoTest_expect_called    FUNCTION                this NEPO function was called
    nepoTest_expect_error     KIND                    this runtime error happened (any, division_by_zero, ...)
  ACTION (value blocks; an empty input or ANY means "any")
    nepoTest_action_led PORT MODE | _drive DIR, POWER DISTANCE | _turn DIR, POWER DEGREES
    _curve DIR, POWER_LEFT POWER_RIGHT DISTANCE | _motor PORT, POWER | _stop | _tone FREQUENCY DURATION
    _sound_file FILE | _ir_send VALUE | _wait MS

Values in inputs are NEPO literal blocks: math_number, math_integer, logic_boolean, robLists_create_with of numbers.
A saved program keeps its test suite as extra <instance>s in its block_set (split_program separates them).
"""

import re
import xml.etree.ElementTree as ET

from .nepo import NS, Block

PREFIX = 'nepoTest_'
OPS = {'EQ', 'NEQ', 'LT', 'LTE', 'GT', 'GTE'}
ERROR_KINDS = {'any', 'division_by_zero', 'overflow', 'index_out_of_range', 'recursion', 'step_limit', 'negative_value',
               'shift_out_of_range'}
ANY = 'ANY'


def _tag(el):
    return el.tag[len(NS):] if el.tag.startswith(NS) else el.tag


def is_test_instance(instance):
    first = next((b for b in instance if _tag(b) == 'block'), None)
    return first is not None and (first.get('type') or '').startswith(PREFIX)


def split_program(xml_text):
    """(program block_set XML without test instances, test block_set XML or None) from a program's (or an export's) XML"""
    m = re.search(r'<program>\s*(.*?)\s*</program>', xml_text, re.S)
    block_set_text = m.group(1) if m else xml_text.strip()
    ET.register_namespace('', NS[1:-1])
    root = ET.fromstring(block_set_text)
    tests = ET.Element(root.tag, dict(root.attrib))
    for inst in list(root):
        if _tag(inst) == 'instance' and is_test_instance(inst):
            root.remove(inst)
            tests.append(inst)
    program = ET.tostring(root, encoding='unicode')
    return program, (ET.tostring(tests, encoding='unicode') if len(tests) else None)


class _Problems(list):
    def add(self, block, message, severity='error'):
        self.append({'block_id': getattr(block, 'id', None), 'message': message, 'severity': severity})

    @property
    def errors(self):
        return [p for p in self if p['severity'] == 'error']


def _int_field(block, name, problems, default=0, minimum=0):
    text = block.fields.get(name, '')
    try:
        value = int(float(text))
    except ValueError:
        problems.add(block, '%s must be a whole number, not %r' % (name.lower(), text))
        return default
    if value < minimum:
        problems.add(block, '%s must be at least %d' % (name.lower(), minimum))
    return value


def _literal(block, name, problems, required=True):
    b = block.values.get(name)
    if b is None:
        if required:
            problems.add(block, 'put a value into "%s"' % name.lower())
        return None
    value = b.literal()
    if value is None:
        problems.add(b, 'only numbers, true/false and lists of numbers are allowed here')
    elif isinstance(value, float):
        problems.add(b, 'the Edison only knows whole numbers (%s)' % value)
    return value


def _compare(op, value, block, problems):
    """a matcher for `<actual> OP value`"""
    if op not in OPS:
        problems.add(block, 'unknown comparison %r' % op)
        return value
    if op == 'EQ':
        return value
    if op == 'NEQ':
        return {'not': value}
    if isinstance(value, bool) or not isinstance(value, int):
        problems.add(block, 'only numbers can be compared with <, <=, >, >=')
        return value
    return {'LT': {'max': value - 1}, 'LTE': {'max': value}, 'GT': {'min': value + 1}, 'GTE': {'min': value}}[op]


def _action_matcher(block, problems):
    if block is None:
        return None
    t = block.type
    m = {}

    def opt(input_name, key, approx=False):
        v = _literal(block, input_name, problems, required=False)
        if v is not None:
            m[key] = {'approx': v, 'tol': 1} if approx else v

    def field(name, key):
        v = block.fields.get(name, ANY)
        if v and v != ANY:
            m[key] = v

    if t == 'nepoTest_action_led':
        m['action'] = 'led'
        field('PORT', 'port')
        field('MODE', 'mode')
    elif t == 'nepoTest_action_drive':
        m['action'] = 'drive'
        field('DIR', 'dir')
        opt('POWER', 'power')
        opt('DISTANCE', 'distance_cm')
    elif t == 'nepoTest_action_turn':
        m['action'] = 'turn'
        field('DIR', 'dir')
        opt('POWER', 'power')
        opt('DEGREES', 'degrees')
    elif t == 'nepoTest_action_curve':
        m['action'] = 'curve'
        field('DIR', 'dir')
        opt('POWER_LEFT', 'power_left')
        opt('POWER_RIGHT', 'power_right')
        opt('DISTANCE', 'distance_cm')
    elif t == 'nepoTest_action_motor':
        m['action'] = 'motor'
        field('PORT', 'port')
        opt('POWER', 'power')
    elif t == 'nepoTest_action_stop':
        m['action'] = 'stop'
    elif t == 'nepoTest_action_tone':
        m['action'] = 'tone'
        opt('FREQUENCY', 'frequency_hz', approx=True)
        opt('DURATION', 'duration_ms')
    elif t == 'nepoTest_action_sound_file':
        m['action'] = 'sound_file'
        opt('FILE', 'file')
    elif t == 'nepoTest_action_ir_send':
        m['action'] = 'ir_send'
        opt('VALUE', 'value')
    elif t == 'nepoTest_action_wait':
        m['action'] = 'wait'
        opt('MS', 'ms')
    else:
        problems.add(block, 'this is not an action block')
        return None
    return m


def _chain(block, name):
    return [b for b in block.statements.get(name, []) if not b.disabled]


def _translate_test(test_block, program, problems):
    name = (test_block.fields.get('NAME') or '').strip()
    test = {'name': name, 'origin': 'blocks', 'block_id': test_block.id}
    expect = {}
    world, globals_ = [], {}
    for b in _chain(test_block, 'GIVEN'):
        t = b.type
        if t == 'nepoTest_given_clap':
            world.append({'event': 'clap', 'at': _int_field(b, 'AT', problems)})
        elif t == 'nepoTest_given_key':
            world.append({'event': 'key', 'port': b.fields.get('PORT', 'PLAY'), 'at': _int_field(b, 'AT', problems)})
        elif t == 'nepoTest_given_obstacle':
            start, duration = _int_field(b, 'FROM', problems), _int_field(b, 'DURATION', problems)
            world.append({'event': 'obstacle', 'port': b.fields.get('PORT', 'FRONT'), 'from': start,
                          'to': start + duration if duration > 0 else None})
        elif t == 'nepoTest_given_light':
            world.append({'event': 'light', 'port': b.fields.get('PORT', 'LLIGHT'), 'value': _int_field(b, 'VALUE', problems),
                          'at': _int_field(b, 'AT', problems)})
        elif t == 'nepoTest_given_line':
            world.append({'event': 'line', 'color': b.fields.get('COLOR', 'black'), 'at': _int_field(b, 'AT', problems)})
        elif t == 'nepoTest_given_remote':
            code = _int_field(b, 'CODE', problems)
            if code > 7:
                problems.add(b, 'remote control codes are 0 to 7')
            world.append({'event': 'remote', 'code': code, 'at': _int_field(b, 'AT', problems)})
        elif t == 'nepoTest_given_ir':
            value = _int_field(b, 'VALUE', problems)
            if value > 255:
                problems.add(b, 'IR messages are 0 to 255')
            world.append({'event': 'ir_message', 'value': value, 'at': _int_field(b, 'AT', problems)})
        elif t == 'nepoTest_given_variable':
            var = b.fields.get('VAR')
            value = _literal(b, 'VALUE', problems)
            if program is not None and var not in [v.name for v in program.variables]:
                problems.add(b, 'the program has no variable "%s"' % var)
            globals_[var] = value
        else:
            problems.add(b, 'this block does not belong under "given"')
    if world:
        test['world'] = world

    when = _chain(test_block, 'WHEN')
    is_call = False
    if not when:
        problems.add(test_block, 'test "%s": put "run the program" or "call function" under "when"' % name)
    else:
        w = when[0]
        if w.type == 'nepoTest_when_run':
            seconds = _int_field(w, 'SECONDS', problems, default=10, minimum=1)
            test['max_time_ms'] = seconds * 1000
        elif w.type == 'nepoTest_when_call':
            is_call = True
            fn = w.fields.get('FUNCTION') or w.mutation.get('name')
            test['call'] = fn
            arity = len(w.mutation_args) if w.mutation_args else len([k for k in w.values if k.startswith('ARG')])
            if program is not None:
                if fn not in program.functions:
                    problems.add(w, 'the program has no function "%s"' % fn)
                else:
                    arity = len(program.functions[fn].params)
            test['args'] = [_literal(w, 'ARG%d' % i, problems) for i in range(arity)]
        else:
            problems.add(w, 'this block does not belong under "when"')
    if globals_:
        if is_call:
            test['globals'] = globals_
        else:
            problems.add(test_block, 'test "%s": "variable is" only works with "call function"' % name)

    actions = []
    for b in _chain(test_block, 'THEN'):
        t = b.type
        if t == 'nepoTest_expect_result':
            if not is_call:
                problems.add(b, '"expect the result" only works with "call function"')
            expect['returns'] = _compare(b.fields.get('OP', 'EQ'), _literal(b, 'VALUE', problems), b, problems)
        elif t == 'nepoTest_expect_variable':
            var = b.fields.get('VAR')
            if program is not None and var not in [v.name for v in program.variables]:
                problems.add(b, 'the program has no variable "%s"' % var)
            expect.setdefault('variables', {})[var] = _compare(b.fields.get('OP', 'EQ'), _literal(b, 'VALUE', problems), b, problems)
        elif t == 'nepoTest_expect_status':
            if is_call:
                problems.add(b, '"expect the program" only works with "run the program"')
            expect['status'] = 'finished' if b.fields.get('STATUS', 'finished') == 'finished' else 'running'
        elif t == 'nepoTest_expect_action':
            m = _action_matcher(b.values.get('ACTION'), problems)
            if m is None and 'ACTION' not in b.values:
                problems.add(b, 'put an action block into "expect"')
            elif m is not None:
                actions.append(m)
        elif t == 'nepoTest_expect_no_action':
            m = _action_matcher(b.values.get('ACTION'), problems)
            if m is None and 'ACTION' not in b.values:
                problems.add(b, 'put an action block into "expect no"')
            elif m is not None:
                expect.setdefault('no_actions', []).append(m)
        elif t == 'nepoTest_expect_count':
            m = _action_matcher(b.values.get('ACTION'), problems)
            if m is None and 'ACTION' not in b.values:
                problems.add(b, 'put an action block into "expect ... times"')
            elif m is not None:
                count = _compare(b.fields.get('OP', 'EQ'), _int_field(b, 'COUNT', problems), b, problems)
                expect.setdefault('action_count', []).append({'match': m, 'count': count})
        elif t == 'nepoTest_expect_called':
            fn = b.fields.get('FUNCTION')
            if program is not None and fn not in program.functions:
                problems.add(b, 'the program has no function "%s"' % fn)
            expect.setdefault('calls', []).append({'function': fn})
        elif t == 'nepoTest_expect_error':
            kind = b.fields.get('KIND', 'any')
            if kind not in ERROR_KINDS:
                problems.add(b, 'unknown error kind %r' % kind)
            expect['error'] = kind
        else:
            problems.add(b, 'this block does not belong under "then"')
    if actions:
        expect['actions'] = actions
    if not expect:
        problems.add(test_block, 'test "%s": put at least one expectation under "then"' % name)
    test['expect'] = expect
    return test


def translate(tests_xml, program=None):
    """(spec, problems) for a test block_set. program (a NepoProgram) enables name checks.

    problems: [{'block_id', 'message', 'severity': 'error'|'warning'}]; the spec is runnable if there are no errors."""
    problems = _Problems()
    spec = {'format': 'nepotest', 'version': 1, 'program': 'program', 'tests': []}
    if not tests_xml:
        problems.add(None, 'the test suite is empty: build a test and put "run test" under the start block')
        return spec, list(problems)
    root = ET.fromstring(tests_xml)
    chains = [[Block(b) for b in inst if _tag(b) == 'block'] for inst in root if _tag(inst) == 'instance']
    suite = [c for c in chains if c and c[0].type == 'nepoTest_suite']
    tests = {}
    for chain in chains:
        for top in chain:
            if top.type == 'nepoTest_test' and not top.disabled:
                name = (top.fields.get('NAME') or '').strip()
                if not name:
                    problems.add(top, 'give the test a name')
                elif name in tests:
                    problems.add(top, 'there are two tests named "%s"' % name)
                else:
                    tests[name] = top
    if not suite:
        problems.add(None, 'the start block of the test suite is missing')
        return spec, list(problems)
    selected = []
    for run in suite[0][1:]:
        if run.type != 'nepoTest_run' or run.disabled:
            continue
        name = run.fields.get('NAME')
        if name not in tests:
            problems.add(run, 'there is no test named "%s"' % name)
        elif name in selected:
            problems.add(run, 'test "%s" is already in the suite' % name, 'warning')
        else:
            selected.append(name)
    for name in tests:
        if name not in selected:
            problems.add(tests[name], 'test "%s" is not under the start block, so it does not run' % name, 'warning')
    if not selected:
        problems.add(suite[0][0], 'put "run test" blocks under the start block')
    for name in selected:
        spec['tests'].append(_translate_test(tests[name], program, problems))
    return spec, list(problems)
