"""Simulation tests (nepotest.simulation): the geometry of a drawn world, what the robot's sensors see in it, how a run
ends (goal, fail area, obstacle, recorded path), the simulation test block, and the example suite.
Offline: uses examples/line_follower.bundle.json (converted by the Lab).

Run from NepoTest/:  python -m unittest tests.test_simulation
"""

import json
import math
import os
import unittest
from xml.sax.saxutils import escape

from nepotest import TestSubject, load_spec, run_spec, subject_for, validate_spec
from nepotest import simulation as SIM
from nepotest.blocks import split_program, translate, translate_one
from nepotest.engine import values as V

HERE = os.path.dirname(os.path.abspath(__file__))
EXAMPLES = os.path.join(os.path.dirname(HERE), 'examples')
BUNDLE = os.path.join(EXAMPLES, 'line_follower.bundle.json')

LINE = {'id': 'l', 'kind': 'line', 'points': [[0, 0], [100, 0]], 'smooth': False}


def follower():
    return TestSubject.from_bundle(BUNDLE)


def oval_world(**extra):
    cx, cy, rx, ry = 70, 45, 45, 25
    points = [[round(cx + rx * math.cos(2 * math.pi * k / 8), 1), round(cy + ry * math.sin(2 * math.pi * k / 8), 1)] for k in range(8)]
    world = {'start': {'x': 60, 'y': 69.3, 'heading': 0},
             'items': [{'id': 'track', 'kind': 'line', 'points': points, 'smooth': True, 'closed': True}]}
    world['items'] += extra.get('items', [])
    return world


def sim_test(world, **more):
    test = {'name': 'sim', 'simulation': {'world': world}, 'max_time_ms': 30000}
    test.update(more)
    return test


class GeometryTest(unittest.TestCase):
    def test_robot_outline(self):
        front_left, front_right, back_right, back_left = SIM.footprint((10, 20, 0))
        self.assertAlmostEqual(front_left[0], 10 + SIM.FRONT_CM)
        self.assertAlmostEqual(front_left[1], 20 - SIM.WIDTH_CM / 2)  # the robot's left is up on the screen
        self.assertAlmostEqual(back_right[0], 10 - SIM.BACK_CM)
        self.assertAlmostEqual(back_right[1], 20 + SIM.WIDTH_CM / 2)
        # heading 90: facing up (counterclockwise as seen from above)
        x, y = SIM.to_world((0, 0, 90), 5, 0)
        self.assertAlmostEqual(x, 0)
        self.assertAlmostEqual(y, -5)

    def test_curves_pass_through_their_points(self):
        points = [[0, 0], [10, 10], [20, 0], [30, 10]]
        segments = SIM.bezier_segments(points, smooth=True, closed=False)
        self.assertEqual([s[0] for s in segments] + [segments[-1][3]], [tuple(p) for p in points])
        closed = SIM.bezier_segments(points, smooth=True, closed=True)
        self.assertEqual(len(closed), 4)
        self.assertEqual(closed[-1][3], (0.0, 0.0))
        straight = SIM.bezier_segments(points, smooth=False, closed=False)
        self.assertEqual(straight[0], ((0.0, 0.0), (0.0, 0.0), (10.0, 10.0), (10.0, 10.0)))

    def test_rotated_shapes(self):
        poly = SIM.shape_polygon({'kind': 'rect', 'x': 0, 'y': 0, 'w': 10, 'h': 2, 'rot': 90})
        xs = [p[0] for p in poly]
        ys = [p[1] for p in poly]
        self.assertAlmostEqual(max(xs) - min(xs), 2)
        self.assertAlmostEqual(max(ys) - min(ys), 10)

    def test_polygons_touch(self):
        a = [(0, 0), (10, 0), (10, 10), (0, 10)]
        self.assertTrue(SIM.polygons_touch(a, [(9, 9), (20, 9), (20, 20), (9, 20)]))
        self.assertTrue(SIM.polygons_touch(a, [(2, 2), (3, 2), (3, 3), (2, 3)]))  # inside
        self.assertFalse(SIM.polygons_touch(a, [(11, 0), (20, 0), (20, 10), (11, 10)]))

    def test_corridor(self):
        corridor = SIM.Corridor([[0, 0, 0], [10, 0, 0], [20, 0, 0]], tolerance=2)
        self.assertTrue(corridor.contains(15, SIM.WIDTH_CM / 2 + 1.9))
        self.assertFalse(corridor.contains(15, SIM.WIDTH_CM / 2 + 2.1))
        self.assertTrue(corridor.contains(-SIM.BACK_CM - 1, 0))
        self.assertIsNone(corridor.outside(SIM.check_points(SIM.footprint((12, 1, 0)))))
        self.assertIsNotNone(corridor.outside(SIM.check_points(SIM.footprint((12, 5, 0)))))


