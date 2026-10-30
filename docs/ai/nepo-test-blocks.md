# The Tests tab: NEPO test blocks in the Lab

Learners build unit tests for their Edison V2 program **from blocks** in a third tab, **Tests**, next to Program and
Robot configuration. They run the tests in the browser and see the results per test and per block. This is part 1 of
the project goal in `CLAUDE.md`, on top of the NepoTest framework (`nepo-unit-testing.md`).

> **The given / when / then tests are switched off** (`BDD_TESTS = false` in `nepoTest.blocks.ts`, 2026-10-27): the
> toolbox offers only the blocks of simulation worlds (§5): *Tests* (world, test of a world, run test), *Checks*,
> *Given* (clap, key press, variable) and *Values*. The categories *When*, *Expect*, *Actions* and *States*, the
> *test* block and the other *given* blocks (obstacle, light, line, remote, IR) are no longer offered. Their code is
> unchanged: suites that have such tests still load, run and save (verified: the line follower's "stops at the wall"
> passed), and `BDD_TESTS = true` offers them again. The sections below still describe them.

```
Tests tab
+-------------------------------------------------------+---------------------------------------------+
| toolbox   test suite: run these tests   (red start)   | [Test runner] [Code]                        |
| Tests     run test [clampSpeed limits 150 to 100 v]    |  > Run tests   Stop                         |
| Given     run test [three claps ...              v]    |  7 passed, 1 failed, 0 test errors          |
| When                                                   |  ✓ clampSpeed limits 150 to 100    passed   |
| Expect    test [clampSpeed limits 150 to 100]          |  ✗ average of 4 and 6 is 5         failed   |
| Actions     given                                      |      returns: 5 ≠ 7                         |
| Values      when  call function [clampSpeed v]         |  Blocks of the program executed: 47 of 47   |
|                     speed (150)                        |  ██████████████████████████████████         |
|             then  expect the result [= v] (100)        |                                             |
+-------------------------------------------------------+---------------------------------------------+
```

**How a learner uses it:**
1. Build a **test** block. Under *given*, put what happens around the robot. Under *when*, put what runs: the whole
   program, or one of its functions. Under *then*, put what must be true: a result, a variable, the actions the
   program commanded, or what the robot is doing and when (a block from *States* in an *expect … at the end*,
   *… within … ms after …*, *expect while …* block; also distance, turn and end position).
2. Put a **run test** block for it under the red **start block**. Only tests under the start block run, so a learner
   can keep drafts.
3. Press **Run tests**. Each test turns ✓, ✗ or ⚠. Failures say what was expected and what happened. Clicking a
   runtime error opens the Program tab with the failing block selected. Clicking a test selects its test block.
4. The **Code** panel shows what the suite translates to (NepoTest JSON), and the program's generated EdPy.

**Simulation worlds** hold the second kind of test (§5). A *simulation world* block has a small picture of its world,
its **rules** (checks for every test of the world) and its **tests**. Clicking it opens the **Simulation** panel,
which looks and behaves like the Lab's simulator. There the learner:
- draws the world once: the simulator's backgrounds, obstacles and coloured areas, lines to follow, goal and fail
  areas (or takes over the simulator's scene);
- places the robot's **starts** (A, B, …);
- runs the world's tests, records a test's path, and watches a run again.

Each test of a world reads: **set up** (where the robot starts, and what happened before: claps, keys, variables),
**run** (the whole program, for some seconds, or until the robot touches an area), **check** (any number of checks).
It passes only if every check holds; a run never stops at the first failed check. A test can be skipped (its box) and
can be expected to fail. **Simulation tests run on the Lab's own simulator**: its interpreter, its Edison and its
objects, offscreen and in virtual time (§5). The BDD-style tests (given / when / then) are unchanged: they run in
NepoTest.

**The suite is saved with the program:** with save, save as, export, and "get link". It comes back when the program is
loaded or imported. The tab appears only for the Edison robots, since NepoTest supports only them.

**Status (2026-09-25), verified in Chrome against a Lab built from this repository:**
- **Loading and running:** the example program with its suite was imported through the Lab's real import path (all 77
  test blocks landed in the Tests tab and none in the program). All 8 tests ran live in the browser: 7 passed and 1
  failed, the latter being the deliberate quirk #14 catch. Coverage was 47/47.
- **The Code panel:** both views, JSON and EdPy.
- **Problems and errors:** problem links select the block; runtime-error links open the Program tab and select the
  block.
- **Saving:** a save/load round trip brings back a suite edited in the browser, and editing marks the program unsaved.
- **Controls:** Stop works, and a live switch to German re-labels everything.
- **Automated tests:**
  - Python: `NepoTest/tests/test_blocks.py`.
  - Java: `NepoTestSuitePersistenceTest`.
  - The runner protocol was replayed under Node's Pyodide.

**State blocks (2026-09-29), verified in headless Chrome against a Lab built from this repository:**
- `examples/patrol_with_tests.xml` (88 test blocks, 7 tests) was imported through `loadProgramFromXML`. All blocks
  render, in English and German. The new *States* category and the *Expect* presets render too.
- **Run tests:** 6 passed and 1 failed, the deliberate one ("stands still while the obstacle is there"), with the same
  message as the Python run. Clicking the failure opens the Program tab with the causing block selected (the square's
  drive block).
- **Optional inputs:** "stands still" and "plays a sound" show no power or Hz input.
- Python: `tests/test_blocks.py` (`StateBlocksTest`) translates the same suite and checks the JSON against
  `examples/patrol.tests.json`.

**Simulation tests (2026-10-18), verified in headless Chrome against a Lab built from this repository and started
with `ora.sh start-from-git`:**
- **Drawing with real mouse input** (CDP mouse events, not API calls):
  - a curve (three clicks and a double-click) and a goal area (drag);
  - the block's picture follows;
  - the program becomes unsaved.
- **Running and recording:**
  - *Run test* passed ("the robot reached the goal after 4.6 s"), and the replay animated the run.
  - *Record path* drew the covered area, the corner traces and the 2 cm corridor.
  - After the program was broken on purpose (it steers right on black too), *Run test* failed: "the robot left the
    recorded path (by more than 2 cm) after 0.6 s", with the point marked.
- **A function test with a wall:**
  - with a detection range of 0: "the robot hit an obstacle after 3.4 s";
  - with 10 cm: passed, stopped before the wall.
- **Editing:** wheel zoom (kept in the test's data), Delete, Ctrl+Z and Ctrl+Y in the canvas. The test block is not
  deleted with the item.
- **Saving:** the program with its suite (`nepoTest.suite.merge`) went through the server's import (`/program/import`:
  XSD validation, JAXB, transformer). The world came back byte for byte.
- **The example:** `examples/line_follower_with_tests.xml` was imported. *Run tests* gave 3 passed in about 2 s (two
  simulations, one BDD test, coverage 18 of 18). *Show the run* opened the replay.
- **German:** labels, hints and run messages are translated. NepoTest's failure messages stay English.

**Simulation tests copy the simulator (2026-10-22), verified in headless Chrome next to the Lab's own simulator:**
- **The default scene:** a new test looks like the simulator's default scene: the same background, wall, robot image
  and standard obstacle at the same place.
- **Taking over the simulator's scene:** in the simulator, the robot was moved and a black coloured area and a circle
  obstacle were added. *From the simulator* took the scene over.
- **Sensors:** the Tests tab showed exactly the simulator's values: line tracker 87 %, LLIGHT 87 %, RLIGHT 76 %, no
  obstacle (and 87 / 34 / 87 % at the default start).
- **Motion:** the line follower ran 8 s from that pose, in the simulator and in the test. The paths were within 1.2 cm
  of each other after 7.4 s (`nepo-unit-testing.md` §4.11).
