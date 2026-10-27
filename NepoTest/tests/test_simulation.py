"""Simulation tests (nepotest.simulation): simulation worlds and their tests (the blocks, their data and their checks), the
example suite (which run_spec skips: simulation tests run on the Lab's simulator, in the Tests tab), and the copy of the
Lab's simulator that NepoTest no longer uses (geometry, the floor picture and how the sensors read it, the infrared rays,
the robot's speed, kinematics and bumping, how a run of the first kind of simulation tests ends: goal, fail area, recorded
path).
Offline: uses examples/line_follower.bundle.json (converted by the Lab) and tests/data/edison_track_floor.json (the floor
picture of the simulator's Edison track, as the Lab's Tests tab draws it: the copy needs it to run on that background).

Run from NepoTest/:  python -m unittest tests.test_simulation
"""

import array
import base64
import json
import math
import os
import unittest
import zlib
from xml.sax.saxutils import escape

from nepotest import TestSubject, browser, load_spec, run_spec, subject_for, validate_spec
from nepotest import simulation as SIM
from nepotest.blocks import split_program, translate
from nepotest.engine import values as V
from nepotest.spec import run_test

HERE = os.path.dirname(os.path.abspath(__file__))
EXAMPLES = os.path.join(os.path.dirname(HERE), 'examples')
BUNDLE = os.path.join(EXAMPLES, 'line_follower.bundle.json')
C = V.CONSTANTS

LINE = {'id': 'l', 'kind': 'line', 'points': [[10, 20], [110, 20]], 'smooth': False}


def follower():
    return TestSubject.from_bundle(BUNDLE)


def white_world(*items, **start):
    """a world of the first kind (one start) on the simulator's white background, which this module can draw itself"""
    return {'background': 'drawBackground', 'start': dict({'x': 10, 'y': 20, 'heading': 0}, **start), 'items': list(items)}


def oval_world(*extra):
    cx, cy, rx, ry = 70, 45, 45, 25
    points = [[round(cx + rx * math.cos(2 * math.pi * k / 8), 1), round(cy + ry * math.sin(2 * math.pi * k / 8), 1)] for k in range(8)]
    track = {'id': 'track', 'kind': 'line', 'points': points, 'smooth': True, 'closed': True}
    return white_world(track, *extra, x=60, y=69.3, heading=0)


def sim_test(world, **more):
    test = {'name': 'sim', 'simulation': {'world': world}, 'max_time_ms': 30000}
    test.update(more)
    return test


def track_floor():
    """the floor picture of the Edison track (simpleBackgroundEdison), drawn by the Lab's Tests tab"""
    with open(os.path.join(HERE, 'data', 'edison_track_floor.json'), encoding='utf-8') as f:
        return json.load(f)


def example_tests():
    """the tests of examples/line_follower_with_tests.xml, translated"""
    with open(os.path.join(EXAMPLES, 'line_follower_with_tests.xml'), encoding='utf-8') as f:
        _, tests_xml = split_program(f.read())
    spec, problems = translate(tests_xml, follower().nepo)
    return spec, problems


def stored_floor(name):
    """the simulation of a test of the example, with the floor picture of its background"""
    spec, _ = example_tests()
    return dict([t for t in spec['tests'] if t['name'] == name][0]['simulation'], floor=track_floor())


class GeometryTest(unittest.TestCase):
    def test_the_robot_is_the_simulators(self):
        front_left, front_right, back_right, back_left = SIM.outline(SIM.sim_pose(0, 0, 0))
        self.assertEqual(front_left, (SIM.BORDER + 18.5, SIM.BORDER - 11.25))  # EdisonChassis, units
        self.assertEqual(back_right, (SIM.BORDER - 5.5, SIM.BORDER + 11.25))
        self.assertAlmostEqual(SIM.LENGTH_CM, 8)
        self.assertAlmostEqual(SIM.WIDTH_CM, 7.5)
        # heading 90: facing up (counterclockwise as seen from above); the simulator's theta is clockwise
        x, y, theta = SIM.sim_pose(0, 0, 90)
        self.assertAlmostEqual(theta, 3 * math.pi / 2)
        px, py = SIM.transform((x, y, theta), SIM.LINE_SENSOR)
        self.assertAlmostEqual(px, x)
        self.assertAlmostEqual(py, y - 15)

    def test_curves_pass_through_their_points(self):
        points = [[0, 0], [10, 10], [20, 0], [30, 10]]
        segments = SIM.bezier_segments(points, smooth=True, closed=False)
        self.assertEqual([s[0] for s in segments] + [segments[-1][3]], [tuple(p) for p in points])
        self.assertEqual(len(SIM.bezier_segments(points, smooth=True, closed=True)), 4)

    def test_shapes_like_the_simulator(self):
        rect = SIM.Shape({'kind': 'rect', 'role': 'obstacle', 'x': 0, 'y': 0, 'w': 10, 'h': 5})
        self.assertEqual((rect.x, rect.y, rect.w, rect.h), (10, 10, 30, 15))  # top left corner, in units
        self.assertTrue(rect.contains(20, 20))
        self.assertFalse(rect.contains(10, 20))  # checkInObstacle: strictly inside
        circle = SIM.Shape({'kind': 'circle', 'role': 'goal', 'x': 10, 'y': 10, 'r': 2})
        self.assertTrue(circle.contains(*SIM.to_units(11.9, 10)))
        triangle = SIM.Shape({'kind': 'triangle', 'role': 'fail', 'points': [[0, 10], [5, 0], [10, 10]]})
        self.assertTrue(triangle.contains(*SIM.to_units(5, 8)))
        self.assertFalse(triangle.contains(*SIM.to_units(1, 2)))
        self.assertEqual(len(triangle.lines()), 3)

    def test_touching(self):
        robot = SIM.outline(SIM.sim_pose(20, 20, 0))
        near = SIM.Shape({'kind': 'circle', 'role': 'goal', 'x': 20 + 6.17 + 0.5, 'y': 20, 'r': 0.6})
        far = SIM.Shape({'kind': 'circle', 'role': 'goal', 'x': 20 + 6.17 + 2, 'y': 20, 'r': 0.6})
        self.assertTrue(near.touches(robot, SIM.bbox(robot)))
        self.assertFalse(far.touches(robot, SIM.bbox(robot)))

    def test_corridor(self):
        corridor = SIM.Corridor([[0, 0, 0], [10, 0, 0], [20, 0, 0]], tolerance_cm=2)
        half = SIM.WIDTH_CM / 2
        self.assertTrue(corridor.contains(*SIM.to_units(15, half + 1.9)))
        self.assertFalse(corridor.contains(*SIM.to_units(15, half + 2.1)))
        self.assertIsNone(corridor.outside(SIM.check_points(SIM.outline(SIM.sim_pose(12, 1, 0)))))
        self.assertIsNotNone(corridor.outside(SIM.check_points(SIM.outline(SIM.sim_pose(12, 5, 0)))))


