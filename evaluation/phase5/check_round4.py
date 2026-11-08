"""Phase 5, round 4 (2026-11-07): the measurements behind the round's rules, drawn by their numbers and run on every version (correct, and broken
that lose their level). A test is right if every correct version passes it, useful if broken versions fail it. Writes results-round4.json and
prints a table per part.

- stops: a stop at a wall it drives up to, as round 3 tested it ("whenever obstacle_ahead, stands_still", never_bumps), and with an area before
  the wall it ends in (round 4), on every function (every later function stops at walls too);
- bends: tunnels that turn by 90° in steps of `turn` degrees, `piece` cm apart, to the right and to the left, on the functions that turn away
  from walls in the dark: which bends do right programs get through? With the most the smoothed tunnel turns over 20 cm of its line.

Measured on 2026-11-07 (versions.json):
- stops: with the area before the wall, every correct version of stopAtWall and of every later function passes (followLine has no stop at
  walls), and all 12 broken versions of stopAtWall fail (negated, no-handover, turns, slows); as round 3 tested it, only the 3 that slow down
  fail. Checking that the robot stays there (`does stands_still` from 12 s on) catches nothing more.
- bends: every correct version of avoidWalls and followInTheDark gets through every bend, up to a corner of 90° (69° over 20 cm), to the
  right and to the left. So the Lab has no limit on bends; what made round 3's bends fail right programs was the start in the bend.

python check_round4.py [stops|bends ...]   (the Lab and the Chromes of browser.PORTS run)
"""
import json
import math
import os
import queue
import sys
import threading

import browser
from check_recipes import world, test, line, tunnel, goal

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'results-round4.json')


def wall(i, x, y, w=2, h=12):
    return {'id': i, 'name': 'Wall', 'kind': 'rect', 'role': 'obstacle', 'x': x, 'y': y, 'w': w, 'h': h}


def stops():
    x, y = 30, 100
    s = [{'id': 'A', 'name': 'A', 'x': x, 'y': y, 'heading': 0}]
    whenever = {'check': 'whenever', 'when': 'obstacle_ahead', 'after_ms': 200, 'does': 'stands_still'}
    bumps = {'check': 'never_bumps', 'item': 't2'}
    return [
        world('Wall seen at once', s, [line('t1', [[x - 10, y], [x + 40, y]]), wall('t2', x + 8, y - 6)],
              [test('Stops at once', 'A', [bumps, whenever], max_ms=10000)]),
        world('Wall ahead, round 3', s, [line('t1', [[x - 10, y], [x + 40, y]]), wall('t2', x + 30, y - 6)],
              [test('Stops at the wall', 'A', [bumps, whenever], max_ms=20000)]),
        world('Wall ahead, round 4', s, [line('t1', [[x - 10, y], [x + 40, y]]), wall('t2', x + 30, y - 6), goal('t3', x + 15, y - 10, 15, 20)],
              [test('Stops at the wall', 'A', [bumps, whenever, {'check': 'ends_in', 'item': 't3'}], max_ms=20000)]),
        world('Wall ahead, round 4, stays', s, [line('t1', [[x - 10, y], [x + 40, y]]), wall('t2', x + 30, y - 6), goal('t3', x + 15, y - 10, 15, 20)],
              [test('Stops at the wall', 'A', [bumps, whenever, {'check': 'ends_in', 'item': 't3'}, {'check': 'does', 'does': 'stands_still', 'after_ms': 12000}],
                    max_ms=20000)]),
        world('Box on a long line, round 4', s, [line('t1', [[x - 10, y], [x + 230, y]]), wall('t2', x + 120, y - 5, 10, 10), goal('t3', x + 105, y - 10, 15, 20)],
              [test('Stops before the box', 'A', [bumps, whenever, {'check': 'ends_in', 'item': 't3'}], max_ms=40000)]),
    ]


def bend_points(x0, y0, turn, piece, sign):
    """a straight 60 cm, then turns of `turn` degrees `piece` cm apart until 90°, then 45 cm straight on; sign 1: to the right (larger y)"""
    pts = [[x0, y0], [x0 + 60, y0]]
    heading = 0.0
    steps = int(round(90 / turn))
    for k in range(steps):
        heading += turn
        a = math.radians(heading)
        last = pts[-1]
        length = piece if k < steps - 1 else 45
        pts.append([round(last[0] + length * math.cos(a), 2), round(last[1] + sign * length * math.sin(a), 2)])
    return pts


