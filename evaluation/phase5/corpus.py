"""Phase 5's corpus: per level function, correct versions and broken versions of each (made by fixed kinds of faults), as NEPO programs.

The study gives learners faulty code per level (docs/ai/nepo-ai-technique-compliance.md, "Phase 5"): each level's code is its own function, and
a level's program is the functions so far. The simulator runs one motor block per frame, so the functions form a priority chain: each handles
its situation, or hands over to the function of the level before; the main loop calls the newest one.

A version of a function is made from its parameters; a fault changes one of them. verify.py decides on the levels which versions are correct
(they beat their levels and every level before) and which broken (they lose their level); a fault that still beats the level is equivalent and
left out.
"""
from nepo import *

DARK = 70  # LLIGHT below this: inside a tunnel (100 in the open, 40 from 15 cm inside on)

# the functions in the order the levels unlock them; each hands over to the one before
CHAIN = ['followLine', 'stopAtWall', 'driveInTheDark', 'avoidWalls', 'followInTheDark']
# the levels each function is for (its own levels: a broken version loses one of them)
LEVELS_OF = {'followLine': ['l1', 'l2'], 'stopAtWall': ['l4'], 'driveInTheDark': ['l5'], 'avoidWalls': ['l6'], 'followInTheDark': ['l7']}
LEVEL_ORDER = ['l1', 'l2', 'l4', 'l5', 'l6', 'l7']


def handover(fn):
    i = CHAIN.index(fn)
    return [call(CHAIN[i - 1])] if i > 0 else []


def cond(p):
    """a condition from parameters: (sensor, op, threshold) or ('line',) or ('obstacle', port); 'not' in front negates it"""
    if p[0] == 'not':
        return negate(cond(p[1:]))
    if p[0] == 'line':
        return on_line()
    if p[0] == 'obstacle':
        return obstacle(p[1])
    return compare(light(p[0]), p[1], p[2])


def act(a):
    """an action from parameters: ('curve', l, r), ('drive', p), ('stop',), ('turn', dir, power, deg), ('none',)"""
    return {'curve': lambda: [curve(a[1], a[2])], 'drive': lambda: [drive(a[1])], 'stop': lambda: [stop()],
            'turn': lambda: [turn(a[1], a[2], a[3])], 'none': lambda: []}[a[0]]()


# ------------------------------------------------------------------------------------------------ the functions, from parameters

def follow_line(p):
    if p['kind'] == 'three':
        return [if_((cond(p['black']), act(p['on'])), (cond(p['white']), act(p['off'])), otherwise=act(p['mid']))]
    return [if_((cond(p['black']), act(p['on'])), otherwise=act(p['off']))]


def stop_at_wall(p):
    return [if_((cond(p['wall']), act(p['action'])), otherwise=p['rest'])]


def drive_in_the_dark(p):
    return [if_((cond(p['dark']), act(p['action'])), otherwise=p['rest'])]


def avoid_walls(p):
    inner = [if_((cond(p['first']), act(p['first_action'])), (cond(p['second']), act(p['second_action'])), otherwise=p['rest'])]
    return [if_((cond(p['dark']), inner), otherwise=p['rest'])] if p['dark'] else inner


def follow_in_the_dark(p):
    inner = [if_((cond(p['black']), act(p['on'])), (cond(p['white']), act(p['off'])), otherwise=p['rest'])]
    return [if_((cond(p['dark']), inner), otherwise=p['rest'])]


BUILD = {'followLine': follow_line, 'stopAtWall': stop_at_wall, 'driveInTheDark': drive_in_the_dark, 'avoidWalls': avoid_walls,
         'followInTheDark': follow_in_the_dark}

# ------------------------------------------------------------------------------------------------ correct versions

