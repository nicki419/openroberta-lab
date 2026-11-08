"""Phase 5: every request's tests run on every version of its function (browser/eval.js): the correct versions (each test should pass), the
broken ones that lose their level (each should fail the set), the one the assistant got among them, and (since 2026-11-08) the equivalent ones:
broken by a fault, but they still beat their levels, so each test should pass them, as in the source of truth (evaluation/truth). Until
2026-11-08 the equivalent versions weren't used. One file per request in results/evaluated/ (an existing one is kept).

python evaluate.py [pipeline ...]             (full, plain; default both)
python evaluate.py --missing [pipeline ...]   runs an existing file's tests on the versions of the corpus it has no run of (an equivalent one, or
                                              one the corpus decides differently now) and adds them, marked "added"
"""
import glob
import json
import os
import queue
import sys
import threading

import browser

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.environ.get('PHASE5_RESULTS', 'results')  # the folder of a round's results (2026-11-07: results-r2 after the tuning)
# the corpus file (2026-11-07: versions.json is decided on the loosened levels; round 3 uses versions-rounds-1-2.json, as rounds 1 and 2)
VERSIONS = os.environ.get('PHASE5_VERSIONS', 'versions.json')
OUT = os.path.join(HERE, RESULTS, 'evaluated')
SOURCES = {'full': os.path.join(HERE, RESULTS, 'generated'), 'plain': os.path.join(HERE, RESULTS, 'plain')}


def kind(v):
    """correct, broken (it loses its level), or equivalent (broken by a fault, but it beats its levels: each test should pass it)"""
    return v['kind'] if v['kind'] == 'correct' or v['ok'] else 'equivalent'


def usable(versions, fn):
    """the versions a function's tests are judged on: every version of it (a correct version the levels reject would be a mistake of the corpus)"""
    return [v for v in versions if v['function'] == fn and (v['kind'] != 'correct' or v['ok'])]


def requests(pipelines):
    out = []
    for p in pipelines:
        for f in sorted(glob.glob(os.path.join(SOURCES[p], '*.json'))):
            r = json.load(open(f, encoding='utf-8'))
            worlds = ((r.get('generate') or {}).get('worlds')) or []
            out.append({'id': os.path.basename(f)[:-5], 'job': r['job'], 'worlds': worlds})
    return out


def main(pipelines, missing=False):
    versions = json.load(open(os.path.join(HERE, 'corpus', VERSIONS), encoding='utf-8'))
    os.makedirs(OUT, exist_ok=True)
    work = queue.Queue()
    for req in requests(pipelines):
        path = os.path.join(OUT, req['id'] + '.json')
        if missing:
            if os.path.exists(path):
                old = json.load(open(path, encoding='utf-8'))
                if old['runs'] and any(v['id'] not in old['runs'] for v in usable(versions, req['job']['function'])):
                    req['old'] = old
                    work.put(req)
            continue
        if os.path.exists(path):
            continue
        work.put(req)
    print(work.qsize(), 'requests to evaluate', flush=True)
    lock = threading.Lock()

    def worker(p):
        browser.use(p)
        while True:
            try:
                req = work.get_nowait()
            except queue.Empty:
                return
            fn = req['job']['function']
            old = req.get('old')
            vs = [v for v in usable(versions, fn) if not old or v['id'] not in old['runs']]
            runs = {}
            if any(w['tests'] for w in req['worlds']):
                jobs = [{'key': v['id'], 'worlds': req['worlds'], 'xml': v['xml']} for v in vs]
                try:
                    mine = {(w['name'], t['name']) for w in req['worlds'] for t in w['tests']}
                    for i in range(0, len(jobs), 4):
                        batch = jobs[i:i + 4]
                        r = browser.run_js(browser.fill('eval.js', JOBS=batch))
                        # 2026-11-07: two processes on one Chrome once swapped their scripts (_run_<port>.js), and 4 requests got the runs of others
                        if sorted(x['key'] for x in r['results']) != sorted(j['key'] for j in batch) or \
                                any((t['world'], t['test']) not in mine for x in r['results'] for t in x.get('tests', [])):
                            raise RuntimeError('the runs are of another request (two processes on one Chrome?)')
                        for x in r['results']:
                            runs[x['key']] = x
                except Exception as e:
                    print('  port %d: %s' % (p, str(e)[:200]), flush=True)
                    browser.boot()
                    work.put(req)
                    continue
            entries = [{'id': v['id'], 'kind': kind(v), 'fault': v['fault'], 'of': v['of']} for v in vs]
            if old:  # the versions it had keep their kinds as they were evaluated; the added ones say so
                out = dict(old, versions=old['versions'] + [dict(e, added='2026-11-08') for e in entries], runs=dict(old['runs'], **runs))
            else:
                out = {'id': req['id'], 'job': req['job'], 'versions': entries, 'runs': runs}
            json.dump(out, open(os.path.join(OUT, req['id'] + '.json'), 'w', encoding='utf-8'), indent=1)
            with lock:
                print('  evaluated', req['id'], flush=True)

    threads = [threading.Thread(target=worker, args=(p,)) for p in browser.PORTS]
    [t.start() for t in threads]
    [t.join() for t in threads]


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if a != '--missing']
    main(args or ['full', 'plain'], missing='--missing' in sys.argv[1:])
