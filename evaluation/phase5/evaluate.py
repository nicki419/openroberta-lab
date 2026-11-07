"""Phase 5: every request's tests run on every version of its function (browser/eval.js): the correct versions (each test should pass) and the
broken ones that lose their level (each should fail the set), the one the assistant got among them. One file per request in results/evaluated/
(an existing one is kept). The equivalent faults (they still beat the level) aren't used.

python evaluate.py [pipeline ...]   (full, plain; default both)
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
OUT = os.path.join(HERE, RESULTS, 'evaluated')
SOURCES = {'full': os.path.join(HERE, RESULTS, 'generated'), 'plain': os.path.join(HERE, RESULTS, 'plain')}


def usable(versions, fn):
    """the versions a function's tests are judged on: the correct ones, and the broken ones that lose their level"""
    return [v for v in versions if v['function'] == fn and v['ok']]


def requests(pipelines):
    out = []
    for p in pipelines:
        for f in sorted(glob.glob(os.path.join(SOURCES[p], '*.json'))):
            r = json.load(open(f, encoding='utf-8'))
            worlds = ((r.get('generate') or {}).get('worlds')) or []
            out.append({'id': os.path.basename(f)[:-5], 'job': r['job'], 'worlds': worlds})
    return out


def main(pipelines):
    versions = json.load(open(os.path.join(HERE, 'corpus', 'versions.json'), encoding='utf-8'))
    os.makedirs(OUT, exist_ok=True)
    work = queue.Queue()
    for req in requests(pipelines):
        if os.path.exists(os.path.join(OUT, req['id'] + '.json')):
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
            vs = usable(versions, fn)
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
            out = {'id': req['id'], 'job': req['job'],
                   'versions': [{'id': v['id'], 'kind': v['kind'], 'fault': v['fault'], 'of': v['of']} for v in vs], 'runs': runs}
            json.dump(out, open(os.path.join(OUT, req['id'] + '.json'), 'w', encoding='utf-8'), indent=1)
            with lock:
                print('  evaluated', req['id'], flush=True)

    threads = [threading.Thread(target=worker, args=(p,)) for p in browser.PORTS]
    [t.start() for t in threads]
    [t.join() for t in threads]


if __name__ == '__main__':
    main(sys.argv[1:] or ['full', 'plain'])