class SensingTest(unittest.TestCase):
    def test_a_line_has_a_black_core_and_a_white_rim(self):
        world = SIM.SimWorld({'items': [LINE]})
        self.assertEqual(world.reflectance(50, 0), SIM.BLACK)
        self.assertEqual(world.reflectance(50, SIM.LINE_WIDTH_CM / 2 + 0.2), SIM.WHITE)
        self.assertEqual(world.reflectance(50, 5), SIM.BACKGROUND)

    def test_lines_lie_on_floor_shapes(self):
        black = {'id': 'b', 'kind': 'rect', 'role': 'black', 'x': 50, 'y': 0, 'w': 20, 'h': 20}
        world = SIM.SimWorld({'items': [black, LINE]})
        self.assertEqual(world.reflectance(50, 1.0), SIM.WHITE)  # the rim of the line
        self.assertEqual(world.reflectance(50, 5), SIM.BLACK)  # the black area
        self.assertEqual(world.reflectance(65, 0), SIM.BLACK)

    def test_the_line_tracker_sees_a_mix_at_an_edge(self):
        world = SIM.SimWorld({'items': [LINE]})
        ahead = SIM.LINE_SENSOR[0]
        on = world.tracker_level((50 - ahead, 0, 0))
        edge = world.tracker_level((50 - ahead, SIM.LINE_WIDTH_CM / 2, 0))
        off = world.tracker_level((50 - ahead, 5, 0))
        self.assertEqual(on, SIM.BLACK)
        self.assertTrue(on < edge < off, (on, edge, off))

    def test_obstacle_detection(self):
        wall = {'id': 'w', 'kind': 'rect', 'role': 'obstacle', 'x': 20, 'y': 0, 'w': 2, 'h': 40}
        world = SIM.SimWorld({'items': [wall]})
        c = V.CONSTANTS
        self.assertEqual(world.obstacle_bits((5, 0, 0)), c['OBSTACLE_DETECTED'] | c['OBSTACLE_AHEAD'])
        self.assertEqual(world.obstacle_bits((0, 0, 0)), 0)  # 19 cm away: out of range
        box = {'id': 'b', 'kind': 'rect', 'role': 'obstacle', 'x': 12, 'y': -6, 'w': 2, 'h': 2}  # ahead, to the left (up)
        self.assertEqual(SIM.SimWorld({'items': [box]}).obstacle_bits((0, 0, 0)), c['OBSTACLE_DETECTED'] | c['OBSTACLE_LEFT'])

    def test_start_problems(self):
        goal = {'id': 'g', 'kind': 'rect', 'role': 'goal', 'x': 0, 'y': 0, 'w': 4, 'h': 4}
        problems = SIM.start_problems({'start': {'x': 0, 'y': 0, 'heading': 0}, 'items': [goal]})
        self.assertEqual([p[0] for p in problems], ['g'])
        self.assertIn('goal area', problems[0][1])


class RunTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.subject = follower()

    def run_sim(self, test, record=False):
        return SIM.run_simulation_test(self.subject, test, record=record)[0]

    def test_the_line_follower_reaches_the_goal(self):
        goal = {'id': 'g', 'kind': 'rect', 'role': 'goal', 'x': 70, 'y': 16, 'w': 12, 'h': 8}
        report = self.run_sim(sim_test(oval_world(items=[goal])))
        self.assertEqual(report['outcome'], 'passed', report['failures'])
        sim = report['simulation']
        self.assertEqual((sim['result'], sim['item']), ('goal', 'g'))
        self.assertTrue(10000 < sim['t'] < 25000, sim['t'])
        self.assertEqual(sim['path'][0][1:], [60.0, 69.3, 0.0])
        self.assertGreater(len(sim['path']), 50)
        self.assertEqual(report['kind'], 'simulation')

    def test_without_a_goal_the_test_passes_when_time_is_up(self):
        report = self.run_sim(sim_test(oval_world(), max_time_ms=3000))
        self.assertEqual(report['outcome'], 'passed')
        self.assertEqual(report['simulation']['result'], 'time_limit')

    def test_a_goal_that_is_never_reached(self):
        far = {'id': 'g', 'kind': 'rect', 'role': 'goal', 'x': 300, 'y': 300, 'w': 5, 'h': 5}
        report = self.run_sim(sim_test(oval_world(items=[far]), max_time_ms=3000))
        self.assertEqual(report['outcome'], 'failed')
        self.assertEqual(report['failures'][0]['message'], 'the robot did not reach a goal area within 3 s')

    def test_a_fail_area_ends_the_run(self):
        fail = {'id': 'f', 'kind': 'ellipse', 'role': 'fail', 'x': 88, 'y': 69, 'w': 6, 'h': 6}  # on the track
        report = self.run_sim(sim_test(oval_world(items=[fail])))
        self.assertEqual(report['outcome'], 'failed')
        self.assertEqual((report['simulation']['result'], report['simulation']['item']), ('fail_area', 'f'))
        self.assertTrue(report['failures'][0]['message'].startswith('the robot touched a fail area after'))
        self.assertTrue(report['failures'][0]['described'])

    def test_the_obstacle_detection_keeps_the_robot_off_the_wall(self):
        wall = {'id': 'w', 'kind': 'rect', 'role': 'obstacle', 'x': 50, 'y': 20, 'w': 4, 'h': 30}
        world = {'start': {'x': 10, 'y': 20, 'heading': 0}, 'items': [wall]}
        report = self.run_sim(sim_test(world, call='toTheWall', args=[], max_time_ms=10000))
        self.assertEqual(report['outcome'], 'passed', report['failures'])
        self.assertEqual(report['simulation']['result'], 'returned')
        end = report['simulation']['path'][-1]
        self.assertTrue(48 - SIM.FRONT_CM - 11 < end[1] < 48 - SIM.FRONT_CM, end)  # stopped about 10 cm before the wall
        # a detection range of 0: the robot doesn't see the wall and hits it
        world['settings'] = {'obstacle_range_cm': 0}
        report = self.run_sim(sim_test(world, call='toTheWall', args=[], max_time_ms=10000))
        self.assertEqual((report['outcome'], report['simulation']['result'], report['simulation']['item']), ('failed', 'crash', 'w'))

    def test_leaving_the_recorded_path_fails(self):
        world = oval_world()
        recorded = self.run_sim(sim_test(world, max_time_ms=5000), record=True)
        path = [p[1:] for p in recorded['simulation']['path']]
        test = sim_test(world, max_time_ms=5000)
        test['simulation'].update(reference={'path': path}, tolerance_cm=1)
        self.assertEqual(self.run_sim(test)['outcome'], 'passed')
        shifted = [[x, y - 6, h] for x, y, h in path]  # the same path, 6 cm higher up
        test['simulation']['reference'] = {'path': shifted}
        report = self.run_sim(test)
        self.assertEqual((report['outcome'], report['simulation']['result']), ('failed', 'deviation'))
        self.assertIsNotNone(report['simulation']['point'])
        self.assertIn('left the recorded path (by more than 1 cm)', report['failures'][0]['message'])
        self.assertEqual(self.run_sim(test, record=True)['outcome'], 'passed')  # recording ignores the old path

    def test_the_forward_light_sensors_see_the_room(self):
        robot = SIM.SimRobot(SIM.SimWorld({'items': [LINE], 'settings': {'ambient_light': 30}}))
        self.assertEqual((robot.ed_ReadLeftLightLevel(), robot.ed_ReadRightLightLevel()), (300, 300))

    def test_spec_validation(self):
        test = sim_test(oval_world())
        self.assertEqual(validate_spec({'format': 'nepotest', 'tests': [test]}), [])  # no "expect" needed
        test['world'] = [{'event': 'obstacle', 'port': 'FRONT', 'from': 0}]
        problems = validate_spec({'format': 'nepotest', 'tests': [test]})
        self.assertTrue(any('only takes clap, key, remote, ir_message' in p for p in problems), problems)
        bad = sim_test({'start': {'x': 0, 'y': 0, 'heading': 0}, 'items': [{'kind': 'rect', 'role': 'lava', 'x': 0, 'y': 0, 'w': 1, 'h': 1}]})
        self.assertTrue(any('"role" must be one of' in p for p in validate_spec({'format': 'nepotest', 'tests': [bad]})))


def suite_xml(data, extra='', name='drive', run=''):
    data_el = '<data>%s</data>' % escape(json.dumps(data)) if data is not None else ''
    return ('<block_set xmlns="http://de.fhg.iais.roberta.blockly" robottype="edison">'
            '<instance x="0" y="0"><block type="nepoTest_suite" id="s"/><block type="nepoTest_run" id="r"><field name="NAME">%s</field></block></instance>'
            '<instance x="0" y="100"><block type="nepoTest_simtest" id="t"><field name="NAME">%s</field><field name="SECONDS">12</field>%s%s%s</block></instance>'
            '</block_set>') % (name, name, data_el, extra, run)


