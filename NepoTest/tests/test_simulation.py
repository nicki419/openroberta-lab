"""Simulation tests (nepotest.simulation): the simulation test block and its data, the example suite (which run_spec skips:
simulation tests run on the Lab's simulator, in the Tests tab), and the copy of the Lab's simulator that NepoTest no longer
uses (geometry, the floor picture and how the sensors read it, the infrared rays, the robot's speed, kinematics and
bumping, how a run ends: goal, fail area, recorded path).
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

from nepotest import TestSubject, load_spec, run_spec, subject_for, validate_spec
from nepotest import simulation as SIM
from nepotest.blocks import split_program, translate, translate_one
from nepotest.engine import values as V

HERE = os.path.dirname(os.path.abspath(__file__))
EXAMPLES = os.path.join(os.path.dirname(HERE), 'examples')
BUNDLE = os.path.join(EXAMPLES, 'line_follower.bundle.json')
C = V.CONSTANTS

LINE = {'id': 'l', 'kind': 'line', 'points': [[10, 20], [110, 20]], 'smooth': False}


def follower():
    return TestSubject.from_bundle(BUNDLE)


def white_world(*items, **start):
    """a world on the simulator's white background, which this module can draw itself"""
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
        self.assertEqual(world['background'], 'drawBackground')
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
        problems = SIM.start_problems(white_world(goal))
        self.assertEqual([p[0] for p in problems], ['g'])
        self.assertIn('goal area', problems[0][1])
        self.assertEqual([p[0] for p in SIM.start_problems(white_world(x=-5))], [None])  # off the floor


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
        test = sim_test(oval_world())
        self.assertEqual(validate_spec({'format': 'nepotest', 'tests': [test]}), [])  # no "expect" needed
        test['world'] = [{'event': 'obstacle', 'port': 'FRONT', 'from': 0}]
        problems = validate_spec({'format': 'nepotest', 'tests': [test]})
        self.assertTrue(any('only takes clap, key;' in p for p in problems), problems)
        test['world'] = [{'event': 'remote', 'code': 1, 'at': 0}]  # the Lab's simulator has no IR remote control
        self.assertTrue(validate_spec({'format': 'nepotest', 'tests': [test]}))
        bad = sim_test(white_world({'kind': 'rect', 'role': 'lava', 'x': 0, 'y': 0, 'w': 1, 'h': 1}))
        self.assertTrue(any('"role" must be one of' in p for p in validate_spec({'format': 'nepotest', 'tests': [bad]})))
        image = sim_test(dict(oval_world(), background='simpleBackgroundEdison'))
        self.assertEqual(validate_spec({'format': 'nepotest', 'tests': [image]}), [])  # the simulator draws the floor


def suite_xml(data, extra='', name='drive', run=''):
    data_el = '<data>%s</data>' % escape(json.dumps(data)) if data is not None else ''
    return ('<block_set xmlns="http://de.fhg.iais.roberta.blockly" robottype="edison">'
            '<instance x="0" y="0"><block type="nepoTest_suite" id="s"/><block type="nepoTest_run" id="r"><field name="NAME">%s</field></block></instance>'
            '<instance x="0" y="100"><block type="nepoTest_simtest" id="t"><field name="NAME">%s</field><field name="SECONDS">12</field>%s%s%s</block></instance>'
            '</block_set>') % (name, name, data_el, extra, run)


def v2(world, **more):
    return dict({'version': 2, 'world': world}, **more)


