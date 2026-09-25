"""Unit tests for the example learner program "clap counter".

NEPO source: examples/clap_counter.xml. Generated EdPy (by the Lab's EdisonPythonVisitor, unmodified): tests/clap_counter.edpy.py.

    claps := 0, goal := 3
    while claps < goal: wait until clap; claps += 1
    blink(claps)                                  blink(times): repeat times: LED left on, wait 200, off, wait 200
    drive forward, speed clampSpeed(150), 10 cm   clampSpeed(speed): 100 if > 100, 0 if < 0, else speed
    average(a, b) returns (a + b) / 2             (not called by the program)

Engine-level tests (Ed calls, EdPy names); the NEPO-level versions are in examples/. Run from NepoTest/:
    python -m unittest discover -s tests -t .
"""

import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))  # NepoTest/

from nepotest.engine import EdProgram, EdPyRuntimeError, Robot, edpy_check  # noqa: E402

PROGRAM = os.path.join(HERE, 'clap_counter.edpy.py')  # the EdPy the Lab generates for examples/clap_counter.xml
FORWARD, SPEED_10 = 1, 10


def program():
    return EdProgram.from_file(PROGRAM)


class Level0CompilesForTheRobot(unittest.TestCase):
    """Before any behaviour test: would the robot accept the program at all?"""

    @unittest.skipUnless(edpy_check.configured(), 'set EDPY_HOME and EDPY_PYTHON to run the reference EdPy compiler')
    def test_reference_compiler_accepts_the_program(self):
        result = edpy_check.check_file(PROGRAM)
        self.assertTrue(result.ok, result.messages)

    def test_program_has_the_expected_parts(self):
        p = program()
        self.assertEqual(p.variables, ['claps', 'goal'])
        self.assertEqual(p.functions, {'clampSpeed': ['speed'], 'average': ['a', 'b'], 'blink': ['times']})


class Level1Functions(unittest.TestCase):
    """Learner functions called in isolation; the main program doesn't run."""

    def setUp(self):
        self.session = program().load()

    def test_clamp_speed(self):
        for speed, expected in [(-5, 0), (0, 0), (42, 42), (100, 100), (101, 100), (150, 100)]:
            with self.subTest(speed=speed):
                self.assertEqual(self.session.call('clampSpeed', speed), expected)

    @unittest.expectedFailure
    def test_average_of_4_and_6_is_5(self):
        # Fails, and that's the point: the generator drops the parentheses of the dividend (quirk #14 in
        # edisonv2-nepo-to-edpy.md), so NEPO (a + b) / 2 becomes `a + b / 2`, and average(4, 6) returns 7.
        self.assertEqual(self.session.call('average', 4, 6), 5)

    def test_average_overflows_16_bit(self):
        # 32767 + 2 / 2 = 32768 doesn't fit into EdPy's 16-bit int; the harness reports it instead of guessing
        with self.assertRaises(EdPyRuntimeError) as ctx:
            self.session.call('average', 32767, 2)
        self.assertIn('16-bit overflow', str(ctx.exception))
        self.assertIn('return ___a + ___b / 2', ctx.exception.source_line)

    def test_blink_switches_the_left_led_on_and_off_n_times(self):
        self.session.call('blink', 2)
        timeline = self.session.robot.led_timeline('left')
        self.assertEqual([on for _, on in timeline], [True, False, True, False])
        on_ms = timeline[1][0] - timeline[0][0]
        self.assertAlmostEqual(on_ms, 200, delta=5)  # 200 ms wait plus the mock's per-call cost

    def test_blink_zero_times_does_nothing(self):
        self.session.call('blink', 0)
        self.assertEqual(self.session.robot.led_timeline('left'), [])

    def test_global_variables_start_with_their_declared_values(self):
        self.assertEqual(self.session.vars, {'claps': 0, 'goal': 3})


class Level2Scenarios(unittest.TestCase):
    """The whole program against a scripted world."""

    def test_three_claps_blink_three_times_then_drive_10_cm(self):
        robot = Robot().clap(at=1000).clap(at=2000).clap(at=3000)
        result = program().run(robot, max_time_ms=10000)

        self.assertTrue(result.finished, result)
        self.assertEqual(result.vars['claps'], 3)
        self.assertEqual([on for _, on in robot.led_timeline('left')], [True, False] * 3)
        drives = robot.calls('Drive')
        self.assertEqual([d.args for d in drives], [(FORWARD, SPEED_10, 10)])  # clampSpeed(150) = 100 -> level 10
        self.assertGreater(drives[0].t, 3000)  # only after the third clap
        self.assertAlmostEqual(robot.odometer_cm['left'], 10.0)
        self.assertAlmostEqual(robot.pose[0], 10.0)

    def test_keeps_waiting_with_only_two_claps(self):
        robot = Robot().clap(at=1000).clap(at=2000)
        result = program().run(robot, max_time_ms=10000)

        self.assertEqual(result.status, 'time_limit')  # still waiting for the third clap
        self.assertEqual(result.vars['claps'], 2)
        self.assertEqual(robot.calls('Drive'), [])
        self.assertEqual(robot.led_timeline('left'), [])

    def test_a_clap_at_the_very_start_is_swallowed_by_the_setup_block(self):
        # every generated program starts with Ed.ReadClapSensor() (to discard noise) and waits 250 ms
        robot = Robot().clap(at=0).clap(at=1000).clap(at=2000)
        result = program().run(robot, max_time_ms=10000)
        self.assertEqual(result.vars['claps'], 2)
        self.assertFalse(result.finished)

    def test_two_claps_between_two_reads_count_once(self):
        robot = Robot().clap(at=1000).clap(at=1000).clap(at=2000).clap(at=3000)
        result = program().run(robot, max_time_ms=10000)
        self.assertTrue(result.finished)
        self.assertGreater(robot.calls('Drive')[0].t, 3000)  # the two claps at 1000 ms were one latched event


class Level3GeneratedCases(unittest.TestCase):
    """Generated test cases: properties checked over many inputs (no extra libraries needed)."""

    def test_clamp_speed_properties(self):
        session = program().load()
        for speed in range(-300, 301, 7):
            got = session.call('clampSpeed', speed)
            with self.subTest(speed=speed):
                self.assertTrue(0 <= got <= 100)
                self.assertEqual(session.call('clampSpeed', got), got)  # idempotent
                if 0 <= speed <= 100:
                    self.assertEqual(got, speed)

    def test_program_finishes_for_any_three_claps(self):
        for gap in (1, 10, 250, 999):
            robot = Robot()
            for i in range(3):
                robot.clap(at=500 + i * gap)
            with self.subTest(gap=gap):
                self.assertTrue(program().run(robot, max_time_ms=20000).finished)


if __name__ == '__main__':
    unittest.main()
