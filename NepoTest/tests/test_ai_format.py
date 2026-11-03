"""The AI test assistant's test JSON as Tests-tab blocks: the blocks the Lab makes of an answer (nepoTest.aiFormat.suiteXml, in the
browser) translate back to the answer's tests. The fixture tests/data/ai_format.json holds the answers (the context pack's examples and one that
uses every check and set-up), the worlds aiFormat made of them and the blocks; regenerate it when aiFormat changes (docs/ai/nepo-ai-tests.md)."""

import json
import os
import unittest

from nepotest import simulation as SIM
from nepotest import validate_spec
from nepotest.blocks import translate

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURE = os.path.join(HERE, 'data', 'ai_format.json')


def load():
    with open(FIXTURE, encoding='utf-8') as f:
        return json.load(f)['cases']


def expected_check(c):
    """a check of the answer as blocks.py makes it (the defaults of the blocks filled in)"""
    check = dict(c)
    kind = check['check']
    if kind in ('does', 'whenever'):
        check.setdefault('after_ms', SIM.DEFAULT_REACTION_MS[kind])
    if kind == 'whenever' and check['when'] in SIM.LIGHT_CONDITIONS:
        check.setdefault('percent', 50)
    if kind == 'after':
        check.setdefault('within_ms', 500)
    if kind == 'variable':
        check.setdefault('op', 'EQ')
    return check


def expected_tests(case):
    """the answer's tests in NepoTest's JSON, each with its world as aiFormat resolved it"""
    tests = []
    for world, resolved in zip(case['answer']['worlds'], case['worlds']):
        for t in world['tests']:
            sim = {'world_name': resolved['name'], 'world': SIM.world_v3(resolved['data']['world']), 'start': t['start'],
                   'checks': [expected_check(c) for c in t['checks']]}
            if t.get('until'):
                sim['until'] = t['until']
            test = {'name': t['name'], 'origin': 'blocks', 'simulation': sim, 'max_time_ms': t['max_time_ms']}
            if t.get('world'):
                test['world'] = t['world']
            if t.get('globals'):
                test['globals'] = t['globals']
            tests.append(test)
    return tests


def without_ids(test):
    test = json.loads(json.dumps(test))
    test.pop('block_id', None)
    test['simulation'].pop('world_block_id', None)
    for c in test['simulation']['checks']:
        c.pop('block_id', None)
    return test


class AiFormatTest(unittest.TestCase):
    def test_the_fixture_has_the_examples_and_every_kind_of_check(self):
        cases = load()
        self.assertEqual(['1-follow-the-line', '3-park-in-the-box', 'synthetic'], [c['name'] for c in cases])
        kinds = set(c['check'] for case in cases for w in case['answer']['worlds'] for t in w['tests'] for c in t['checks'])
        self.assertEqual({'reaches', 'never_touches', 'ends_in', 'never_bumps', 'does', 'whenever', 'after', 'variable'}, kinds)
        for case in cases:
            self.assertEqual([], case['problems'], case['name'])

    def test_blocks_made_from_json_translate_back_to_the_same_tests(self):
        for case in load():
            with self.subTest(case['name']):
                spec, problems = translate(case['xml'])
                self.assertEqual([], [p for p in problems if p['severity'] == 'error'])
                self.assertEqual(expected_tests(case), [without_ids(t) for t in spec['tests']])
                self.assertEqual([], validate_spec(spec))

    def test_the_worlds_are_the_ones_the_model_drew(self):
        for case in load():
            for world, resolved in zip(case['answer']['worlds'], case['worlds']):
                with self.subTest(case['name'] + ': ' + world['name']):
                    self.assertEqual(SIM.world_v3(world['world']), SIM.world_v3(resolved['data']['world']))

    def test_the_provenance_is_in_the_test_blocks(self):
        case = load()[0]
        self.assertIn('<data>{&quot;ai&quot;:{&quot;call&quot;:&quot;fixture&quot;', case['xml'])
        self.assertNotIn('&quot;ai&quot;', case['xml'].split('<statement name="TESTS">')[0])  # not in the world's data


if __name__ == '__main__':
    unittest.main()