def sharpest(points, smooth=True, over=20.0):
    """the most the tunnel's line turns over `over` cm of it (degrees), on its smoothed line (16 pieces per segment, as the simulator)"""
    import itertools
    segs = []
    n = len(points)
    for i in range(n - 1):
        p0, p1 = points[i], points[i + 1]
        b = points[i - 1] if i > 0 else p0
        a = points[i + 2] if i + 2 < n else p1
        c1 = [p0[0] + (p1[0] - b[0]) / 6, p0[1] + (p1[1] - b[1]) / 6] if smooth else p0
        c2 = [p1[0] - (a[0] - p0[0]) / 6, p1[1] - (a[1] - p0[1]) / 6] if smooth else p1
        for k in range(1 if i else 0, 17):
            t = k / 16
            u = 1 - t
            segs.append([u ** 3 * p0[j] + 3 * u * u * t * c1[j] + 3 * u * t * t * c2[j] + t ** 3 * p1[j] for j in (0, 1)])
    pts = [p for i, p in enumerate(segs) if i == 0 or math.dist(p, segs[i - 1]) > 1e-6]
    heads, at = [], [0.0]
    for i in range(1, len(pts)):
        heads.append(math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]))
        at.append(at[-1] + math.dist(pts[i], pts[i - 1]))
    best = 0.0
    for i in range(len(heads)):
        for j in range(i, len(heads)):
            if at[j + 1] - at[i] > over + 1e-9:
                break
            d = abs(math.degrees(math.atan2(math.sin(heads[j] - heads[i]), math.cos(heads[j] - heads[i]))))
            best = max(best, d)
    return round(best)


BENDS = [(30, 20), (30, 30), (30, 40), (45, 20), (45, 30), (45, 40), (90, 60)]


def bends():
    out = []
    x = 30
    for turn, piece in BENDS:
        for sign, y, side in ((1, 40, 'right'), (-1, 160, 'left')):
            pts = bend_points(x + 40, y, turn, piece, sign)
            last, before = pts[-1], pts[-2]
            d = math.dist(last, before)
            gx = before[0] + (last[0] - before[0]) * 25 / d
            gy = before[1] + (last[1] - before[1]) * 25 / d
            name = 'Bend %s, %d deg every %d cm (%d deg over 20 cm)' % (side, turn, piece, sharpest(pts))
            out.append(world(name, [{'id': 'A', 'name': 'A', 'x': x, 'y': y, 'heading': 0}],
                             [line('t1', [[x - 10, y], [x + 55, y]]), tunnel('t2', pts, 15, True), goal('t3', round(gx - 5, 2), round(gy - 5, 2), 10, 10)],
                             [test('Gets through the bend', 'A', [{'check': 'reaches', 'item': 't3'}, {'check': 'never_bumps', 'item': 't2'}], until='t3')]))
    return out


PARTS = {'stops': (stops, None), 'bends': (bends, ['avoidWalls', 'followInTheDark'])}


def main(parts):
    versions = [v for v in json.load(open(os.path.join(HERE, 'corpus', 'versions.json'), encoding='utf-8')) if v['ok']]
    results = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {}
    for part in parts:
        make, functions = PARTS[part]
        worlds = make()
        work = queue.Queue()
        for v in versions:
            if functions is None or v['function'] in functions:
                work.put(v)
        done = {}
        lock = threading.Lock()

        def worker(p):
            browser.use(p)
            while True:
                try:
                    v = work.get_nowait()
                except queue.Empty:
                    return
                try:
                    r = browser.run_js(browser.fill('eval.js', JOBS=[{'key': v['id'], 'worlds': worlds, 'xml': v['xml']}]))
                    x = r['results'][0]
                    assert x['key'] == v['id'], 'another request'
                except Exception as e:
                    print('  port %d: %s' % (p, str(e)[:200]), flush=True)
                    browser.boot()
                    work.put(v)
                    continue
                with lock:
                    done[v['id']] = {'kind': v['kind'], 'tests': x.get('tests'), 'error': x.get('error')}
                    print('  ran', part, v['id'], flush=True)

        threads = [threading.Thread(target=worker, args=(p,)) for p in browser.PORTS]
        [t.start() for t in threads]
        [t.join() for t in threads]
        results[part] = done
        json.dump(results, open(OUT, 'w', encoding='utf-8'), indent=1)
        names = [w['name'] for w in worlds]
        print('\n## ' + part + '\n')
        print('| version | ' + ' | '.join(names) + ' |')
        print('|---|' + '---|' * len(names))
        for vid in sorted(done, key=lambda k: (k.split('/')[0], done[k]['kind'] != 'correct', k)):
            r = done[vid]
            cells = []
            for n in names:
                t = [t for t in (r['tests'] or []) if t['world'] == n]
                cells.append(('pass' if t[0]['outcome'] == 'passed' else 'FAIL: ' + '; '.join(t[0]['failed'])[:60]) if t else (r['error'] or '-')[:40])
            print('| %s (%s) | %s |' % (vid, r['kind'], ' | '.join(cells)))


if __name__ == '__main__':
    main(sys.argv[1:] or list(PARTS))
