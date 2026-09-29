"""The robot's state over time (nepotest.states): the engine's state log, the NEPO-level timeline, state expectations
with every timing, measurements, and validation. Offline: uses examples/patrol.bundle.json (converted by the Lab).

Run from NepoTest/:  python -m unittest tests.test_states
"""

import json
import os
import unittest

from nepotest import TestSubject, World, load_spec, run_spec, subject_for, validate_spec
from nepotest import states as ST
from nepotest.engine import Robot

HERE = os.path.dirname(os.path.abspath(__file__))
EXAMPLES = os.path.join(os.path.dirname(HERE), 'examples')
PATROL = os.path.join(EXAMPLES, 'patrol.bundle.json')
OBSTACLE = World().obstacle('FRONT', 2000, 2500)


def patrol():
    return TestSubject.from_bundle(PATROL)


def snapshot(left=('stopped', 0), right=('stopped', 0), **more):
    state = dict(ST.INITIAL, **{'motor.left': left, 'motor.right': right})
    for k, v in more.items():
        state[k.replace('_', '.', 1)] = v
    return state


class EngineStateLogTest(unittest.TestCase):
    def test_changes_are_logged_once_with_time_and_cause(self):
        robot = Robot()
        robot._begin(None, None)
        robot.trace.append(None)  # pretend an Ed call is in progress (index 0)
        robot.ed_LeftLed(1)
        robot.ed_LeftLed(1)  # no change: not logged
        self.assertEqual([(c.t, c.key, c.value, c.cause, c.kind) for c in robot.state_log], [(0.0, 'led.left', True, 0, 'set')])

    def test_a_distance_drive_ends_by_itself(self):
        robot = Robot()
        robot._begin(None, None)
        robot.trace.append(None)
        robot.ed_Drive(robot_constant('FORWARD'), 5, 10)  # 10 cm at level 5 (12.5 cm/s): 800 ms
        log = [(round(c.t, 1), c.key, c.value, c.kind) for c in robot.state_log]
        self.assertEqual(log, [(0.0, 'motor.left', (1, 5), 'set'), (0.0, 'motor.right', (1, 5), 'set'),
                               (800.0, 'motor.left', (0, 0), 'end'), (800.0, 'motor.right', (0, 0), 'end')])
        self.assertTrue(all(c.cause == 0 for c in robot.state_log))

    def test_a_sound_ends_after_its_duration(self):
        robot = Robot()
        robot._begin(None, None)
        robot.trace.append(None)
        robot.ed_PlayTone(18181, 200)
        robot._advance(300)
        self.assertEqual([(c.t, c.key, c.value) for c in robot.state_log], [(0.0, 'sound', ('tone', 18181)), (200.0, 'sound', None)])


def robot_constant(name):
    from nepotest.engine.values import CONSTANTS
    return CONSTANTS[name]


class TimelineTest(unittest.TestCase):
    def test_the_patrol_run(self):
        run = patrol().run(OBSTACLE, max_time_ms=20000)
        tl = run.timeline
        self.assertEqual(ST.movement(tl.at(1500).state), ('forward', 50))
        self.assertEqual(ST.movement(tl.at(2001).state), ('still', 0))
        self.assertEqual(tl.at(2100).state['sound'], {'kind': 'tone', 'frequency_hz': 440})  # 8000000/440, from the tone block
        self.assertIsNone(tl.at(2300).state['sound'])
        self.assertEqual(tl.at(11000).state['motor.left'], ('forward', 30))
        self.assertEqual(tl.moments[-1].t, run.time_ms - 2)  # the last change: the stop block, before its clap read
        self.assertEqual(tl.start, 254.0)
        stop = tl.at(2001)
        self.assertEqual(stop.cause['motor.left'], 'pt17')  # the stop block
        self.assertEqual(stop.since['motor.left'], 2001.0)

    def test_the_motor_calls_of_one_block_are_one_change(self):
        """_diffCurve starts the wheels 1 ms apart and stops the other wheel 1 ms after the first has driven its distance"""
        tl = patrol().call('curveLeft').timeline
        self.assertEqual([(round(m.t, 1), ST.movement(m.state)[0]) for m in tl.moments], [(0.0, 'still'), (255.0, 'curve_left'), (1590.3, 'still')])

    def test_variables_are_tracked_on_request(self):
        s = patrol()
        self.assertNotIn('var.sides', s.call('square', 20).timeline.moments[-1].state)
        tl = s.call('square', 20, track_variables=True).timeline
        self.assertEqual([m.state['var.sides'] for m in tl.moments if 'var.sides' in m.changed], [0, 1, 2, 3, 4])

    def test_spans(self):
        tl = patrol().call('blink', 2).timeline  # LED on at 254, off 456, on 658, off 860
        leds = [(s, e, m.state['led.left']) for m, s, e in tl.spans(300, 700)]
        self.assertEqual(leds, [(300, 456.0, True), (456.0, 658.0, False), (658.0, 700, True)])
        self.assertEqual(len(tl.spans(456, 456)), 1)  # a point in time: the moment that holds then


