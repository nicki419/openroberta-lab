"""Unit tests for the NEPO program clap_counter.xml, written with the Python API (the same tests as clap_counter.tests.json,
plus a few that need code). Run from NepoTest/:  python -m unittest examples.test_clap_counter

The program (Edison V2, expert mode):
    claps := 0, goal := 3
    while claps < goal: wait until clap; claps += 1
    blink(claps)                                   blink(times): repeat times: LED left on, wait 200, off, wait 200
    drive forward, power clampSpeed(150), 10 cm    clampSpeed(speed): 100 if > 100, 0 if < 0, else speed
    average(a, b) returns (a + b) / 2              (not called by the program)

The Lab converts it (EdPy + source map); the result is cached in clap_counter.bundle.json, so these tests run without a
server. Delete the bundle (or set NEPOTEST_RECONVERT=1) to convert again with the Lab at $NEPOTEST_LAB.
"""

import os
import unittest

from nepotest import TestSubject, World

HERE = os.path.dirname(os.path.abspath(__file__))


def subject():
    return TestSubject.load(os.path.join(HERE, 'clap_counter.xml'), bundle=os.path.join(HERE, 'clap_counter.bundle.json'))


class Functions(unittest.TestCase):
    def test_clamp_speed(self):
        s = subject()
        for speed, expected in [(-5, 0), (0, 0), (42, 42), (100, 100), (101, 100), (150, 100)]:
            with self.subTest(speed=speed):
                self.assertEqual(s.call('clampSpeed', speed).returned, expected)

    @unittest.expectedFailure
    def test_average_of_4_and_6_is_5(self):
        # the generator drops the parentheses of (a + b) / 2 (quirk #14): the robot computes a + b / 2 = 7
        self.assertEqual(subject().call('average', 4, 6).returned, 5)

    def test_average_overflow_is_reported_on_the_block(self):
        result = subject().call('average', 32767, 2)
        self.assertEqual(result.error.kind, 'overflow')
        self.assertEqual(result.error.function, 'average')
        self.assertEqual(result.error.block_type, 'math_arithmetic')

    def test_blink_twice(self):
        result = subject().call('blink', 2)
        leds = [(a['port'], a['mode']) for a in result.actions_of('actions_led_edison')]
        self.assertEqual(leds, [('LLED', 'ON'), ('LLED', 'OFF')] * 2)
        self.assertEqual([a['ms'] for a in result.actions_of('robControls_wait_time')], [200] * 4)


class Scenarios(unittest.TestCase):
    def test_three_claps(self):
        run = subject().run(World().clap(1000).clap(2000).clap(3000), max_time_ms=10000)
        self.assertTrue(run.finished, run)
        self.assertEqual(run.variables['claps'], 3)
        drive = run.actions_of('robActions_motorDiff_on_for')
        self.assertEqual(len(drive), 1)
        self.assertEqual((drive[0]['direction'], drive[0]['power'], drive[0]['distance_cm']), ('FOREWARD', 100, 10))
        self.assertGreater(drive[0]['t'], 3000)
        self.assertEqual([c['function'] for c in run.calls], ['blink', 'clampSpeed'])

    def test_two_claps_keep_it_waiting(self):
        run = subject().run(World().clap(1000).clap(2000), max_time_ms=10000)
        self.assertTrue(run.running)
        self.assertEqual(run.actions_of('robActions_motorDiff_on_for'), [])

    def test_the_program_reacts_to_claps_at_any_pace(self):
        for gap in (1, 10, 250, 999):
            world = World()
            for i in range(3):
                world.clap(at=500 + i * gap)
            with self.subTest(gap=gap):
                self.assertTrue(subject().run(world, max_time_ms=20000).finished)


class Coverage(unittest.TestCase):
    def test_all_blocks_are_covered_by_these_tests(self):
        s = subject()
        coverage = s.run(World().clap(1000).clap(2000).clap(3000), max_time_ms=10000).coverage
        for args in ((150,), (-5,), (42,)):
            coverage = coverage.merge(s.call('clampSpeed', *args).coverage)
        coverage = coverage.merge(s.call('average', 4, 6).coverage)
        self.assertEqual(coverage.uncovered, [])


if __name__ == '__main__':
    unittest.main()
