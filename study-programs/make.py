"""Writes the programs every new account gets (ClientUser createUser, server property study.programs.dir: this folder), one file per program,
named after it:

- Familiarisation.xml: the familiarisation before the study. Its code works as it is: the robot drives forward, slightly to the left, and in
  front of a wall it stops and sounds an alarm (two tones). Its Tests tab has one test, which passes; its progress opens the warm-up set
  levels/00-familiarisation (L0: a wall on an empty floor).
- WithAI.xml, WithoutAI.xml: the two blank programs of the study (the start block, as a new program of the Edison), one per run; the level
  code (levels.code.ts) is added when a level is played, its version chosen per program in the Edit menu.

python make.py   (the Lab at localhost:1999 and a headless Chrome of phase 5, PHASE5_PORTS=9333: the test's blocks are made by the Lab, and the
                  program is checked: it beats L0, and the test passes)
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
sys.path.insert(0, os.path.join(ROOT, 'evaluation', 'phase5'))
import browser  # noqa: E402
import judge  # noqa: E402
from nepo import NS, curve, if_, obstacle, stop  # noqa: E402

LEVEL = os.path.join(ROOT, 'levels', '00-familiarisation', 'l0-familiarisation.json')
SET = '00-familiarisation'
HEAD = '<block_set xmlns="%s" robottype="edison" xmlversion="3.1" description="" tags="">' % NS
START = ('<block type="robControls_start" id="{id}" intask="true" deletable="false"><mutation declare="false"/>'
         '<field name="DEBUG">FALSE</field></block>')
LEFT, RIGHT = 48, 50  # slightly to the left: on L0 the robot meets the wall at about 26 degrees and its front sensor sees it in time


def tone(hz, ms):
    return ('<block type="robActions_play_tone" id="{id}" intask="true"><value name="FREQUENCE"><block type="math_integer" id="{id}" intask="true">'
            '<field name="NUM">%d</field></block></value><value name="DURATION"><block type="math_integer" id="{id}" intask="true"><field name="NUM">%d'
            '</field></block></value></block>') % (hz, ms)


def ids(xml, prefix):
    n = iter(range(1, 10000))
    return re.sub(r'\{id\}', lambda m: '%s%d' % (prefix, next(n)), xml)


def familiarisation_code():
    """forever: if an obstacle is ahead: stop, two tones (the alarm); else drive forward, slightly to the left"""
    body = if_((obstacle('FRONT'), [stop(), tone(880, 200), tone(440, 200)]), otherwise=[curve(LEFT, RIGHT)])
    return ids(HEAD + '<instance x="40" y="40">' + START + '<block type="robControls_loopForever" id="{id}" intask="true"><statement name="DO">'
               + body + '</statement></block></instance></block_set>', 'fam')


def blank(prefix):
    return ids(HEAD + '<instance x="512" y="50">' + START + '</instance></block_set>', prefix)


def test_world():
    """the test: L0's floor and wall, the area before the wall an ordinary goal (a test checks where the robot ended)"""
    level = json.load(open(LEVEL, encoding='utf-8'))
    world = json.loads(json.dumps(level['world']))
    for item in world['items']:
        item.pop('soft', None)
        item.pop('failOnHit', None)
    world['size'] = level['world']['size']
    test = {'name': 'Stops at the wall and sounds the alarm', 'start': 'A', 'until': None, 'max_time_ms': 20000, 'world': [], 'globals': {},
            'scenario': 'Given a wall ahead, when the program runs, then the robot stops in front of the wall without bumping into it and sounds '
                        'the alarm.',
            'checks': [{'check': 'never_bumps', 'item': 'w0wall'}, {'check': 'ends_in', 'item': 'w0goal'},
                       {'check': 'after', 'event': 'obstacle', 'within_ms': 500, 'does': 'plays_sound'}]}
    return {'name': 'A wall ahead', 'existing': False, 'data': {'version': 3, 'world': world, 'view': level['view']}, 'tests': [test]}


def progress_instance():
    progress = {'set': SET, 'sets': {SET: {'current': SET + '/l0-familiarisation', 'beaten': []}}, 'levels': {}}
    data = json.dumps(progress, separators=(',', ':')).replace('&', '&amp;').replace('<', '&lt;')
    return ('<instance x="0" y="0"><block type="nepoLevel_progress" id="nepoLevelProgress" intask="true"><data>%s</data></block></instance>' % data)


def main():
    browser.use(browser.PORTS[0])
    code = familiarisation_code()
    world = test_world()
    # the program beats L0
    level = json.load(open(LEVEL, encoding='utf-8'))
    won = judge.judge([{'key': 'L0', 'level': level, 'xml': code}], max_ms=60000)[0]
    print('L0:', won['outcome'], 'at', won.get('at_s'), 's')
    assert won['outcome'] in ('win', 'win_soft'), won
    # the test passes
    ran = browser.run_js(browser.fill('eval.js', JOBS=[{'key': 'test', 'worlds': [world], 'xml': code}]))['results'][0]
    print('test:', [(t['test'], t['outcome'], t['failed']) for t in ran['tests']])
    assert ran['tests'] and all(t['outcome'] == 'passed' for t in ran['tests']), ran
    # the test as Tests-tab blocks, made by the Lab (nepoTest.aiFormat suiteXml, as the AI assistant adds tests)
    suite = browser.run_js('const FORMAT = require("nepoTest.aiFormat"); return {xml: FORMAT.suiteXml(%s, "fam-test")};' % json.dumps([world]))['xml']
    tests = ''.join(re.findall(r'<instance [^>]*>.*?</instance>', suite, re.S))
    assert 'nepoTest_world' in tests and 'nepoTest_simcase' in tests
    programs = {'Familiarisation': code[:-len('</block_set>')] + tests + progress_instance() + '</block_set>',
                'WithAI': blank('wai'), 'WithoutAI': blank('woai')}
    for name, xml in programs.items():
        open(os.path.join(HERE, name + '.xml'), 'w', encoding='utf-8', newline='\n').write(xml + '\n')
        print('wrote', name + '.xml')


if __name__ == '__main__':
    main()
