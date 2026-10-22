# The Tests tab: NEPO test blocks in the Lab

Learners build unit tests for their Edison V2 program **from blocks** in a third tab, **Tests**, next to Program and
Robot configuration. They run the tests in the browser and see the results per test and per block. This is part 1 of
the project goal in `CLAUDE.md`, on top of the NepoTest framework (`nepo-unit-testing.md`).

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

**Simulation tests** are the second kind of test (§5). A *simulation test* block has a small picture of its world.
Clicking it opens the **Simulation** panel, which looks and behaves like the Lab's simulator. There the learner:
- draws the world: the simulator's backgrounds, obstacles and coloured areas, lines to follow, goal and fail areas (or
  takes over the simulator's scene);
- places the robot;
- records the path the robot must keep to, runs the test, and watches the run again.

The blocks under the test say what runs: nothing means the whole program, or *call function* for one function.
**Simulation tests run on the Lab's own simulator**: its interpreter, its Edison and its objects, offscreen and in
virtual time (§5). The BDD-style tests (given / when / then) are unchanged: they run in NepoTest.

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

---

## 1. The blocks

All block types start with `nepoTest_`. They're defined at runtime in `OpenRobertaWeb/src/app/nepotest/nepoTest.blocks.ts`;
Blockly itself isn't rebuilt. They're translated to NepoTest's JSON by `NepoTest/nepotest/blocks.py`. **Keep both in
sync:** the field and input names below are the contract between them.

