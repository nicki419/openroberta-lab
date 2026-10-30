"""Test suites built from NEPO test blocks (the Lab's Tests tab), translated into the JSON test format of spec.py.

The blocks (all types start with `nepoTest_`; the frontend defines them in nepoTest.blocks.ts):

    nepoTest_suite                      the red start block; `nepoTest_run` blocks below it choose the tests to run
    nepoTest_run          NAME          run the test NAME (a test, a simulation world: all its tests, or a test of a world)
    nepoTest_test         NAME SHOULD   a test: statement inputs GIVEN (the world), WHEN (one action), THEN (expectations);
                                        SHOULD: pass | fail ("this test should fail": it passes if it fails)
    nepoTest_world        NAME          a simulation world (block data: JSON, see below); statement input TESTS
                                        (nepoTest_simcase blocks). Its tests run on the Lab's simulator (the Tests tab).
                                        Until 2026-10-30 it had RULES (checks for every test of the world): they are still
                                        translated (rule: true), and the Tests tab moves them into each test when it loads.
    nepoTest_simcase      ACTIVE NAME START MODE UNTIL SECONDS   a test of a world: ACTIVE TRUE | FALSE (unticked:
                                        skipped); set up: START (a start's id) and statement input SETUP (claps, keys,
                                        variables: the past); run: the whole program, MODE for | until (UNTIL: an area's
                                        id; the run ends when the robot touches it), at most SECONDS s (one decimal); statement input
                                        CHECKS (nepoTest_check_* blocks). Every test of a world should pass: a SHOULD (saved
                                        until 2026-10-30) is ignored.
  CHECK (in CHECKS; AREA, OBSTACLE: an item's id, or ANY)
    nepoTest_check_reaches        AREA        the robot touches the area (ANY: any goal area) at some time
    nepoTest_check_never_touches  AREA        ... never (ANY: any fail area)
    nepoTest_check_ends_in        AREA        the whole robot is in the area at the end
    nepoTest_check_never_bumps    OBSTACLE    the robot never bumps into it (an obstacle or a wall; ANY: anything, the edge of
                                              the floor too)
    nepoTest_check_path           TOL         (until 2026-10-30) the robot stays on its recorded path: paths are no longer
                                              recorded, the check is left out with a warning
    nepoTest_check_does           AFTER DOES  from AFTER ms on, the robot always does DOES (drives_forward, drives_backward,
                                              turns_left, turns_right, stands_still, left_led_on, left_led_off, right_led_on,
                                              right_led_off, leds_on, leds_off, plays_sound, silent)
    nepoTest_check_whenever       WHEN PERCENT DOES AFTER   whenever WHEN holds (line, no_line, obstacle_ahead, obstacle_left,
                                              obstacle_right, no_obstacle, left_light_below, left_light_above,
                                              right_light_below, right_light_above: PERCENT %, sound, play_key, rec_key) for
                                              AFTER ms, the robot does DOES
    nepoTest_check_after          WITHIN EVENT DOES   within WITHIN ms after each EVENT (clap, key: of the set-up;
                                              line_start, line_end, obstacle), the robot does DOES at some moment
    nepoTest_check_variable       VAR OP, input VALUE   the global variable VAR at the end
  GIVEN (in a simulation world's test, SETUP: only clap, key and variable)
    nepoTest_given_clap       AT                      a clap at AT ms
    nepoTest_given_key        AT PORT                 key PLAY/REC pressed at AT ms
    nepoTest_given_obstacle   FROM DURATION PORT      obstacle FRONT/LEFT/RIGHT from FROM ms for DURATION ms (0: until the end)
    nepoTest_given_light      AT PORT VALUE           light sensor LLIGHT/RLIGHT/LINETRACKER reads VALUE (%) from AT ms
    nepoTest_given_line       AT COLOR                the line tracker sees black/white from AT ms
    nepoTest_given_remote     AT CODE                 remote control code 0..7 at AT ms
    nepoTest_given_ir         AT VALUE                IR message VALUE at AT ms
    nepoTest_given_variable   VAR, input VALUE        global variable VAR has VALUE before the call (function tests), or
                                                      from the start (tests of simulation worlds: the program's declared
                                                      start value is replaced)
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

The data of a simulation world block (<data>, JSON): {"version": 3, "world": {"background", "starts", "items"} (see
simulation.py), "view": {"x", "y", "scale"} (the editor's zoom, not used here)}. No data: a new world (peach, start A
in its middle). Versions 1 and 2 are migrated (their one start is start A); a "floor" (a picture of the floor, stored
until 2026-10-22) is ignored.

The simulation tests of the first kind (nepoTest_simtest: one test with its own world, until 2026-10-26) are no longer
translated: the Lab drops them when it loads a suite; here they are a warning, and they don't run.
"""

