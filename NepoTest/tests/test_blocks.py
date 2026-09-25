"""Test suites built from NEPO test blocks (the Lab's Tests tab): translation to the test format, the browser API used
by the Lab's Pyodide worker, and the CLI for programs with an embedded test suite. Offline (uses the example bundle)."""

import contextlib
import io
import json
import os
import unittest

from nepotest import Bundle, NepoProgram, TestSubject, run_spec, validate_spec
from nepotest import browser
from nepotest.__main__ import main as cli
from nepotest.blocks import split_program, translate

HERE = os.path.dirname(os.path.abspath(__file__))
EXAMPLES = os.path.join(os.path.dirname(HERE), 'examples')
WITH_TESTS = os.path.join(EXAMPLES, 'clap_counter_with_tests.xml')
BUNDLE = os.path.join(EXAMPLES, 'clap_counter.bundle.json')
NS = 'xmlns="http://de.fhg.iais.roberta.blockly"'


def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


def suite(*tests, run=None):
    """a tests block_set: the start block with run blocks for `run` (default: all), plus the test blocks"""
    names = run if run is not None else [t[0] for t in tests]
    runs = ''.join('<block type="nepoTest_run" id="r%d"><field name="NAME">%s</field></block>' % (i, n) for i, n in enumerate(names))
    defs = ''.join('<instance x="0" y="0"><block type="nepoTest_test" id="%s"><field name="NAME">%s</field>%s</block></instance>'
                   % ('d%d' % i, name, body) for i, (name, body) in enumerate(tests))
    return '<block_set %s><instance x="0" y="0"><block type="nepoTest_suite" id="s"></block>%s</instance>%s</block_set>' % (NS, runs, defs)


CALL_CLAMP = ('<statement name="WHEN"><block type="nepoTest_when_call" id="w"><mutation name="clampSpeed"><arg name="speed" type="Number"/>'
              '</mutation><field name="FUNCTION">clampSpeed</field><value name="ARG0"><block type="math_number" id="n"><field name="NUM">150</field>'
              '</block></value></block></statement>')
EXPECT_100 = ('<statement name="THEN"><block type="nepoTest_expect_result" id="e"><field name="OP">EQ</field><value name="VALUE">'
              '<block type="math_number" id="v"><field name="NUM">100</field></block></value></block></statement>')


class SplitTest(unittest.TestCase):
    def test_split(self):
        program, tests = split_program(read(WITH_TESTS))
        self.assertNotIn('nepoTest_', program)
        self.assertIn('robControls_start', program)
        self.assertEqual(tests.count('<instance'), 9)  # the suite + 8 tests
        self.assertEqual(split_program(read(os.path.join(EXAMPLES, 'clap_counter.xml')))[1], None)


class TranslateTest(unittest.TestCase):
    def test_example_suite_runs_like_the_json_example(self):
        program, tests = split_program(read(WITH_TESTS))
        spec, problems = translate(tests, NepoProgram(program))
        self.assertEqual(problems, [])
        subject = TestSubject.from_bundle(BUNDLE)
        self.assertEqual(validate_spec(spec, subject), [])
        results = run_spec(spec, subject)
        self.assertEqual(results['summary'], {'passed': 7, 'failed': 1, 'error': 0})
        self.assertEqual(results['coverage']['ratio'], 1.0)
        failed = [t for t in results['tests'] if t['outcome'] == 'failed']
        self.assertEqual([t['name'] for t in failed], ['average of 4 and 6 is 5'])
        self.assertTrue(failed[0]['block_id'])  # results link back to the test block

    def test_matchers(self):
        _, tests = split_program(read(WITH_TESTS))
        spec, _ = translate(tests)
        drive = spec['tests'][5]['expect']
        self.assertEqual(drive['actions'], [{'action': 'drive', 'dir': 'forward', 'power': 100, 'distance_cm': 10}])
        self.assertEqual(drive['action_count'], [{'match': {'action': 'led', 'port': 'LLED'}, 'count': 6}])
        self.assertEqual(spec['tests'][6]['expect']['no_actions'][0], {'action': 'drive'})  # ANY and empty inputs mean "any"

    def test_comparisons(self):
        body = CALL_CLAMP + EXPECT_100.replace('>EQ<', '>GTE<')
        spec, problems = translate(suite(('t', body)))
        self.assertEqual(problems, [])
        self.assertEqual(spec['tests'][0]['expect']['returns'], {'min': 100})

    def problems(self, xml, program=None):
        return [(p['block_id'], p['severity'], p['message']) for p in translate(xml, program)[1]]

    def test_problems_point_to_blocks(self):
        program = NepoProgram(split_program(read(WITH_TESTS))[0])
        p = self.problems(suite(('no when', EXPECT_100)), program)
        self.assertIn(('d0', 'error', 'test "no when": put "run the program" or "call function" under "when"'), p)
        p = self.problems(suite(('a', CALL_CLAMP + EXPECT_100), ('a', CALL_CLAMP + EXPECT_100), run=['a']), program)
        self.assertIn(('d1', 'error', 'there are two tests named "a"'), p)
        p = self.problems(suite(('a', CALL_CLAMP + EXPECT_100), run=['a', 'b']), program)
        self.assertIn(('r1', 'error', 'there is no test named "b"'), p)
        p = self.problems(suite(('a', CALL_CLAMP + EXPECT_100), ('unused', CALL_CLAMP + EXPECT_100), run=['a']), program)
        self.assertIn(('d1', 'warning', 'test "unused" is not under the start block, so it does not run'), p)
        run = '<statement name="WHEN"><block type="nepoTest_when_run" id="w"><field name="SECONDS">5</field></block></statement>'
        p = self.problems(suite(('r', run + EXPECT_100)), program)
        self.assertIn(('e', 'error', '"expect the result" only works with "call function"'), p)
        p = self.problems(suite(('c', CALL_CLAMP.replace('clampSpeed', 'nope') + EXPECT_100)), program)
        self.assertIn(('w', 'error', 'the program has no function "nope"'), p)
        p = self.problems(suite(('f', CALL_CLAMP.replace('>150<', '>1.5<') + EXPECT_100)), program)
        self.assertIn(('n', 'error', 'the Edison only knows whole numbers (1.5)'), p)
        self.assertEqual(self.problems(suite(), program)[0][2], 'put "run test" blocks under the start block')