class StatesTest(unittest.TestCase):
    def test_movement(self):
        cases = [((('forward', 50), ('forward', 50)), ('forward', 50)), ((('backward', 30), ('backward', 30)), ('backward', 30)),
                 ((('forward', 50), ('backward', 50)), ('turn_right', 50)), ((('backward', 50), ('forward', 50)), ('turn_left', 50)),
                 ((('forward', 30), ('forward', 60)), ('curve_left', None)), ((('forward', 30), ('stopped', 0)), ('curve_right', None)),
                 ((('backward', 30), ('backward', 60)), ('curve_right', None)), ((('stopped', 0), ('stopped', 0)), ('still', 0))]
        for (left, right), expected in cases:
            with self.subTest(left=left, right=right):
                self.assertEqual(ST.movement(snapshot(left, right)), expected)

    def test_power_is_compared_in_the_robots_steps(self):
        running = snapshot(('forward', 50), ('forward', 50))
        for power, ok in ((50, True), (45, True), (54, True), (44, False), (55, False), ({'min': 45}, True), ({'max': 40}, False)):
            with self.subTest(power=power):
                self.assertEqual(ST.holds({'motor': 'left', 'is': 'forward', 'power': power}, running), ok)
        full = snapshot(('forward', 100), ('forward', 100))
        self.assertTrue(ST.holds({'robot': 'forward', 'power': 150}, full))  # the robot clamps to level 10

    def test_states(self):
        s = snapshot(('forward', 50), ('stopped', 0), led_left=True, sound={'kind': 'tone', 'frequency_hz': 440})
        s['var.x'] = 3
        yes = [{'motor': 'left', 'is': 'running'}, {'motor': 'right', 'is': 'stopped'}, {'robot': 'curve_right'},
               {'led': 'left', 'is': 'on'}, {'led': 'either', 'is': 'on'}, {'led': 'both', 'is': 'off', 'x': 1} if False else {'led': 'right', 'is': 'off'},
               {'sound': 'tone', 'frequency_hz': {'approx': 441, 'tol': 1}}, {'sound': 'any'}, {'variable': 'x', 'value': {'min': 3}},
               {'all': [{'led': 'left'}, {'variable': 'x', 'value': 3}]}, {'any': [{'robot': 'still'}, {'sound': 'tone'}]},
               {'not': {'motor': 'both', 'is': 'running'}}]
        no = [{'motor': 'both', 'is': 'forward'}, {'led': 'both', 'is': 'on'}, {'sound': 'silent'}, {'sound': 'file'},
              {'variable': 'y', 'value': 3}, {'robot': 'forward'}]
        for spec in yes:
            with self.subTest(spec=spec):
                self.assertTrue(ST.holds(spec, s))
        for spec in no:
            with self.subTest(spec=spec):
                self.assertFalse(ST.holds(spec, s))

    def test_in_words(self):
        self.assertEqual(ST.describe({'motor': 'left', 'is': 'forward', 'power': 50}), 'the left motor runs forward at 50 %')
        self.assertEqual(ST.describe({'motor': 'both', 'is': 'stopped'}), 'both motors are stopped')
        self.assertEqual(ST.describe({'all': [{'robot': 'still'}, {'led': 'left', 'is': 'off'}]}), 'the robot stands still and the left LED is off')
        self.assertEqual(ST.describe({'variable': 'sides', 'value': {'min': 3}}), 'sides ≥ 3')
        self.assertEqual(ST.describe({'sound': 'tone', 'frequency_hz': {'approx': 440, 'tol': 1}}), 'the robot plays a tone of ≈ 440 (± 1) Hz')


class TimingTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.observed = patrol().run(OBSTACLE, max_time_ms=20000, track_variables=True)
        cls.events = OBSTACLE.to_json()

    def check(self, *entries):
        return ST.check(list(entries), self.observed.timeline, self.events)

    def test_at(self):
        self.assertEqual(self.check({'state': {'robot': 'forward', 'power': 50}, 'at': 1500}, {'state': {'robot': 'still'}, 'at': 'end'}), [])
        f, = self.check({'state': {'robot': 'still'}, 'at': 1500})
        self.assertEqual(f['message'], 'at 1500 ms: expected: the robot stands still, but the robot drives forward at 50 % (since 255 ms)')
        self.assertEqual(f['block_id'], 'pt11')  # the drive block made the robot drive
        self.assertTrue(f['described'])
        f, = self.check({'state': {'robot': 'still'}, 'at': 99999})
        self.assertIn('the run ended at 11427 ms', f['message'])

    def test_always_never_sometime(self):
        ok = [{'state': {'led': 'left', 'is': 'on'}, 'always': {'from': 300, 'to': 2000}},
              {'state': {'robot': 'backward'}, 'never': {}},
              {'state': {'robot': 'turn_right'}, 'sometime': {}},
              {'state': {'variable': 'sides', 'value': {'max': 4}}, 'always': {}}]
        self.assertEqual(self.check(*ok), [])
        f, = self.check({'state': {'led': 'left', 'is': 'on'}, 'always': {}})
        self.assertIn('at 2003 ms the left LED is off', f['message'])
        f, = self.check({'state': {'robot': 'turn_right'}, 'never': {'from': 0, 'to': 5000}})
        self.assertIn('from 0 to 5000 ms: expected never: the robot turns right, but at 3809 ms', f['message'])
        f, = self.check({'state': {'robot': 'turn_left'}, 'sometime': {}})
        self.assertIn('it never happened. There was:', f['message'])

    def test_after_an_event(self):
        self.assertEqual(self.check({'state': {'robot': 'still'}, 'after': {'event': 'obstacle'}, 'within_ms': 10}), [])
        f, = self.check({'state': {'robot': 'still'}, 'after': {'event': 'clap'}, 'within_ms': 10})
        self.assertEqual(f['message'], 'there is no "clap" in "given" of this test')
        f, = self.check({'state': {'sound': 'tone'}, 'after': {'event': 'obstacle', 'edge': 'end'}, 'within_ms': 100})
        self.assertIn('within 100 ms after the obstacle disappears at 2500 ms', f['message'])

    def test_while_a_condition_holds(self):
        f, = self.check({'state': {'robot': 'still'}, 'while': {'obstacle': 'FRONT'}, 'delay_ms': 50})
        self.assertIn('at 2207 ms the robot drives forward at 50 %', f['message'])
        short = [{'event': 'obstacle', 'port': 'FRONT', 'from': 2000, 'to': 2150}]  # gone before the square starts at 2207 ms
        self.assertEqual(ST.check([{'state': {'robot': 'still'}, 'while': {'obstacle': 'FRONT'}, 'delay_ms': 50}], self.observed.timeline, short), [])
        f, = self.check({'state': {'robot': 'still'}, 'while': {'line': 'black'}})
        self.assertIn('never happens in this test', f['message'])
        f, = self.check({'state': {'robot': 'still'}, 'while': {'obstacle': 'any'}, 'delay_ms': 600})
        self.assertIn('never lasts longer than 600 ms', f['message'])

    def test_duration_and_starts(self):
        self.assertEqual(self.check({'state': {'sound': 'tone'}, 'for_ms': 200}, {'state': {'robot': 'turn_right'}, 'starts': 4},
                                    {'state': {'variable': 'sides', 'value': {'min': 1}}, 'starts': 1}), [])
        f, = self.check({'state': {'led': 'left', 'is': 'on'}, 'for_ms': {'min': 5000}})
        self.assertEqual(f['actual'], 1749)
        f, = self.check({'state': {'robot': 'forward'}, 'starts': 1})
        self.assertEqual(f['actual'], 5)


class WorldTest(unittest.TestCase):
    def test_events_and_conditions(self):
        world = [{'event': 'line', 'color': 'black', 'at': 100}, {'event': 'line', 'color': 'black', 'at': 200},
                 {'event': 'line', 'color': 'white', 'at': 300}, {'event': 'obstacle', 'port': 'LEFT', 'from': 50, 'to': 150},
                 {'event': 'obstacle', 'port': 'FRONT', 'from': 120, 'to': None}, {'event': 'light', 'port': 'LLIGHT', 'value': 80, 'at': 400}]
        self.assertEqual(ST.event_times({'event': 'line', 'color': 'black'}, world), [100])  # changes only
        self.assertEqual(ST.event_times({'event': 'obstacle', 'edge': 'end'}, world), [150])
        self.assertEqual(ST.condition_intervals({'line': 'white'}, world, 1000), [(0, 100), (300, 1000)])
        self.assertEqual(ST.condition_intervals({'obstacle': 'any'}, world, 1000), [(50, 1000)])
        self.assertEqual(ST.condition_intervals({'light': 'LLIGHT', 'value': {'min': 50}}, world, 1000), [(400, 1000)])


