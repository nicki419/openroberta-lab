"""The reference tests of the study's level functions, written by hand (2026-11-07): per function, the tests a good learner would write for its
level, as simulation worlds in the AI assistant's test format (the worlds of a "generate" answer after resolving: nepoTest.aiFormat), so they run
the same way as the AI's and the learners' tests (nepoTest.ai runTests).

The rule they are held to (the user's, 2026-11-06): every correct version of the function passes every test, and every broken version fails at
least one. The versions that are broken by a fault but still beat the level ("equivalent") count as correct here: the level passes them, so the
tests must too. verify.py checks the rule on every version and writes the results into truth.json.

Each test runs the whole program of its level (the function in the version under test, the functions of the levels before in their reference
version), as the learner's program is run. Each test names the faults it is there for (`targets`); a test may catch others too.
"""

VIEW = {'x': 150, 'y': 100, 'scale': 3}


def world(name, starts, items, tests):
    return {'name': name, 'existing': False, 'data': {'version': 3, 'world': {'background': 'peach', 'starts': starts, 'items': items}, 'view': VIEW},
            'tests': tests}


def start(letter, x, y, heading=0):
    return {'id': letter, 'name': letter, 'x': x, 'y': y, 'heading': heading}


def test(name, start_id, checks, scenario, targets, until=None, max_ms=60000):
    return {'name': name, 'scenario': scenario, 'targets': targets, 'start': start_id, 'until': until, 'max_time_ms': max_ms, 'world': [],
            'globals': {}, 'checks': checks}


def line(i, points, smooth=False):
    return {'id': i, 'name': 'Line ' + i, 'kind': 'line', 'points': points, 'smooth': smooth, 'width': 1.48}


def tunnel(i, points, width=15, smooth=False):
    return {'id': i, 'name': 'Tunnel ' + i, 'kind': 'tunnel', 'role': 'obstacle', 'points': points, 'smooth': smooth, 'width': width}


def wall(i, x, y, w, h):
    return {'id': i, 'name': 'Wall ' + i, 'kind': 'rect', 'role': 'obstacle', 'x': x, 'y': y, 'w': w, 'h': h}


def goal(i, x, y, w, h):
    return {'id': i, 'name': 'Goal ' + i, 'kind': 'rect', 'role': 'goal', 'x': x, 'y': y, 'w': w, 'h': h}


def reaches(item):
    return {'check': 'reaches', 'item': item}


def ends_in(item):
    return {'check': 'ends_in', 'item': item}


def never_bumps(item=None):
    return {'check': 'never_bumps', 'item': item} if item else {'check': 'never_bumps'}


# ------------------------------------------------------------------------------------------------ the worlds, shared by the levels

def straight_line_in_time():
    """L1's line and goal, with L1's time limit (20 s): the line follower must be fast enough"""
    return world('A straight line, in time', [start('A', 12, 51.92)],
                 [line('t1', [[16.74, 51.83], [132.26, 51.66]]), goal('t2', 132.28, 40.33, 10.65, 21.18)],
                 [test('Follows a straight line to its end within 20 s', 'A', [reaches('t2'), never_bumps()],
                       'Given the robot on a straight line of 115 cm, when the program runs, then it reaches the goal at the line\'s end within 20 s '
                       '(the time limit of L1).',
                       ['light-above', 'one-turn', 'too-slow', 'straight-off'], until='t2', max_ms=20000)])


def bend(direction, y):
    """a line with a bend of 30 cm to the left (up) or to the right (down), the goal over its end; a robot that goes straight passes beside it"""
    s = -1 if direction == 'left' else 1
    return world('A bend to the %s' % direction, [start('A', 20, y)],
                 [line('t1', [[25, y], [90, y], [130, y + s * 30], [200, y + s * 30]], smooth=True), goal('t2', 192, y + s * 30 - 10, 12, 20)],
                 [test('Follows a bend to the %s' % direction, 'A', [reaches('t2'), never_bumps()],
                       'Given the robot on a line that bends to the %s, when the program runs, then it follows the line round the bend to the goal at '
                       'its end.' % direction,
                       ['light-above', 'one-turn', 'straight-off'], until='t2', max_ms=40000)])