class FloorTest(unittest.TestCase):
    def test_the_floor_drawn_here(self):
        world = SIM.SimWorld(white_world(LINE, {'id': 'b', 'kind': 'rect', 'role': 'color', 'color': '#000000', 'x': 50, 'y': 40, 'w': 10, 'h': 10}))
        floor = world.floor
        self.assertEqual((floor.width, floor.height), (720, 520))  # drawBackground 700 x 500 and the wall
        self.assertEqual(floor.sample(*SIM.to_units(50, 20)), 0)  # the line's black core
        self.assertEqual(floor.sample(*SIM.to_units(50, 21.5)), 100)  # its white band
        self.assertEqual(floor.sample(*SIM.to_units(50, 60)), 100)  # the white background
        self.assertEqual(floor.sample(*SIM.to_units(55, 45)), 0)  # the black area
        edge = floor.sample(*SIM.to_units(50, 20 + SIM.LINE_WIDTH_CM / 2))
        self.assertTrue(0 < edge < 100, edge)  # the 5-pixel cross is half on the core

    def test_the_peach_floor(self):
        world = SIM.default_world()  # a new world: the plain peach floor, the robot's start A in its middle, nothing on it
        self.assertEqual((world['background'], world['starts'], world['items']),
                         ('peach', [{'id': 'A', 'name': 'A', 'x': 150.0, 'y': 100.0, 'heading': 0}], []))
        floor = SIM.SimWorld(world).floor
        self.assertEqual((floor.width, floor.height), (920, 620))  # 300 x 200 cm and the border, which is peach too
        self.assertAlmostEqual(floor.sample(*SIM.to_units(150, 100)), (0xf7 + 0xd1 + 0xb3) / 3 / 2.55)  # 83 %: light
        self.assertAlmostEqual(floor.sample(5, 5), floor.sample(*SIM.to_units(150, 100)))  # no wall in the border (units)

    def test_a_stored_floor(self):
        sums = array.array('H', [765, 0, 765, 0, 0, 0, 765, 0, 765])  # a 3 x 3 picture: a black cross
        floor = SIM.Floor.decode({'w': 3, 'h': 3, 'sum': base64.b64encode(zlib.compress(sums.tobytes())).decode()})
        self.assertEqual(floor.sample(1.5, 1.5), 0)  # the cross of the sampled pixels is the black one
        self.assertAlmostEqual(floor.sample(0.5, 0.5), 765 / 5 / 3 / 2.55)  # shifted: 2 pixels outside, 2 black, 1 white
        sim = stored_floor('follows the track to the finish')
        stored = SIM.SimWorld(sim['world'], sim['floor']).floor
        self.assertEqual((stored.width, stored.height), (280, 240))  # simpleBackgroundEdison 260 x 220 and the wall

    def test_the_sensors_read_the_floor_as_in_the_simulator(self):
        # values the Lab's simulator showed for the robot at (150, 40) units, turned 30 degrees, on the Edison track
        # (read from its hardwareState in a browser): line tracker 87 %, LLIGHT 87 %, RLIGHT 76 %
        sim = stored_floor('follows the track to the finish')
        robot = SIM.SimRobot(SIM.SimWorld(dict(sim['world'], start={'x': 46.67, 'y': 10, 'heading': -30}), sim['floor']))
        robot._sense(0, 0, 0)
        self.assertEqual((SIM.js_round(robot.light['tracker']), SIM.js_round(robot.light['left']), SIM.js_round(robot.light['right'])), (87, 87, 76))
        self.assertEqual(robot.ed_ReadLineState(), C['LINE_ON_WHITE'])
        self.assertEqual((robot.ed_ReadLineTracker(), robot.ed_ReadLeftLightLevel(), robot.ed_ReadRightLightLevel()), (870, 870, 760))

    def test_version_1_worlds(self):
        old = {'start': {'x': 1, 'y': 2, 'heading': 0}, 'items': [
            {'id': 'r', 'kind': 'rect', 'role': 'black', 'x': 10, 'y': 10, 'w': 4, 'h': 2, 'rot': 30},
            {'id': 'e', 'kind': 'ellipse', 'role': 'goal', 'x': 5, 'y': 5, 'w': 4, 'h': 6},
            {'id': 'l', 'kind': 'line', 'points': [[0, 0], [1, 1]], 'width': 1.5}]}
        world = SIM.migrate_v1(old)
        self.assertEqual(world['background'], 'peach')
        self.assertEqual(world['items'][0], {'id': 'r', 'role': 'color', 'color': '#000000', 'kind': 'rect', 'x': 8.0, 'y': 9.0, 'w': 4, 'h': 2})
        self.assertEqual(world['items'][1], {'id': 'e', 'role': 'goal', 'kind': 'circle', 'x': 5, 'y': 5, 'r': 2.5})
        self.assertNotIn('width', world['items'][2])


