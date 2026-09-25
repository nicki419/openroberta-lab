"""Self-tests of the engine: they pin the EdPy semantics the mock implements (see docs/ai/edpy-test-engine.md).

Run from NepoTest/:  python -m unittest discover -s tests -t .
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # NepoTest/

from nepotest.engine import (EdProgram, EdPyCompatibilityError, EdPyRuntimeError, Robot, StepLimitExceeded,  # noqa: E402
                    UnsupportedInMock)

SETUP = '''import Ed

Ed.EdisonVersion = Ed.V2
Ed.DistanceUnits = Ed.CM
Ed.Tempo = Ed.TEMPO_SLOW
obstacleDetectionOn = False
Ed.LineTrackerLed(Ed.ON)
Ed.ReadClapSensor()
Ed.ReadLineState()
Ed.TimeWait(250, Ed.TIME_MILLISECONDS)

'''


def run(body, robot=None, **kwargs):
    return EdProgram(SETUP + body).run(robot or Robot(), **kwargs)


class Arithmetic(unittest.TestCase):
    def test_division_is_floor_division(self):
        r = run('___a = 7\n___b = -7\n___c = ___a / 2\n___d = ___b / 2\n___e = ___b % 2\n')
        self.assertEqual((r.vars['c'], r.vars['d'], r.vars['e']), (3, -4, 1))

    def test_division_by_zero_is_reported_with_its_line(self):
        with self.assertRaises(EdPyRuntimeError) as ctx:
            run('___a = 0\n___b = 5 / ___a\n')
        self.assertIn('division by zero', str(ctx.exception))
        self.assertEqual(ctx.exception.source_line, '___b = 5 / ___a')

    def test_overflow_raises_or_wraps(self):
        body = '___a = 32767\n___a += 1\n'
        with self.assertRaises(EdPyRuntimeError):
            run(body)
        self.assertEqual(run(body, overflow='wrap').vars['a'], -32768)

    def test_constant_folding_like_edpy(self):
        # EdPy folds constants before its range check: 8000000/440 is fine, 8000000/244 = 32786 isn't
        run('Ed.PlayTone(8000000/440, 500)\n')
        with self.assertRaises(EdPyCompatibilityError) as ctx:
            run('Ed.PlayTone(8000000/244, 500)\n')
        self.assertIn('constant 32786 is out of range', str(ctx.exception))
        with self.assertRaises(EdPyCompatibilityError):
            run('___f = 440\nEd.PlayTone(8000000/___f, 500)\n')  # 8000000 can't be folded here
        with self.assertRaises(EdPyCompatibilityError):
            run('___a = -32768\n')

    def test_and_or_are_generated_as_eager_bitwise_operators(self):
        body = ('___n = 0\n'
                'def ____count():\n    global ___n\n    ___n = ___n + 1\n    return True\n'
                '___r = ((True) | (____count()))\n')
        r = run(body)
        self.assertEqual(r.vars['n'], 1)  # evaluated although the left side is already True
        self.assertIs(r.vars['r'], True)


class StaticGuard(unittest.TestCase):
    def assertRejected(self, body, fragment):
        with self.assertRaises(EdPyCompatibilityError) as ctx:
            EdProgram(SETUP + body)
        self.assertIn(fragment, str(ctx.exception))

    def test_rejects_what_the_edpy_compiler_rejects(self):
        # each verified with EdPy 1.2.11
        self.assertRejected('___a = 1\n___b = ___a > 0 and ___a < 5\n', "'and'/'or'")
        self.assertRejected('___a = 1\n___b = 2 if ___a else 3\n', 'IfExp')
        self.assertRejected('___a = 1\n___b = 0 < ___a < 5\n', 'COMPARE code too complex')
        self.assertRejected('___a = 0\nwhile ___a < 3:\n    ___a += 1\nelse:\n    ___a = 9\n', 'WHILE code too complex')
        self.assertRejected('print(1)\n', 'Unknown function print')
        self.assertRejected('___a = 1.5\n', 'must be an integer value')
        self.assertRejected('___a = "x"\n', 'String not allowed here')
        self.assertRejected('___a = 2 ** 3\n', 'Pow')
        self.assertRejected('___l = Ed.List(3, [1,2,3])\n___b = 2 in ___l\n', 'In/Is')
        self.assertRejected('import math\n', 'only the Ed module')
        self.assertRejected('Ed.Foo()\n', 'Unknown Ed function')

    def test_problems_are_kept_when_not_strict(self):
        p = EdProgram(SETUP + '___a = 1\n___b = 0 < ___a < 5\n', strict=False)
        self.assertEqual(len(p.problems), 1)


class Sensors(unittest.TestCase):
    def test_clap_is_latched_and_cleared_by_reading(self):
        r = run('___a = Ed.ReadClapSensor()\n___b = Ed.ReadClapSensor()\n', Robot().clap(at=100))
        self.assertEqual((r.vars['a'], r.vars['b']), (4, 0))

    def test_both_keys_pressed_read_as_5(self):
        r = run('___k = Ed.ReadKeypad()\n', Robot().press('triangle', at=10).press('round', at=20))
        self.assertEqual(r.vars['k'], 5)  # neither KEYPAD_TRIANGLE (1) nor KEYPAD_ROUND (4)

    def test_obstacles_are_only_seen_with_the_beam_on(self):
        body = ('___a = Ed.ReadObstacleDetection()\n'
                'Ed.ObstacleDetectionBeam(Ed.ON)\n'
                '___b = Ed.ReadObstacleDetection()\n')
        r = run(body, Robot().obstacle('left', start=0))
        self.assertEqual((r.vars['a'], r.vars['b']), (0, 32))

    def test_light_and_line_are_plain_state(self):
        body = '___l = Ed.ReadLeftLightLevel()\n___s = Ed.ReadLineState()\n___s2 = Ed.ReadLineState()\n'
        r = run(body, Robot().light(left=420).surface('black'))
        self.assertEqual((r.vars['l'], r.vars['s'], r.vars['s2']), (420, 1, 1))


class Time(unittest.TestCase):
    def test_time_wait_has_10_ms_resolution(self):
        robot = Robot(call_cost_ms=0)
        run('Ed.TimeWait(5, Ed.TIME_MILLISECONDS)\nEd.TimeWait(15, Ed.TIME_MILLISECONDS)\n', robot)
        self.assertEqual(robot.now - robot.program_start_ms, 10)

    def test_tone_does_not_block_but_music_end_reports_it(self):
        body = ('Ed.PlayTone(8000, 500)\n___a = Ed.ReadMusicEnd()\n'
                'Ed.TimeWait(600, Ed.TIME_MILLISECONDS)\n___b = Ed.ReadMusicEnd()\n')
        r = run(body)
        self.assertEqual((r.vars['a'], r.vars['b']), (0, 1))

    def test_forever_loop_ends_at_the_time_limit(self):
        r = run('while True:\n    Ed.ReadClapSensor()\n', max_time_ms=1000)
        self.assertEqual(r.status, 'time_limit')
        self.assertEqual(r.time_ms, 1000)

    def test_busy_loop_without_ed_calls_ends_at_the_step_limit(self):
        r = run('while True:\n    pass\n', max_steps=5000)
        self.assertEqual(r.status, 'step_limit')


class Driving(unittest.TestCase):
    def test_drive_forward_blocks_and_moves(self):
        robot = Robot()
        run('Ed.Drive(Ed.FORWARD, Ed.SPEED_5, 25)\n', robot)
        self.assertAlmostEqual(robot.pose[0], 25.0)
        self.assertAlmostEqual(robot.now - robot.program_start_ms, 25 / 12.5 * 1000 + 1)  # SPEED_5 = 12.5 cm/s (assumed)

    def test_spin_right_90_degrees(self):
        robot = Robot()
        run('Ed.Drive(Ed.SPIN_RIGHT, Ed.SPEED_5, 90)\n', robot)
        self.assertAlmostEqual(robot.heading_deg, -90.0, places=6)
        self.assertAlmostEqual(robot.pose[0], 0.0, places=6)

    def test_a_drive_cut_off_by_the_time_limit_is_in_the_trace(self):
        robot = Robot()
        result = run('Ed.Drive(Ed.FORWARD, Ed.SPEED_1, 1000)\n', robot, max_time_ms=2000)  # would take 400 s
        self.assertEqual(result.status, 'time_limit')
        self.assertEqual([c.args for c in robot.calls('Drive')], [(1, 1, 1000)])
        self.assertTrue(robot.moving)

    def test_unlimited_drive_keeps_going_while_time_passes(self):
        robot = Robot()
        run('Ed.Drive(Ed.FORWARD, Ed.SPEED_10, Ed.DISTANCE_UNLIMITED)\nEd.TimeWait(1000, Ed.TIME_MILLISECONDS)\n', robot)
        self.assertTrue(robot.moving)
        self.assertAlmostEqual(robot.pose[0], 25.0 * 1.002)  # 1000 ms wait + 2 x 1 ms call cost, at 25 cm/s


class ListsAndMisc(unittest.TestCase):
    def test_list_index_out_of_range(self):
        with self.assertRaises(EdPyRuntimeError) as ctx:
            run('___l = Ed.List(3, [1,2,3])\n___i = 3\n___x = ___l[___i]\n')
        self.assertIn('out of range', str(ctx.exception))

    def test_list_len_is_the_max_size(self):
        self.assertEqual(run('___l = Ed.List(5, [1,2])\n___n = len(___l)\n').vars['n'], 5)

    def test_setup_variables_can_only_be_set_once(self):
        with self.assertRaises(EdPyCompatibilityError):
            run('Ed.Tempo = Ed.TEMPO_FAST\n')

    def test_function_that_never_returns(self):
        session = EdProgram(SETUP + 'def ____f():\n    while True:\n        pass\n').load()
        with self.assertRaises(StepLimitExceeded):
            session.call('f', max_steps=1000)

    def test_unmodelled_ed_functions_say_so(self):
        with self.assertRaises(UnsupportedInMock):
            run('Ed.ResetDistance()\n')


if __name__ == '__main__':
    unittest.main()