import json
import re
import xml.etree.ElementTree as ET

from . import simulation as SIM
from . import states as ST
from .nepo import NS, Block
from .spec import validate_spec

PREFIX = 'nepoTest_'
WORLD = 'nepoTest_world'
SIM_TEST = 'nepoTest_simcase'
OLD_SIM_TEST = 'nepoTest_simtest'
OLD_PATH_CHECK = 'nepoTest_check_path'  # "the robot stays on its recorded path" (until 2026-10-30)
TEST_TYPES = ('nepoTest_test', WORLD, SIM_TEST)  # their names are one namespace
CHECK_TYPES = {'nepoTest_check_reaches': 'reaches', 'nepoTest_check_never_touches': 'never_touches',
               'nepoTest_check_ends_in': 'ends_in', 'nepoTest_check_never_bumps': 'never_bumps',
               'nepoTest_check_does': 'does', 'nepoTest_check_whenever': 'whenever', 'nepoTest_check_after': 'after',
               'nepoTest_check_variable': 'variable'}
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
    if not re.match(r'<block_set[^>]*\sxmlns=', block_set_text):
        block_set_text = block_set_text.replace('<block_set', '<block_set xmlns="%s"' % NS[1:-1], 1)  # declared only on <export>
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


def _seconds_field(block, name, problems, default):
    """a length in seconds, with up to one decimal, as ms (at least 0.1 s)"""
    text = (block.fields.get(name) or '').replace(',', '.')
    try:
        value = float(text)
    except ValueError:
        problems.add(block, 'the time must be a number of seconds, not %r' % block.fields.get(name))
        return default * 1000
    if value < 0.1:
        problems.add(block, 'a test runs for at least 0.1 s')
    return int(round(value * 10)) * 100


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


# the "given" blocks a simulation test may have: the drawn world gives obstacles, the line and the light, and the Lab's
# simulator has no IR remote control and no IR messages
SIM_GIVEN = ('nepoTest_given_clap', 'nepoTest_given_key', 'nepoTest_given_variable')
SIM_NO_IR = ('nepoTest_given_remote', 'nepoTest_given_ir')


def _given(test_block, program, problems, simulation=False):
    """(world events, globals) of the GIVEN blocks of a test (of a simulation world's test: of its SETUP)"""
    world, globals_ = [], {}
    for b in _chain(test_block, 'SETUP' if simulation else 'GIVEN'):
        t = b.type
        if simulation and t in SIM_NO_IR:
            problems.add(b, "the Lab's simulator has no IR remote control and no IR messages: use this block in a test, not in a "
                            "simulation world")
            continue
        if simulation and t not in SIM_GIVEN:
            problems.add(b, 'in a simulation world, draw obstacles, lines and areas into the world instead')
            continue
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
    return world, globals_


def _call(w, test, program, problems):
    """a "call function" block: sets "call" and "args" of the test"""
    fn = w.fields.get('FUNCTION') or w.mutation.get('name')
    test['call'] = fn
    arity = len(w.mutation_args) if w.mutation_args else len([k for k in w.values if k.startswith('ARG')])
    if program is not None:
        if fn not in program.functions:
            problems.add(w, 'the program has no function "%s"' % fn)
        else:
            arity = len(program.functions[fn].params)
    test['args'] = [_literal(w, 'ARG%d' % i, problems) for i in range(arity)]


def _should(test_block, test, problems):
    """"this test should [pass / fail]": "should" of the test (only when it should fail)"""
    should = test_block.fields.get('SHOULD') or 'pass'
    if should == 'fail':
        test['should'] = 'fail'
    elif should != 'pass':
        problems.add(test_block, 'a test should "pass" or "fail", not %r' % should)


def _translate_test(test_block, program, problems):
    name = (test_block.fields.get('NAME') or '').strip()
    test = {'name': name, 'origin': 'blocks', 'block_id': test_block.id}
    _should(test_block, test, problems)
    expect = {}
    world, globals_ = _given(test_block, program, problems)
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
            _call(w, test, program, problems)
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


