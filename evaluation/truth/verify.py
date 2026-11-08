"""Runs the reference tests (reference_tests.py) on every version of their function (the phase 5 corpus: correct, broken, and equivalent: broken
by a fault but still beating the level) and checks the rule: every correct and equivalent version passes every test, every broken version fails at
least one. Writes the results to results.json; build.py puts them into truth.json.

python verify.py [function ...]   (the Lab at localhost:1999 and the Chromes of phase 5's browser.PORTS run; PHASE5_PORTS=9333,9334 for two)
Exit code 1 if the rule is broken.
"""
import json
import os
import queue
import sys
import threading

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'phase5'))
import browser  # noqa: E402  (phase 5's headless Chromes)

from reference_tests import reference_tests  # noqa: E402

FUNCTIONS = ['followLine', 'stopAtWall', 'driveInTheDark', 'avoidWalls', 'followInTheDark']
RESULTS = os.path.join(HERE, 'results.json')


def kind(v):
    """correct, broken, or equivalent (broken by a fault, but the level still passes it)"""
    return v['kind'] if v['kind'] == 'correct' or v['ok'] else 'equivalent'


def versions():
    """the versions with their programs: truth.json once built, else the phase 5 corpus; their kinds always from the corpus (judged again on the
    levels the study plays: phase 5's rejudge.py, 2026-11-08)"""
    vs = json.load(open(os.path.join(HERE, '..', 'phase5', 'corpus', 'versions.json'), encoding='utf-8'))
    kinds = {v['id']: kind(v) for v in vs}
    path = os.path.join(HERE, 'truth.json')
    if os.path.exists(path):
        t = json.load(open(path, encoding='utf-8'))
        return [{'id': v['id'], 'function': v['function'], 'kind': kinds[v['id']], 'xml': v['program']} for v in t['versions']]
    return [{'id': v['id'], 'function': v['function'], 'kind': kinds[v['id']], 'xml': v['xml']} for v in vs]


def run(only):
    tests = reference_tests()
    vs = [v for v in versions() if v['function'] in only]
    old = json.load(open(RESULTS, encoding='utf-8')) if os.path.exists(RESULTS) else {}
    results = {k: r for k, r in old.items() if k.split('/')[0] not in only}
    work = queue.Queue()
    for v in vs:
        work.put(v)
    lock = threading.Lock()

    def worker(p):
        browser.use(p)
        while True:
            try:
                v = work.get_nowait()
            except queue.Empty:
                return
            worlds = tests[v['function']]
            mine = {(w['name'], t['name']) for w in worlds for t in w['tests']}
            try:
                r = browser.run_js(browser.fill('eval.js', JOBS=[{'key': v['id'], 'worlds': worlds, 'xml': v['xml']}]))
                x = r['results'][0]
                if x['key'] != v['id'] or any((t['world'], t['test']) not in mine for t in x.get('tests', [])):
                    raise RuntimeError('the runs are of another job (two processes on one Chrome?)')
                if x.get('error'):
                    raise RuntimeError(x['error'])
            except Exception as e:
                print('  port %d: %s' % (p, str(e)[:300]), flush=True)
                browser.boot()
                work.put(v)
                continue
            with lock:
                results[v['id']] = {'function': v['function'], 'kind': v['kind'],
                                    'tests': [{'world': t['world'], 'test': t['test'], 'passed': t['outcome'] == 'passed', 'outcome': t['outcome'],
                                               'failed': t['failed']} for t in x['tests']]}
                print('  ran', v['id'], flush=True)

    threads = [threading.Thread(target=worker, args=(p,)) for p in browser.PORTS]
    [t.start() for t in threads]
    [t.join() for t in threads]
    json.dump(results, open(RESULTS, 'w', encoding='utf-8'), indent=1)
    return results


def check(results, only=FUNCTIONS):
    """the rule, per function; prints a table and returns the problems"""
    tests = reference_tests()
    problems = []
    for fn in only:
        names = [(w['name'], t['name']) for w in tests[fn] for t in w['tests']]
        print('\n## %s\n' % fn)
        print('| version | kind | ' + ' | '.join('T%d' % (i + 1) for i in range(len(names))) + ' | verdict |')
        print('|---|---|' + '---|' * len(names) + '---|')
        for vid in sorted([k for k in results if results[k]['function'] == fn], key=lambda k: (results[k]['kind'] != 'correct', k)):
            r = results[vid]
            got = {(t['world'], t['test']): t for t in r['tests']}
            cells = ['pass' if got.get(n, {}).get('passed') else 'FAIL' for n in names]
            failed = sum(1 for c in cells if c == 'FAIL')
            if r['kind'] in ('correct', 'equivalent'):
                verdict = 'ok' if not failed else 'FALSE ALARM'
            else:
                verdict = 'caught' if failed else 'MISSED'
            if verdict in ('FALSE ALARM', 'MISSED'):
                problems.append((vid, verdict, [(n, got.get(n, {}).get('failed')) for n in names if not got.get(n, {}).get('passed')]))
            print('| %s | %s | %s | %s |' % (vid, r['kind'], ' | '.join(cells), verdict))
        for i, n in enumerate(names):
            print('- T%d: %s / %s' % (i + 1, n[0], n[1]))
    for p in problems:
        print('PROBLEM', p[0], p[1], json.dumps(p[2])[:600])
    return problems


if __name__ == '__main__':
    only = sys.argv[1:] or FUNCTIONS
    res = run(only)
    sys.exit(1 if check(res, only) else 0)
