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
    nepoTest_expect_state_end     input STATE                     the state holds at the end
    nepoTest_expect_state_at      input STATE, AT                 ... at AT ms
    nepoTest_expect_state_during  input STATE, QUANT FROM TO      always / never / sometime, from FROM to TO ms (empty: the run)
    nepoTest_expect_state_after   input STATE, WITHIN EACH EVENT  within WITHIN ms after each/the first EVENT of "given"
    nepoTest_expect_state_while   input COND, DELAY, input STATE  while the condition holds (after DELAY ms)
    nepoTest_expect_state_for     input STATE, OP MS              for at least / at most / about MS ms in total
    nepoTest_expect_state_count   input STATE, OP COUNT           the state begins OP COUNT times
    nepoTest_expect_distance      DISTANCE DIR TOL                the robot drove DISTANCE cm forward/backward (± TOL)
    nepoTest_expect_turned        DEGREES DIR TOL                 the robot turned DEGREES right/left (± TOL)
    nepoTest_expect_position      AHEAD AHEAD_DIR SIDE SIDE_DIR TOL   it ended there, relative to its start (± TOL cm)
    nepoTest_expect_finish_within SECONDS                         the program finished within SECONDS s
  ACTION (value blocks; an empty input or ANY means "any")
    nepoTest_action_led PORT MODE | _drive DIR, POWER DISTANCE | _turn DIR, POWER DEGREES
    _curve DIR, POWER_LEFT POWER_RIGHT DISTANCE | _motor PORT, POWER | _stop | _tone FREQUENCY DURATION
    _sound_file FILE | _ir_send VALUE | _wait MS
  STATE (value blocks, see states.py; an empty power or frequency means "any")
    nepoTest_state_motor PORT IS, POWER | _robot MOVE, POWER | _led PORT IS | _sound SOUND, FREQUENCY
    _variable VAR OP, VALUE | _logic OP, A B | _not STATE
  CONDITION (value blocks: the world of "given")
    nepoTest_cond_obstacle PORT | _line COLOR | _light PORT OP VALUE

