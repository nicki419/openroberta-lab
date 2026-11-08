"""The study's levels against every combination of correct fixes (2026-11-07).

In the study a learner keeps the fixes of the earlier levels: whatever correct version of an earlier function they wrote, the later levels must be
beatable with it, once they fix the later functions correctly too. So every level is played with every combination of the correct versions of the
functions its program has (3 per function: 3 at L2, 9 at L4, 27 at L6, 81 at L7 and L8), and the equivalent versions (broken by a fault, but their
level passes them) each in place of the reference version, with the other functions in their reference version. A function the study gives as it
is (corpus.GIVEN: driveInTheDark, brought by L6 since L5 was taken out on 2026-11-08) is played in its reference version only.

python check_levels.py [--again] [level ...]   (l2 l4 l6 l7 l8; the Lab and the Chromes of phase 5: PHASE5_PORTS=9333,9334)
Plays the programs that levels.json has no run of yet (--again: every program of the levels named), drops the runs of programs the study no longer
has, writes levels.json and prints the levels with the combinations that lose. Exit code 1 if one loses.
"""
import itertools
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'phase5'))
import corpus  # noqa: E402
import judge  # noqa: E402
from nepo import program  # noqa: E402

LEVELS = {'l2': 'followLine', 'l4': 'stopAtWall', 'l6': 'avoidWalls', 'l7': 'followInTheDark', 'l8': 'followInTheDark'}  # L1, L5: until 2026-11-08
OUT = os.path.join(HERE, 'levels.json')
MAX_MS = 300000  # L8 takes about 50 s; a level without a time limit is played this long


def program_of(choice):
    """choice: {function: params} for the functions of the program, the newest last"""
    have = list(choice)
    return program([(n, corpus.body(n, choice[n])) for n in reversed(have)], main=[have[-1]])


def equivalents():
    vs = json.load(open(os.path.join(HERE, '..', 'phase5', 'corpus', 'versions.json'), encoding='utf-8'))
    return [v for v in vs if v['kind'] == 'broken' and not v['ok']]


def jobs_for(level, lv):
    fn = LEVELS[level]
    have = corpus.CHAIN[:corpus.CHAIN.index(fn) + 1]
    out = []
    for combo in itertools.product(*[(['A'] if n in corpus.GIVEN else sorted(corpus.CORRECT[n])) for n in have]):
        choice = {n: corpus.CORRECT[n][c] for n, c in zip(have, combo)}
        out.append({'key': '%s|%s' % (level, ' '.join('%s/%s' % (n, c) for n, c in zip(have, combo))), 'level': lv, 'xml': program_of(choice)})
    for v in equivalents():
        if v['function'] in have and v['function'] not in corpus.GIVEN:
            choice = {n: (v['params'] if n == v['function'] else corpus.reference(n)) for n in have}
            out.append({'key': '%s|%s (others A)' % (level, v['id']), 'level': lv, 'xml': program_of(choice)})
    return out


def main(only, again=False):
    L = judge.levels()
    old = json.load(open(OUT, encoding='utf-8')) if os.path.exists(OUT) else {}
    wanted = {level: jobs_for(level, L[level]) for level in LEVELS}
    keys = {j['key'] for jobs in wanted.values() for j in jobs}
    runs = {k: r for k, r in old.items() if k in keys and not (again and k.split('|')[0] in only)}
    lost = []
    for level in only:
        jobs = [j for j in wanted[level] if j['key'] not in runs]
        t0 = time.time()
        res = judge.judge(jobs, max_ms=MAX_MS) if jobs else []
        for r in res:
            runs[r['key']] = {'outcome': r['outcome'], 'at_s': r.get('at_s'), 'last': r.get('last'), 'error': r.get('error')}
        res = [dict(runs[j['key']], key=j['key']) for j in wanted[level]]
        bad = [r for r in res if r['outcome'] not in ('win', 'win_soft')]
        lost += bad
        print('%s: %d of %d programs win (%d played now, %.0f s)' % (level, len(res) - len(bad), len(res), len(jobs), time.time() - t0), flush=True)
        for r in bad:
            print('   LOSES %-90s %s at %s s, last %s' % (r['key'].split('|')[1], r['outcome'], r.get('at_s'),
                                                         [round(x, 1) for x in (r.get('last') or [])]), flush=True)
        json.dump(runs, open(OUT, 'w', encoding='utf-8'), indent=1)
    return lost


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if a != '--again']
    sys.exit(1 if main(args or list(LEVELS), again='--again' in sys.argv[1:]) else 0)