def simulation_data(block):
    """the data of a simulation world block (see the module doc), in today's version, with defaults for what's missing;
    None if unreadable"""
    data = {}
    if block.data:
        try:
            data = json.loads(block.data)
        except ValueError:
            data = None
    if not isinstance(data, dict):
        return None
    world = data.get('world')
    if not isinstance(world, dict):
        world = SIM.default_world()
    elif data.get('version', 1) < 2:
        world = SIM.migrate_v1(world)
    world = SIM.world_v3(world)
    data['world'] = world
    for old in ('reference', 'tolerance_cm', 'floor'):
        data.pop(old, None)
    return data


def _world_name(world_block):
    return (world_block.fields.get('NAME') or '').strip()


def _behaviour(b, kind, check, problems):
    """the fields of a behaviour check (does, whenever, after)"""
    check['does'] = b.fields.get('DOES') or ''
    if check['does'] not in SIM.DOES:
        problems.add(b, 'choose what the robot does')
    if kind == 'after':
        check['event'] = b.fields.get('EVENT') or ''
        if check['event'] not in SIM.EVENTS:
            problems.add(b, 'choose the event the robot reacts to')
        check['within_ms'] = _int_field(b, 'WITHIN', problems, default=500, minimum=1)
        return check
    check['after_ms'] = _int_field(b, 'AFTER', problems, default=SIM.DEFAULT_REACTION_MS[kind])
    if kind == 'whenever':
        check['when'] = b.fields.get('WHEN') or ''
        if check['when'] not in SIM.CONDITIONS:
            problems.add(b, 'choose the condition')
        elif check['when'] in SIM.LIGHT_CONDITIONS:
            check['percent'] = _int_field(b, 'PERCENT', problems, default=50)
            if check['percent'] > 100:
                problems.add(b, 'a light sensor reads 0 to 100 %')
    return check


def _variable_check(b, check, program, problems):
    """the fields of a check of a variable at the end"""
    var = b.fields.get('VAR') or ''
    if not var:
        problems.add(b, 'choose the variable')
    elif program is not None and var not in [v.name for v in program.variables]:
        problems.add(b, 'the program has no variable "%s"' % var)
    op = b.fields.get('OP') or 'EQ'
    value = _literal(b, 'VALUE', problems)
    if op not in OPS:
        problems.add(b, 'unknown comparison %r' % op)
    elif op not in ('EQ', 'NEQ') and value is not None and (isinstance(value, bool) or not isinstance(value, int)):
        problems.add(b, 'only numbers can be compared with <, <=, >, >=')
    check.update({'variable': var, 'op': op, 'value': value})
    return check


def _check(b, world, problems, rule=False, program=None):
    """a check block (of a test, or a rule of the world) as a check of simulation.py, or None"""
    kind = CHECK_TYPES.get(b.type)
    if b.type == OLD_PATH_CHECK:
        problems.add(b, 'paths are no longer recorded: this check is left out (delete it)', 'warning')
        return None
    if kind is None:
        problems.add(b, 'this block does not belong under "check"' if not rule else 'only checks are rules of a world')
        return None
    check = {'check': kind, 'block_id': b.id}
    if rule:
        check['rule'] = True
    items = dict((i.get('id'), i) for i in world.get('items') or [])
    if kind in SIM.BEHAVIOUR_CHECKS:
        return _behaviour(b, kind, check, problems)
    if kind == 'variable':
        return _variable_check(b, check, program, problems)
    field = 'OBSTACLE' if kind == 'never_bumps' else 'AREA'
    item = b.fields.get(field) or ''
    roles = ('obstacle',) if kind == 'never_bumps' else SIM.AREA_ROLES
    if kind == 'ends_in' and item in ('', ANY):
        problems.add(b, 'choose the area the robot ends in')
        return check
    if item == '':
        problems.add(b, 'choose what this check is about')
        return check
    if item == ANY:
        return check
    found = items.get(item)
    if found is None or (found.get('kind') == 'line' and not SIM.is_wall(found)) or found.get('role') not in roles:
        problems.add(b, 'this %s is not in the world (any more): choose another one' % ('obstacle' if kind == 'never_bumps' else 'area'))
        return check
    check['item'] = item
    return check


def _overwritten(program, globals_):
    """the set-up variables the program assigns before it does anything else: the set-up value would be lost at once"""
    if program is None:
        return []
    names = []
    for b in program.main:
        if b.type != 'variables_set':
            break
        if b.fields.get('VAR') in globals_:
            names.append(b.fields.get('VAR'))
    return names


