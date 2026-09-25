"""Self-tests of the NEPO-level framework. Offline: they use the bundles in tests/fixtures (the six Edison golden programs,
converted by the Lab) and examples/clap_counter.bundle.json. test_lab_live.py checks that those are still current.

Run from NepoTest/:  python -m unittest discover -s tests -t .
"""

import contextlib
import io
import json
import os
import unittest

from nepotest import (Bundle, ConversionError, NepoProgram, TestSubject, World, run_spec, validate_spec)
from nepotest.__main__ import main as cli
from nepotest.sourcemap import SourceMap

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FIXTURES = os.path.join(HERE, 'fixtures')
CLAP = os.path.join(ROOT, 'examples', 'clap_counter.bundle.json')


def fixture(name):
    return TestSubject.from_bundle(os.path.join(FIXTURES, name + '.bundle.json'))


class SourceMapTest(unittest.TestCase):
    def test_innermost_and_spanning(self):
        source = 'x = f(1)\n'
        sm = SourceMap(source, {'blocks': {'set': {'type': 'variables_set', 'ranges': [[0, 8]]},
                                           'call': {'type': 'robProcedures_callreturn', 'ranges': [[4, 8]]},
                                           'one': {'type': 'math_number', 'ranges': [[6, 7]]}}})
        self.assertEqual(sm.blocks_at(6), ['one', 'call', 'set'])
        self.assertEqual(sm.blocks_spanning(4, 8), ['call', 'set'])
        self.assertEqual(sm.at_position((1, 1, 4, 8)), ['call', 'set'])
        self.assertEqual(sm.line_of('call'), 1)

    def test_utf8_columns_become_char_offsets(self):
        sm = SourceMap('___größe = 1\n', {'blocks': {}})
        self.assertEqual(sm.offset(1, len('___größe = '.encode('utf-8'))), len('___größe = '))


class NepoProgramTest(unittest.TestCase):
    def test_clap_counter_model(self):
        p = NepoProgram(Bundle.load(CLAP).xml)
        self.assertEqual([(v.name, v.type, v.initial) for v in p.variables], [('claps', 'Number', 0), ('goal', 'Number', 3)])
        self.assertEqual(sorted(p.functions), ['average', 'blink', 'clampSpeed'])
        self.assertEqual(p.functions['average'].params, [('a', 'Number'), ('b', 'Number')])
        self.assertEqual(p.functions['blink'].returns, None)
        self.assertEqual([b.type for b in p.main], ['controls_whileUntil', 'robProcedures_callnoreturn', 'robActions_motorDiff_on_for'])
        led = [b for b in p.blocks.values() if b.type == 'actions_led_edison'][0]
        self.assertEqual(p.function_of(led.id), 'blink')

    def test_hints(self):
        hints = NepoProgram(Bundle.load(CLAP).xml).describe()['test_hints']
        boundary = [h for h in hints if h['kind'] == 'boundary']
        self.assertIn({'values': [99, 100, 101], 'of': 'speed'}, [h['suggested'] for h in boundary])
        self.assertTrue(any(h['kind'] == 'wait_for_sensor' for h in hints))

    def test_block_errors_of_the_lab(self):
        data = Bundle.load(CLAP).data.copy()
        data.update(rc='error', edpy=None, message='ORA_PROGRAM_INVALID_STATEMETNS',
                    annotated_prog_xml='<block_set xmlns="http://de.fhg.iais.roberta.blockly"><instance x="0" y="0">'
                                       '<block type="robActions_play_tone" id="t1" intask="true"><error>NO_CONST_NOT_SUPPORTED</error>'
                                       '</block></instance></block_set>')
        with self.assertRaises(ConversionError) as ctx:
            TestSubject(Bundle(data))
        self.assertEqual(ctx.exception.block_errors, [('t1', 'robActions_play_tone', 'NO_CONST_NOT_SUPPORTED')])