CORRECT = {
    'followLine': {
        'A': {'kind': 'two', 'black': ('line',), 'on': ('curve', 10, 40), 'off': ('curve', 40, 10)},
        'B': {'kind': 'two', 'black': ('LINETRACKER', 'LT', 50), 'on': ('curve', 20, 50), 'off': ('curve', 50, 20)},
        'C': {'kind': 'three', 'black': ('LINETRACKER', 'LT', 30), 'white': ('LINETRACKER', 'GT', 70), 'on': ('curve', 15, 45), 'off': ('curve', 45, 15),
              'mid': ('drive', 40)},
    },
    'stopAtWall': {
        'A': {'wall': ('obstacle', 'FRONT'), 'action': ('stop',)},
        'B': {'wall': ('obstacle', 'FRONT'), 'action': ('drive', 0)},
        'C': {'wall': ('obstacle', 'RIGHT'), 'action': ('stop',)},  # every obstacle sensor looks forward: RIGHT sees the wall too
    },
    'driveInTheDark': {
        'A': {'dark': ('LLIGHT', 'LT', 70), 'action': ('drive', 30)},
        'B': {'dark': ('RLIGHT', 'LT', 70), 'action': ('drive', 40)},  # L5 is beaten only with a threshold of about 70 to 75 (2026-11-07)
        'C': {'dark': ('RLIGHT', 'LT', 75), 'action': ('drive', 30)},
    },
    'avoidWalls': {
        'A': {'dark': ('LLIGHT', 'LT', 70), 'first': ('obstacle', 'LEFT'), 'first_action': ('turn', 'RIGHT', 30, 20), 'second': ('obstacle', 'RIGHT'),
              'second_action': ('turn', 'LEFT', 30, 20)},
        'B': {'dark': ('RLIGHT', 'LT', 60), 'first': ('obstacle', 'RIGHT'), 'first_action': ('turn', 'LEFT', 40, 15), 'second': ('obstacle', 'LEFT'),
              'second_action': ('turn', 'RIGHT', 40, 15)},
        'C': {'dark': ('LLIGHT', 'LT', 70), 'first': ('obstacle', 'LEFT'), 'first_action': ('curve', 30, 0), 'second': ('obstacle', 'RIGHT'),
              'second_action': ('curve', 0, 30)},
    },
    'followInTheDark': {
        'A': {'dark': ('LLIGHT', 'LT', 70), 'black': ('LINETRACKER', 'LT', 45), 'white': ('LINETRACKER', 'GT', 90), 'on': ('curve', 10, 30),
              'off': ('curve', 30, 10)},
        'B': {'dark': ('RLIGHT', 'LT', 60), 'black': ('LINETRACKER', 'LT', 30), 'white': ('LINETRACKER', 'GT', 95), 'on': ('curve', 15, 35),
              'off': ('curve', 35, 15)},
        'C': {'dark': ('LLIGHT', 'LT', 70), 'black': ('LINETRACKER', 'LT', 40), 'white': ('LINETRACKER', 'GT', 88), 'on': ('curve', 0, 30),
              'off': ('curve', 30, 0)},
    },
}

# ------------------------------------------------------------------------------------------------ faults: (name, what a learner got wrong, change)


def _swap(p, a, b):
    q = dict(p)
    q[a], q[b] = p[b], p[a]
    return q


def _set(p, **kw):
    q = dict(p)
    q.update(kw)
    return q


def _negate(c):
    return c[1:] if c[0] == 'not' else ('not',) + tuple(c)


