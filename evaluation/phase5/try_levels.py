"""The reference functions, level by level: each level's program (the functions so far) on its level and the earlier ones, and the program of
the level before on the new level (it should lose: the new function is needed)."""
import sys

import judge
from nepo import *

DARK = 70  # LLIGHT below this: inside a tunnel (100 in the open, 40 from 15 cm inside on)

def dark():
    return compare(light('LLIGHT'), 'LT', DARK)


# each level's function handles its situation, or hands over to the function of the level before (the main loop calls the newest one): the
# simulator runs one motor block per frame, so functions that each set the motors one after the other would take turns (2026-11-07)
REF = {
    'followLine': [if_((on_line(), [curve(10, 40)]), otherwise=[curve(40, 10)])],
    'stopAtWall': [if_((obstacle('FRONT'), [stop()]), otherwise=[call('followLine')])],
    'driveInTheDark': [if_((dark(), [drive(30)]), otherwise=[call('stopAtWall')])],
    'avoidWalls': [if_((dark(), [if_((obstacle('LEFT'), [turn('RIGHT', 30, 20)]), (obstacle('RIGHT'), [turn('LEFT', 30, 20)]),
                                     otherwise=[call('driveInTheDark')])]), otherwise=[call('driveInTheDark')])],
    'followInTheDark': [if_((dark(), [if_((compare(light('LINETRACKER'), 'LT', 45), [curve(10, 30)]),
                                          (compare(light('LINETRACKER'), 'GT', 90), [curve(30, 10)]), otherwise=[call('avoidWalls')])]),
                        otherwise=[call('avoidWalls')])],
}
# the levels in order, with the function each adds (None: the same functions as the level before)
LEVELS = [('l1', 'followLine'), ('l2', None), ('l4', 'stopAtWall'), ('l5', 'driveInTheDark'), ('l6', 'avoidWalls'), ('l7', 'followInTheDark'),
          ('l8', None)]
CHAIN = ['followLine', 'stopAtWall', 'driveInTheDark', 'avoidWalls', 'followInTheDark']  # each hands over to the one before


def program_of(names, bodies=REF):
    """the main loop calls the newest function; the functions are listed newest first"""
    have = [n for n in CHAIN if n in names]
    return program([(n, bodies[n]) for n in reversed(have)], main=[have[-1]])


if __name__ == '__main__':
    L = judge.levels()
    only = sys.argv[1:]
    jobs = []
    have = []
    for i, (lv, fn) in enumerate(LEVELS):
        before = list(have)
        if fn:
            have.append(fn)
        if only and lv not in only:
            continue
        xml = program_of(have)
        for earlier, _ in LEVELS[:i + 1]:
            jobs.append({'key': '%s program on %s' % (lv, earlier), 'level': L[earlier], 'xml': xml})
        if fn and before:
            jobs.append({'key': '%s program WITHOUT %s on %s' % (lv, fn, lv), 'level': L[lv], 'xml': program_of(before)})
    for r in judge.judge(jobs):
        print('%-42s %-10s at %5s s  last %s %s' % (r['key'], r['outcome'], r.get('at_s'), r.get('last'), r.get('error') or ''))