class SimulationBlockTest(unittest.TestCase):
    def test_translation(self):
        world = oval_world({'id': 'g', 'kind': 'rect', 'role': 'goal', 'x': 64, 'y': 12, 'w': 12, 'h': 8})
        floor = {'w': 1, 'h': 1, 'sum': 'eJxjYAAAAAIAAQ==', 'key': 'k'}  # stored until 2026-10-22: ignored
        data = v2(world, tolerance_cm=3, floor=floor, reference={'path': [[60, 69.3, 0]], 'time_ms': 10}, view={'x': 0, 'y': 0, 'scale': 4})
        given = '<statement name="GIVEN"><block type="nepoTest_given_clap" id="c"><field name="AT">500</field></block></statement>'
        spec, problems = translate(suite_xml(data, given))
        self.assertEqual(problems, [])
        self.assertEqual(spec['tests'], [{'name': 'drive', 'origin': 'blocks', 'block_id': 't', 'world': [{'event': 'clap', 'at': 500}],
                                          'max_time_ms': 12000, 'simulation': {'world': world, 'tolerance_cm': 3,
                                                                               'reference': {'path': [[60, 69.3, 0]]}}}])

    def test_a_function_runs_instead_of_the_program(self):
        run = ('<statement name="RUN"><block type="nepoTest_when_call" id="w"><mutation name="toTheWall"/>'
               '<field name="FUNCTION">toTheWall</field></block></statement>')
        spec, problems = translate(suite_xml(v2(oval_world()), run=run))
        self.assertEqual([p for p in problems if p['severity'] == 'error'], [])
        self.assertEqual((spec['tests'][0]['call'], spec['tests'][0]['args']), ('toTheWall', []))

    def test_old_and_missing_data(self):
        spec, _ = translate(suite_xml({'version': 1, 'world': {'start': {'x': 1, 'y': 2, 'heading': 0}, 'items': [
            {'id': 'e', 'kind': 'ellipse', 'role': 'fail', 'x': 30, 'y': 30, 'w': 4, 'h': 4}]}}))
        self.assertEqual(spec['tests'][0]['simulation']['world']['items'], [{'id': 'e', 'role': 'fail', 'kind': 'circle', 'x': 30, 'y': 30, 'r': 2.0}])
        spec, problems = translate(suite_xml(None))  # a new block: the simulator's default world
        self.assertEqual(spec['tests'][0]['simulation']['world'], SIM.default_world())
        self.assertEqual([p['message'] for p in problems if p['severity'] == 'error'], [])

    def test_problems(self):
        on_goal = oval_world({'id': 'g', 'kind': 'rect', 'role': 'goal', 'x': 58, 'y': 67, 'w': 4, 'h': 4})
        _, problems = translate(suite_xml(v2(on_goal)))
        self.assertIn('test "drive": the robot starts touching a goal area: move it or the goal area', [p['message'] for p in problems])
        obstacle = '<statement name="GIVEN"><block type="nepoTest_given_obstacle" id="o"><field name="FROM">0</field><field name="DURATION">0</field></block></statement>'
        _, problems = translate(suite_xml(v2(oval_world()), obstacle))
        self.assertEqual([(p['block_id'], p['severity']) for p in problems if 'draw obstacles' in p['message']], [('o', 'error')])
        _, problems = translate(suite_xml(v2(oval_world())))
        self.assertEqual([p['severity'] for p in problems if 'checks nothing' in p['message']], ['warning'])
        broken = suite_xml(None).replace('<field name="SECONDS">12</field>', '<field name="SECONDS">12</field><data>{not json</data>')
        _, problems = translate(broken)
        self.assertTrue(any('cannot be read' in p['message'] for p in problems), problems)
        remote = '<statement name="GIVEN"><block type="nepoTest_given_remote" id="rc"><field name="AT">0</field><field name="CODE">1</field></block></statement>'
        _, problems = translate(suite_xml(v2(oval_world()), remote))
        self.assertEqual([(p['block_id'], p['severity']) for p in problems if 'no IR remote control' in p['message']], [('rc', 'error')])

    def test_one_test_on_its_own(self):
        xml = suite_xml(v2(oval_world())).replace('<field name="NAME">drive</field></block></instance>', '<field name="NAME">other</field></block></instance>', 1)
        test, problems = translate_one(xml, 't')
        self.assertEqual(test['name'], 'drive')  # not under the start block, but it can run on its own
        self.assertEqual(translate_one(xml, 'nope')[0], None)

    def test_names_are_shared_with_bdd_tests(self):
        xml = suite_xml(v2(oval_world())).replace(
            '</block_set>', '<instance x="0" y="0"><block type="nepoTest_test" id="b"><field name="NAME">drive</field></block></instance></block_set>')
        _, problems = translate(xml)
        self.assertIn('there are two tests named "drive"', [p['message'] for p in problems])


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
        results = run_spec(spec, follower())
        self.assertEqual([(t['name'], t['outcome']) for t in results['tests']],
                         [('follows the track to the finish', 'skipped'), ('stops at the wall', 'skipped'),
                          ('stops at the wall (no simulation)', 'passed')])

    def test_the_copy_of_the_simulator_still_runs_the_example(self):
        """the copy (no longer used) on the example's worlds, with the path recorded on the Lab's simulator"""
        spec, _ = example_tests()
        subject = follower()
        for test in spec['tests'][:2]:
            test['simulation']['floor'] = track_floor()
            report, coverage = SIM.run_simulation_test(subject, test)
            self.assertEqual(report['outcome'], 'passed', (test['name'], report['failures']))
        self.assertEqual(report['simulation']['result'], 'returned')


if __name__ == '__main__':
    unittest.main()