def wall_on_the_line():
    """L4 in small: a line runs into a wall across the robot's whole front (every obstacle sensor sees it); the goal is the 16 cm before it"""
    return world('A wall across the line', [start('A', 20, 50)],
                 [line('t1', [[25, 50], [110, 50]]), wall('t2', 100, 38, 3, 24), goal('t3', 84, 39, 16, 22)],
                 [test('Stops in front of the wall and stays there', 'A',
                       [ends_in('t3'), never_bumps('t2'), {'check': 'does', 'does': 'stands_still', 'after_ms': 15000}],
                       'Given the robot on a line that runs into a wall, when the program runs for 30 s, then it stops in front of the wall (it ends '
                       'in the area before it), never bumps into it, and stands still from 15 s on (it gets there in about 9 s; L4 wants it to stand '
                       'still in front of the wall).',
                       ['negated', 'no-handover', 'turns', 'slows'], max_ms=30000)])


def line_without_wall():
    return world('A line without a wall', [start('A', 20, 100)],
                 [line('t1', [[25, 100], [200, 100]]), goal('t2', 195, 90, 12, 20)],
                 [test('With nothing ahead, follows the line', 'A', [reaches('t2'), never_bumps()],
                       'Given the robot on a line with nothing ahead, when the program runs, then it follows the line to the goal at its end.',
                       ['negated', 'no-handover'], until='t2', max_ms=40000)])


def through_the_tunnel(targets):
    """the context pack's recipe "Driving through a tunnel": the line runs 15 cm into the tunnel, the goal inside it, where it is dark"""
    x, y = 30, 100
    return world('Through the tunnel', [start('A', x, y)],
                 [line('t1', [[x - 10, y], [x + 55, y]]), tunnel('t2', [[x + 40, y], [x + 160, y]]), goal('t3', x + 110, y - 5, 10, 10)],
                 [test('Follows the line into the tunnel and gets through the dark', 'A', [reaches('t3'), never_bumps('t2')],
                       'Given the robot on a line that runs into a tunnel, when the program runs, then it drives on in the dark to the goal inside the '
                       'tunnel without bumping into the tunnel\'s walls.',
                       targets, until='t3')])


def starts_in_the_dark(targets):
    """the context pack's recipe "Dim light": the robot starts inside a straight tunnel, where it is dark"""
    x, y = 30, 100
    return world('Starts in the dark', [start('A', x, y)],
                 [tunnel('t1', [[x - 10, y], [x + 100, y]]), goal('t2', x + 50, y - 5, 10, 10)],
                 [test('In the dark, drives straight on', 'A', [reaches('t2'), never_bumps('t1')],
                       'Given the robot inside a dark tunnel with no line, when the program runs, then it drives straight on to the goal without '
                       'bumping into the tunnel\'s walls.',
                       targets, until='t2')])


def bent_tunnel(direction, targets):
    """the context pack's recipe "Dim light: walls on its left or right": a tunnel that bends; its outer wall comes in front of one side"""
    x = 30
    y = 50 if direction == 'right' else 150
    s = 1 if direction == 'right' else -1
    pts = [[x + 40, y], [x + 100, y], [x + 140, y + s * 30], [x + 155, y + s * 70], [x + 155, y + s * 115]]
    g = goal('t3', x + 150, y + 85, 10, 10) if direction == 'right' else goal('t3', x + 150, y - 95, 10, 10)
    side = 'left' if direction == 'right' else 'right'
    return world('A tunnel that bends to the %s' % direction, [start('A', x, y)],
                 [line('t1', [[x - 10, y], [x + 55, y]]), tunnel('t2', pts, 15, True), g],
                 [test('Turns away from the wall on its %s and gets round the bend' % side, 'A', [reaches('t3'), never_bumps('t2')],
                       'Given the robot on a line into a tunnel that bends to the %s, when the program runs, then in the dark it turns away from the '
                       'tunnel\'s wall on its %s and gets round the bend to the goal inside the tunnel without bumping into it.' % (direction, side),
                       targets, until='t3')])