- **Drawing with real mouse input:** a rectangle (drag), a circle (a click: the simulator's size), a triangle (drag),
  a colour from the palette, and a curve (clicks and a double-click).
- **The example:** `examples/line_follower_with_tests.xml` was built in the Tests tab (with its floor pictures).
  *Run tests* gave 3 passed in 1.5 s. The command line gave the same.

**Simulation tests run on the Lab's simulator (2026-10-22), verified in headless Chrome:**
- **The example:** `examples/line_follower_with_tests.xml` was imported (its old floor pictures are dropped on load).
  *Run tests* gave 3 passed in about 1 s (4.4 s with Python's start), coverage 18 of 18: the simulation tests' blocks
  count too.
- **The Simulation panel** (real clicks): *Run test* passed ("the robot reached the goal after 7.4 s"). *Record path*
  replaced the path recorded with NepoTest's copy (7.5 s) by the simulator's (7.4 s), and the replay ran.
- **Against the simulator:** the test's path stayed within 0.15 cm of the simulator's own run; the floor pictures were
  identical, pixel for pixel; calls, given variables, keys and tones behaved as in `nepo-unit-testing.md` §4.11.
- **Stop** ended a running simulation test.
- **The command line** skips the simulation tests (2 skipped, 1 passed).

**Simulation worlds (2026-10-26), verified in headless Chrome against a Lab built from this repository:**
- **Old programs:** the example as saved before (two simulation tests of their own) lost them on load, with the notice
  "This program had 2 simulation test(s) of an older kind: they were removed …"; their *run test* blocks went too.
- **The example:** `examples/line_follower_with_tests.xml` (a world with starts A and B, a rule, two tests) was
  imported. The dropdowns showed the names (A, B, Finish, Shortcut; "(recorded: 7.4 s)"). *Run tests*: 3 passed in
  5 s, coverage 18 of 18; the old path, recorded with the first kind of test, still held.
- **The Simulation panel:** the world, both starts with their badges, the list of tests, and for the selected test what
  each check found.
- **Checks:** a check only test B had ("never touches Finish") failed only B; with "this test should fail" B passed
  ("failed, as it should"); the same check as a rule failed both, also B, which should fail.
- **Skip:** the unticked test showed "skipped" in the panel and in the runner ("2 passed, 0 failed, 0 test errors,
  1 skipped"); undo and redo of the box worked.
- **Starts:** renaming B in the panel renamed it in the test's block; the start tool added a start; deleting a start a
  test used gave that test a warning and a message, and Ctrl+Z brought both back.
- **Recording:** test B got a path check; *Record path* stored its path in the check ("recorded: 3.9 s"), and the next
  run passed. With start B dragged 6 cm aside, the rule and the path check failed, and the replay marked both.
- **New world, German, from the simulator:** a world from the toolbox started its test at A; the German labels
  followed; *From the simulator* kept the start's id and named the new obstacle "Hindernis 1".

**The facts of a failure (2026-10-26), verified in headless Chrome against a Lab built from this repository:**
- **A bug planted in the line follower** (on black it curved right, left 40 % / right 10 %): test A failed ("did not reach
  "Finish" within 20 s", "left its recorded path … after 1.2 s"). Under each failed check, the panel showed the second
  before it: *sensed* the line tracker block, "line tracker sees black: no 49×, yes 11×"; *ran* the `if` block ("yes
  11×, no 49×") and the curve blocks in effect ("curves forward, left 40 %, right 10 % when [if] says no"); *did* "drove
  8.7 cm and turned 85.6° to the right; wheels left 13.9, right 3.5 cm/s".
- **The clap counter** in a world (three claps set up, a goal too far away): *remembered* "claps = 3, goal = 3", the LED
  blocks and the drive block in effect, and the run's trace held the decisions of its `wait until` and `repeat while`.
- **Chips:** a click on a block chip (in the panel and in the runner's results) opened the Program tab with that block
  selected.
- **Cost:** a run of 7.4 s took 93 ms with the record; its report was 17 KB.

**Checks of behaviour (2026-10-27), verified in headless Chrome against a Lab built from this repository:**
- **The line follower's world** got starts C (on the line) and D (beside it), the tests "on the line, it turns left"
  (0.3 s, *from 0 ms on, the robot always turns left*) and "beside the line, it turns right" (0.4 s), and test A the
  checks *whenever it sees the line, the robot turns left, after 0 ms* and *whenever it doesn't see the line, the robot
  turns right, after 0 ms*. *Run all*: 4 passed ("whenever it saw the line (122 times, 2.85 s checked), the robot turned
  left").
- **With the bug** (on black, left 40 % / right 10 %): A failed "it saw the line, but the robot did not turn left: it
  drove forward, turning right (8.62 cm/s, 86°/s), 17 times, 3.85 s in total; the first from 1 to 1.18 s"; "on the line"
  failed "the robot did not turn left: it drove forward, turning right (8.63 cm/s, 86°/s), from 0 to 0.3 s", with the
  facts: the curve block with left 40 %, right 10 % in effect "when [if] says yes". "Beside the line" still passed. The
  runner showed the same, 2 passed and 3 failed.
- **The clap counter** in a world: "the 3rd clap starts it" (set up: *variable claps is 2*, a clap at 0.3 s) passed
  *within 300 ms after each clap, the robot has its left LED on* (0.03 s), *within 1500 ms … drives forward* (1.37 s:
  it blinks first) and *at the end, variable claps = 3*. "Two claps count as 2" (claps at 0.3 and 1.3 s) failed: "claps
  was 3 at the end (expected claps = 2; it became 3 at 0.33 s)", the facts showing "sound: yes 3×", "repeated 3×",
  "claps = 0 → 3": the simulator's sound sensor is a state (`nepo-unit-testing.md` §4.11). With *this test should
  fail*, it passed. "It waits for claps" passed (stands still, both LEDs off).
- **The conditions** read the simulator's values: the light sensors (below / above 50 %), key ▶ (a key press set up at
  0.2 s), an obstacle ahead (a start in front of the obstacle). A condition that never held, an event that never
  happened: "not checked", the test passes on its other checks.
- **Blocks:** the Checks category and the labels in German; a *whenever* switched to a light sensor showed its %;
  saving and loading the suite gave the same XML.

**Why it failed, and the replay with code (2026-10-27), verified in headless Chrome against a Lab built from this
repository:**
- **Swapped powers in the `if`'s "yes" part** (left 40 %, right 10 %): "why (wrong action): [steer forwards … left 40 …
  right 10] makes the robot drive forward, turning right (left wheel 40 %, right wheel 10 %), but whenever it sees the
  line, it should turn left (it ran because [if get line …] said "yes")". Test A's failed area and path checks pointed to
  it ("probably because "whenever it sees the line …" failed").
- **An inverted condition** (`if not line`): "why (wrong decision): when it saw the line (at 0.67 s), [if not get line …]
  said "no" (it read line tracker sees black: yes 2×), so [steer … 40 … 10] makes the robot drive forward, turning
  right …; its "yes" part has [steer … 10 … 40], which makes the robot drive forward, turning left …". The same for
  "on the line" and "beside the line" (whose other part never ran: its blocks' numbers were read).
- **An LED check for a clap the program never reads** (it only drives): "why (decision missing): no block of the
  program reads the sound sensor: it cannot notice each clap".
- **A clap during `wait 1000 ms`** (`repeat: if sound: left LED on; wait 1000 ms`, a clap at 0.3 s): "why (missed the
  moment): the clap at 0.3 s (heard until 0.62 s) came while [wait ms 1000] ran (from 0 to 1.02 s): the program read
  the sound sensor again only at 1.03 s, when it was over".
- **The clap counter's "two claps count as 2"**: "why (wrong value): claps was 3 at the end: [change claps by 1] made it
  3 at 0.33 s. It ran 3 times at 0.33 s (in one frame of the simulator), each time after [wait until get sound …],
  while the sound sensor kept reading yes: it counted one clap 3 times (the simulator hears a clap for about 0.3 s; the
  Edison itself reports a clap once)".
- **Driving into an obstacle** (a *from 100 ms on, … drives forward* check): "why (right, but not enough): [drive …]
  makes the robot drive forward (left wheel 30 %, right wheel 30 %), as it should, but the robot bumped into "Box 1" and
  could not". Its *never bumps* check got no pointer (the bump caused that failure, not the other way round).
- **The correct line follower:** 4 passed, no why. **The runner** showed the same why lines under the failures; a chip
  in one opened the Program tab with that block selected.
- **The replay:** at 1.1 s the line read "1–1.1 s: running [steer … 40 … 10] · read: line tracker sees black: yes ·
  [if …] yes 6×", and the Program tab outlined that block (in German: "läuft [Warte ms 1000] · er hört ein Geräusch").

---

## 1. The blocks

All block types start with `nepoTest_`. They're defined at runtime in `OpenRobertaWeb/src/app/nepotest/nepoTest.blocks.ts`;
Blockly itself isn't rebuilt. They're translated to NepoTest's JSON by `NepoTest/nepotest/blocks.py`. **Keep both in
sync:** the field and input names below are the contract between them.

| Block | Looks like | Fields / inputs | Becomes (NepoTest JSON) |
|---|---|---|---|
| `nepoTest_suite` | red: *test suite: run these tests* | (next: `run` blocks) | the list and order of the tests |
| `nepoTest_run` | *run test* [name ▾] | `NAME` (dropdown of the workspace's tests, worlds and their tests, shown as "world ▸ test"; `''` shown as `?` = none chosen) | selects a test; a world: all its tests |
| `nepoTest_test` | *test* [name] *given / when / then*, *this test should* [pass ▾ / fail] | `NAME`, `SHOULD` (`pass`, `fail`); statements `GIVEN`, `WHEN`, `THEN` | one test (`name`, `block_id`, `origin: "blocks"`; `should: "fail"`) |
| `nepoTest_world` | *simulation world* [name], a picture of its world, *rules for every test*, *tests* | `NAME`; statements `RULES` (check blocks), `TESTS` (`nepoTest_simcase`); **the world is the block's `data`** (JSON, §5); the picture is a `FieldImage` without a value, drawn asynchronously (a PNG of the floor, the objects and the robot at its starts) | nothing itself: its tests (`simulation.world_block_id`, `world_name`, `world`); its rules are copied into each test's `checks` with `"rule": true` |
| `nepoTest_simcase` | ☑ *test* [name] / *set up: the robot starts at* [A ▾] / (set-up blocks) / *run: the program* [for ▾ / until the robot touches] [area ▾] *, at most* [5] *s* / *check:* (checks) / *this test should* [pass ▾ / fail] | `ACTIVE` (checkbox, `TRUE`/`FALSE`), `NAME`, `START` (a start's id), `MODE` (`for`, `until`), `UNTIL` (an area's id; shown only for `until`), `SECONDS` (one decimal, at least 0.1), `SHOULD`; statements `SETUP` (clap, key, variable only: the simulator has no IR remote and no IR messages), `CHECKS` | a test of the world (`simulation` with `start`, `until`, `checks`; `max_time_ms`, `globals`, `world` events; `skip: true` when unticked) |
| `nepoTest_check_reaches` | *the robot reaches* [area ▾] | `AREA` (an area's id, or `ANY`: any goal area) | `{"check": "reaches", "item"}` |
| `nepoTest_check_never_touches` | *the robot never touches* [area ▾] | `AREA` (or `ANY`: any fail area) | `{"check": "never_touches", "item"}` |
| `nepoTest_check_ends_in` | *at the end, the robot is completely in* [area ▾] | `AREA` | `{"check": "ends_in", "item"}` |
| `nepoTest_check_never_bumps` | *the robot never bumps into* [obstacle ▾] | `OBSTACLE` (an obstacle's id, or `ANY`: anything, the wall too) | `{"check": "never_bumps", "item"}` |
| `nepoTest_check_path` | *the robot stays on its recorded path ±* [2] *cm* (recorded: 7.4 s) | `TOL` (cm, decimals allowed); **the recorded path is the block's `data`** (`{"path": [[x, y, heading], …], "time_ms"}`), set by *Record path* | `{"check": "path", "path", "time_ms", "tolerance_cm"}` (no path: a warning, the check checks nothing) |
| `nepoTest_check_does` | *from* [100] *ms on, the robot always* [turns left ▾] | `AFTER` (ms), `DOES`: `drives_forward`, `drives_backward`, `turns_left`, `turns_right`, `stands_still`, `left_led_on`, `left_led_off`, `right_led_on`, `right_led_off`, `leds_on`, `leds_off` (both), `plays_sound`, `silent` | `{"check": "does", "does", "after_ms"}` |
| `nepoTest_check_whenever` | *whenever* [it sees the line ▾] *,* / *the robot* [turns left ▾] *, after* [0] *ms* | `WHEN`: `line`, `no_line`, `obstacle_ahead`, `obstacle_left`, `obstacle_right`, `no_obstacle`, `left_light_below`, `left_light_above`, `right_light_below`, `right_light_above` (with `PERCENT`, shown only for them), `sound`, `play_key`, `rec_key`; `DOES`, `AFTER` (ms) | `{"check": "whenever", "when", "percent", "does", "after_ms"}` |
| `nepoTest_check_after` | *within* [500] *ms after* [each clap ▾] *,* / *the robot* [drives forward ▾] | `WITHIN` (ms, at least 1), `EVENT`: `clap`, `key` (of the set-up), `line_start`, `line_end`, `obstacle` (appears); `DOES` | `{"check": "after", "event", "within_ms", "does"}` (a clap or key without one in the set-up: a warning) |
| `nepoTest_check_variable` | *at the end, variable* [claps ▾] [= ▾] (value) | `VAR`, `OP` (`EQ` … `GTE`); input `VALUE` (a number, true/false, a list of numbers) | `{"check": "variable", "variable", "op", "value"}` |
| `nepoTest_given_clap` | *at* [1000] *ms: a clap* | `AT` | world `clap` |
| `nepoTest_given_key` | *at … ms: key* [▶ PLAY ▾] *is pressed* | `AT`, `PORT` (PLAY/REC) | world `key` |
| `nepoTest_given_obstacle` | *from … ms for … ms: an obstacle* [FRONT ▾] | `FROM`, `DURATION` (0 = until the end), `PORT` | world `obstacle` |
| `nepoTest_given_light` | *from … ms: light sensor* [LLIGHT ▾] *reads* [50] % | `AT`, `PORT`, `VALUE` | world `light` |
| `nepoTest_given_line` | *from … ms: the line tracker sees* [black ▾] | `AT`, `COLOR` | world `line` |
| `nepoTest_given_remote` | *at … ms: remote control code* [0 ▾] | `AT`, `CODE` (0–7) | world `remote` |
| `nepoTest_given_ir` | *at … ms: IR message* [1] | `AT`, `VALUE` (0–255) | world `ir_message` |
| `nepoTest_given_variable` | *variable* [claps ▾] *is* ⟨value⟩ | `VAR` (the program's globals), input `VALUE` | `globals` (function tests; in a world's test: its value from the start) |
| `nepoTest_when_run` | *run the program for at most* [10] *s* | `SECONDS` | a program run, `max_time_ms` |
| `nepoTest_when_call` | *call function* [clampSpeed ▾] + one input per parameter | `FUNCTION`; inputs `ARG0…`; mutation `name` + `<arg name type/>`; fits under *when* | `call`, `args` |
| `nepoTest_expect_result` | *expect the result* [= ≠ < ≤ > ≥] ⟨value⟩ | `OP`, input `VALUE` | `returns` |
| `nepoTest_expect_variable` | *expect variable* [claps ▾] [= ▾] ⟨value⟩ | `VAR`, `OP`, input `VALUE` | `variables` |
| `nepoTest_expect_status` | *expect the program* [to finish / to be still running] | `STATUS` | `status` |
| `nepoTest_expect_action` | *expect* ⟨action⟩ | input `ACTION` | `actions` (consecutive ones: **in this order**) |
| `nepoTest_expect_no_action` | *expect no* ⟨action⟩ | input `ACTION` | `no_actions` |
| `nepoTest_expect_count` | *expect* ⟨action⟩ [= ▾] [1] *times* | input `ACTION`, `OP`, `COUNT` | `action_count` (matcher form) |
| `nepoTest_expect_called` | *expect function* [f ▾] *to be called* | `FUNCTION` | `calls` |
| `nepoTest_expect_error` | *expect the error* [any error ▾] | `KIND`: any, division_by_zero, overflow, index_out_of_range, recursion, step_limit, negative_value | `error` |
| `nepoTest_action_led` | *LED* [any/LLED/RLED] [any/on/off] | `PORT`, `MODE` | `{"action": "led", ...}` |
| `nepoTest_action_drive` | *drive* [any/forward/backward], *power %*, *distance cm* | `DIR`; optional inputs `POWER`, `DISTANCE` | `{"action": "drive", "dir", "power", "distance_cm"}` |
| `nepoTest_action_turn` | *turn* [any/right/left], *power %*, *degrees* | `DIR`; `POWER`, `DEGREES` | `{"action": "turn", ...}` |
| `nepoTest_action_curve` | *curve* [dir], *power left/right %*, *distance cm* | `DIR`; `POWER_LEFT`, `POWER_RIGHT`, `DISTANCE` | `{"action": "curve", ...}` |
| `nepoTest_action_motor` | *motor* [any/LMOTOR/RMOTOR], *power %* | `PORT`; `POWER` | `{"action": "motor", ...}` |
| `nepoTest_action_stop` | *stop* | – | `{"action": "stop"}` |
| `nepoTest_action_tone` | *tone*, *frequency Hz*, *duration ms* | `FREQUENCY` (±1 Hz), `DURATION` | `{"action": "tone", ...}` (tone and note blocks) |
| `nepoTest_action_sound_file` | *sound file*, *number* | `FILE` | `{"action": "sound_file", ...}` |
| `nepoTest_action_ir_send` | *send IR message*, *value* | `VALUE` | `{"action": "ir_send", ...}` |
| `nepoTest_action_wait` | *wait*, *ms* | `MS` | `{"action": "wait", ...}` |

**State expectations** (under *then*): what the robot is doing, and when (`nepo-unit-testing.md` §4.10). Each takes a
⟨state⟩ block from the *States* category.

| Block | Looks like | Fields / inputs | Becomes (NepoTest JSON) |
|---|---|---|---|
| `nepoTest_expect_state_end` | *expect* ⟨state⟩ *at the end* | input `STATE` | `states`: `{"state", "at": "end"}` |
| `nepoTest_expect_state_at` | *expect* ⟨state⟩ *at* [2000] *ms* | `STATE`, `AT` | `{"at": ms}` |
| `nepoTest_expect_state_during` | *expect* ⟨state⟩ [always / never / at some point] *from* [ ] *to* [ ] *ms* | `STATE`, `QUANT`, `FROM`, `TO` (both may be empty: the whole run) | `{"always" \| "never" \| "sometime": {"from", "to"}}` |
| `nepoTest_expect_state_after` | *expect* ⟨state⟩ *within* [200] *ms after* [each / the first] [clap ▾] | `STATE`, `WITHIN`, `EACH`, `EVENT`: clap, key, obstacle_start, obstacle_end, line_black, line_white, remote, ir_message | `{"after": event, "within_ms", "each"}` |
| `nepoTest_expect_state_while` | *expect while* ⟨condition⟩ *after* [100] *ms:* ⟨state⟩ | inputs `COND`, `STATE`; `DELAY` | `{"while": condition, "delay_ms"}` |
| `nepoTest_expect_state_for` | *expect* ⟨state⟩ *for* [at least / at most / about] [1000] *ms in total* | `STATE`, `OP` (GTE, LTE, ABOUT: ± 5 %, at least 10 ms), `MS` | `{"for_ms": matcher}` |
| `nepoTest_expect_state_count` | *expect* ⟨state⟩ *to begin* [= ▾] [1] *times* | `STATE`, `OP`, `COUNT` | `{"starts": matcher}` |
| `nepoTest_expect_distance` | *expect the robot to have driven* [20] *cm* [forward ▾] ± [1] *cm* | `DISTANCE`, `DIR`, `TOL` | `distance_cm` (backward: negative) |
| `nepoTest_expect_turned` | *expect the robot to have turned* [90] ° [right ▾] ± [5] ° | `DEGREES`, `DIR`, `TOL` | `heading_deg` (right: negative) |
| `nepoTest_expect_position` | *expect the robot to end* [0] *cm* [ahead ▾] *and* [0] *cm* [to the left ▾] *of its start* ± [2] *cm* | `AHEAD`, `AHEAD_DIR`, `SIDE`, `SIDE_DIR`, `TOL` | `end_position` |
| `nepoTest_expect_finish_within` | *expect the program to finish within* [5] *s* | `SECONDS` | `finished_within_ms` (runs only) |

**States** (value blocks, output `nepoTestState`, category *States*) and **conditions** (output `nepoTestCondition`,
for *expect while*; they describe the world of *given*):

| Block | Looks like | Fields / inputs | Becomes |
|---|---|---|---|
| `nepoTest_state_motor` | [left motor ▾] [forward / backward / running / stopped] *at* ⟨⟩ % | `PORT` (left, right, both), `IS`; optional input `POWER` | `{"motor", "is", "power"}` |
| `nepoTest_state_robot` | *the robot* [drives forward ▾] *at* ⟨⟩ % | `MOVE` (forward, backward, turn_left, turn_right, curve_left, curve_right, still); optional `POWER` | `{"robot", "power"}` |
| `nepoTest_state_led` | [left LED ▾] [on ▾] | `PORT` (left, right, both, either), `IS` | `{"led", "is"}` |
| `nepoTest_state_sound` | *the robot* [plays a tone ▾] ⟨⟩ *Hz* | `SOUND` (tone, any, file, silent); optional `FREQUENCY` | `{"sound", "frequency_hz": {"approx": f, "tol": 1}}` |
| `nepoTest_state_variable` | *variable* [x ▾] [= ▾] ⟨value⟩ | `VAR`, `OP`, input `VALUE` | `{"variable", "value"}` |
| `nepoTest_state_logic` | ⟨state⟩ [and / or] ⟨state⟩ | inputs `A`, `B`; `OP` | `{"all": [...]}` / `{"any": [...]}` (nested ones flattened) |
| `nepoTest_state_not` | *not* ⟨state⟩ | input `STATE` | `{"not": ...}` |
| `nepoTest_cond_obstacle` | *an obstacle* [FRONT ▾] | `PORT` (FRONT, LEFT, RIGHT, ANY) | `{"obstacle"}` |
| `nepoTest_cond_line` | *the line tracker sees* [black ▾] | `COLOR` | `{"line"}` |
| `nepoTest_cond_light` | *light sensor* [LLIGHT ▾] [> ▾] [50] % | `PORT`, `OP`, `VALUE` | `{"light", "value": matcher}` |

- **Connection checks** keep the structure valid while the learner builds. `GIVEN` accepts only *given* blocks,
  `WHEN` exactly one *when* block (no next connection), `THEN` only *expect* blocks, ⟨action⟩ inputs only action
  blocks, ⟨state⟩ inputs only state blocks, and ⟨condition⟩ inputs only condition blocks. Run blocks attach only below
  the start block.
- **Optional inputs show only where they apply:** no "at … %" for "stands still", the curves or a stopped motor, and no
  Hz except for "plays a tone" (`showOptional`, called from the blocks' `onchange`). An input with a block in it stays
  visible, so the translator's message about it can be followed.
- **Power in state blocks is the NEPO power a program would use:** it's compared in the robot's 10 % steps, so 45 to 54
  all mean "runs at 50 %".
- **Values** are NEPO literal blocks from the *Values* category: `math_number`, `logic_boolean`,
  `robLists_create_with`. The translator rejects anything else, and non-whole numbers, with a message on that block.
- **In action blocks, an empty input or "any" matches everything.** For example, *expect no* ⟨drive any⟩ means "never
  drives".
- **The program's names come from the Program tab, live:** function names and parameters for *call function* and
  *expect function*, and global variables for *variable* dropdowns. The *call function* block gets one labelled input
  per parameter, and re-shapes when the learner picks another function.
- **The blocks in a world follow the world** (`refreshWorldLabels` in `nepoTest.blocks.ts`): their dropdowns hold ids
  of the world's starts and items and show their names. Blockly sets a dropdown's text only when its value changes, so
  the names are refreshed when the world changes, after a suite is loaded, and when such a block is moved or created.
  Outside a world (while loaded, in the toolbox) the dropdowns use a new world's, so the toolbox's test shows start A.
  A start or item that isn't in the block's world shows `?` and a warning on the block; so does a test or check
  outside a world. A dropdown without a value gets the world's first fitting item when the block comes into a world.
- **The checkbox** of a test: the bundled Blockly's undo hands `FieldCheckbox.setValue` a boolean, which it takes as
  "unchecked"; the field accepts both (`checkbox` in `nepoTest.blocks.ts`).
- **Names** of tests, worlds and their tests are one namespace: *run test* runs any of them by its name.
- **Run blocks follow the tests** (`tests.controller.ts`):
  - When a block is created, *run test* blocks without a test (`?`) get a test or a world that no run block runs yet,
    in workspace order. The new block and this choice are one undo step. Loaded suites are left as they are.
  - Renaming a test renames its run blocks.
  - While a dropdown shows `?`, `?` stays in its menu. Blockly doesn't open a menu with one option, so a single test,
    function or variable could otherwise never be picked (`nameOptions` in `nepoTest.blocks.ts`).
- **Colours** follow NEPO:
  - start block: red (activity);
  - tests, simulation worlds and their tests: green (procedure);
  - checks: logic cyan, like *expect*;
  - *given*: sensor green;
  - *when*: control orange;
  - *expect*: logic cyan;
  - actions: action orange;
  - states: variable purple; conditions: sensor green, like *given*;
  - values: math blue.
- **Messages** are in English and German (`MESSAGES` in `nepoTest.blocks.ts`). The panel texts are in
  `tests.controller.ts`. Failure texts come from NepoTest and are English only.

**Problems** (translation errors and warnings) come with the block id and appear in the runner as clickable lines.
Examples:
- "put "run the program" or "call function" under "when"";
- "there are two tests named …";
- "there is no test named …";
- "choose the test to run in "run test"" (a run block still showing `?`);
- "the program has no function …";
- "the Edison only knows whole numbers";
- "expect the result only works with call function";
- "there is no "clap" under "given" of this test" (*expect … after*), ""an obstacle is there (FRONT)" never happens: add
  it under "given"" (*expect while*);
- "a stopped motor has no power", ""at … %" only works with "drives" and "turns"", "a frequency only works with "plays
  a tone"";
- "only one such block per test" (the measurement blocks);
- simulation worlds:
  - "test "…": its start is not in the world (any more): choose one of its starts", "this area is not in the world
    (any more): choose another one" (also for the area that ends the run, and obstacles);
  - "test "…": put this test into a simulation world" (a test outside a world that *run test* selects);
  - "test "…": the robot starts outside the floor …", "… starts on an obstacle …"; the warning "… starts on "…",
    which the test checks …";
  - "in a simulation world, draw obstacles, lines and areas into the world instead" (a set-up obstacle, line or
    light);
  - "the Lab's simulator has no IR remote control and no IR messages: use this block in a test, not in a simulation
    world" (a set-up remote control code or IR message);
  - "a recorded path belongs to one test: put this check into a test, not under "rules"";
  - "the simulation world "…" cannot be read: draw it again";
  - the warnings "test "…" checks nothing …", "… its path is not recorded yet, so it is not checked …", "… the program
    sets "…" when it starts, so the value of "set up" is lost";
  - the warning "test "…" is a simulation test of an older kind: it does not run …" (the command line; the Tab drops
    them on load).

A test or world that isn't under the start block, and a test listed twice (also with its world), are **warnings**.
Everything else is an error and stops the run.

---

## 2. How it is built

```
OpenRobertaWeb/src/app/nepotest/nepoTest.blocks.ts     block definitions, toolbox, messages, empty suite
OpenRobertaWeb/src/app/nepotest/nepoTest.suite.ts      split/merge of test instances in program XML (no imports: no cycles)
OpenRobertaWeb/src/app/nepotest/nepoTest.runner.ts     client of the Web Worker (promises, cancel; prepare, runOne, finish, simulationTest)
OpenRobertaWeb/src/app/nepotest/nepoTest.sim.ts        a simulation world: data format, starts and names, the simulator's geometry and look (for drawing and replay)
OpenRobertaWeb/src/app/nepotest/nepoTest.simRun.ts     the tests of worlds on the Lab's simulator: the program for a test, compiling, the run and its checks, the floor picture
OpenRobertaWeb/src/app/nepotest/nepoTest.simProgram.ts the record of a run (decisions, readings, blocks in effect, variables, motion), the facts of a failure, what action blocks do
OpenRobertaWeb/src/app/nepotest/nepoTest.simBehaviour.ts the checks of behaviour (does, whenever, after) and of a variable at the end, from the record
OpenRobertaWeb/src/app/nepotest/nepoTest.simVerdict.ts why a check failed: the block to blame (decision missing / wrong, action wrong, missed the moment, ...)
OpenRobertaWeb/src/app/nepotest/nepoTest.simEditor.ts  the Simulation panel: drawing, starts, the world's tests, zoom, undo, record/run, replay (no Blockly inside)
OpenRobertaWeb/src/app/nepotest/nepotest.worker.js     module Web Worker: Pyodide + nepotest.browser
OpenRobertaWeb/src/app/roberta/controller/tests.controller.ts   the tab: workspace, dropdowns, panels, running
OpenRobertaServer/staticResources/index.html          #tabTests, pane #tests (#testsBlocklyDiv, #testsSide ...)
OpenRobertaWeb/css/roberta.css                         the tab's styles (section "the Tests tab")
NepoTest/nepotest/blocks.py                            test blocks -> NepoTest JSON (+ problems with block ids)
NepoTest/nepotest/browser.py                           the functions the worker calls (JSON strings in and out)
NepoTest/nepotest/simulation.py                        simulation worlds and their tests: their data and its checks (its copy of the simulator is no longer used)
```

The wiring into the Lab consists of:
- `main.js`: a path per module (also `nepoTest.sim`, `nepoTest.simRun`, `nepoTest.simProgram`, `nepoTest.simBehaviour`, `nepoTest.simVerdict`, `nepoTest.simEditor`), a `blockly` shim for the
  blocks module, the require list, and `testsController.init()` right after `configurationController.init()`;
- `tsconfig.json`: `paths` (also `robot.edison`, which `nepoTest.simRun` imports);
- `guiState.controller.js`: a `tabTests` branch in `setView`, which keeps the program menu, and `addLanguageListener`;
- `program.controller.js`: the persistence hooks (§3).

**Running a suite** (`tests.controller.ts runTests`):
1. The program workspace XML goes to `POST /rest/projectWorkflow/sourceForTest` (`nepo-unit-testing.md` §3). The
   request is the same as for "show source".
2. The answer becomes a NepoTest **bundle**: EdPy, source map, the Lab's annotated XML, and `rc`/`message`.
3. The worker gets the bundle and the suite XML. `browser.prepare` translates the suite and validates it against the
   program. If the Lab rejected the program, it reports the conversion errors with block ids instead.
4. The tests run one by one, so results appear one by one:
   - a BDD test in the worker (`browser.run_one(i)`);
   - a test of a simulation world on the page, on the Lab's simulator (`nepoTest.simRun runTest`, §5); a skipped one
     doesn't run.
5. `browser.finish(simulation reports)` returns the summary (with `skipped`) and the merged coverage, with the
   simulation tests' covered blocks (the page sends only `name`, `block_id`, `outcome`, `covered_blocks`).
6. The panel renders each report.
   - Links use `data-block` and `data-workspace` (`tests` or `program`).
   - An unexpected runtime error is shown once, as "The program failed in block … (function): …".
   - Coverage is a bar plus the list of never-executed program blocks. It is **not shown** (`SHOW_COVERAGE = false`
     in `tests.controller.ts`, 2026-10-30: learners found it confusing); it is still computed, and `true` shows it
     again.

**The worker** (`nepotest.worker.js`) is a **module worker** (`new Worker(url, {type: 'module'})`):
- **Loading Pyodide:** it loads Pyodide 314.0.7 (CPython 3.14; NepoTest needs 3.11+) with
  `import(PYODIDE_URL + 'pyodide.mjs')` from `https://cdn.jsdelivr.net/pyodide/v314.0.7/full/`.
  - **Why `import()` and not `importScripts`:** `importScripts` makes a cross-origin *no-cors* request. In the Chrome
    this was tested in, every cross-origin `importScripts` failed, even jQuery from the same CDN. Meanwhile `import()`,
    a CORS request, and `fetch` worked.
  - The `import()` is created with `new Function`, because tsc would compile a literal `import()` into an AMD
    `require`.
- **Loading NepoTest:** it fetches `/nepotest/nepotest-files.json` (with `cache: 'no-cache'`), writes the package into
  Pyodide's file system under `/home/pyodide`, and imports `nepotest.browser`.
- **Cost:** the first run downloads about 12 MB (then cached); start-up takes about 3–5 s, and a suite like the
  example takes about 1 s.
- **Stop** terminates the worker; the next run starts a new one. A simulation test that runs stops at its next piece
  (about every 30 ms).
- **The Code panel's JSON** also comes from the worker (`browser.translate_tests`), so the first view starts Python.
  The EdPy view is the `sourceCode` of `sourceForTest`.

---

## 3. Saving and loading

A program's suite is stored **in the program's own XML**, as extra `<instance>`s of its `block_set`: every instance
whose first block has a `nepoTest_` type. There's no database or REST change.

| Where | What happens | Code |
|---|---|---|
| Save, save as | the program workspace XML plus the suite | `program.controller.js` `saveToServer`, `saveAsProgramToServer` → `NEPOTEST_SUITE.merge` |
| Export, get link | the same, inside `<export><program>` | `exportXml`, `linkProgram` |
| Load (list, gallery, import, new program, robot switch) | test instances are split off and put into the Tests tab; a program without them gets a new, empty suite | `programToBlocklyWorkspace(xml, fromShowSource, keepTests)` → `NEPOTEST_SUITE.split` / `loadTests` |
| Reloads with a workflow result (show source, simulation, run, source editor) and re-renders (language, toolbox) | the regenerated XML has no tests, so the current suite is **kept** | `reloadProgram(result)` and `reloadView` pass `keepTests` |

**The rules this relies on:**
- **The program workspace never contains test blocks,** so code generation, simulation and run never see them.
  `programToBlocklyWorkspace` always splits.
- **The server keeps test instances unchanged:**
  - saving doesn't validate;
  - import and listing validate against `blockly.xsd`, re-marshal through JAXB, and run the XSLT/Java transformer;
  - `NepoTestSuitePersistenceTest` checks that all test blocks, names, mutations and `<arg>`s survive;
  - the test blocks only use XSD-valid parts (fields, values, statements, and mutation `name` with `<arg>`).
- **A simulation world is the block's `data`** (Blockly's `block.data`, saved as `<data>` with JSON text), and so is
  a recorded path (the path check's `data`). `blockly.xsd` allows `data` as a string, so import and listing keep it.
  `NepoTestSuitePersistenceTest` checks that the world and the path of `line_follower_with_tests.xml` survive byte for
  byte. Copying, pasting and undoing a deleted block bring them along.
- **Suites saved before 2026-10-26** had simulation tests of their own (`nepoTest_simtest`). `loadSuite` removes them,
  and the *run test* blocks that ran them, from the XML before Blockly sees it, and says so. If a suite can't be loaded
  at all, it is kept as it was for saving (`unloadable`), so an empty suite shown instead doesn't delete it.
- **An empty suite** (only the start block) isn't stored, so programs without tests stay byte-for-byte unchanged.
- **An edit in the Tests tab** marks the program unsaved, like an edit in the Program tab.
- **Compatibility:** a Lab without this feature would show unknown test blocks when it opens such a program. That's
  accepted for this fork.

`python -m nepotest run program.xml` runs a suite saved this way from the command line: it splits the program, converts
it with a running Lab, and runs the suite (`nepo-unit-testing.md` §1). `NepoTest/examples/clap_counter_with_tests.xml`
is the example.

---

## 4. Building and changing

- **After changes in `OpenRobertaWeb`:** in `OpenRobertaWeb`, run `npx tsc --noEmit -p .` (type check), then
  `npx gulp`. This builds TypeScript, CSS, **and the NepoTest bundle**. Reload the page; the server serves
  `staticResources` directly.
- **After changes in `NepoTest/nepotest`:** `npx gulp nepotest` regenerates
  `OpenRobertaServer/staticResources/nepotest/nepotest-files.json` (`{generated, version, files: {path: source}}`).
  **It's generated; never edit it.** The Tests tab uses whatever that file contains.
- **Adding a test block:**
  1. Define it in `nepoTest.blocks.ts` (`DEFINITIONS`, with the connection check of its section), put it into
     `toolbox()`, and add its messages (EN, DE).
  2. Translate it in `blocks.py` (`_translate_test` or `_action_matcher`).
  3. Add a case to `tests/test_blocks.py`.
  4. Extend the table in §1.
  5. Mutations must use XSD-allowed attributes only (`name`, `items`, `value`, `type`, …, plus `<arg>`); otherwise
     saving still works, but loading and importing fail.
- **Pyodide version:** `PYODIDE_URL` in `nepoTest.runner.ts`. To run without internet access, host a Pyodide
  distribution on the Lab's own server (under `staticResources`) and point `PYODIDE_URL` at it.

---

## 5. Simulation worlds: the Simulation panel

**Opening it:** clicking a simulation world, or a block in it, or a result line ("show the run"), opens the panel with
that world. A click in a test of the world selects that test in the panel. The tab *Simulation* shows the world last
opened.

**It looks like the Lab's simulator:**
- its backgrounds, with the striped wall around them (and the tests' own plain peach floor, without a wall);
- its obstacles (teal, with their shadow) and coloured areas, as rectangles, circles and triangles, in its colours;
- its robot image (`css/img/simulator/edison.png`, with its shadow);
- the line tracker and the light sensors, filled with the brightness they see;
- the infrared rays, and the LEDs' red glow.

A new world starts on a plain light peach floor (3 × 2 m, `#f7d1b3`), with start A in its middle and nothing else on
it. The view shows the area around the robot; the block's picture shows what is drawn, not the whole floor.

```
Simulation world: Edison track
[↖ A ╱ ∿ ▭ ◯ △] [▩ ■ ✓ ✗] [− + ⤢] [↶ ↷ 🗑] [⇩ ↔]    tools | what it is | zoom | undo, redo, delete | from the simulator, wider
[Edison track ▾]  ■■■■■■■■■■                      background | colours (obstacles and coloured areas)
name [halfway]                                    the selected start's or item's name
+----------------------------------------------+
|  the simulator's background and wall         |      the drawn world, the starts (A, B: the selected test's
|   (A)===>   [goal]   [fail]   ■ obstacle  (B) |      solid), its recorded path (blue), its last run (orange)
+----------------------------------------------+      and the robot replaying it
line tracker white (87 %) · LLIGHT 87 % · RLIGHT 76 % · obstacle: none
[● Record path] [Forget path]  allowed deviation [——o——] 2 cm
[▶ Run test] [▶▶ Run all] [▶ Replay] [————————o—] 7.4 / 7.4 s
✓ passed: the run ended at its area after 7.4 s
✓ the robot never touched "Shortcut"     (a rule)
✓ the robot reached "Finish" after 7.4 s
✓ the robot stayed on its recorded path
Tests in this world
✓ (A) follows the track to the finish          (selected)
✓ (B) from halfway, it reaches the finish too
```

**Drawing** (`nepoTest.simEditor.ts`):
- **Starts:** each start is a robot with its name on it. Drag it; turn the selected one (or the selected test's) with
  its round handle, in steps of 15°; Shift turns it freely. The *start* tool (the second) adds a start where you
  click, named with the next free letter. A world keeps at least one start.
- **Names:** a selected start or item gets a name field; the tests' blocks show the names. New items are named by their
  kind ("Goal 1", "Obstacle 2").
- **Deleting what a test uses:** the start or item goes; the tests that used it show a warning on their block, and the
  panel names them. Undo brings it back.
- **Lines:** *Line* (straight segments) and *Curve* (smooth through the points) draw a line to follow, like the
  background's track: a black core on a white band.
  - Click the points. A click on the last point again ends an open line, so a double-click of any speed does too; a
    right click or Enter also ends it. A click on the first point closes the line; Esc cancels. The browser's own
    double click isn't reliable here (the handle under the pointer is redrawn after the first click), and the
    operating system's double-click time can be longer than the editor's own detection (400 ms; Windows: 500 ms by
    default). A double click right after a line ends doesn't edit the new line.
  - A selected line shows its points: drag them. A double-click on a point removes it; a double-click on the line adds
    one.
  - Settings of a selected line: *curved*, *closed*, *width* (the core, 0.5–5 cm; the background's is 1.48 cm).
- **The simulator's objects:** *Rectangle*, *Circle* and *Triangle*. Drag to draw; a click alone makes the
  simulator's default size (a ninth of the background's width).
  - The buttons say what an object is: obstacle, coloured area, goal, fail. For a selected object they change it.
  - Obstacles and coloured areas take a colour from the simulator's palette.
  - Handles resize rectangles (corners) and circles (the radius), and move the corners of triangles. Like the
    simulator's, objects don't turn.
- **Background:** the plain peach floor, or the simulator's four for the Edison. On the peach floor, a click makes an
  object of the size it has on the simulator's Edison track (9.6 cm).
- **From the simulator:** takes over the scene of the Lab's simulator, if it was opened (Program tab → SIM):
  - background, obstacles and coloured areas;
  - where the robot starts.

  The robot's pose becomes the active start's (its id and name stay); the other starts, the lines, goal and fail
  areas stay. Undo brings the old world back.
- **Sensors:** under the canvas, what the robot's sensors see where it is drawn, as in the simulator's sensor view.
- **Selecting and moving:** *Select* moves things; arrow keys move the selection by 0.5 cm (Shift: 5 cm). Delete
  removes it.
- **Zoom and view:**
  - The mouse wheel zooms at the pointer; the buttons zoom and show the whole floor.
  - Dragging the empty floor, or the middle button, moves the view.
  - **The view is kept with the world** (`data.view`). It is saved with the program, but changing it alone doesn't
    mark the program unsaved.
- **Wider window (↔):** the panel takes 62 % of the tab.
- **Undo and redo** (buttons, Ctrl+Z, Ctrl+Y) belong to the panel, per world. Blockly's undo covers the blocks;
  deleting a simulation world and undoing that brings back its world.
- **Keys:** they act in the canvas and don't reach Blockly, so Delete removes the drawn item, not the test block.

**How a test runs: on the Lab's simulator** (`nepoTest.simRun.ts`; the details, and what differs from the
simulator's own loop, in `nepo-unit-testing.md` §4.11):
1. **The tests:** the worker translates the world, or one of its tests (`browser.simulation_test`: a test with errors
   is left out, and the panel shows why), or the whole suite (`prepare`).
2. **The program:** always the whole program; a set-up *variable is* changes its declared start value. The program is
   compiled for the simulator (`POST /rest/projectWorkflow/sourceSimulation`, as the Program tab's simulation does it).
   The last 16 are kept.
3. **The world:** the simulator's objects (`RectangleSimulationObject`, `CircleSimulationObject`,
   `TriangleSimulationObject`, `Ground`) and its `RobotEdison` at the test's start, made offscreen:
   - their mouse handlers come off the simulator's canvas right away;
   - the robot's picture doesn't go into the simulator's robot window;
   - the microphone isn't asked for, and the robot's audio context is closed.
4. **The floor picture** (`floorCanvas`) is the simulator's sensor canvas: the background and its wall, the coloured
   areas drawn by the simulator's objects, then the world's lines (`nepoTest.sim.ts drawLines`). The tests of a world
   share it (the last few worlds' are kept).
5. **The run:** frames of 1/60 s of virtual time, as `SimulationRoberta.render` and `SimulationScene.update` do them:
   the interpreter (at most 10,000 operations per frame), then the robot's actions, then its sensors. After each frame
   in which the robot moved, the checks of areas and of the path are decided; a bump decides "never bumps into". The
   run ends when the program ends, when the time is up, when the robot touches the test's "until" area, or when the
   program fails, never at a failed check (`nepo-unit-testing.md` §4.11). It is computed in pieces of about 30 ms, so
   the page stays responsive.
6. **The report** has the shape of NepoTest's (`nepo-unit-testing.md` §4.11), so both kinds of test show alike.

The picture under the block and the sensors shown under the canvas use the same floor picture. Data saved before
2026-10-22 carries a floor picture of its own (`floor`, for NepoTest's copy of the simulator): it is dropped when the
suite is loaded.

**Recording, tolerance, running** (always the selected test):
- **Record path** runs the test on the simulator without checking its path (`record`). The run becomes the recorded
  path of the test's *stays on its recorded path* check (its `data`). Without such a check, the button is off and the
  panel says so. The panel draws the selected test's path:
  - the area the robot covered (its outline at every pose);
  - the traces of its four corners;
  - the corridor: the covered area widened by the allowed deviation (0–10 cm, slider: the check's `TOL`).
- **Forget path** removes it.
- **Run test** runs the selected test on its own, even if no *run test* block selects it; **Run all** runs every test of
  the world. A test with problems doesn't run; the panel lists them.
- **The list of tests** under the picture: ✓, ✗, – (skipped) or ○ (not run), the start's name, the test's name. A click
  selects the test (and its block).
- **Replay:** after a run, the panel replays it:
  - the robot moves along its path, with its LEDs, its sensors' values and its infrared rays;
  - the path is orange;
  - a failure is marked: the area outlined in red, or a red ✗ where the robot left the corridor;
  - under it, what each check found;
  - *Replay* plays it again, faster for long runs (at most about 8 s); the slider scrubs;
  - below the slider, the replay's tenth of a second: the block running (a chip), what the program read, its
    decisions, whether the robot hears a sound or a key is pressed ("1–1.1 s: running [steer …] · read: line tracker
    sees black: yes · [if …] yes 6×"). The Program tab outlines that block (blue), while the run is shown.
- **Run tests in the runner:** runs simulation tests like any other test. Their runs are kept, and the result line has
  *show the run*.

**Checks of behaviour** (`nepoTest.simBehaviour.ts`): what the robot does, decided from the run's record when the run
has ended. A test can check only its behaviour (no area at all); a world's rules can be such checks too.
- **What it does** is measured in every frame (1/60 s) from how the robot really moved in the simulator, its position
  and heading: *drives forward / backward* (at least 1 cm/s along its heading; 10 % power is 3.5 cm/s), *turns left /
  right* (at least 10°/s: a curve whose wheels differ by 4 % turns faster), *stands still* (neither). Curving left is
  driving forward and turning left. And its LEDs (on, off; left, right, both) and its sound (a tone or a sound file).
  A robot that drives against an obstacle jitters from frame to frame (the simulator turns the bumped wheel back): near a
  bump, the motion is measured over 100 ms, so pressing against a wall is standing still.
- **What it senses** (the conditions of *whenever*, the events of *after*) is the simulator's sensor values, whether
  or not the program reads them: the line tracker sees black, an obstacle ahead / left / right, a light sensor's %, the
  sound (loud, above 25 %), the keys.
- **When:** the program reads its sensors before the robot moves in a frame, so a frame's motion is compared with what
  the robot sensed at the end of the frame before. A program that reacts at once (a loop without a wait) passes
  *whenever …, after 0 ms*; a line follower that switches every frame needs 0 ms (with 20 ms, few of its moments
  count).
- ***from* t *ms on, the robot always* …:** every frame from t to the end. ***whenever* … *, the robot* … *, after* t
  *ms*:** every frame in which the condition has held for t ms, for as long as it holds. ***within* t *ms after* …:**
  after each event, some frame within t in which the robot does it (an event too close to the end of the run to tell
  is left out). ***at the end, variable* …:** the program's global variable when the run ends.
- **Not checked:** a condition that never held, an event that never happened: the check shows "–" with why, and the
  test is decided by its other checks.
- **A failure says what the robot did instead and when:** "it saw the line, but the robot did not turn left: it drove
  forward, turning right (8.62 cm/s, 86°/s), 17 times, 3.85 s in total; the first from 1 to 1.18 s". The replay marks
  where it first went wrong (a red ✗), and its facts are those of the moments around then (they end at most half a
  second after it went wrong); of a variable: around its last change ("it became 3 at 0.33 s").

**Why it failed: the facts** (`nepoTest.simProgram.ts`). Every run is recorded, and a failed check (and a runtime error)
comes with the facts of the second before it. The panel shows them under the check (*what happened before*, the first
one open), the runner under the failure:
- **sensed:** what the program read, per sensor and the block that read it ("line tracker sees black: no 49×, yes
  11×");
- **ran:** the decisions it took, with how often their condition held ("[if …] yes 11×, no 49×"; a `wait until`:
  "not yet 300×"; a `repeat while`: "repeated 12×"), and the blocks in effect for the motors, the LEDs and the sound,
  with the values they ran with, from when on, and the `if` part they are in ("[curve …] curves forward, left 40 %,
  right 10 % when [if …] says no");
- **remembered:** the program's global variables, at the start and at the end of that second ("claps = 2 → 3");
- **did:** how far the robot drove and turned, its wheel speeds, its LEDs, its sound, what it bumped into, the areas
  it touched.

The blocks are chips with the block's text (from the Program tab); a click opens the Program tab with the block
selected. The facts are English, like the other messages.

**Why it failed: the block to blame** (`nepoTest.simVerdict.ts`). A failed check of what the robot does, or of a
variable, gets a *why* line above its facts (in the panel and in the runner): its kind and what happened, with the
blocks as chips. The rules look at the record where the check went wrong (the failing stretch, the time after the
event), in this order:
- **decision missing:** no block read the sensor the check is about, then or at all ("no block of the program reads the
  sound sensor: it cannot notice each clap");
- **missed the moment:** the program reads it, but not while the event lasted, because a blocking block ran (a wait, a
  drive or turn for an amount, a tone): "the clap at 0.3 s (heard until 0.62 s) came while [wait ms 1000] ran …";
- **wrong decision:** a decision read another port of the sensor (the obstacle sensor to the left, not ahead); or it
  took the same part whether or not the condition held (over the whole run: a wrong threshold); or it took the part
  whose action the check doesn't want while another of its parts has one it wants (an inverted condition, swapped
  parts; for a *from … on* check, the `if` the block in effect is in). The other part's actions count as they ran, or,
  if they never ran, as their numbers are written;
- **right, but not enough:** the action the check wants came too late (nothing ran before it, or a blocking block held
  the program up); or the block in effect does what the check wants, but the robot didn't (it bumped into something);
- **wrong action:** the block in effect makes the robot do something else ("[steer … 40 … 10] makes the robot drive
  forward, turning right (left wheel 40 %, right wheel 10 %), but whenever it sees the line, it should turn left (it
  ran because [if …] said "yes")"), or no block made it do that, or its amount was done;
- **wrong value** (a variable check): the value at the end, the block that changed it last and when; and whether one
  sound or key press was counted several times (the same block, each time after a decision whose sensor kept its value:
  in the simulator a clap is heard for about 0.3 s, the Edison reports it once).

What a block does is computed from its real values, as the simulator sets the wheels (`simProgram.wheelsAfter`: backward
and negative amounts turn the speeds round; the Edison's 7 cm track and 3.7 cm wheels give cm/s and °/s), and judged
with the same thresholds as the checks. A failed check of where the robot goes (an area, a bump, the recorded path)
points to the test's first check of what it does that went wrong by then ("probably because "…" failed"), unless that
one failed because of the world (right, but not enough); otherwise it has only its facts. The words are English.

**How the record is made** (without changing the simulator's code, and without its debugger, which would highlight
blocks in the Program tab):
- **Decisions:** the compiled program's conditional jumps are found before the interpreter turns their labels into
  indexes: case k of an `if` jumps to `i_{k+1}_n` when its condition is false, a `wait until` to `w_{k+1}_n`, a
  `repeat while` to `r_e_n`; the compound's start comment carries its block's id. At run time, the value on the stack
  before such a jump is the decision; the readings since the condition began are its inputs. Counting loops aren't
  decisions here, and neither are the conditions of `?:` (later).
- **Blocks running:** as the debugger knows them: an operation's `+` begins blocks, the next operation ends those in the
  previous one's `-`. The innermost statement block running when an action operation runs is the block in effect for
  that actuator; the action's values are on the stack.
- **Readings:** the robot behaviour's `getSample` is wrapped: the value it pushed, and the block that read it.
- **Per frame** (1/60 s): the readings and decisions (counted), the statement blocks that began, the pose, the wheel
  speeds, the LEDs, the sound, bumps and touched areas, the simulator's sensor values (shared while unchanged); changes
  only of the global variables (with the block that assigned them, `set` or `change by`, and how often in the frame),
  the simulator's sensor values and the blocks in effect. And the frame before the program starts (`initial`): where
  the robot starts, what its sensors see.
- **The report** keeps the facts and the why of each failure (`facts`, `why`: `{kind, parts}`) and the record in steps
  of 100 ms (`trace`, with the motion of each step, `does`, and the simulator's sensor values at its end, `sensors`).
- **Stale runs:** a world edited after a run marks its tests' runs with "The world changed since this run."

**Data** (`nepoTest.sim.ts`, the world block's `data`, JSON):
- `version`: 3;
- `world` (`background`, `starts`, `items`: the format of `nepo-unit-testing.md` §4.11);
- `view` (`x`, `y`, `scale` in pixels per cm).

`blocks.py` turns it into each test's `simulation` and leaves `view` out. Older data is migrated:
- version 2 (a world of one test): its `start` becomes start A; its recorded path and tolerance are dropped;
- version 1 (before the world copied the simulator): the world goes onto the plain peach floor, as then; rectangles
  and ellipses become the simulator's rectangles and circles; black and white floor become coloured areas.

**Geometry:** the run uses the simulator's own code. `nepoTest.sim.ts` has what the editor needs to draw and replay
(robot outline, sensor positions, floor sampling and infrared rays, copied from the simulator), and the Bezier
segments of the lines, which the run draws on the floor picture. `simulation.py` computes the same segments and
outline (for its checks of the data, and its unused copy).

---

## 6. Limits and open points

- **Internet access:** the first run needs to reach the CDN, unless Pyodide is hosted on the Lab's own server (§4).
- **Browsers:** module workers are needed (Chrome/Edge 80+, Firefox 114+, Safari 15+).
- **Messages:**
  - failure texts from NepoTest are English;
  - block names in results are block types (`math_arithmetic`), not the block's label;
  - a translated "expected vs. got" view would help learners.
- **Error links are live:** a link in the results points to a block id of the program as it was converted. If the
  learner changes the program meanwhile, the link may point to a deleted block.
- **Suites are edited in the Tests tab only.** There's no test block inside the Program tab, and no generated tests
  yet. The JSON format and `describe()` (`nepo-unit-testing.md` §7) are the entry points for AI-generated tests,
  which the Tests tab can show once they are converted back to blocks, the inverse of `blocks.py` (not implemented).
- **Two runtimes.** BDD tests run the EdPy on NepoTest's virtual robot (`edisonv2-nepo-to-edpy.md` §11), with the
  robot's semantics. Simulation tests run on the Lab's simulator, with the simulator's semantics: sensors are states,
  powers aren't in 10 % steps, drives are measured in cm (`nepo-unit-testing.md` §4.11). The same program can pass one
  and fail the other.
- **Simulation tests:**
  - They run only in the Lab (the command line skips them).
  - Their checks are about areas, bumps, the recorded path, the robot's behaviour and its variables, and a failure
    comes with its facts and, for behaviour and variables, why (the block to blame). The rules are heuristics: they
    name what the record shows, not what the learner meant; a decision's parts are analysed only for `if` blocks (not
    `?:`), and a block whose powers are variables can't be judged if it never ran.
  - The Program tab's outline of the replayed block stays until the replay shows another block or none; it isn't
    removed when the program is edited.
  - The behaviour checks know the Edison's sensors and actuators only; they don't check powers (a curve's speeds) or
    tones' frequencies, and *after* has no "for how long".
  - Recording a path isn't undone by Blockly's undo (*Forget path* removes it).
  - Runs are kept until the page is reloaded; they aren't saved.
  - The simulator's uploaded backgrounds, markers and movable obstacles aren't supported.
  - *From the simulator* works only after the simulator was opened. There's no way back (from a test to the
    simulator).
  - There is no snapping of lines to each other.