class SensorAndPhysicsTest(unittest.TestCase):
    def robot(self, *items, **start):
        robot = SIM.SimRobot(SIM.SimWorld(white_world(*items, **start)))
        robot._begin(None, None)
        robot.trace.append(None)  # pretend an Ed call is in progress
        return robot

    def test_the_speed_is_the_simulators(self):
        robot = self.robot(x=10, y=50)
        robot.ed_Drive(C['FORWARD'], 5, 0)  # level 5 = 50 %
        robot._advance(1000)
        expected = 50 * SIM.MAXPOWER / SIM.UNITS_PER_CM  # cm in a second
        self.assertAlmostEqual(robot.world_pose()[0] - 10, expected, delta=0.4)
        self.assertAlmostEqual(expected, 17.44, places=2)

    def test_turning_by_degrees(self):
        robot = self.robot(x=50, y=50)
        robot.ed_Drive(C['SPIN_LEFT'], 5, 90)
        robot._advance(100)
        self.assertAlmostEqual(robot.world_pose()[2], 90, delta=1)

    def test_obstacle_detection(self):
        wall = {'id': 'w', 'kind': 'rect', 'role': 'obstacle', 'x': 30, 'y': 5, 'w': 4, 'h': 30}
        robot = self.robot(wall, x=10, y=20)
        robot.ed_ObstacleDetectionBeam(1)
        robot.ed_Drive(C['FORWARD'], 5, 0)
        seen = None
        for _ in range(300):
            robot._advance(10)
            if robot.ir['FRONT']:
                seen = robot.world_pose()[0]
                break
        sensor = seen + 18 / SIM.UNITS_PER_CM  # the front sensor: 18 units ahead of the axle
        self.assertAlmostEqual(30 - sensor, SIM.IR_MAX_CM, delta=0.25)  # the simulator sees 3 cm
        self.assertEqual(robot.ed_ReadObstacleDetection(), C['OBSTACLE_AHEAD'])

    def test_one_beam_sees_an_obstacle_to_the_side(self):
        post = {'id': 'p', 'kind': 'circle', 'role': 'obstacle', 'x': 17, 'y': 20 - 8 / SIM.UNITS_PER_CM, 'r': 0.5}
        robot = self.robot(post, x=10, y=20)
        robot._sense(0, 0, 0)
        self.assertEqual(robot.ir, {'LEFT': True, 'FRONT': False, 'RIGHT': False})

    def test_bumping_into_an_obstacle(self):
        wall = {'id': 'w', 'kind': 'rect', 'role': 'obstacle', 'x': 30, 'y': 5, 'w': 4, 'h': 30}
        robot = self.robot(wall, x=10, y=20)
        robot.ed_Drive(C['FORWARD'], 5, 0)  # no obstacle detection: it drives into the wall
        robot._advance(4000)
        front = robot.world_pose()[0] + 18.5 / SIM.UNITS_PER_CM
        self.assertTrue(29 < front < 30.5, front)  # it pushes against the wall and stays there
        self.assertGreater(robot.bumps, 10)

    def test_the_wall_around_the_floor(self):
        robot = self.robot(x=10, y=20, heading=180)
        robot.ed_Drive(C['FORWARD'], 5, 0)
        robot._advance(3000)
        back = robot.world_pose()[0] - 18.5 / SIM.UNITS_PER_CM
        self.assertTrue(-1 < back < 0.5, back)  # the front stays at the background's edge (x = 0)

    def test_start_problems(self):
        goal = {'id': 'g', 'kind': 'rect', 'role': 'goal', 'x': 9, 'y': 19, 'w': 2, 'h': 2}
        self.assertEqual(SIM.start_problems(white_world(goal)), [])  # an area no check is about
        problems = SIM.start_problems(white_world(goal), checked=['g'])
        self.assertEqual([(p[0], p[2]) for p in problems], [('g', 'warning')])
        self.assertIn('"Goal 1", which the test checks', problems[0][1])
        wall = {'id': 'o', 'kind': 'rect', 'role': 'obstacle', 'x': 9, 'y': 19, 'w': 2, 'h': 2}
        self.assertEqual([(p[0], p[2]) for p in SIM.start_problems(white_world(wall))], [('o', 'error')])
        self.assertEqual([(p[0], p[2]) for p in SIM.start_problems(white_world(x=-5))], [(None, 'error')])  # off the floor
        world = SIM.world_v3(white_world(goal))
        world['starts'].append({'id': 'far', 'name': 'B', 'x': 100, 'y': 100, 'heading': 0})
        self.assertEqual(SIM.start_problems(world, 'far', checked=['g']), [])


class RunTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.subject = follower()

    def run_sim(self, test, record=False):
        return SIM.run_simulation_test(self.subject, test, record=record)[0]

    def test_the_line_follower_reaches_the_goal(self):
        goal = {'id': 'g', 'kind': 'rect', 'role': 'goal', 'x': 64, 'y': 12, 'w': 12, 'h': 8}
        report = self.run_sim(sim_test(oval_world(goal)))
        self.assertEqual(report['outcome'], 'passed', report['failures'])
        sim = report['simulation']
        self.assertEqual((sim['result'], sim['item']), ('goal', 'g'))
        self.assertTrue(8000 < sim['t'] < 20000, sim['t'])
        self.assertEqual(sim['path'][0][1:], [60.0, 69.3, 0.0])
        self.assertEqual(report['kind'], 'simulation')

    def test_without_a_goal_the_test_passes_when_time_is_up(self):
        report = self.run_sim(sim_test(oval_world(), max_time_ms=3000))
        self.assertEqual((report['outcome'], report['simulation']['result']), ('passed', 'time_limit'))

    def test_a_goal_that_is_never_reached(self):
        far = {'id': 'g', 'kind': 'rect', 'role': 'goal', 'x': 200, 'y': 140, 'w': 5, 'h': 5}
        report = self.run_sim(sim_test(oval_world(far), max_time_ms=3000))
        self.assertEqual(report['outcome'], 'failed')
        self.assertEqual(report['failures'][0]['message'], 'the robot did not reach a goal area within 3 s')

    def test_a_fail_area_ends_the_run(self):
        fail = {'id': 'f', 'kind': 'circle', 'role': 'fail', 'x': 88, 'y': 69, 'r': 3}  # on the track
        report = self.run_sim(sim_test(oval_world(fail)))
        self.assertEqual((report['outcome'], report['simulation']['result'], report['simulation']['item']), ('failed', 'fail_area', 'f'))
        self.assertTrue(report['failures'][0]['message'].startswith('the robot touched a fail area after'))

    def test_the_obstacle_detection_stops_the_robot_before_the_wall(self):
        wall = {'id': 'w', 'kind': 'rect', 'role': 'obstacle', 'x': 50, 'y': 5, 'w': 4, 'h': 30}
        close = {'id': 'close', 'kind': 'rect', 'role': 'fail', 'x': 49, 'y': 5, 'w': 1, 'h': 30}
        report = self.run_sim(sim_test(white_world(wall, close), call='toTheWall', args=[], max_time_ms=10000))
        self.assertEqual((report['outcome'], report['simulation']['result']), ('passed', 'returned'), report['failures'])
        front = report['simulation']['path'][-1][1] + 18.5 / SIM.UNITS_PER_CM
        self.assertTrue(46 < front < 48, front)  # about 3 cm before the wall

    def test_leaving_the_recorded_path_fails(self):
        world = oval_world()
        recorded = self.run_sim(sim_test(world, max_time_ms=5000), record=True)
        path = [p[1:] for p in recorded['simulation']['path']]
        test = sim_test(world, max_time_ms=5000)
        test['simulation'].update(reference={'path': path}, tolerance_cm=1)
        self.assertEqual(self.run_sim(test)['outcome'], 'passed')
        test['simulation']['reference'] = {'path': [[x, y - 6, h] for x, y, h in path]}  # the same path, 6 cm higher up
        report = self.run_sim(test)
        self.assertEqual((report['outcome'], report['simulation']['result']), ('failed', 'deviation'))
        self.assertIsNotNone(report['simulation']['point'])
        self.assertIn('left the recorded path (by more than 1 cm)', report['failures'][0]['message'])
        self.assertEqual(self.run_sim(test, record=True)['outcome'], 'passed')  # recording ignores the old path

    def test_spec_validation(self):
        def spec(world, **sim):
            test = {'name': 'sim', 'max_time_ms': 3000, 'simulation': dict({'world': SIM.world_v3(world), 'start': 'A', 'checks': []}, **sim)}
            return {'format': 'nepotest', 'tests': [test]}

        test = spec(oval_world())
        self.assertEqual(validate_spec(test), [])  # no "expect" needed
        test['tests'][0]['world'] = [{'event': 'obstacle', 'port': 'FRONT', 'from': 0}]
        problems = validate_spec(test)
        self.assertTrue(any('only takes clap, key;' in p for p in problems), problems)
        test['tests'][0]['world'] = [{'event': 'remote', 'code': 1, 'at': 0}]  # the Lab's simulator has no IR remote control
        self.assertTrue(validate_spec(test))
        bad = spec(white_world({'kind': 'rect', 'role': 'lava', 'x': 0, 'y': 0, 'w': 1, 'h': 1}))
        self.assertTrue(any('"role" must be one of' in p for p in validate_spec(bad)))
        image = spec(dict(oval_world(), background='simpleBackgroundEdison'))
        self.assertEqual(validate_spec(image), [])  # the simulator draws the floor
        self.assertTrue(any("there is no start 'B'" in p for p in validate_spec(spec(oval_world(), start='B'))))
        self.assertTrue(any('"check" must be one of' in p for p in validate_spec(spec(oval_world(), checks=[{'check': 'flies'}]))))
        self.assertTrue(any("is not an area" in p for p in validate_spec(spec(oval_world(), until='track'))))  # a line