class WorldTest(unittest.TestCase):
    def test_nepo_ports(self):
        robot = World().key('PLAY', 10).obstacle('FRONT', 0, 5).light('LLIGHT', 45).line('black').build_robot()
        self.assertEqual(robot._light['left'], 0)  # applied when the clock reaches t = 0
        robot._begin(None, None)
        self.assertEqual(robot.ed_ReadLeftLightLevel() // 10, 45)
        self.assertEqual(robot.ed_ReadLineState(), 1)

    def test_invalid_events(self):
        for bad in ({'event': 'key', 'port': 'START', 'at': 0}, {'event': 'tap', 'at': 0}, {'event': 'line', 'color': 'grey'}):
            with self.subTest(event=bad):
                with self.assertRaises(ValueError):
                    World([bad])


class ObservationTest(unittest.TestCase):
    def test_all_action_blocks_of_the_golden_action_program_decode(self):
        run = fixture('action').run(max_time_ms=200000)
        self.assertTrue(run.finished)
        by_type = dict((a['block'], a) for a in run.actions)
        self.assertEqual(by_type['robActions_motor_on']['power'], 1000)
        self.assertEqual(by_type['robActions_motorDiff_turn_for']['degrees'], 1000)
        self.assertEqual(by_type['robActions_motorDiff_curve_for']['power_left'], 1000)
        self.assertEqual(by_type['robActions_play_tone'], dict(by_type['robActions_play_tone'], frequency_hz=1000, duration_ms=1000))
        self.assertEqual(by_type['mbedActions_play_note']['frequency_hz'], 391.995)
        self.assertEqual([a['file'] for a in run.actions_of('robActions_play_file')], [0, 1])
        self.assertEqual(run.coverage.uncovered, [])

    def test_sensor_waits_and_reads(self):
        world = (World().key('PLAY', 500).key('REC', 600).obstacle('LEFT', 700, 750).obstacle('RIGHT', 800, 850)
                 .obstacle('FRONT', 900, 950).remote(3, 1000).line('black', 1100).clap(1200))
        run = fixture('sensors').run(world, max_time_ms=5000)
        self.assertTrue(run.finished)
        waits = run.actions_of('robControls_wait_for')
        self.assertEqual([w['t_end'] for w in waits][:2], [500.0, 600.0])
        types = set(r['type'] for r in run.sensor_reads.values())
        self.assertIn('robSensors_key_getSample', types)
        self.assertIn('robSensors_infrared_getSample', types)

    def test_errors_are_attributed_to_blocks(self):
        run = fixture('math_lists').run(max_steps=200000)
        self.assertEqual(run.status, 'error')
        self.assertEqual((run.error.kind, run.error.block_type, run.error.function), ('division_by_zero', 'math_arithmetic', 'math'))

    def test_calls_record_nepo_arguments_and_results(self):
        run = fixture('text_messages_functions').run()
        calls = dict((c['function'], c) for c in run.calls)
        self.assertEqual(calls['function_parameters']['args'], [0, True, [0, 0, 0]])
        self.assertEqual(calls['function_return_numberList']['returned'], [0, 0, 0])

    def test_loop_body_blocks_execute_per_iteration(self):
        result = TestSubject.from_bundle(CLAP).call('blink', 3)
        self.assertEqual(len(result.actions_of('actions_led_edison')), 6)


class SpecTest(unittest.TestCase):
    def spec(self, *tests):
        return {'format': 'nepotest', 'version': 1, 'program': 'clap_counter.xml', 'tests': list(tests)}

    def test_validation(self):
        s = TestSubject.from_bundle(CLAP)
        problems = validate_spec(self.spec(
            {'name': 'a', 'call': 'nope', 'expect': {'returns': 1}},
            {'name': 'b', 'call': 'average', 'args': [1], 'expect': {'returns': 1}},
            {'name': 'c', 'expect': {'variables': {'x': 1}, 'bogus': 1}},
            {'name': 'c', 'world': [{'event': 'tap'}], 'expect': {'status': 'done'}}), s)
        text = '\n'.join(problems)
        for fragment in ("no function 'nope'", 'average takes 2 arguments', "no variable 'x'", "unknown key 'bogus'",
                         "duplicate name 'c'", 'unknown world event', 'status must be one of'):
            self.assertIn(fragment, text)

    def test_matching(self):
        s = TestSubject.from_bundle(CLAP)
        world = [{'event': 'clap', 'at': t} for t in (1000, 2000, 3000)]
        results = run_spec(self.spec(
            {'name': 'range', 'world': world, 'expect': {'actions': [{'block': 'robActions_motorDiff_on_for', 'power': {'min': 90, 'max': 100}}]}},
            {'name': 'order', 'world': world, 'expect': {'actions': [{'block': 'robActions_motorDiff_on_for'}, {'block': 'actions_led_edison'}]}},
            {'name': 'count', 'world': world, 'expect': {'action_count': {'actions_led_edison': 6}}},
            {'name': 'never', 'world': world, 'expect': {'no_actions': [{'block': 'actions_led_edison', 'port': 'RLED'}]}},
            {'name': 'calls', 'world': world, 'expect': {'calls': [{'function': 'clampSpeed', 'returns': 100}]}},
            {'name': 'error', 'call': 'average', 'args': [32767, 2], 'expect': {'error': {'kind': 'overflow', 'function': 'average'}}},
            {'name': 'unexpected error', 'call': 'average', 'args': [32767, 2], 'expect': {'returns': 1}},
            {'name': 'bad test', 'call': 'average', 'args': ['x', 1], 'expect': {'returns': 1}},
        ), s)
        outcome = dict((t['name'], t['outcome']) for t in results['tests'])
        self.assertEqual(outcome, {'range': 'passed', 'order': 'failed', 'count': 'passed', 'never': 'passed', 'calls': 'passed',
                                   'error': 'passed', 'unexpected error': 'failed', 'bad test': 'error'})
        self.assertEqual(results['summary'], {'passed': 5, 'failed': 2, 'error': 1})
        self.assertEqual(results['coverage']['blocks_total'], 47)

    def test_cli_runs_the_example_file(self):
        # the example file contains one test that fails on purpose (generator quirk #14), so the exit code is 1
        out = os.path.join(HERE, 'fixtures', '_results.json')
        try:
            with contextlib.redirect_stdout(io.StringIO()) as printed:
                self.assertEqual(cli(['run', os.path.join(ROOT, 'examples', 'clap_counter.tests.json'), '--json', out]), 1)
            self.assertIn('FAILED  average of 4 and 6 is 5', printed.getvalue())
            with open(out, encoding='utf-8') as f:
                results = json.load(f)
            self.assertEqual(results['summary'], {'passed': 7, 'failed': 1, 'error': 0})
            self.assertEqual(results['coverage']['ratio'], 1.0)
        finally:
            if os.path.exists(out):
                os.remove(out)


class RobotAcceptsTheProgram(unittest.TestCase):
    """Level 0: the reference EdPy compiler accepts the EdPy the Lab generated (needs EDPY_HOME and EDPY_PYTHON)."""

    @unittest.skipUnless(__import__('nepotest.engine', fromlist=['edpy_check']).edpy_check.configured(),
                         'set EDPY_HOME and EDPY_PYTHON to run the reference EdPy compiler')
    def test_all_bundles_compile(self):
        bundles = [CLAP] + [os.path.join(FIXTURES, f) for f in sorted(os.listdir(FIXTURES)) if f.endswith('.bundle.json')]
        for path in bundles:
            with self.subTest(bundle=os.path.basename(path)):
                result = TestSubject.from_bundle(path).check_with_edpy()
                self.assertTrue(result.ok, result.messages)


if __name__ == '__main__':
    unittest.main()
