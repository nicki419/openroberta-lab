"""Phase 5, round 4 (2026-11-07): the Lab's new checks (nepoTest.aiFormat tunnelProblems, startProblems, exitProblems; nepoTest.aiStrategy
arrivalProblems) on the tests of an earlier round, as they were generated and evaluated: which tests would they have sent back, and were those
false alarms (failed on a correct version) or valid tests? Also on the context pack's example answers and the recipes of check_round4.py, which
must pass. Prints a summary; writes <results>/rules.json.

PHASE5_RESULTS=results-r3 python check_rules.py   (the Lab and one Chrome of browser.PORTS run)
"""
import glob
import json
import os
import re

import browser
import report
from check_round4 import stops, bends

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.environ.get('PHASE5_RESULTS', 'results-r3')
R = os.path.join(HERE, RESULTS)
PACK = os.path.join(HERE, '..', '..', 'OpenRobertaServer', 'src', 'main', 'resources', 'ai', 'examples')


def example_answers():
    """the generate answers of the context pack's examples (the worlds as drawn: the checks work on their items)"""
    out = []
    for f in sorted(glob.glob(os.path.join(PACK, '*.md'))):
        text = open(f, encoding='utf-8').read()
        for k, block in enumerate(re.findall(r'```json\n(.*?)\n```', text, re.S)):
            try:
                a = json.loads(block)
            except ValueError:
                continue
            worlds = [{'name': w['name'], 'data': {'world': w['world']}, 'tests': w.get('tests', [])} for w in a.get('worlds', []) if w.get('world')]
            worlds and out.append({'id': 'example %s #%d' % (os.path.basename(f), k), 'worlds': worlds})
    return out


def main():
    cases, outcome = [], {}
    for f in sorted(glob.glob(os.path.join(R, 'generated', '*.json'))):
        g = json.load(open(f, encoding='utf-8'))
        cases.append({'id': os.path.basename(f)[:-5], 'worlds': (g.get('generate') or {}).get('worlds') or []})
        e = os.path.join(R, 'evaluated', os.path.basename(f))
        if os.path.exists(e):
            outcome[cases[-1]['id']] = json.load(open(e, encoding='utf-8'))
    own = example_answers() + [{'id': 'check_round4 ' + w['name'], 'worlds': [w]} for w in stops() + bends()]
    browser.use(browser.PORTS[0])
    browser.boot()
    res = browser.run_js(browser.fill('check_rules.js', CASES=cases + own))
    json.dump(res, open(os.path.join(R, 'rules.json'), 'w', encoding='utf-8'), indent=1)
    flagged = {'alarm': 0, 'valid': 0}
    sets = {'alarm sets cleared': 0, 'sets with a flagged valid test': 0}
    kinds = {}
    for r in res['results']:
        if r['id'] not in outcome:
            bad = [(w['name'], m) for w in r['worlds'] for m in w['world']] + [(w['name'] + ' / ' + t['name'], m) for w in r['worlds'] for t in w['tests'] for m in t['problems']]
            print('%-60s %s' % (r['id'][:60], 'ok' if not bad else 'FLAGGED: ' + '; '.join('%s: %s' % (a, m[:90]) for a, m in bad)))
            continue
        ev = outcome[r['id']]
        m = report.measure(ev)
        correct = [v['id'] for v in ev['versions'] if v['kind'] == 'correct']
        res_of = {(t['world'], t['test']): [] for vid in ev['runs'] for t in ev['runs'][vid].get('tests', [])}
        for vid in correct:
            for t in (ev['runs'].get(vid) or {}).get('tests', []):
                res_of[(t['world'], t['test'])].append(t['outcome'])
        alarms_left = m['alarms']
        any_valid = False
        for w in r['worlds']:
            for t in w['tests']:
                probs = w['world'] + t['problems']
                if not probs:
                    continue
                alarm = any(o != 'passed' for o in res_of.get((w['name'], t['name']), []))
                flagged['alarm' if alarm else 'valid'] += 1
                alarm and (alarms_left := alarms_left - 1)
                any_valid = any_valid or not alarm
                for p in probs:
                    k = p.split(':')[0][:40] if p.startswith(('start', 'goal', 'it checks')) else p[:40]
                    k = 'start touches' if p.startswith('start') else 'goal after exit' if p.startswith('goal') else 'reaction without arrival' if p.startswith('it checks') else 'overlap' if 'overlap' in p else 'bend' if 'turns by' in p else k
                    kinds.setdefault(k, {'alarm': 0, 'valid': 0})['alarm' if alarm else 'valid'] += 1
                print('  %s | %s | %s: %s' % (r['id'], 'FALSE ALARM' if alarm else 'valid', w['name'] + ' / ' + t['name'], '; '.join(x[:100] for x in probs)))
        if m['alarms'] and alarms_left <= 0:
            sets['alarm sets cleared'] += 1
        sets['sets with a flagged valid test'] += any_valid
    print('flagged tests:', flagged, 'by kind:', kinds, sets)
    print('page errors:', res.get('errs'))


if __name__ == '__main__':
    main()