| Block | Looks like | Fields / inputs | Becomes (NepoTest JSON) |
|---|---|---|---|
| `nepoTest_suite` | red: *test suite: run these tests* | (next: `run` blocks) | the list and order of the tests |
| `nepoTest_run` | *run test* [name ▾] | `NAME` (dropdown of the workspace's tests; `''` shown as `?` = none chosen) | selects a test |
| `nepoTest_test` | *test* [name] *given / when / then* | `NAME`; statements `GIVEN`, `WHEN`, `THEN` | one test (`name`, `block_id`, `origin: "blocks"`) |
| `nepoTest_simtest` | *simulation test* [name], a picture of its world, *given*, *run* (empty: the whole program), *for at most* [30] *s* | `NAME`, `SECONDS`; statements `GIVEN` (clap, key, variable only: the simulator has no IR remote and no IR messages), `RUN` (one *call function*, or nothing); **the world is the block's `data`** (JSON, §5); the picture is a `FieldImage` without a value, drawn asynchronously (a PNG of the floor, the objects and the robot) | a simulation test (`simulation` with `world`, `reference`, `tolerance_cm`; `max_time_ms`, optionally `call`/`args`/`globals`, `world` events) |
| `nepoTest_given_clap` | *at* [1000] *ms: a clap* | `AT` | world `clap` |
| `nepoTest_given_key` | *at … ms: key* [▶ PLAY ▾] *is pressed* | `AT`, `PORT` (PLAY/REC) | world `key` |
| `nepoTest_given_obstacle` | *from … ms for … ms: an obstacle* [FRONT ▾] | `FROM`, `DURATION` (0 = until the end), `PORT` | world `obstacle` |
| `nepoTest_given_light` | *from … ms: light sensor* [LLIGHT ▾] *reads* [50] % | `AT`, `PORT`, `VALUE` | world `light` |
| `nepoTest_given_line` | *from … ms: the line tracker sees* [black ▾] | `AT`, `COLOR` | world `line` |
| `nepoTest_given_remote` | *at … ms: remote control code* [0 ▾] | `AT`, `CODE` (0–7) | world `remote` |
| `nepoTest_given_ir` | *at … ms: IR message* [1] | `AT`, `VALUE` (0–255) | world `ir_message` |
| `nepoTest_given_variable` | *variable* [claps ▾] *is* ⟨value⟩ | `VAR` (the program's globals), input `VALUE` | `globals` (function tests only) |
| `nepoTest_when_run` | *run the program for at most* [10] *s* | `SECONDS` | a program run, `max_time_ms` |
| `nepoTest_when_call` | *call function* [clampSpeed ▾] + one input per parameter | `FUNCTION`; inputs `ARG0…`; mutation `name` + `<arg name type/>`; fits under *when* and under a simulation test's *run* | `call`, `args` |
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
- **Run blocks follow the tests** (`tests.controller.ts`):
  - When a block is created, *run test* blocks without a test (`?`) get a test that no run block runs yet, in workspace
    order. The new block and this choice are one undo step. Loaded suites are left as they are.
  - Renaming a test renames its run blocks.
  - While a dropdown shows `?`, `?` stays in its menu. Blockly doesn't open a menu with one option, so a single test,
    function or variable could otherwise never be picked (`nameOptions` in `nepoTest.blocks.ts`).
- **Colours** follow NEPO:
  - start block: red (activity);
  - tests: green (procedure);
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
- simulation tests:
  - "test "…": the robot starts touching a goal area: move it or the goal area" (also an obstacle, a fail area, and
    "the robot starts outside the floor");
  - "in a simulation test, draw obstacles and lines into the simulation instead" (a *given* obstacle, line or light);
  - "the Lab's simulator has no IR remote control and no IR messages: use this block in a test, not in a simulation
    test" (a *given* remote control code or IR message);
  - "only "call function" belongs here";
  - "the simulation of test "…" cannot be read: draw it again";
  - the warning "test "…" checks nothing: draw a goal area or a fail area, or record the path".

A test that isn't under the start block, and a test listed twice, are **warnings**. Everything else is an error and
stops the run.

---

## 2. How it is built

```
OpenRobertaWeb/src/app/nepotest/nepoTest.blocks.ts     block definitions, toolbox, messages, empty suite
OpenRobertaWeb/src/app/nepotest/nepoTest.suite.ts      split/merge of test instances in program XML (no imports: no cycles)
OpenRobertaWeb/src/app/nepotest/nepoTest.runner.ts     client of the Web Worker (promises, cancel; prepare, runOne, finish, simulationTest)
OpenRobertaWeb/src/app/nepotest/nepoTest.sim.ts        a simulation test's world: data format, the simulator's geometry and look (for drawing and replay)
OpenRobertaWeb/src/app/nepotest/nepoTest.simRun.ts     simulation tests on the Lab's simulator: the program for a test, compiling, the run, the floor picture
OpenRobertaWeb/src/app/nepotest/nepoTest.simEditor.ts  the Simulation panel: drawing, zoom, undo, record/run, replay (no Blockly inside)
OpenRobertaWeb/src/app/nepotest/nepotest.worker.js     module Web Worker: Pyodide + nepotest.browser
OpenRobertaWeb/src/app/roberta/controller/tests.controller.ts   the tab: workspace, dropdowns, panels, running
OpenRobertaServer/staticResources/index.html          #tabTests, pane #tests (#testsBlocklyDiv, #testsSide ...)
OpenRobertaWeb/css/roberta.css                         the tab's styles (section "the Tests tab")
NepoTest/nepotest/blocks.py                            test blocks -> NepoTest JSON (+ problems with block ids)
NepoTest/nepotest/browser.py                           the functions the worker calls (JSON strings in and out)
NepoTest/nepotest/simulation.py                        simulation tests: their data and its checks (its copy of the simulator is no longer used)
```

The wiring into the Lab consists of:
- `main.js`: a path per module (also `nepoTest.sim`, `nepoTest.simRun`, `nepoTest.simEditor`), a `blockly` shim for the
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
   - a simulation test on the page, on the Lab's simulator (`nepoTest.simRun runTest`, §5).
5. `browser.finish(simulation reports)` returns the summary and the merged coverage, with the simulation tests' covered
   blocks.
6. The panel renders each report.
   - Links use `data-block` and `data-workspace` (`tests` or `program`).
   - An unexpected runtime error is shown once, as "The program failed in block … (function): …".
   - Coverage is a bar plus the list of never-executed program blocks.

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
- **A simulation test's world is the block's `data`** (Blockly's `block.data`, saved as `<data>` with JSON text).
  `blockly.xsd` allows `data` as a string, so import and listing keep it. `NepoTestSuitePersistenceTest` checks that
  the worlds of `line_follower_with_tests.xml` survive byte for byte. Copying, pasting and undoing a deleted block bring
  the world along.
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

## 5. Simulation tests: the Simulation panel

**Opening it:** clicking a simulation test, or a block in it, or its result line ("show the run"), opens the panel with
that test. The tab *Simulation* shows the test last opened.

**It looks like the Lab's simulator:**
- its backgrounds, with the striped wall around them;
- its obstacles (teal, with their shadow) and coloured areas, as rectangles, circles and triangles, in its colours;
- its robot image (`css/img/simulator/edison.png`, with its shadow);
- the line tracker and the light sensors, filled with the brightness they see;
- the infrared rays, and the LEDs' red glow.

A new test starts with the simulator's own scene: the Edison track, the robot at its start, and the standard obstacle.

```
Simulation test: follows the track to the finish
[↖ ╱ ∿ ▭ ◯ △] [▩ ■ ✓ ✗] [− + ⤢] [↶ ↷ 🗑] [⇩ ↔]      tools | what it is | zoom | undo, redo, delete | from the simulator, wider
[Edison track ▾]  ■■■■■■■■■■                      background | colours (obstacles and coloured areas)
+----------------------------------------------+
|  the simulator's background and wall         |      the drawn world, the recorded path (blue),
|      robot===>   [goal]   [fail]   ■ obstacle |      the last run (orange) and the robot replaying it
+----------------------------------------------+
line tracker white (87 %) · LLIGHT 87 % · RLIGHT 76 % · obstacle: none
[● Record path] [Forget path]  allowed deviation [——o——] 2 cm
[▶ Run test] [▶ Replay] [————————o—] 7.5 / 7.5 s
✓ passed: the robot reached the goal after 7.5 s
```

**Drawing** (`nepoTest.simEditor.ts`):
- **The robot:** drag it to its start. Turn it with its round handle, in steps of 15°; Shift turns it freely.
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
- **Background:** the simulator's four for the Edison.
- **From the simulator:** takes over the scene of the Lab's simulator, if it was opened (Program tab → SIM):
  - background, obstacles and coloured areas;
  - where the robot starts.

  The test's lines, goal and fail areas stay. The recorded path is dropped. Undo brings the old world back.
- **Sensors:** under the canvas, what the robot's sensors see where it is drawn, as in the simulator's sensor view.
- **Selecting and moving:** *Select* moves things; arrow keys move the selection by 0.5 cm (Shift: 5 cm). Delete
  removes it (not the robot).
- **Zoom and view:**
  - The mouse wheel zooms at the pointer; the buttons zoom and show the whole floor.
  - Dragging the empty floor, or the middle button, moves the view.
  - **The view is kept with the test** (`data.view`). It is saved with the program, but changing it alone doesn't mark
    the program unsaved.
- **Wider window (↔):** the panel takes 62 % of the tab.
- **Undo and redo** (buttons, Ctrl+Z, Ctrl+Y) belong to the panel, per test. Blockly's undo covers the blocks;
  deleting a simulation test and undoing that brings back its world.
- **Keys:** they act in the canvas and don't reach Blockly, so Delete removes the drawn item, not the test block.

**How a test runs: on the Lab's simulator** (`nepoTest.simRun.ts`; the details, and what differs from the
simulator's own loop, in `nepo-unit-testing.md` §4.11):
1. **The test:** the worker translates the block (`browser.simulation_test`, or `prepare` for the whole suite).
2. **The program:** for *call function*, a copy of the program whose start block calls only that function (a
   function's result goes into a variable `nepoTestReturned`); *variable is* changes the declared start values. The
   copy is compiled for the simulator (`POST /rest/projectWorkflow/sourceSimulation`, as the Program tab's simulation
   does it). The last few are kept.
3. **The world:** the simulator's objects (`RectangleSimulationObject`, `CircleSimulationObject`,
   `TriangleSimulationObject`, `Ground`) and its `RobotEdison` at the test's start, made offscreen:
   - their mouse handlers come off the simulator's canvas right away;
   - the robot's picture doesn't go into the simulator's robot window;
   - the microphone isn't asked for, and the robot's audio context is closed.
4. **The floor picture** (`floorCanvas`) is the simulator's sensor canvas: the background and its wall, the coloured
   areas drawn by the simulator's objects, then the test's lines (`nepoTest.sim.ts drawLines`).
5. **The run:** frames of 1/60 s of virtual time, as `SimulationRoberta.render` and `SimulationScene.update` do them:
   the interpreter (at most 10,000 operations per frame), then the robot's actions, then its sensors. After each frame,
   the test checks fail areas, the recorded path and goal areas. The run is computed in pieces of about 30 ms, so the
   page stays responsive.
6. **The report** has the shape of NepoTest's (`nepo-unit-testing.md` §4.11), so both kinds of test show alike.

The picture under the block and the sensors shown under the canvas use the same floor picture. Data saved before
2026-10-22 carries a floor picture of its own (`floor`, for NepoTest's copy of the simulator): it is dropped when the
suite is loaded.

**Recording, tolerance, running:**
- **Record path** runs this test on the simulator without its recorded path (`record`). The run becomes the recorded
  path (`data.reference`). The panel draws it:
  - the area the robot covered (its outline at every pose);
  - the traces of its four corners;
  - the corridor: the covered area widened by the allowed deviation (0–10 cm, slider; `data.tolerance_cm`).
- **Forget path** removes it.
- **Run test** runs this test on its own, even if no *run test* block selects it.
- **Replay:** after a run, the panel replays it:
  - the robot moves along its path, with its LEDs, its sensors' values and its infrared rays;
  - the path is orange;
  - a failure is marked: the area outlined in red, or a red ✗ where the robot left the corridor.
  - *Replay* plays it again, faster for long runs (at most about 8 s); the slider scrubs.
- **Run tests in the runner:** runs simulation tests like any other test. Their runs are kept, and the result line has
  *show the run*.
- **Stale runs:** a world edited after a run marks the shown run with "The world changed since this run."

**Data** (`nepoTest.sim.ts`, block `data`, JSON):
- `version`: 2;
- `world` (`background`, `start`, `items`: the format of `nepo-unit-testing.md` §4.11);
- `reference` (`path`: `[[x, y, heading], …]`, `time_ms`, `result`);
- `tolerance_cm`;
- `view` (`x`, `y`, `scale` in pixels per cm).

`blocks.py` turns it into the test's `simulation` and leaves `view` out. Data of version 1 (before the world copied
the simulator) is migrated:
- the world goes onto the simulator's plain white background;
- rectangles and ellipses become the simulator's rectangles and circles;
- black and white floor become coloured areas;
- the recorded path is dropped.

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
  - Runs are kept until the page is reloaded; they aren't saved.
  - The simulator's uploaded backgrounds, markers and movable obstacles aren't supported.
  - *From the simulator* works only after the simulator was opened. There's no way back (from a test to the
    simulator).
  - There is no snapping of lines to each other.