def world_xml(data, rules='', tests='', world_id='w', name='course', extra=''):
    """a simulation world block with its data, rules and tests (XML)"""
    data_el = '<data>%s</data>' % escape(json.dumps(data)) if data is not None else ''
    return ('<block type="nepoTest_world" id="%s"><field name="NAME">%s</field>%s<statement name="RULES">%s</statement>'
            '<statement name="TESTS">%s</statement>%s</block>') % (world_id, name, data_el, rules, tests, extra)


def case_xml(case_id, name, start='A', checks='', setup='', mode='for', until='', seconds=5, active='TRUE', should='pass'):
    """a test of a world (XML)"""
    return ('<block type="nepoTest_simcase" id="%s"><field name="ACTIVE">%s</field><field name="NAME">%s</field>'
            '<field name="START">%s</field><field name="MODE">%s</field><field name="UNTIL">%s</field><field name="SECONDS">%d</field>'
            '<field name="SHOULD">%s</field><statement name="SETUP">%s</statement><statement name="CHECKS">%s</statement></block>'
            ) % (case_id, active, name, start, mode, until, seconds, should, setup, checks)


def check_xml(kind, block_id, value=None, data=None, tol=None):
    field = {'never_bumps': 'OBSTACLE', 'path': 'TOL'}.get(kind, 'AREA')
    value = tol if kind == 'path' else value
    return '<block type="nepoTest_check_%s" id="%s">%s%s</block>' % (
        kind, block_id, '<field name="%s">%s</field>' % (field, value) if value is not None else '',
        '<data>%s</data>' % escape(json.dumps(data)) if data is not None else '')


def suite_of(*instances, run=('course',)):
    runs = ''.join('<block type="nepoTest_run" id="r%d"><field name="NAME">%s</field></block>' % (i, n) for i, n in enumerate(run))
    return ('<block_set xmlns="http://de.fhg.iais.roberta.blockly" robottype="edison">'
            '<instance x="0" y="0"><block type="nepoTest_suite" id="s"/>%s</instance>%s</block_set>'
            ) % (runs, ''.join('<instance x="0" y="100">%s</instance>' % i for i in instances))


def course(*items, **more):
    """a world with two starts (A in the middle, B at the left) and some items"""
    world = SIM.default_world()
    world['starts'].append({'id': 'st2', 'name': 'B', 'x': 30, 'y': 100, 'heading': 0})
    world['items'] = list(items)
    data = {'version': 3, 'world': world}
    data.update(more)
    return data


GOAL = {'id': 'g', 'name': 'Finish', 'kind': 'rect', 'role': 'goal', 'x': 200, 'y': 90, 'w': 10, 'h': 20}
FAIL = {'id': 'f', 'kind': 'circle', 'role': 'fail', 'x': 100, 'y': 40, 'r': 5}
WALL = {'id': 'o', 'name': 'Wall', 'kind': 'rect', 'role': 'obstacle', 'x': 250, 'y': 50, 'w': 4, 'h': 100}
PATH = {'path': [[150, 100, 0], [160, 100, 0]], 'time_ms': 900}


def messages(problems, severity=None):
    return [p['message'] for p in problems if severity is None or p['severity'] == severity]


