"""Plays programs on levels in the headless Chrome and decides each attempt as the level player does (browser/judge.js)."""
import glob
import json
import os
import queue
import threading

import browser

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MAX_MS = 180000  # a level without a time limit is played this long (the slowest reference win: L8, about 50 s since 2026-11-07)


def levels():
    """the levels of the first set, by short name (l1, l2, …)"""
    out = {}
    for f in sorted(glob.glob(os.path.join(ROOT, 'levels', '01-first-steps', '*.json'))):
        out[os.path.basename(f).split('-')[0]] = json.load(open(f, encoding='utf-8'))
    return out


def judge(jobs, max_ms=MAX_MS):
    """jobs: [{key, level: <level JSON>, xml: <block_set XML>}] → [{key, level, outcome, won, at_s, …}]"""
    batches = queue.Queue()
    for i in range(0, len(jobs), 4):  # small batches, spread over the Chromes of browser.PORTS
        batches.put(jobs[i:i + 4])
    out = []
    lock = threading.Lock()

    def work(p):
        browser.use(p)
        while True:
            try:
                batch = batches.get_nowait()
            except queue.Empty:
                return
            r = browser.run_js(browser.fill('judge.js', JOBS=batch, MAX_MS=max_ms))
            if r.get('errs'):
                print('page errors (port %d):' % p, r['errs'][:3])
            with lock:
                out.extend(r['results'])

    threads = [threading.Thread(target=work, args=(p,)) for p in browser.PORTS]
    [t.start() for t in threads]
    [t.join() for t in threads]
    order = {j['key']: i for i, j in enumerate(jobs)}
    return sorted(out, key=lambda r: order.get(r['key'], 0))
