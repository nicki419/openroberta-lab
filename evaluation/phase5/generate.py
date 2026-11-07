"""Phase 5, design B: the assistant writes tests for broken programs, as a learner with that program would get them (browser/gen.js, through the
running Lab: its effort from .env). Per function: up to PER_FUNCTION broken versions (different faults and correct versions they break), each
with the precise and the vague sentence, REPEATS times. One result file per request in results/generated/ (an existing one is kept: the run can
be continued). The calls go into the Lab's telemetry as an anonymous session's (session-N.jsonl).

python generate.py [--pilot] [function ...]
"""
import json
import os
import queue
import sys
import threading
import time

import browser
import corpus
from nepo import export
from sentences import SENTENCES

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.environ.get('PHASE5_RESULTS', 'results')  # the folder of a round's results (2026-11-07: results-r2 after the tuning)
# the corpus file (2026-11-07: versions.json is decided on the loosened levels; round 3 uses versions-rounds-1-2.json, as rounds 1 and 2)
VERSIONS = os.environ.get('PHASE5_VERSIONS', 'versions.json')
OUT = os.path.join(HERE, RESULTS, 'generated')
PER_FUNCTION = 4
REPEATS = 2
ANALYSES_PER_SESSION = 25  # the Lab allows 30 an hour per session: a new session before that


def chosen(versions, fn, n=PER_FUNCTION):
    """broken versions of fn that lose their level, spread over the faults and the correct versions they break"""
    broken = [v for v in versions if v['function'] == fn and v['kind'] == 'broken' and v['ok']]
    faults = [f for f, _, _ in corpus.FAULTS[fn]]
    out = []
    parents = sorted({v['of'] for v in broken})
    i = 0
    while len(out) < n and len(out) < len(broken):  # fault by fault, a different correct version each time
        for f in faults:
            cands = [v for v in broken if v['fault'] == f and v not in out]
            if not cands:
                continue
            cands.sort(key=lambda v: (parents.index(v['of']) - i) % len(parents))
            out.append(cands[0])
            i += 1
            if len(out) >= n:
                break
    return out


def jobs(versions, functions):
    out = []
    for fn in functions:
        for v in chosen(versions, fn):
            for kind in ('precise', 'vague'):
                for rep in range(1, REPEATS + 1):
                    rid = '%s__%s__r%d__full' % (v['id'].replace('/', '__'), kind, rep)
                    out.append({'id': rid, 'function': fn, 'version': v['id'], 'sentenceKind': kind, 'sentence': SENTENCES[fn][kind], 'repeat': rep,
                                'pipeline': 'full', 'name': 'p5_' + v['id'].replace('/', '_').replace('-', '_'), 'exportXml': export(v['xml'])})
    return out


def run(todo):
    os.makedirs(OUT, exist_ok=True)
    work = queue.Queue()
    for j in todo:
        if not os.path.exists(os.path.join(OUT, j['id'] + '.json')):
            work.put(j)
    print(work.qsize(), 'requests to make', flush=True)
    lock = threading.Lock()

    def worker(p):
        browser.use(p)
        browser.new_session()
        analyses = 0
        while True:
            try:
                j = work.get_nowait()
            except queue.Empty:
                return
            if analyses >= ANALYSES_PER_SESSION:
                browser.new_session()
                analyses = 0
            started = time.time()
            try:
                r = browser.run_js(browser.fill('gen.js', JOB={'name': j['name'], 'exportXml': j['exportXml'], 'sentence': j['sentence']}))
            except Exception as e:  # the page is stuck: a new one, and the request later again
                print('  port %d: %s' % (p, str(e)[:200]), flush=True)
                browser.new_session()
                analyses = 0
                work.put(j)
                continue
            analyses += 1 + (r.get('analyze') or {}).get('repairs', 0)
            if (r.get('analyze') or {}).get('error') == 'limit' or ((r.get('generate') or {}).get('error') == 'limit'):
                browser.new_session()
                analyses = 0
                work.put(j)
                continue
            r['job'] = {k: v for k, v in j.items() if k != 'exportXml'}
            r['wallSeconds'] = round(time.time() - started, 1)
            json.dump(r, open(os.path.join(OUT, j['id'] + '.json'), 'w', encoding='utf-8'), indent=1)
            g = r.get('generate') or {}
            with lock:
                print('  %-62s %s tests, %ss (analyze %ss, generate %ss)%s' % (
                    j['id'], sum(len(w['tests']) for w in g.get('worlds') or []), round(r['ms']['total'] / 1000) if r.get('ms') else '?',
                    round(r['ms']['analyze'] / 1000) if r.get('ms') else '?', round(r['ms']['generate'] / 1000) if r.get('ms') else '?',
                    '' if g.get('ok') else '  ' + str((r.get('analyze') or {}).get('error') or g.get('error') or r.get('error'))), flush=True)

    threads = [threading.Thread(target=worker, args=(p,)) for p in browser.PORTS]
    [t.start() for t in threads]
    [t.join() for t in threads]


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    versions = json.load(open(os.path.join(HERE, 'corpus', VERSIONS), encoding='utf-8'))
    todo = jobs(versions, args or corpus.CHAIN)
    if '--pilot' in sys.argv:
        todo = todo[:1]
        browser.PORTS = browser.PORTS[:1]
    run(todo)