def _translate_simcase(test_block, world_block, program, problems):
    """a test of a simulation world (a nepoTest_simcase in the world's TESTS)"""
    name = (test_block.fields.get('NAME') or '').strip()
    test = {'name': name, 'origin': 'blocks', 'block_id': test_block.id}  # it should pass (no "should")
    if test_block.fields.get('ACTIVE', 'TRUE') == 'FALSE':
        test['skip'] = True
    data = simulation_data(world_block)
    if data is None:
        problems.add(world_block, 'the simulation world "%s" cannot be read: draw it again' % _world_name(world_block))
        data = {'world': SIM.default_world()}
    world = data['world']
    invalid = SIM.validate_world(world, 'world "%s"' % _world_name(world_block))
    for message in invalid:
        problems.add(world_block, message)
    sim = {'world_block_id': world_block.id, 'world_name': _world_name(world_block), 'world': world,
           'start': test_block.fields.get('START') or ''}
    if not invalid and SIM.start_pose(world, sim['start']) is None:
        problems.add(test_block, 'test "%s": its start is not in the world (any more): choose one of its starts' % name)
    if test_block.fields.get('MODE', 'for') == 'until':
        until = test_block.fields.get('UNTIL') or ''
        item = next((i for i in world.get('items') or [] if i.get('id') == until), None)
        if not until:
            problems.add(test_block, 'test "%s": choose the area that ends the run' % name)
        elif item is None or item.get('kind') == 'line' or item.get('role') not in SIM.AREA_ROLES:
            problems.add(test_block, 'test "%s": the area that ends the run is not in the world (any more): choose another one' % name)
        else:
            sim['until'] = until
    checks = [_check(b, world, problems, rule=True, program=program) for b in _chain(world_block, 'RULES')]
    checks += [_check(b, world, problems, program=program) for b in _chain(test_block, 'CHECKS')]
    sim['checks'] = [c for c in checks if c is not None]
    test['simulation'] = sim
    events, globals_ = _given(test_block, program, problems, simulation=True)
    for c in sim['checks']:
        if c['check'] == 'after' and c.get('event') in ('clap', 'key') and not c.get('rule') and not any(
                e['event'] == c['event'] for e in events):
            problems.add(_Ref(c['block_id']), 'test "%s" has no %s in its set-up, so this check checks nothing'
                         % (name, 'clap' if c['event'] == 'clap' else 'key press'), 'warning')
    if events:
        test['world'] = events
    if globals_:
        test['globals'] = globals_
        for var in _overwritten(program, globals_):
            problems.add(test_block, 'test "%s": the program sets "%s" when it starts, so the value of "set up" is lost' % (name, var), 'warning')
    test['max_time_ms'] = _seconds_field(test_block, 'SECONDS', problems, default=5)
    if not sim['checks']:
        problems.add(test_block, 'test "%s" checks nothing: put checks into it (or rules into its world)' % name, 'warning')
    if not invalid and SIM.start_pose(world, sim['start']) is not None:
        checked = set(c['item'] for c in sim['checks'] if c.get('item') and c['check'] in ('reaches', 'never_touches'))
        checked |= set([sim['until']]) if 'until' in sim else set()
        for _, message, severity in SIM.start_problems(world, sim['start'], checked):
            problems.add(test_block, 'test "%s": %s' % (name, message), severity)
    return test


class _Ref(object):
    """a block known by its id only (for a problem)"""

    def __init__(self, block_id):
        self.id = block_id