class SimulationBlockTest(unittest.TestCase):
    def test_translation(self):
        world = oval_world(items=[{'id': 'g', 'kind': 'rect', 'role': 'goal', 'x': 70, 'y': 16, 'w': 12, 'h': 8}])
        data = {'version': 1, 'world': world, 'tolerance_cm': 3, 'reference': {'path': [[60, 69.3, 0]], 'time_ms': 10},
                'view': {'x': 0, 'y': 0, 'scale': 4}}
        given = '<statement name="GIVEN"><block type="nepoTest_given_clap" id="c"><field name="AT">500</field></block></statement>'
        spec, problems = translate(suite_xml(data, given))
        self.assertEqual(problems, [])
        self.assertEqual(spec['tests'], [{'name': 'drive', 'origin': 'blocks', 'block_id': 't', 'world': [{'event': 'clap', 'at': 500}],
                                          'max_time_ms': 12000, 'simulation': {'world': world, 'tolerance_cm': 3,
                                                                               'reference': {'path': [[60, 69.3, 0]]}}}])

    def test_a_function_runs_instead_of_the_program(self):
        run = ('<statement name="RUN"><block type="nepoTest_when_call" id="w"><mutation name="toTheWall"/>'
               '<field name="FUNCTION">toTheWall</field></block></statement>')
        spec, problems = translate(suite_xml({'world': oval_world(items=[LINE])}, run=run))
        self.assertEqual([p for p in problems if p['severity'] == 'error'], [])
        self.assertEqual((spec['tests'][0]['call'], spec['tests'][0]['args']), ('toTheWall', []))

    def test_problems(self):
        on_goal = oval_world(items=[{'id': 'g', 'kind': 'rect', 'role': 'goal', 'x': 60, 'y': 69, 'w': 4, 'h': 4}])
        _, problems = translate(suite_xml({'world': on_goal}))
        self.assertIn('test "drive": the robot starts touching a goal area: move it or the goal area', [p['message'] for p in problems])
        obstacle = '<statement name="GIVEN"><block type="nepoTest_given_obstacle" id="o"><field name="FROM">0</field><field name="DURATION">0</field></block></statement>'
        _, problems = translate(suite_xml({'world': oval_world()}, obstacle))
        self.assertEqual([(p['block_id'], p['severity']) for p in problems if 'draw obstacles' in p['message']], [('o', 'error')])
        _, problems = translate(suite_xml({'world': oval_world()}))
        self.assertEqual([p['severity'] for p in problems if 'checks nothing' in p['message']], ['warning'])
        _, problems = translate(suite_xml(None))  # a new block without data: an empty world
        self.assertEqual([p['severity'] for p in problems], ['warning'])
        broken = suite_xml(None).replace('</field><field name="SECONDS">', '</field><data>{not json</data><field name="SECONDS">')
        _, problems = translate(broken.replace('<data>{not json</data><field name="SECONDS">12</field>', '<field name="SECONDS">12</field><data>{not json</data>'))
        self.assertTrue(any('cannot be read' in p['message'] for p in problems), problems)

    def test_one_test_on_its_own(self):
        xml = suite_xml({'world': oval_world()}).replace('<field name="NAME">drive</field></block></instance>', '<field name="NAME">other</field></block></instance>', 1)
        test, problems = translate_one(xml, 't')
        self.assertEqual(test['name'], 'drive')  # not under the start block, but it can run on its own
        self.assertEqual(translate_one(xml, 'nope')[0], None)

    def test_names_are_shared_with_bdd_tests(self):
        xml = suite_xml({'world': oval_world()}).replace(
            '</block_set>', '<instance x="0" y="0"><block type="nepoTest_test" id="b"><field name="NAME">drive</field></block></instance></block_set>')
        _, problems = translate(xml)
        self.assertIn('there are two tests named "drive"', [p['message'] for p in problems])


class ExampleSuiteTest(unittest.TestCase):
    def test_the_json_suite(self):
        spec = load_spec(os.path.join(EXAMPLES, 'line_follower.tests.json'))
        subject = subject_for(spec)
        self.assertEqual(validate_spec(spec, subject), [])
        results = run_spec(spec, subject)
        self.assertEqual([t['outcome'] for t in results['tests']], ['passed'] * 3)

    def test_the_suite_saved_in_the_program(self):
        with open(os.path.join(EXAMPLES, 'line_follower_with_tests.xml'), encoding='utf-8') as f:
            program_xml, tests_xml = split_program(f.read())
        spec, problems = translate(tests_xml, follower().nepo)
        self.assertEqual(problems, [])
        results = run_spec(spec, follower())
        self.assertEqual([(t['name'], t['outcome']) for t in results['tests']],
                         [('follows the oval to the finish', 'passed'), ('stops at the wall', 'passed'),
                          ('stops at the wall (no simulation)', 'passed')])
        self.assertEqual(results['coverage']['blocks_covered'], results['coverage']['blocks_total'])


if __name__ == '__main__':
    unittest.main()