class MeasurementTest(unittest.TestCase):
    def test_the_square(self):
        result = patrol().call('square', 20)
        self.assertEqual(result.pose, {'x_cm': 0.0, 'y_cm': 0.0, 'heading_deg': -360.0, 'distance_cm': 80.0})
        ok = {'distance_cm': {'approx': 80, 'tol': 1}, 'heading_deg': {'approx': -360, 'tol': 5},
              'end_position': {'ahead_cm': 0, 'left_cm': 0, 'tol_cm': 1}}
        self.assertEqual(ST.check_measurements(ok, result.pose), [])
        bad = ST.check_measurements({'distance_cm': 40, 'end_position': {'ahead_cm': 20, 'left_cm': 0, 'tol_cm': 1}}, result.pose)
        self.assertEqual([f['expect'] for f in bad], ['distance_cm', 'end_position'])
        self.assertIn('but it drove 80 cm', bad[0]['message'])


class SpecTest(unittest.TestCase):
    def test_the_example_file(self):
        spec = load_spec(os.path.join(EXAMPLES, 'patrol.tests.json'))
        subject = subject_for(spec)
        self.assertEqual(validate_spec(spec, subject), [])
        results = run_spec(spec, subject)
        self.assertEqual(results['summary'], {'passed': 6, 'failed': 1, 'error': 0})
        failed, = [t for t in results['tests'] if t['outcome'] == 'failed']
        self.assertEqual(failed['name'], 'stands still while the obstacle is there')  # the deliberate one
        self.assertEqual(failed['failures'][0]['block_id'], 'pt44')  # the square's drive block
        square = [t for t in results['tests'] if t['name'] == 'the square ends where it started'][0]
        self.assertEqual(square['pose']['heading_deg'], -360.0)
        json.dumps(results)  # JSON-able

    def test_validation(self):
        subject = patrol()
        spec = {'format': 'nepotest', 'version': 1, 'tests': [{'name': 't', 'expect': {'states': [
            {'state': {'motor': 'left', 'is': 'stopped', 'power': 50}, 'at': 'end'},
            {'state': {'robot': 'still'}, 'at': 'end', 'always': {}},
            {'state': {'sound': 'silent', 'frequency_hz': 440}, 'at': 5},
            {'state': {'variable': 'nope', 'value': 1}, 'at': 'end'},
            {'state': {'led': 'left'}, 'after': {'event': 'tap'}},
            {'state': {'led': 'left'}, 'while': {'line': 'grey'}},
            {'state': {'led': 'left'}, 'starts': 1, 'delay_ms': 5}],
            'end_position': {'ahead': 3}}}]}
        problems = validate_spec(spec, subject)
        for part in ('power: a power', 'needs exactly one timing', 'frequency_hz: a matcher, and only for "tone"', "no variable 'nope'",
                     'must be an event', '.line must be black or white', '"delay_ms" only goes with "while"', 'end_position must be'):
            with self.subTest(part=part):
                self.assertTrue(any(part in p for p in problems), problems)
        self.assertIn('needs "within_ms"', ' '.join(problems))


class HintTest(unittest.TestCase):
    def test_movement_hints(self):
        import re
        from nepotest import NepoProgram
        with open(os.path.join(EXAMPLES, 'patrol.xml'), encoding='utf-8') as f:
            xml = f.read()
        xml = re.sub(r'(id="pt12" intask="true">\s*<field name="NUM">)50', r'\g<1>3', xml)  # drive at 3 %
        xml = re.sub(r'(id="pt25" intask="true">\s*<field name="NUM">)30', r'\g<1>45', xml)  # motor on at 45 %
        hints = dict((h['block_id'], h) for h in NepoProgram(xml).describe()['test_hints'] if h['kind'] == 'movement')
        self.assertEqual(hints['pt11']['suggested']['note'], 'power 3 is below 5 %: the motor stops')
        self.assertEqual(hints['pt24']['suggested']['note'], 'power 45 runs at 50 % (the robot has 10 % steps)')
        self.assertNotIn('note', hints['pt44']['suggested'])  # 50 %: exact


class SchemaTest(unittest.TestCase):
    def test_the_examples_match_the_schema(self):
        try:
            import jsonschema
        except ImportError:
            self.skipTest('pip install jsonschema to check the schema (nepotest itself needs only the standard library)')
        from nepotest.blocks import split_program, translate
        with open(os.path.join(os.path.dirname(HERE), 'schema', 'nepo-tests.schema.json'), encoding='utf-8') as f:
            schema = json.load(f)
        for name in ('patrol.tests.json', 'clap_counter.tests.json'):
            with open(os.path.join(EXAMPLES, name), encoding='utf-8') as f:
                jsonschema.validate(json.load(f), schema)
        with open(os.path.join(EXAMPLES, 'patrol_with_tests.xml'), encoding='utf-8') as f:
            jsonschema.validate(translate(split_program(f.read())[1])[0], schema)


if __name__ == '__main__':
    unittest.main()