class _Suite(object):
    """the test blocks of a suite: tests by name (tests, worlds, the tests of worlds: one namespace), each test of a world
    with its world, and the simulation tests of the first kind"""

    def __init__(self, root, problems):
        self.chains = [[Block(b) for b in inst if _tag(b) == 'block'] for inst in root if _tag(inst) == 'instance']
        self.by_name = {}
        self.world_of = {}  # the id of a test of a world: its world block
        self.old = []
        for chain in self.chains:
            for top in chain:
                if top.disabled:
                    continue
                if top.type == OLD_SIM_TEST:
                    self.old.append(top)
                    problems.add(top, 'test "%s" is a simulation test of an older kind: it does not run. Build it again as a test of a '
                                      'simulation world' % (top.fields.get('NAME') or '').strip(), 'warning')
                elif top.type in TEST_TYPES:
                    self._add(top, problems)
                    if top.type == WORLD:
                        for test in _chain(top, 'TESTS'):
                            if test.type == SIM_TEST:
                                self.world_of[test.id] = top
                                self._add(test, problems)
                            else:
                                problems.add(test, 'only tests belong under "tests" of a simulation world')

    def _add(self, block, problems):
        name = (block.fields.get('NAME') or '').strip()
        if not name:
            problems.add(block, 'give the test a name')
        elif name in self.by_name:
            problems.add(block, 'there are two tests named "%s"' % name)
        else:
            self.by_name[name] = block

    def block(self, block_id):
        for chain in self.chains:
            for top in chain:
                for b in top.walk():
                    if b.id == block_id:
                        return b
        return None

    def tests_of(self, block, problems):
        """the test blocks a name or a block stands for: a test, all tests of a world, or one test of a world"""
        if block.type == WORLD:
            return [t for t in _chain(block, 'TESTS') if t.type == SIM_TEST]
        if block.type == SIM_TEST and block.id not in self.world_of:
            problems.add(block, 'test "%s": put this test into a simulation world' % (block.fields.get('NAME') or '').strip())
            return []
        return [block]

    def translate(self, block, program, problems):
        if block.type == SIM_TEST:
            return _translate_simcase(block, self.world_of[block.id], program, problems)
        return _translate_test(block, program, problems)


def translate_simulation(tests_xml, block_id, program=None):
    """(tests, problems) for a simulation world (all its tests) or one test of a world, whether or not the suite runs them
    (the Simulation tab runs them on their own). A test with errors is not among the tests: the problems say why."""
    problems = _Problems()
    suite = _Suite(ET.fromstring(tests_xml), _Problems())
    block = suite.block(block_id)
    if block is None or block.type not in (WORLD, SIM_TEST):
        problems.add(None, 'there is no simulation world or test %s' % block_id)
        return [], list(problems)
    tests = []
    for test_block in suite.tests_of(block, problems):
        own = _Problems()
        test = suite.translate(test_block, program, own)
        if not own.errors:
            own += [{'block_id': test_block.id, 'message': p, 'severity': 'error'} for p in validate_spec({'format': 'nepotest', 'tests': [test]})]
        if not own.errors:
            tests.append(test)
        problems += own
    return tests, list(problems)


def translate(tests_xml, program=None):
    """(spec, problems) for a test block_set. program (a NepoProgram) enables name checks.

    problems: [{'block_id', 'message', 'severity': 'error'|'warning'}]; the spec is runnable if there are no errors."""
    problems = _Problems()
    spec = {'format': 'nepotest', 'version': 1, 'program': 'program', 'tests': []}
    if not tests_xml:
        problems.add(None, 'the test suite is empty: build a test and put "run test" under the start block')
        return spec, list(problems)
    suite = _Suite(ET.fromstring(tests_xml), problems)
    starts = [c for c in suite.chains if c and c[0].type == 'nepoTest_suite']
    if not starts:
        problems.add(None, 'the start block of the test suite is missing')
        return spec, list(problems)
    old_names = [(b.fields.get('NAME') or '').strip() for b in suite.old]
    selected, chosen = [], set()  # test blocks, in the order they run; the names chosen by "run test" blocks
    for run in starts[0][1:]:
        if run.type != 'nepoTest_run' or run.disabled:
            continue
        name = run.fields.get('NAME') or ''
        if not name:
            problems.add(run, 'choose the test to run in "run test"')
        elif name in old_names:
            continue  # its warning is above
        elif name not in suite.by_name:
            problems.add(run, 'there is no test named "%s"' % name)
        elif name in chosen:
            problems.add(run, 'test "%s" is already in the suite' % name, 'warning')
        else:
            chosen.add(name)
            for block in suite.tests_of(suite.by_name[name], problems):
                if any(b.id == block.id for b in selected):
                    problems.add(run, 'test "%s" is already in the suite (with its world)' % (block.fields.get('NAME') or '').strip(), 'warning')
                else:
                    selected.append(block)
    ids = set(b.id for b in selected)
    for name, block in suite.by_name.items():
        if block.type == 'nepoTest_test' and block.id not in ids:
            problems.add(block, 'test "%s" is not under the start block, so it does not run' % name, 'warning')
        elif block.type == WORLD and not any(t.id in ids for t in suite.tests_of(block, _Problems())):
            problems.add(block, 'the tests of world "%s" are not under the start block, so they do not run' % name, 'warning')
    if not selected:
        problems.add(starts[0][0], 'put "run test" blocks under the start block')
    for block in selected:
        spec['tests'].append(suite.translate(block, program, problems))
    return spec, list(problems)
