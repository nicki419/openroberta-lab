"""Phase 5 tuning (2026-11-07): the tunnel recipes of the context pack (tests.md "Dim light", "Driving through a tunnel", "Dim light: walls on its
left or right"), drawn by their numbers, run on every version of the tunnel functions. A recipe is right if every correct version passes it;
it is useful if broken versions fail it. Writes results-recipes.json and prints a table.

2026-11-07: every right version passes the goal inside the tunnel, the start in the dark, and the bends (except driveInTheDark, which drives
straight in the dark and has no wall avoidance); "Follows the line after the tunnel" (a second line from 15 cm before the exit, the goal over
its end) fails on 5 of the 9 right versions: they come out of the dark on the side away from the line. So the pack has no goal after the exit.

python check_recipes.py   (the Lab and the Chromes of browser.PORTS run)
"""
import json
import os
import queue
import threading

import browser

HERE = os.path.dirname(os.path.abspath(__file__))
FUNCTIONS = ['driveInTheDark', 'avoidWalls', 'followInTheDark']
VIEW = {'x': 150, 'y': 100, 'scale': 3}


def world(name, starts, items, tests):
    return {'name': name, 'existing': False, 'data': {'version': 3, 'world': {'background': 'peach', 'starts': starts, 'items': items}, 'view': VIEW},
            'tests': tests}


def test(name, start, checks, until=None, max_ms=60000):
    return {'name': name, 'scenario': name, 'start': start, 'until': until, 'max_time_ms': max_ms, 'world': [], 'globals': {}, 'checks': checks}


def line(i, points, smooth=False):
    return {'id': i, 'kind': 'line', 'points': points, 'smooth': smooth, 'width': 1.48}


def tunnel(i, points, width=15, smooth=False):
    return {'id': i, 'name': 'Tunnel', 'kind': 'tunnel', 'role': 'obstacle', 'points': points, 'smooth': smooth, 'width': width}


def goal(i, x, y, w, h):
    return {'id': i, 'name': 'Goal ' + i, 'kind': 'rect', 'role': 'goal', 'x': x, 'y': y, 'w': w, 'h': h}


def recipes():
    x, y = 30, 100
    through = world('Through the dark (goal inside)', [{'id': 'A', 'name': 'A', 'x': x, 'y': y, 'heading': 0}],
                    [line('t1', [[x - 10, y], [x + 55, y]]), tunnel('t2', [[x + 40, y], [x + 160, y]]), goal('t3', x + 110, y - 5, 10, 10)],
                    [test('Gets through the dark', 'A', [{'check': 'reaches', 'item': 't3'}, {'check': 'never_bumps', 'item': 't2'}], until='t3')])
    after = world('Follows the line after the tunnel', [{'id': 'A', 'name': 'A', 'x': x, 'y': y, 'heading': 0}],
                  [line('t1', [[x - 10, y], [x + 55, y]]), tunnel('t2', [[x + 40, y], [x + 160, y]]), line('t3', [[x + 145, y], [x + 215, y]]),
                   goal('t4', x + 200, y - 15, 30, 30)],
                  [test('Follows the line again after the tunnel', 'A', [{'check': 'reaches', 'item': 't4'}, {'check': 'never_bumps', 'item': 't2'}],
                        until='t4')])
    inside = world('Starts in the dark', [{'id': 'A', 'name': 'A', 'x': x, 'y': y, 'heading': 0}],
                   [tunnel('t1', [[x - 10, y], [x + 100, y]]), goal('t2', x + 50, y - 5, 10, 10)],
                   [test('Drives on in the dark', 'A', [{'check': 'reaches', 'item': 't2'}, {'check': 'never_bumps', 'item': 't1'}], until='t2')])
    out = [through, after, inside]
    for width in (15, 20):
        yr, yl = 50, 150
        out.append(world('Bend to the right, width %d' % width, [{'id': 'A', 'name': 'A', 'x': x, 'y': yr, 'heading': 0}],
                         [line('t1', [[x - 10, yr], [x + 55, yr]]),
                          tunnel('t2', [[x + 40, yr], [x + 100, yr], [x + 140, yr + 30], [x + 155, yr + 70], [x + 155, yr + 115]], width, True),
                          goal('t3', x + 150, yr + 85, 10, 10)],
                         [test('Gets through the bend', 'A', [{'check': 'reaches', 'item': 't3'}, {'check': 'never_bumps', 'item': 't2'}], until='t3')]))
        out.append(world('Bend to the left, width %d' % width, [{'id': 'A', 'name': 'A', 'x': x, 'y': yl, 'heading': 0}],
                         [line('t1', [[x - 10, yl], [x + 55, yl]]),
                          tunnel('t2', [[x + 40, yl], [x + 100, yl], [x + 140, yl - 30], [x + 155, yl - 70], [x + 155, yl - 115]], width, True),
                          goal('t3', x + 150, yl - 95, 10, 10)],
                         [test('Gets through the bend', 'A', [{'check': 'reaches', 'item': 't3'}, {'check': 'never_bumps', 'item': 't2'}], until='t3')]))
    return out


def main():
    versions = [v for v in json.load(open(os.path.join(HERE, 'corpus', 'versions.json'), encoding='utf-8')) if v['function'] in FUNCTIONS and v['ok']]
    worlds = recipes()
    work = queue.Queue()
    for v in versions:
        work.put(v)
    results = {}
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
                results[v['id']] = {'kind': v['kind'], 'tests': x.get('tests'), 'error': x.get('error')}
                print('  ran', v['id'], flush=True)

    threads = [threading.Thread(target=worker, args=(p,)) for p in browser.PORTS]
    [t.start() for t in threads]
    [t.join() for t in threads]
    json.dump(results, open(os.path.join(HERE, 'results-recipes.json'), 'w', encoding='utf-8'), indent=1)
    names = [w['name'] for w in worlds]
    print('| version | ' + ' | '.join(names) + ' |')
    for vid in sorted(results, key=lambda k: (k.split('/')[0], results[k]['kind'] != 'correct', k)):
        r = results[vid]
        cells = []
        for n in names:
            t = [t for t in (r['tests'] or []) if t['world'] == n]
            cells.append(('pass' if t[0]['outcome'] == 'passed' else 'FAIL: ' + '; '.join(t[0]['failed'])[:70]) if t else (r['error'] or '-')[:40])
        print('| %s (%s) | %s |' % (vid, r['kind'], ' | '.join(cells)))


if __name__ == '__main__':
    main()