class SimulationWorldTest(unittest.TestCase):
    def test_a_world_with_tests(self):
        rules = check_xml('never_touches', 'c1', 'ANY')
        tests = (case_xml('t1', 'to the finish', checks=check_xml('reaches', 'c2', 'g') + check_xml('path', 'c3', data=PATH, tol='1.5'),
                          mode='until', until='g', seconds=12)
                 + case_xml('t2', 'from the left', start='st2', checks=check_xml('never_bumps', 'c4', 'o') + check_xml('ends_in', 'c5', 'g'),
                            setup='<block type="nepoTest_given_clap" id="cl"><field name="AT">500</field></block>', should='fail')
                 + case_xml('t3', 'skipped one', active='FALSE', checks=check_xml('never_bumps', 'c6', 'ANY')))
        spec, problems = translate(suite_of(world_xml(course(GOAL, FAIL, WALL, view={'x': 0, 'y': 0, 'scale': 4}), rules, tests)))
        self.assertEqual(problems, [])
        world = SIM.world_v3(course(GOAL, FAIL, WALL)['world'])
        rule = {'check': 'never_touches', 'block_id': 'c1', 'rule': True}
        self.assertEqual(spec['tests'][0], {
            'name': 'to the finish', 'origin': 'blocks', 'block_id': 't1', 'max_time_ms': 12000,
            'simulation': {'world_block_id': 'w', 'world_name': 'course', 'world': world, 'start': 'A', 'until': 'g',
                           'checks': [rule, {'check': 'reaches', 'block_id': 'c2', 'item': 'g'},
                                      {'check': 'path', 'block_id': 'c3', 'tolerance_cm': 1.5, 'path': PATH['path'], 'time_ms': 900}]}})
        second = spec['tests'][1]
        self.assertEqual((second['should'], second['world'], second['simulation']['start'], 'until' in second['simulation']),
                         ('fail', [{'event': 'clap', 'at': 500}], 'st2', False))
        self.assertEqual(second['simulation']['checks'][1:], [{'check': 'never_bumps', 'block_id': 'c4', 'item': 'o'},
                                                              {'check': 'ends_in', 'block_id': 'c5', 'item': 'g'}])
        self.assertEqual((spec['tests'][2]['skip'], spec['tests'][2]['simulation']['checks'][1]), (True, {'check': 'never_bumps', 'block_id': 'c6'}))
        self.assertEqual(validate_spec(spec), [])

    def test_one_test_of_a_world_and_each_test_once(self):
        tests = case_xml('t1', 'one', checks=check_xml('reaches', 'c1', 'ANY')) + case_xml('t2', 'two', checks=check_xml('reaches', 'c2', 'ANY'))
        world = world_xml(course(GOAL), tests=tests)
        spec, problems = translate(suite_of(world, run=('two',)))
        self.assertEqual(([t['name'] for t in spec['tests']], problems), (['two'], []))  # the other test of the world doesn't run, no warning
        spec, problems = translate(suite_of(world, run=('two', 'course')))
        self.assertEqual([t['name'] for t in spec['tests']], ['two', 'one'])
        self.assertEqual(messages(problems), ['test "two" is already in the suite (with its world)'])
        _, problems = translate(suite_of(world, run=()))
        self.assertIn('the tests of world "course" are not under the start block, so they do not run', messages(problems, 'warning'))

    def test_names_are_one_namespace(self):
        tests = case_xml('t1', 'course', checks=check_xml('reaches', 'c1', 'ANY'))
        bdd = '<block type="nepoTest_test" id="b"><field name="NAME">one</field></block>'
        _, problems = translate(suite_of(world_xml(course(GOAL), tests=tests), bdd, run=('one',)))
        self.assertIn('there are two tests named "course"', messages(problems))

    def test_a_test_outside_a_world(self):
        loose = case_xml('t9', 'loose', checks=check_xml('reaches', 'c1', 'ANY'))
        _, problems = translate(suite_of(world_xml(course(GOAL)), loose, run=('loose',)))
        self.assertEqual([(p['block_id'], p['severity']) for p in problems if 'into a simulation world' in p['message']], [('t9', 'error')])

    def test_references_that_are_not_in_the_world(self):
        tests = (case_xml('t1', 'gone', start='nope', checks=check_xml('reaches', 'c1', 'x') + check_xml('never_bumps', 'c2', 'g'), mode='until', until='o')
                 + case_xml('t2', 'empty', checks=check_xml('ends_in', 'c3', 'ANY')))
        _, problems = translate(suite_of(world_xml(course(GOAL, WALL), tests=tests)))
        errors = [(p['block_id'], p['message']) for p in problems if p['severity'] == 'error']
        self.assertEqual([e[0] for e in errors], ['t1', 't1', 'c1', 'c2', 'c3'], errors)
        self.assertIn('its start is not in the world', errors[0][1])
        self.assertIn('the area that ends the run is not in the world', errors[1][1])  # an obstacle is no area

    def test_warnings(self):
        rules = check_xml('path', 'c0', tol='2')
        tests = (case_xml('t1', 'nothing') + case_xml('t2', 'no path', checks=check_xml('path', 'c1', tol='2'))
                 + case_xml('t3', 'on the goal', checks=check_xml('reaches', 'c2', 'g')))
        on_start = dict(GOAL, x=145, y=95)
        _, problems = translate(suite_of(world_xml(course(on_start), rules, tests)))
        found = [(p['block_id'], p['severity']) for p in problems]
        self.assertIn(('c0', 'error'), found)  # a recorded path is no rule
        self.assertIn(('t1', 'warning'), found)  # checks nothing
        self.assertIn(('c1', 'warning'), found)  # not recorded yet
        self.assertIn('test "on the goal": the robot starts on "Finish", which the test checks: move the start or the area', messages(problems, 'warning'))

    def test_set_up(self):
        setup = ('<block type="nepoTest_given_variable" id="v"><field name="VAR">claps</field><value name="VALUE">'
                 '<block type="math_number" id="n"><field name="NUM">2</field></block></value></block>'
                 '<block type="nepoTest_given_obstacle" id="o"><field name="FROM">0</field><field name="DURATION">0</field></block>')
        spec, problems = translate(suite_of(world_xml(course(GOAL), tests=case_xml('t1', 'past', setup=setup, checks=check_xml('reaches', 'c1', 'ANY')))))
        self.assertEqual(spec['tests'][0]['globals'], {'claps': 2})  # no "call" needed
        self.assertEqual([(p['block_id'], p['severity']) for p in problems], [('o', 'error')])  # draw obstacles into the world
        self.assertEqual(validate_spec({'format': 'nepotest', 'tests': [spec['tests'][0]]}), [])

    def test_old_world_data(self):
        old = {'version': 2, 'tolerance_cm': 3, 'reference': {'path': [[1, 2, 0]]}, 'world': {
            'background': 'peach', 'start': {'x': 30, 'y': 40, 'heading': 90}, 'items': []}}
        spec, _ = translate(suite_of(world_xml(old, tests=case_xml('t1', 'old', checks=check_xml('reaches', 'c1', 'ANY')))))
        self.assertEqual(spec['tests'][0]['simulation']['world']['starts'], [{'id': 'A', 'name': 'A', 'x': 30, 'y': 40, 'heading': 90}])
        spec, problems = translate(suite_of(world_xml(None, tests=case_xml('t1', 'new', checks=check_xml('reaches', 'c1', 'ANY')))))
        self.assertEqual(spec['tests'][0]['simulation']['world'], SIM.default_world())  # a new world: start A in the middle
        self.assertEqual(messages(problems, 'error'), [])

    def test_simulation_tests_of_the_first_kind_are_left_out(self):
        old = ('<block type="nepoTest_simtest" id="old"><field name="NAME">old</field><field name="SECONDS">12</field></block>')
        tests = case_xml('t1', 'new', checks=check_xml('reaches', 'c1', 'ANY'))
        spec, problems = translate(suite_of(world_xml(course(GOAL), tests=tests), old, run=('old', 'course')))
        self.assertEqual([t['name'] for t in spec['tests']], ['new'])
        self.assertEqual([(p['block_id'], p['severity']) for p in problems], [('old', 'warning')])  # the command line still runs

    def test_the_simulation_tab_runs_a_world_or_one_test(self):
        tests = (case_xml('t1', 'one', checks=check_xml('reaches', 'c1', 'ANY'))
                 + case_xml('t2', 'broken', start='nope', checks=check_xml('reaches', 'c2', 'ANY')))
        xml = suite_of(world_xml(course(GOAL), tests=tests), run=())  # whether the suite runs them or not
        result = json.loads(browser.simulation_test(xml, 'w'))
        self.assertEqual([t['name'] for t in result['tests']], ['one'])  # a test with errors is left out
        self.assertEqual([p['block_id'] for p in result['problems'] if p['severity'] == 'error'], ['t2'])
        self.assertEqual([t['name'] for t in json.loads(browser.simulation_test(xml, 't1'))['tests']], ['one'])
        self.assertEqual(json.loads(browser.simulation_test(xml, 'nope'))['tests'], [])

    def test_behaviour_checks(self):
        def block(kind, block_id, **fields):
            value = fields.pop('value', None)
            inner = ''.join('<field name="%s">%s</field>' % (k, v) for k, v in fields.items())
            if value is not None:
                inner += '<value name="VALUE"><block type="math_number" id="%sn"><field name="NUM">%d</field></block></value>' % (block_id, value)
            return '<block type="nepoTest_check_%s" id="%s">%s</block>' % (kind, block_id, inner)

        rules = block('whenever', 'c0', WHEN='obstacle_ahead', DOES='stands_still', AFTER='200')
        checks = (block('does', 'c1', AFTER='100', DOES='turns_left')
                  + block('whenever', 'c2', WHEN='left_light_below', PERCENT='30', DOES='left_led_on', AFTER='0')
                  + block('after', 'c3', WITHIN='500', EVENT='clap', DOES='drives_forward')
                  + block('variable', 'c4', VAR='claps', OP='GTE', value=2))
        setup = '<block type="nepoTest_given_clap" id="cl"><field name="AT">300</field></block>'
        spec, problems = translate(suite_of(world_xml(course(GOAL), rules, case_xml('t1', 'reacts', setup=setup, checks=checks))))
        self.assertEqual(problems, [])
        self.assertEqual(spec['tests'][0]['simulation']['checks'], [
            {'check': 'whenever', 'block_id': 'c0', 'rule': True, 'does': 'stands_still', 'after_ms': 200, 'when': 'obstacle_ahead'},
            {'check': 'does', 'block_id': 'c1', 'does': 'turns_left', 'after_ms': 100},
            {'check': 'whenever', 'block_id': 'c2', 'does': 'left_led_on', 'after_ms': 0, 'when': 'left_light_below', 'percent': 30},
            {'check': 'after', 'block_id': 'c3', 'does': 'drives_forward', 'event': 'clap', 'within_ms': 500},
            {'check': 'variable', 'block_id': 'c4', 'variable': 'claps', 'op': 'GTE', 'value': 2}])
        self.assertEqual(validate_spec(spec), [])
        try:
            import jsonschema
        except ImportError:
            jsonschema = None
        if jsonschema:
            with open(os.path.join(os.path.dirname(HERE), 'schema', 'nepo-tests.schema.json'), encoding='utf-8') as f:
                jsonschema.validate(dict(spec, version=1, program='p.xml'), json.load(f))

        no_clap = case_xml('t2', 'no clap', checks=block('after', 'c5', WITHIN='500', EVENT='clap', DOES='drives_forward'))
        bad = case_xml('t3', 'bad', checks=block('does', 'c6', AFTER='100', DOES='flies') + block('whenever', 'c7', WHEN='left_light_above', PERCENT='120', DOES='silent', AFTER='0')
                       + block('variable', 'c8', VAR='claps', OP='LT') + block('after', 'c9', WITHIN='0', EVENT='line_start', DOES='silent'))
        _, problems = translate(suite_of(world_xml(course(GOAL), tests=no_clap + bad)))
        self.assertEqual([(p['block_id'], p['severity']) for p in problems],
                         [('c5', 'warning'), ('c6', 'error'), ('c7', 'error'), ('c8', 'error'), ('c9', 'error')])
        self.assertIn('has no clap in its set-up', problems[0]['message'])

        def sim_problems(*checks):
            return validate_spec({'format': 'nepotest', 'tests': [{'name': 'x', 'max_time_ms': 1000, 'simulation': {
                'world': SIM.default_world(), 'start': 'A', 'checks': list(checks)}}]})
        self.assertEqual(sim_problems({'check': 'does', 'does': 'stands_still'}, {'check': 'variable', 'variable': 'n', 'value': [1, 2]}), [])
        found = sim_problems({'check': 'whenever', 'when': 'line', 'does': 'drives_forward', 'after_ms': -1},
                             {'check': 'whenever', 'when': 'right_light_below', 'does': 'silent'},
                             {'check': 'after', 'event': 'clap', 'does': 'silent'},
                             {'check': 'variable', 'variable': 'n', 'op': 'GT', 'value': True})
        self.assertEqual(len(found), 4, found)
        self.assertTrue(all(any(word in p for p in found) for word in ('after_ms', 'percent', 'within_ms', 'only numbers')), found)

    def test_a_run_of_tenths_of_a_second(self):
        def length(seconds):
            case = case_xml('t1', 'short', checks=check_xml('reaches', 'c1', 'ANY')).replace('<field name="SECONDS">5</field>', '<field name="SECONDS">%s</field>' % seconds)
            spec, problems = translate(suite_of(world_xml(course(GOAL), tests=case)))
            return spec['tests'][0]['max_time_ms'], messages(problems, 'error')
        self.assertEqual(length('0.3'), (300, []))
        self.assertEqual(length('2,5'), (2500, []))
        self.assertEqual(length('0'), (0, ['a test runs for at least 0.1 s']))
        self.assertEqual(length('soon')[1], ["the time must be a number of seconds, not 'soon'"])

    def test_skip_and_rules(self):
        skipped = {'name': 'x', 'skip': True, 'expect': {'status': 'finished'}}
        report, coverage = run_test(None, skipped)
        self.assertEqual((report['outcome'], coverage), ('skipped', None))
        spec = {'format': 'nepotest', 'tests': [{'name': 'x', 'max_time_ms': 1000, 'simulation': {
            'world': SIM.default_world(), 'start': 'A', 'checks': [{'check': 'path', 'rule': True}]}}]}
        self.assertTrue(any("can't be a rule" in p for p in validate_spec(spec)))
        spec['tests'][0]['call'] = 'f'
        self.assertTrue(any('always runs the whole program' in p for p in validate_spec(spec)))


class ExampleSuiteTest(unittest.TestCase):
    def test_the_json_suite(self):
        spec = load_spec(os.path.join(EXAMPLES, 'line_follower.tests.json'))
        subject = subject_for(spec)
        self.assertEqual(validate_spec(spec, subject), [])
        results = run_spec(spec, subject)
        self.assertEqual([t['outcome'] for t in results['tests']], ['skipped', 'skipped', 'passed'])  # simulation tests: in the Lab
        self.assertEqual(results['summary'], {'passed': 1, 'failed': 0, 'error': 0, 'skipped': 2})
        self.assertIn("run on the Lab's simulator", results['tests'][0]['message'])

    def test_the_suite_saved_in_the_program(self):
        spec, problems = example_tests()
        self.assertEqual(problems, [])
        self.assertEqual(validate_spec(spec), [])
        results = run_spec(spec, follower())
        self.assertEqual([(t['name'], t['outcome']) for t in results['tests']],
                         [('follows the track to the finish', 'skipped'), ('from halfway, it reaches the finish too', 'skipped'),
                          ('stops at the wall (no simulation)', 'passed')])


if __name__ == '__main__':
    unittest.main()
