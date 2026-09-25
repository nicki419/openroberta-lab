"""The harness against the six Edison golden programs (all constructs the generator emits in its own tests).

This is also a regression test for the harness: if the generator changes, these tests show whether the mock still
understands its output. Expected outcomes were derived by reading each program; see docs/ai/edpy-unit-testing.md.
"""

import glob
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from edtest import EdProgram, EdPyRuntimeError, Robot  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
GOLDEN = os.path.join(REPO, 'OpenRobertaServer', 'src', 'test', 'resources', 'crossCompilerTests', '_expected',
                      'robotSpecific', 'targetLanguage', 'edisonv2')


def golden(name):
    return EdProgram.from_file(os.path.join(GOLDEN, name + '.py'))


@unittest.skipUnless(os.path.isdir(GOLDEN), 'golden files not found (run from a checkout of the repository)')
class GoldenPrograms(unittest.TestCase):
    def test_all_golden_programs_pass_the_static_check(self):
        paths = sorted(glob.glob(os.path.join(GOLDEN, '*.py')))
        self.assertGreaterEqual(len(paths), 6)
        for path in paths:
            with self.subTest(program=os.path.basename(path)):
                self.assertEqual(EdProgram.from_file(path).problems, [])

    def test_text_messages_functions_finishes(self):
        self.assertTrue(golden('text_messages_functions').run().finished)

    def test_control_logic_starts_with_an_endless_empty_loop(self):
        # ____control() begins with `while True: pass`, which never calls Ed, so virtual time stands still
        result = golden('control_logic').run(max_steps=10000)
        self.assertEqual(result.status, 'step_limit')

    def test_math_lists_divides_by_zero(self):
        # ___numberVar = 0, then ___numberVar = ___numberVar / ___numberVar
        with self.assertRaises(EdPyRuntimeError) as ctx:
            golden('math_lists').run()
        self.assertIn('division by zero', str(ctx.exception))

    def test_logic_operation_waits_for_clap_or_rec_key(self):
        self.assertEqual(golden('logic_operation').run(max_time_ms=5000).status, 'time_limit')
        robot = Robot().press('round', at=1000)
        result = golden('logic_operation').run(robot, max_time_ms=5000)
        self.assertTrue(result.finished)
        self.assertEqual(result.vars['booleanVar'], False)

    def test_sensors_finishes_when_every_awaited_event_happens(self):
        robot = (Robot().press('triangle', at=500).press('round', at=600)
                 .obstacle('left', 700, 750).obstacle('right', 800, 850).obstacle('ahead', 900, 950)
                 .remote(3, at=1000).surface('black', at=1100).clap(at=1200))
        result = golden('sensors').run(robot, max_time_ms=5000)
        self.assertTrue(result.finished)
        self.assertAlmostEqual(result.time_ms, 1201)

    def test_action_plays_the_first_tune_only_for_a_moment(self):
        # PREDICTION from EdPy's library code, not verified on a robot: the six PlayTone calls leave the "tone
        # finished" flag set, so the first `while Ed.ReadMusicEnd() == MUSIC_NOT_FINISHED` loop ends at once and the
        # second tune replaces the first one after a few ms.
        robot = Robot()
        self.assertTrue(golden('action').run(robot, max_time_ms=200000).finished)
        tunes = [s for s in robot.sounds if s.kind == 'tune']
        self.assertEqual([t.tune for t in tunes], ['c8e8g8z', 'g8e8c8z'])
        self.assertLess(tunes[1].start - tunes[0].start, 10)
        self.assertTrue(robot.moving)  # the last drive command is an unlimited backward curve

    def test_action_with_flags_cleared_on_play(self):
        # the alternative firmware assumption: starting a sound clears old "finished" flags
        robot = Robot(clear_music_end_on_play=True)
        golden('action').run(robot, max_time_ms=200000)
        tunes = [s for s in robot.sounds if s.kind == 'tune']
        self.assertGreaterEqual(tunes[1].start - tunes[0].start, 750)  # 3 eighth notes at TEMPO_SLOW (assumed)


if __name__ == '__main__':
    unittest.main()