def line_in_the_dark(direction, targets):
    """a wide tunnel (45 cm, as in L7) with a line inside that bends 20 cm to one side; the robot starts on it in the dark. A robot that drives
    straight in the dark passes beside the goal; one that follows the line reaches it."""
    x = 40
    y = 90 if direction == 'right' else 110
    s = 1 if direction == 'right' else -1
    return world('A line in the dark that bends to the %s' % direction, [start('A', x, y)],
                 [tunnel('t1', [[x - 10, 100], [x + 220, 100]], 45), line('t2', [[x - 5, y], [x + 50, y], [x + 90, y + s * 20], [x + 160, y + s * 20]], True),
                  goal('t3', x + 150, y + s * 20 - 7, 10, 14)],
                 [test('In the dark, follows the line round a bend to the %s' % direction, 'A', [reaches('t3'), never_bumps('t1')],
                       'Given the robot on a line inside a dark tunnel, when the line bends to the %s, then the robot follows it to the goal at its '
                       'end without bumping into the tunnel.' % direction,
                       targets, until='t3')])


# ------------------------------------------------------------------------------------------------ the tests per function

# the tests' ids per function, in the order of their worlds (each world has one test): "<function>:<id>" names a test for good
IDS = {
    'followLine': ['straight-in-time', 'bend-left', 'bend-right'],
    'stopAtWall': ['wall-ahead', 'no-wall'],
    'driveInTheDark': ['through-tunnel', 'start-in-dark', 'bend-in-light'],
    'avoidWalls': ['tunnel-bends-right', 'tunnel-bends-left', 'through-tunnel'],
    'followInTheDark': ['dark-line-bends-right', 'dark-line-bends-left', 'start-in-dark'],
}


def reference_tests():
    """{function: [worlds]}; each test has its id in `ref` ("<function>:<id>")"""
    out = _worlds()
    for fn, worlds in out.items():
        assert len(worlds) == len(IDS[fn]) and all(len(w['tests']) == 1 for w in worlds)
        for w, i in zip(worlds, IDS[fn]):
            w['tests'][0]['ref'] = '%s:%s' % (fn, i)
    return out


def _worlds():
    return {
        'followLine': [straight_line_in_time(), bend('left', 60), bend('right', 140)],
        'stopAtWall': [wall_on_the_line(), line_without_wall()],
        'driveInTheDark': [through_the_tunnel(['never-dark', 'floor-sensor', 'negated', 'curves', 'no-handover']),
                           starts_in_the_dark(['never-dark', 'floor-sensor', 'negated', 'curves']),
                           bend_in_the_light()],
        'avoidWalls': [bent_tunnel('right', ['swapped', 'front-sensor', 'never-dark', 'no-handover']),
                       bent_tunnel('left', ['swapped', 'front-sensor', 'never-dark', 'no-handover']),
                       through_the_tunnel(['no-handover'])],
        'followInTheDark': [line_in_the_dark('right', ['peach-is-black', 'light-above', 'no-handover']),
                            line_in_the_dark('left', ['peach-is-black', 'light-above', 'no-handover']),
                            starts_in_the_dark(['peach-is-black', 'light-above', 'no-handover'])],
    }


def bend_in_the_light():
    """driveInTheDark hands over to the line follower in the light: a bend of the line, as for followLine"""
    w = bend('left', 60)
    w['name'] = 'In the light, a bend to the left'
    t = w['tests'][0]
    t['name'] = 'In the light, still follows the line round a bend'
    t['scenario'] = ('Given the robot on a line in the light that bends to the left, when the program runs, then it follows the line round the bend '
                     'to the goal (it drives straight only in the dark).')
    t['targets'] = ['negated', 'no-handover']
    return w