class BrowserApiTest(unittest.TestCase):
    """the functions the Lab's Pyodide worker calls, with JSON strings in and out"""

    def test_prepare_run_finish(self):
        _, tests = split_program(read(WITH_TESTS))
        prepared = json.loads(browser.prepare(read(BUNDLE), tests))
        self.assertEqual((prepared['problems'], prepared['conversion_errors']), ([], []))
        reports = [json.loads(browser.run_one(i)) for i in range(len(prepared['tests']))]
        self.assertEqual([r['outcome'] for r in reports].count('passed'), 7)
        done = json.loads(browser.finish())
        self.assertEqual(done['summary'], {'passed': 7, 'failed': 1, 'error': 0})
        self.assertEqual(done['coverage']['blocks_covered'], 47)

    def test_translate_for_the_code_view(self):
        program, tests = split_program(read(WITH_TESTS))
        result = json.loads(browser.translate_tests(tests, program))
        self.assertEqual(len(result['spec']['tests']), 8)
        self.assertEqual(result['problems'], [])

    def test_conversion_errors_are_reported(self):
        data = Bundle.load(BUNDLE).data.copy()
        data.update(rc='error', edpy=None, message='ORA_PROGRAM_INVALID_STATEMETNS',
                    annotated_prog_xml='<block_set %s><instance x="0" y="0"><block type="robActions_play_tone" id="t1">'
                                       '<error>NO_CONST_NOT_SUPPORTED</error></block></instance></block_set>' % NS)
        prepared = json.loads(browser.prepare(json.dumps(data), suite()))
        self.assertEqual(prepared['conversion_errors'], [{'block_id': 't1', 'block_type': 'robActions_play_tone', 'key': 'NO_CONST_NOT_SUPPORTED'}])


class FormatAdditionsTest(unittest.TestCase):
    """the parts of the test format that the blocks need: action kinds, 'not', 'any' errors, counted matchers"""

    def spec(self, *tests):
        return {'format': 'nepotest', 'version': 1, 'program': 'p', 'tests': list(tests)}

    def test_action_kind_and_direction(self):
        subject = TestSubject.from_bundle(BUNDLE)
        world = [{'event': 'clap', 'at': t} for t in (1000, 2000, 3000)]
        run = subject.run(__import__('nepotest').World(world), max_time_ms=10000)
        drive = run.actions_of('robActions_motorDiff_on_for')[0]
        self.assertEqual((drive['action'], drive['dir'], drive['direction']), ('drive', 'forward', 'FOREWARD'))
        self.assertEqual(set(a['action'] for a in run.actions), {'wait_for', 'led', 'wait', 'drive'})

    def test_not_any_and_counted_matchers(self):
        subject = TestSubject.from_bundle(BUNDLE)
        world = [{'event': 'clap', 'at': t} for t in (1000, 2000, 3000)]
        results = run_spec(self.spec(
            {'name': 'not', 'call': 'clampSpeed', 'args': [150], 'expect': {'returns': {'not': 150}}},
            {'name': 'not fails', 'call': 'clampSpeed', 'args': [150], 'expect': {'returns': {'not': 100}}},
            {'name': 'any error', 'call': 'average', 'args': [32767, 2], 'expect': {'error': 'any'}},
            {'name': 'count', 'world': world, 'expect': {'action_count': [{'match': {'action': 'led', 'mode': 'ON'}, 'count': 3}]}},
            {'name': 'count range', 'world': world, 'expect': {'action_count': [{'match': {'action': 'wait'}, 'count': {'min': 7}}]}},
        ), subject)
        self.assertEqual(dict((t['name'], t['outcome']) for t in results['tests']),
                         {'not': 'passed', 'not fails': 'failed', 'any error': 'passed', 'count': 'passed', 'count range': 'failed'})


class CliTest(unittest.TestCase):
    def test_validate_a_program_with_tests(self):
        with contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(cli(['validate', WITH_TESTS]), 0)
        self.assertIn('valid (8 tests)', out.getvalue())


if __name__ == '__main__':
    unittest.main()