Values in inputs are NEPO literal blocks: math_number, math_integer, logic_boolean, robLists_create_with of numbers.
A saved program keeps its test suite as extra <instance>s in its block_set (split_program separates them).
"""

import re
import xml.etree.ElementTree as ET

from . import states as ST
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


def _state(block, problems, program):
    """a state value block as a state of states.py, or None"""
    t = block.type
    if t == 'nepoTest_state_motor':
        s = {'motor': block.fields.get('PORT', 'left'), 'is': block.fields.get('IS', 'forward')}
        power = _literal(block, 'POWER', problems, required=False)
        if power is not None:
            if s['is'] == 'stopped':
                problems.add(block, 'a stopped motor has no power: leave "at ... %" empty')
            elif isinstance(power, bool) or not isinstance(power, int) or power < 0:
                problems.add(block, 'the power is a number from 0 to 100')
            else:
                s['power'] = power
        return s
    if t == 'nepoTest_state_robot':
        s = {'robot': block.fields.get('MOVE', 'forward')}
        power = _literal(block, 'POWER', problems, required=False)
        if power is not None:
            if s['robot'] not in ST.MOVES_WITH_POWER:
                problems.add(block, '"at ... %" only works with "drives" and "turns"')
            elif isinstance(power, bool) or not isinstance(power, int) or power < 0:
                problems.add(block, 'the power is a number from 0 to 100')
            else:
                s['power'] = power
        return s
    if t == 'nepoTest_state_led':
        return {'led': block.fields.get('PORT', 'left'), 'is': block.fields.get('IS', 'on')}
    if t == 'nepoTest_state_sound':
        s = {'sound': block.fields.get('SOUND', 'tone')}
        frequency = _literal(block, 'FREQUENCY', problems, required=False)
        if frequency is not None:
            if s['sound'] != 'tone':
                problems.add(block, 'a frequency only works with "plays a tone"')
            else:
                s['frequency_hz'] = {'approx': frequency, 'tol': 1}
        return s
    if t == 'nepoTest_state_variable':
        var = block.fields.get('VAR')
        if program is not None and var not in [v.name for v in program.variables]:
            problems.add(block, 'the program has no variable "%s"' % var)
        return {'variable': var, 'value': _compare(block.fields.get('OP', 'EQ'), _literal(block, 'VALUE', problems), block, problems)}
    if t == 'nepoTest_state_logic':
        op = 'all' if block.fields.get('OP', 'AND') == 'AND' else 'any'
        parts = [_state_input(block, name, problems, program) for name in ('A', 'B')]
        if any(p is None for p in parts):
            return None
        flat = []
        for p in parts:
            flat += p[op] if op in p else [p]
        return {op: flat}
    if t == 'nepoTest_state_not':
        inner = _state_input(block, 'STATE', problems, program)
        return None if inner is None else {'not': inner}
    problems.add(block, 'this is not a state block')
    return None


def _state_input(block, name, problems, program):
    inner = block.values.get(name)
    if inner is None:
        problems.add(block, 'put a state block into every input of this block')
        return None
    return _state(inner, problems, program)


def _condition(block, problems):
    t = block.type
    if t == 'nepoTest_cond_obstacle':
        port = block.fields.get('PORT', 'FRONT')
        return {'obstacle': 'any' if port == ANY else port}
    if t == 'nepoTest_cond_line':
        return {'line': block.fields.get('COLOR', 'black')}
    if t == 'nepoTest_cond_light':
        return {'light': block.fields.get('PORT', 'LLIGHT'),
                'value': _compare(block.fields.get('OP', 'GT'), _int_field(block, 'VALUE', problems), block, problems)}
    problems.add(block, 'this is not a condition block')
    return None


# the events of "expect ... within ... ms after ..."
AFTER_EVENTS = {
    'clap': {'event': 'clap'}, 'key': {'event': 'key'}, 'obstacle_start': {'event': 'obstacle', 'edge': 'start'},
    'obstacle_end': {'event': 'obstacle', 'edge': 'end'}, 'line_black': {'event': 'line', 'color': 'black'},
    'line_white': {'event': 'line', 'color': 'white'}, 'remote': {'event': 'remote'}, 'ir_message': {'event': 'ir_message'},
}
STATE_EXPECTS = ('nepoTest_expect_state_end', 'nepoTest_expect_state_at', 'nepoTest_expect_state_during', 'nepoTest_expect_state_after',
                 'nepoTest_expect_state_while', 'nepoTest_expect_state_for', 'nepoTest_expect_state_count')
_FAR = 10 ** 9  # "until the end" when a world condition is checked before the run


def _state_expect(b, problems, program, world):
    """one "expect <state> <timing>" block as an entry of "states", or None"""
    inner = b.values.get('STATE')
    if inner is None:
        problems.add(b, 'put a state block into "expect"')
        return None
    state = _state(inner, problems, program)
    if state is None:
        return None
    t = b.type
    if t == 'nepoTest_expect_state_end':
        return {'state': state, 'at': 'end'}
    if t == 'nepoTest_expect_state_at':
        return {'state': state, 'at': _int_field(b, 'AT', problems)}
    if t == 'nepoTest_expect_state_during':
        window = {}
        for field, key in (('FROM', 'from'), ('TO', 'to')):
            if (b.fields.get(field) or '').strip():
                window[key] = _int_field(b, field, problems)
        if 'from' in window and 'to' in window and window['from'] > window['to']:
            problems.add(b, '"from" must not be after "to"')
        quantifier = b.fields.get('QUANT', 'always')
        return {'state': state, quantifier if quantifier in ST.QUANTIFIERS else 'always': window}
    if t == 'nepoTest_expect_state_after':
        event = dict(AFTER_EVENTS.get(b.fields.get('EVENT', 'clap'), AFTER_EVENTS['clap']))
        if not ST.event_times(event, world):
            problems.add(b, 'there is no "%s" under "given" of this test' % ST.describe_event(event))
        return {'state': state, 'within_ms': _int_field(b, 'WITHIN', problems), 'after': event, 'each': b.fields.get('EACH', 'each') == 'each'}
    if t == 'nepoTest_expect_state_while':
        cond_block = b.values.get('COND')
        if cond_block is None:
            problems.add(b, 'put a condition block into "while"')
            return None
        cond = _condition(cond_block, problems)
        if cond is None:
            return None
        if not ST.condition_intervals(cond, world, _FAR):
            problems.add(b, '"%s" never happens: add it under "given"' % ST.describe_condition(cond))
        return {'state': state, 'while': cond, 'delay_ms': _int_field(b, 'DELAY', problems)}
    if t == 'nepoTest_expect_state_for':
        ms = _int_field(b, 'MS', problems)
        op = b.fields.get('OP', 'GTE')
        matcher = {'min': ms} if op == 'GTE' else {'max': ms} if op == 'LTE' else {'approx': ms, 'tol': max(10, ms // 20)}
        return {'state': state, 'for_ms': matcher}
    return {'state': state, 'starts': _compare(b.fields.get('OP', 'EQ'), _int_field(b, 'COUNT', problems), b, problems)}


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

    actions, states = [], []

    def once(block, key, value):
        if key in expect:
            problems.add(block, 'only one such block per test')
        expect[key] = value

    for b in _chain(test_block, 'THEN'):
        t = b.type
        if t in STATE_EXPECTS:
            entry = _state_expect(b, problems, program, world)
            if entry is not None:
                states.append(entry)
        elif t == 'nepoTest_expect_distance':
            sign = -1 if b.fields.get('DIR', 'forward') == 'backward' else 1
            once(b, 'distance_cm', {'approx': sign * _int_field(b, 'DISTANCE', problems), 'tol': _int_field(b, 'TOL', problems)})
        elif t == 'nepoTest_expect_turned':
            sign = -1 if b.fields.get('DIR', 'right') == 'right' else 1  # heading: counterclockwise (left) is positive
            once(b, 'heading_deg', {'approx': sign * _int_field(b, 'DEGREES', problems), 'tol': _int_field(b, 'TOL', problems)})
        elif t == 'nepoTest_expect_position':
            ahead = _int_field(b, 'AHEAD', problems) * (-1 if b.fields.get('AHEAD_DIR', 'ahead') == 'behind' else 1)
            left = _int_field(b, 'SIDE', problems) * (-1 if b.fields.get('SIDE_DIR', 'left') == 'right' else 1)
            once(b, 'end_position', {'ahead_cm': ahead, 'left_cm': left, 'tol_cm': _int_field(b, 'TOL', problems)})
        elif t == 'nepoTest_expect_finish_within':
            if is_call:
                problems.add(b, '"expect the program to finish within" only works with "run the program"')
            once(b, 'finished_within_ms', _int_field(b, 'SECONDS', problems, minimum=1) * 1000)
        elif t == 'nepoTest_expect_result':
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
    if states:
        expect['states'] = states
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
        name = run.fields.get('NAME') or ''
        if not name:
            problems.add(run, 'choose the test to run in "run test"')
        elif name not in tests:
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