def _slower(a):
    return (a[0],) + tuple(x // 2 if isinstance(x, int) else x for x in a[1:])


FAULTS = {
    'followLine': [
        ('swapped', 'the two turns swapped', lambda p: _swap(p, 'on', 'off')),
        ('light-above', 'reads the light from above (LLIGHT) instead of the floor', lambda p: _set(p, black=('LLIGHT', 'LT', 50))),
        ('one-turn', 'turns the same way on and off the line', lambda p: _set(p, off=p['on'])),
        ('too-slow', 'half the speed', lambda p: _set(p, on=_slower(p['on']), off=_slower(p['off']), **({'mid': _slower(p['mid'])} if 'mid' in p else {}))),
        ('straight-off', 'drives straight when off the line', lambda p: _set(p, off=('drive', 40))),
    ],
    'stopAtWall': [
        ('negated', 'the condition negated: stops when nothing is ahead', lambda p: _set(p, wall=_negate(p['wall']))),
        ('no-handover', 'nothing happens when no wall is ahead (the call of followLine is missing)', lambda p: _set(p, rest=[])),
        ('turns', 'turns away instead of stopping', lambda p: _set(p, action=('turn', 'RIGHT', 30, 90))),
        ('slows', 'slows down instead of stopping', lambda p: _set(p, action=('drive', 10))),
    ],
    'driveInTheDark': [
        ('never-dark', 'the threshold below what the light sensor ever reads (40 in a tunnel)', lambda p: _set(p, dark=(p['dark'][0], 'LT', 30))),
        ('floor-sensor', 'reads the floor (LINETRACKER) instead of the light from above', lambda p: _set(p, dark=('LINETRACKER',) + tuple(p['dark'][1:]))),
        ('negated', 'the comparison the wrong way round: drives straight in the light', lambda p: _set(p, dark=(p['dark'][0], 'GT', p['dark'][2]))),
        ('curves', 'curves in the dark instead of driving straight', lambda p: _set(p, action=('curve', 40, 20))),
        ('no-handover', 'nothing happens in the light (the call of stopAtWall is missing)', lambda p: _set(p, rest=[])),
    ],
    'avoidWalls': [
        ('swapped', 'turns towards the wall: the turns swapped', lambda p: _swap(p, 'first_action', 'second_action')),
        ('front-sensor', 'reads FRONT instead of the first side sensor', lambda p: _set(p, first=('obstacle', 'FRONT'))),
        ('never-dark', 'the threshold below what the light sensor ever reads', lambda p: _set(p, dark=(p['dark'][0], 'LT', 30))),
        ('no-handover', 'nothing happens without a wall (the calls of driveInTheDark are missing)', lambda p: _set(p, rest=[])),
    ],
    'followInTheDark': [
        ('swapped', 'the two turns swapped', lambda p: _swap(p, 'on', 'off')),
        ('peach-is-black', 'the black threshold above the floor (83): it steers everywhere', lambda p: _set(p, black=('LINETRACKER', 'LT', 90))),
        ('light-above', 'reads the light from above instead of the floor', lambda p: _set(p, black=('LLIGHT', 'LT', 45))),
        ('no-handover', 'nothing happens off the line in the dark and in the light (the calls of avoidWalls are missing)', lambda p: _set(p, rest=[])),
    ],
}


def reference(fn):
    """the first correct version of a function (the earlier and later functions of a program use it)"""
    return CORRECT[fn]['A']


def body(fn, params):
    p = dict(params)
    p.setdefault('rest', handover(fn))
    if fn == 'avoidWalls':
        p.setdefault('dark', None)
    if fn == 'followLine' and p.get('kind') == 'three':
        pass
    return BUILD[fn](p)


def program_for(fn, params, upto=None):
    """the program of the levels up to function upto (default: fn): fn in the given version, the others in their reference version"""
    upto = upto or fn
    have = CHAIN[:CHAIN.index(upto) + 1]
    bodies = {n: body(n, params if n == fn else reference(n)) for n in have}
    return program([(n, bodies[n]) for n in reversed(have)], main=[have[-1]])


def versions():
    """every version: {id, function, kind: correct|broken, of (the correct version it breaks), fault, why, params}"""
    out = []
    for fn in CHAIN:
        for name, p in CORRECT[fn].items():
            out.append({'id': '%s/%s' % (fn, name), 'function': fn, 'kind': 'correct', 'of': None, 'fault': None, 'why': None, 'params': p})
            for fault, why, change in FAULTS[fn]:
                q = change(p)
                if q == p:
                    continue
                out.append({'id': '%s/%s-%s' % (fn, name, fault), 'function': fn, 'kind': 'broken', 'of': '%s/%s' % (fn, name), 'fault': fault, 'why': why,
                            'params': q})
    return out
