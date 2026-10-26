# Unit tests for NEPO programs: NepoTest

**NepoTest** tests learners' **NEPO programs** for the Edison V2. The Lab converts the program to EdPy, exactly as
for the robot. The EdPy runs against a virtual robot, and everything it does is translated back to **NEPO terms**:
- which blocks ran;
- what the action blocks did (power in %, distance in cm, frequency in Hz);
- which NEPO functions were called, with which arguments and results;
- which runtime error happened in which block;
- which blocks no test executed;
- what the robot was doing over time (motors in the robot's speed steps, LEDs, sound, variables), and where it ended
  (distance, turn, position): **states** and **measurements** (§4.10);
- how it drives through a **drawn world** on the Lab's own simulator (its backgrounds, obstacles and coloured areas,
  lines to follow, goal and fail areas, starts): **simulation worlds** with many tests, each from one start, with
  checks such as "reaches", "never touches", "never bumps into", "stays on its recorded path" (§4.11). They run in the
  Lab's Tests tab, on the simulator's code, not on the EdPy engine.

Tests are written in NEPO terms too. They're either a JSON file (made for test editors and **AI test generators**) or
Python code. Learners build them from **NEPO test blocks** in the Lab's **Tests tab**, which runs them in the browser
(`nepo-test-blocks.md`). This is parts 1 to 3 of the project goal in `CLAUDE.md`: writing and running tests (§4, §5), detecting
what is worth testing (§7.2), and generating tests (§7).

```
learner's NEPO program (Lab XML)
   |  POST /rest/projectWorkflow/sourceForTest            a running Lab, built from this repository (§3)
   v
bundle: EdPy (the unchanged robot code) + source map (block id -> EdPy ranges) + the Lab's annotated XML
   |  nepotest.engine: EdPy semantics, virtual clock, scripted world    (edpy-test-engine.md)
   v
observer: statements and Ed calls -> block executions -> actions, function calls, coverage, errors per block (§6),
          and the robot's state over time (§4.10)
   |
   v
test file (JSON) or Python API  ->  results (JSON): outcome and failures per test, block ids, coverage (§4.8)
```

Code: `NepoTest/` (Python, standard library only, CPython **3.11+**). Server side: `SourceMapBean`, the recording in
`EdisonPythonVisitor`, and the REST service `sourceForTest` (§3.2).

**Status (2026-10-22):**
- **Python:** 133 tests in `NepoTest/tests` and 8 in `NepoTest/examples` pass with `unittest`. They include the
  live-Lab tests against a server built from this repository and the schema check of the example files (with
  `jsonschema` installed). The Level-0 check with the reference EdPy compiler last ran on 2026-10-18.
- **Java:** `EdisonSourceMapTest` (4 tests) and `NepoTestSuitePersistenceTest` (2 tests) pass. The golden files were
  unchanged (317/317) when last run, on 2026-09-29; simulation tests didn't touch the generator.
- **Browser:** the same suites, built from test blocks (`clap_counter_with_tests.xml`, `patrol_with_tests.xml`,
  `line_follower_with_tests.xml`), run in the Lab's Tests tab under Pyodide with identical results
  (`nepo-test-blocks.md`). The simulation tests run there on the Lab's simulator (§4.11).
- **Timings** measured on a laptop:

  | Step | Time |
  |---|---|
  | Conversion through the Lab | ≈ 50 ms |
  | Loading a bundle | ≈ 9 ms |
  | A function test | ≈ 1 ms |
  | A 4.6-second scenario with ≈ 2,750 sensor polls | ≈ 90 ms |
  | A simulation test on the Lab's simulator: the line follower's 7.4 s to the goal | ≈ 0.45 s (with compiling) |
  | The line follower's suite in the browser (3 tests, two of them simulations; Python loaded) | ≈ 1 s |

---

## 1. Quick start

```bash
# a Lab built from this repository (it has the sourceForTest service)
mvn clean install -DskipTests
./ora.sh start-from-git                      # http://localhost:1999 (Git Bash on Windows)

cd NepoTest
python -m nepotest describe examples/clap_counter.xml         # what's in the program, and what to test (JSON)
python -m nepotest convert  examples/clap_counter.xml         # -> examples/clap_counter.bundle.json
python -m nepotest run      examples/clap_counter.tests.json  # run a test file
python -m nepotest run      examples/clap_counter_with_tests.xml   # run the test suite saved in a program (Tests tab)
python -m nepotest run      examples/patrol.tests.json        # state tests: motors, LEDs, sound, reactions, the square
python -m nepotest run      examples/line_follower.tests.json # simulation tests are skipped: they run in the Tests tab
python -m unittest discover -s tests -t .                      # the framework's own tests
```

Output of the example test file (one test fails on purpose: it catches generator quirk #14):

```
PASSED  clampSpeed keeps 42
PASSED  clampSpeed limits 150 to 100
PASSED  clampSpeed raises -5 to 0
FAILED  average of 4 and 6 is 5
        returns: expected 5, got 7
PASSED  blink 2 times switches the left LED on and off twice
PASSED  three claps: blink three times, then drive 10 cm at full power
PASSED  with two claps the robot keeps waiting and never drives
PASSED  a clap at the very start is swallowed by the setup block
7 passed, 1 failed, 0 errors; block coverage 47/47
```

The same in Python:

```python
from nepotest import TestSubject, World

subject = TestSubject.load('examples/clap_counter.xml', bundle='examples/clap_counter.bundle.json')
assert subject.call('clampSpeed', 150).returned == 100
run = subject.run(World().clap(1000).clap(2000).clap(3000))
assert run.finished and run.variables['claps'] == 3
assert run.actions_of('robActions_motorDiff_on_for')[0]['power'] == 100
```

---

## 2. The example program and the concepts

`NepoTest/examples/clap_counter.xml` is an Edison V2 expert-mode program, built from real block XML:

```
variables  claps := 0, goal := 3
main       while claps < goal:  wait until clap;  claps := claps + 1
           blink(claps)
           drive forward, power clampSpeed(150), 10 cm
functions  clampSpeed(speed) returns: if speed > 100 return 100; if speed < 0 return 0; return speed
           average(a, b) returns (a + b) / 2          (not called; it shows generator quirk #14)
           blink(times): repeat times: LED left on, wait 200 ms, LED left off, wait 200 ms
```

| Concept | Meaning |
|---|---|
| **test subject** | a NEPO program converted by the Lab: the NEPO model (blocks, variables, functions), the EdPy, the source map. `TestSubject`. |
| **bundle** | the conversion saved as JSON (`*.bundle.json`), so tests run without a server (§3.3) |
| **call** | a function test: runs the program's setup and declarations, then calls one NEPO function. The main program doesn't run. |
| **run** | a program test: the whole program against a **world** |
| **world** | what happens around the robot, in NEPO ports: claps, key presses, obstacles, light, line, IR (§4.4) |
| **action** | one execution of an action block, with the NEPO values it used (§4.7) |
| **call record** | one call of a NEPO function: arguments, result, times |
| **coverage** | which generated blocks executed, across one or many tests (§6.5) |
| **state** | what the robot is doing at a moment: its motors, LEDs, sound, and the program's variables (§4.10) |
| **timeline** | the robot's states over a run, as moments (a start time and a snapshot); measurements are taken at its end |
| **status** | of a run: `finished`, or still running when the budget ran out (`time_limit`, `step_limit`), or `error` |
| **error** | a runtime problem (16-bit overflow, division by zero, list index out of range, …) with the block where it happened |
| **virtual time** | milliseconds from program start. Nothing runs in real time; a 60-second scenario takes milliseconds. |
| **simulation test** | a test of a **simulation world**, a world drawn once on the Lab's own simulator: the robot starts at one of the world's starts, the whole program runs, its sensors read the world, and the test's checks (and the world's rules) decide whether it passes (§4.11) |

---

## 3. Conversion through the Lab

### 3.1 The REST protocol (verified)

It's the Lab frontend's own protocol. `nepotest.lab.LabClient` implements it with `urllib`:

| Request (`POST`, JSON) | Body | Answer |
|---|---|---|
| `/rest/init` | `{"log": [], "data": {"cmd": "init", "screenSize": [w, h]}}` | `rc`, `initToken`, `server.robots` |
| `/rest/admin/setRobot` | `{"log": [], "initToken": t, "data": {"cmd": "setRobot", "robot": "edisonv2", "extensions": {}}}` | `rc`, `robot` |
| `/rest/projectWorkflow/sourceForTest` | `{"log": [], "initToken": t, "data": {"programName", "progXML", "confXML", "SSID": "", "password": "", "language": "en"}}` | like `/projectWorkflow/source` (`rc`, `message`, `sourceCode`, `progXML` with annotations, `confAnnos`), **plus `sourceMap`** |

- `progXML` is the `<block_set>` of the program and `confXML` that of the configuration. `LabClient` splits an export
  file itself. The Edison's configuration is fixed, and a default is used if the file has none.
- An invalid `initToken`, for example after a server restart, makes `LabClient` start a new session once.
- A Lab without the service answers 404, which becomes `LabError: … must be built from this repository`.

### 3.2 The source map

```json
{"version": 1, "blocks": {"cc43": {"type": "actions_led_edison", "ranges": [[1127, 1144]]}, "...": {}}}
```

- For every block id: the block type, and the char ranges `[start, end)` of the EdPy generated for the block, without
  surrounding whitespace.
- Nested blocks have nested ranges, e.g. an `if` contains its condition's compare block, which contains a sensor
  block.
- A block can have several ranges, when the generator emits its code more than once.
- **How it's made:**
  - `EdisonPythonVisitor` overrides the visitor hooks `preVisitCheck`/`postVisitCheck` (`BaseVisitor`). Before and
    after each phrase with a block id, it records the length of the source buffer. It never writes to the buffer.
  - `EdisonPythonGeneratorWorker.getVisitor` registers a `SourceMapBean` (in `OpenRobertaRobot`) on the project.
  - `ProjectWorkflowRestController.getSourceCodeForTest` returns it, through the hand-written
    `ProjectSourceForTestResponse`. The REST entity generator isn't in the repository.
- **The robot code is unchanged.** The golden files still pass (317/317), and `/source`, `/run` and the other services
  are untouched. `EdisonSourceMapTest` checks the ranges. For example, the LED block of `logic_operation` maps to
  exactly `Ed.LeftLed(Ed.ON)`, and a function block to its `def`.
- Offsets count Java chars (UTF-16), which equal Python chars except outside the Basic Multilingual Plane.
  `SourceMap.offset()` converts CPython's UTF-8 byte columns.
- Only the Edison generator fills the map. For other robots `sourceForTest` answers without `sourceMap`, and
  `LabClient` reports that.

### 3.3 Bundles and caching

A bundle stores everything the tests need, as one JSON object:

| Field | Content |
|---|---|
| `format`, `version` | `"nepotest-bundle"`, 1 |
| `robot`, `lab`, `program_name`, `converted_at` | where and when it was converted |
| `xml`, `xml_sha256` | the NEPO program, and its hash |
| `rc`, `message`, `cause` | the Lab's result |
| `edpy`, `source_map`, `annotated_prog_xml` | the generated code, the source map, the Lab's annotated XML |

- `TestSubject.load(program, bundle=path)` uses the bundle if its hash matches the program. Otherwise it converts with
  the Lab and saves a new bundle. `NEPOTEST_RECONVERT=1` forces a conversion; `NEPOTEST_LAB` sets the URL.
- **Stale bundles:** when the generator changes, cached EdPy is outdated. `tests/test_lab_live.py` converts every
  cached program again and compares; it only runs when a Lab answers. Re-create a bundle with
  `python -m nepotest convert <xml> -o <bundle>`.

### 3.4 Programs the Lab rejects

- A program with block errors isn't converted. For example, the Edison validator rejects a tone with a variable
  frequency (`NO_CONST_NOT_SUPPORTED`).
- The Lab answers `rc: "error"`, with `message: "ORA_PROGRAM_INVALID_STATEMETNS"` (sic), and marks the offending
  blocks in the annotated XML: `<error>NO_CONST_NOT_SUPPORTED</error>`.
- `TestSubject` then raises `ConversionError`, whose `block_errors` are `[(block_id, block_type, key)]`. Verified
  live.
- This is "Level 0" in NEPO terms: the program can't run on the robot at all.
- The robot compiler's own verdict is `subject.check_with_edpy()`, if the reference compiler is configured
  (`edpy-reference.md` §2).

### 3.5 Running the Lab

- Build with `mvn clean install -DskipTests`, while no server runs.
- Start with `./ora.sh start-from-git`. The database is `OpenRobertaServer/db-embedded`, which is created if missing.
- It's ready when `http://localhost:1999/` answers; `sourceForTest` needs no login.
- One Lab serves any number of test runs. Conversions are independent requests.

---

## 4. Test files (JSON)

### 4.1 Structure

```json
{"format": "nepotest", "version": 1,
 "program": "clap_counter.xml",
 "bundle": "clap_counter.bundle.json",
 "defaults": {"max_time_ms": 10000},
 "tests": [ {test}, ... ]}
```

`program` and `bundle` are relative to the test file, and `bundle` is optional. The schema is
`NepoTest/schema/nepo-tests.schema.json` (JSON Schema 2020-12). `nepotest.validate_spec(spec, subject)` checks the
same rules, plus names against the program (§4.9).

A **test**:

| Key | Meaning |
|---|---|
| `name` (required, unique), `description`, `origin` | `origin` says who wrote it, e.g. `"learner"`, `"teacher"`, `"blocks"`, `"ai:<model>"` |
| `block_id` | the test block the test was built from (Tests tab); results carry it back |
| `call`, `args`, `globals` | a function test: call NEPO function `call` with `args`, after setting global variables `globals` |
| `world` | events (§4.4), for runs and for calls |
| `max_time_ms`, `max_steps` | budgets. Defaults: 60,000 ms virtual; 2,000,000 steps for runs, 100,000 for calls. |
| `expect` (required) | expectations (§4.5); all must hold |
| `should` | `"pass"` (the default) or `"fail"`: a test that should fail passes if its expectations (or its simulation) fail, and fails if they hold (§4.8). The test blocks' *this test should* [pass / fail]. |

NEPO values are ints (−32768…32767), booleans, and lists of ints. There are no floats and no strings: the Edison has
none.

### 4.2 Function tests

```json
{"name": "clampSpeed limits 150 to 100", "call": "clampSpeed", "args": [150], "expect": {"returns": 100}}
```

- The program's helpers, the fixed setup block (≈ 254 ms of virtual time) and the variable declarations run first,
  then only the function.
- Functions it calls run too, and so do its actions (LEDs, waits, driving), which can be expected like in a run.

### 4.3 Program runs

```json
{"name": "three claps", "world": [{"event": "clap", "at": 1000}, {"event": "clap", "at": 2000}, {"event": "clap", "at": 3000}],
 "expect": {"status": "finished", "variables": {"claps": 3}}}
```

- A run ends when the program ends (`finished`), when it fails (`error`), or when a budget runs out.
  - `time_limit`: virtual time is up, e.g. the program waits for an event that never comes, or has a forever loop.
  - `step_limit`: a loop that never calls the robot, where time doesn't move.
- `"status": "running"` accepts either budget status. Robot programs that run forever are normal: expect `running`.

### 4.4 World events

Times are virtual ms from program start.

| Event | Keys | NEPO block that sees it | Semantics |
|---|---|---|---|
| `clap` | `at` | sound sensor | **latched**: stays until the program reads it; the read clears it. Two claps between two reads count once. |
| `key` | `port`: `PLAY` / `REC`, `at` | key sensor | latched; PLAY and REC before one read satisfy neither key block (quirk #31) |
| `obstacle` | `port`: `FRONT` / `LEFT` / `RIGHT`, `from`, `to` (null = forever) | infrared sensor (obstacle) | present during [from, to); seen only while the obstacle beam is on (the generated helper turns it on at first use) |
| `light` | `port`: `LLIGHT` / `RLIGHT` / `LINETRACKER`, `value`, `at` | light sensor (light) | state from `at` on; `value` is what the block reports |
| `line` | `color`: `black` / `white`, `at` | light sensor LINETRACKER (line) | state; white until set |
| `remote` | `code` 0–7, `at` | IR seeker (remote code) | latched |
| `ir_message` | `value` 0–255, `at` | IR receive block | latched |
| `strain` | `from`, `to` | (drive strain) | state |

**Timing facts every test author needs** (all verified):
- Every generated program starts with a fixed setup block: `Ed.ReadClapSensor()` at t ≈ 1 ms, then a 250 ms wait.
  User code starts at ≈ 254 ms. A clap at t ≤ 1 ms is swallowed; claps during the wait are kept.
- Generated code reads the clap sensor right after every drive or stop block, to discard motor noise. A clap scripted
  during a drive is discarded, like on the robot.
- "Wait until" polls the sensor about every millisecond of virtual time (each read costs 1 ms, an assumption), so
  event times are resolved to about 1 ms.

### 4.5 Expectations

| Key | Applies to | Passes if |
|---|---|---|
| `returns` | call | the function returned this value (matcher, §4.6) |
| `status` | run | `finished`, `running`, `time_limit` or `step_limit` |
| `finished_within_ms` | run | finished, at virtual time ≤ n |
| `variables` | both | these global variables have these values at the end |
| `actions` | both | these actions happened **in this order**; other actions may be in between |
| `actions_exactly` | both | these are all actions, in order |
| `no_actions` | both | none of the actions matches any of these |
| `action_count` | both | `{"<block type>": n}`: executions per action block type; or `[{"match": matcher, "count": n}]`: actions matching each matcher (n may be a matcher) |
| `calls` | both | these NEPO function calls happened in this order (`function`, `args`, `returns`) |
| `error` | both | `null` (the default: no runtime error allowed), `"any"`, an error **kind**, or a matcher on `kind`, `block_id`, `block_type`, `function` |
| `covers` | both | these block ids were executed |
| `states` | both | what the robot is doing, and when: `[{"state": ..., <timing>}]` (§4.10) |
| `distance_cm` | both | at the end: the distance driven, mean of both wheels, backward negative (§4.10) |
| `heading_deg` | both | at the end: the change of heading, counterclockwise (left) positive (§4.10) |
| `end_position` | both | at the end: `{"ahead_cm", "left_cm", "tol_cm"}`, relative to the start (§4.10) |

Runtime error kinds: `overflow`, `division_by_zero`, `index_out_of_range`, `shift_out_of_range`, `negative_value`,
`type_error`, `recursion`, `step_limit` (a call that doesn't return), `invalid_arguments`, `invalid_list`,
`unsupported`, `python_error`. The engine also has kinds for programs EdPy rejects (`edpy_incompatible`, `syntax`,
`unknown_ed`, …); generated programs don't produce them.

### 4.6 Matchers

- An action or call matcher is an object: every key must be present in the action or call, and its value must match.
- A value matches if it's equal (numbers numerically; booleans only booleans), within `{"min": a, "max": b}`, within
  `{"approx": x, "tol": d}`, or if it doesn't match `{"not": v}`.

Example: `{"block": "robActions_motorDiff_on_for", "power": {"min": 90, "max": 100}}`.

### 4.7 Actions

Every action has these keys:
- `t`: start time, in ms;
- `block`: the block type;
- `block_id`;
- `function`: the NEPO function it runs in, `null` for the main program;
- `action`: the kind, independent of the block variant (`led`, `drive`, `turn`, `curve`, `stop`, `motor`, `tone`,
  `sound_file`, `ir_send`, `wait`, `wait_for`, `sensor_reset`), so `{"action": "drive"}` matches drives with and
  without distance;
- `dir`: for blocks with a direction, the normalized one (`forward`, `backward`, `right`, `left`).

The values come from the NEPO block's fields (e.g. `port`, `direction`: literally what the XML says) and from the
values the program computed (e.g. `power` is the evaluated power input in %, before the Edison's `(p + 5) / 10`
conversion to a speed level).

| Block | Keys |
|---|---|
| `actions_led_edison` | `port` (`LLED`/`RLED`), `mode` (`ON`/`OFF`) |
| `robActions_motorDiff_on_for` / `_on` | `direction` (`FOREWARD`, `BACKWARDS`/`BACKWARD`), `power`; `distance_cm` (`_for` only) |
| `robActions_motorDiff_turn_for` / `_turn` | `direction` (`RIGHT`/`LEFT`), `power`; `degrees` (`_for` only) |
| `robActions_motorDiff_curve_for` / `_curve` | `direction`, `power_left`, `power_right`; `distance_cm` (`_for` only) |
| `robActions_motorDiff_stop` | – |
| `robActions_motor_on` / `robActions_motor_stop` | `port` (`LMOTOR`/`RMOTOR`); `power` (on) |
| `robActions_play_tone` | `frequency_hz` (NEPO value; the buzzer plays 4×, quirk #26), `duration_ms` |
| `mbedActions_play_note` | `frequency_hz`, `duration_ms` (from the block's fields) |
| `robActions_play_file` | `file` (0–4) |
| `edisonCommunication_ir_sendBlock` | `value` |
| `robControls_wait_time` | `ms` |
| `robControls_wait_for` | `t_end`: when the awaited condition was read as true |
| `edisonSensors_sensor_reset` | `sensor` |

The NEPO field spellings are the XML's own (`FOREWARD`; `BACKWARDS` in the `_for` blocks, `BACKWARD` in the others),
so tests and AI generators can copy them from the program. All these decoders were verified on the golden
`action.xml` and `sensors.xml` programs (`tests/test_framework.py`).

### 4.8 Results

`python -m nepotest run tests.json --json results.json`, or `nepotest.run_spec(spec, subject)`, returns:

```json
{"format": "nepotest-results", "version": 1, "program": "clap_counter.xml",
 "summary": {"passed": 7, "failed": 1, "error": 0},
 "coverage": {"blocks_total": 47, "blocks_covered": 47, "ratio": 1.0, "uncovered": []},
 "tests": [
  {"name": "average of 4 and 6 is 5", "outcome": "failed",
   "failures": [{"expect": "returns", "expected": 5, "actual": 7, "message": null}],
   "error": null, "returned": 7, "time_ms": 254.0, "variables": {"claps": 0, "goal": 3},
   "actions": [], "calls": [{"function": "average", "args": [4, 6], "returned": 7, "t": 254.0, "t_end": 254.0, "completed": true}],
   "covered_blocks": ["cc02", "cc03", "..."]}]}
```

- `outcome` is `passed`, `failed` (an expectation didn't hold, including an unexpected runtime error), or `error`: the
  *test* is broken, e.g. it passes a string as a NEPO value. That separates bad tests from bad programs, which
  matters when tests are generated. (`skipped`: a simulation test outside the Lab, §4.11.)
- **A test that should fail** (`"should": "fail"`, `spec.apply_should`; for simulation tests `nepoTest.simRun applyShould`):
  - if it failed, its `outcome` is `passed`, with `"expected_failure": true`, and its `failures` stay, so the report
    still says what failed;
  - if it passed, its `outcome` is `failed`, with the failure `{"expect": "should", "message": "the test should fail,
    but it passed"}`;
  - an `error` stays an error. The CLI shows such a pass as `PASSED  name (failed, as it should)`; the Tests tab as
    "failed, as it should".
- Failures name the expectation, like `variables.claps` or `actions[1]`, and give the expected and actual values. For
  action expectations, `actual` is the (shortened) list of actions.
- `uncovered` lists blocks that no test executed, as `{block_id, type, function}`.
- The CLI's exit code is 0 only if every test passed.

### 4.9 Validation

- `validate_spec(spec)` checks the structure: unknown keys, duplicate names, bad world events, `status` on a call, and
  `returns`/`args` without `call`.
- `validate_spec(spec, subject)` also checks that functions and variables exist, and that the number of arguments
  fits.
- State expectations are checked completely: the state kinds and their values, exactly one timing per entry, the
  events and conditions, the variable names, and `finished_within_ms` only on runs.
- The CLI refuses to run an invalid file. Validate generated tests **before** running them, and give the problems
  back to the generator.

### 4.10 States and measurements

Actions say what the program *commanded*. States say what the robot *is doing* at a moment, and a timing says when it
must hold. This tests the robot's behaviour, not the program's commands: "the left motor runs at 50 %" holds whichever
blocks made it so.

```json
{"name": "drives forward until the obstacle, then stops within 100 ms",
 "world": [{"event": "obstacle", "port": "FRONT", "from": 2000, "to": 2500}],
 "expect": {"states": [
   {"state": {"robot": "forward", "power": 50}, "at": 1500},
   {"state": {"robot": "still"}, "after": {"event": "obstacle"}, "within_ms": 100},
   {"state": {"led": "left", "is": "on"}, "always": {"from": 300, "to": 2000}},
   {"state": {"led": "left", "is": "off"}, "at": "end"}]}}
```

**States** (`m`: a value or a matcher, §4.6):

| State | Holds when |
|---|---|
| `{"motor": "left" / "right" / "both", "is": "forward" / "backward" / "running" / "stopped", "power": m}` | the motor(s) run that way; `power` optional, only for a running motor |
| `{"robot": ..., "power": m}` | the wheels together: `forward`, `backward` (same speed), `turn_left`, `turn_right` (opposite directions), `curve_left`, `curve_right` (different speeds, or one wheel stands; the front swings left or right, also when reversing), `still`. `power` only for drives and turns. |
| `{"led": "left" / "right" / "both" / "either", "is": "on" / "off"}` | the LED(s) |
| `{"sound": "silent" / "any" / "tone" / "file" / "beep", "frequency_hz": m}` | the sound playing. `tone`: the tone and note blocks, with the NEPO frequency (the buzzer itself plays 4× or 8× that, quirk #26). `file`: a sound file (a tune). |
| `{"variable": "x", "value": m}` | a global variable of the program, over time (not only at the end) |
| `{"all": [...]}`, `{"any": [...]}`, `{"not": <state>}` | combinations |

**Power is compared in the robot's steps.** The Edison has speed levels 1 to 10. A NEPO power p becomes level
`(p + 5) / 10`, rounded down (`_shorten`). A power below 5 % stops the motor, a negative power reverses it, and a level
above 10 runs at 10. A state reports the power as level × 10. A plain number in `power` is rounded the same way:
45 to 54 all mean 50, and 150 means 100. A matcher (`{"min": 45}`) compares with the power the robot runs at. So tests
catch what the robot really does: "motor on at 3 %" leaves the motor stopped.

**Timings** (exactly one per entry):

| Key | Passes if the state holds ... |
|---|---|
| `"at": "end"` | when the run ends: the program finished, the budget ran out, or the called function returned |
| `"at": ms` | at that time, after all changes at that time |
| `"always": {"from": a, "to": b}` | the whole time in the window. Both keys are optional: from the program's own start (after the setup block, ≈ 254 ms) to the end. |
| `"never": {...}`, `"sometime": {...}` | at no time, or at some moment, in the window |
| `"after": <event>, "within_ms": n, "each": true` | at some moment within n ms after each of these world events (`"each": false`: the first one). A reaction test. |
| `"while": <condition>, "delay_ms": n` | the whole time the world condition holds, from n ms after it began |
| `"for_ms": m` | for that long in total, added up over the run |
| `"starts": m` | that many times: how often it began (from not holding to holding), e.g. blinks |

- **Events** (for `after`): `clap`, `key` (optional `port`), `obstacle` (optional `port`; `"edge": "start"` (default)
  or `"end"`), `line` (`"color"`: the moments the line tracker starts to see it), `remote`, `ir_message`.
- **Conditions** (for `while`): `{"obstacle": "FRONT" / "LEFT" / "RIGHT" / "any"}`, `{"line": "black" / "white"}`
  (white until the first line event), `{"light": port, "value": m}` (0 until the first light event).
- Both come from the test's `world`. An event that isn't there, or a condition that never holds, is a failure that
  says so (the Tests tab reports it before the run).

**The timeline** (`nepotest/states.py`):
- The engine logs every change of the motors, LEDs and sound, with its time and the Ed call that caused it
  (`Robot.state_log`, `edpy-test-engine.md` §6.4). The observer adds which block made each call, and, if a test has
  variable states, every change of a global variable (sampled before every statement; it costs a little, so it's on
  only for those tests).
- Moments: a start time and a snapshot, each lasting until the next one.
- **The changes one block makes within 10 ms are one change** (`MERGE_MS`). The curve helper starts the wheels with two
  calls 1 ms apart, and stops the second wheel 1 ms after the first has driven its distance. Nobody means the 1 ms
  pivot in between.
- **Computation takes no time**, so `x := 1; x := 2` happen at the same virtual time. The value 1 still makes a moment
  of zero length: "at some point x = 1" holds. States of the robot ignore zero-length moments that didn't change them.

**Failures say what was expected and what happened**, in words, and `block_id` is the program block that made the
relevant change (the Tests tab links it). From the example file:

```
states[0]: while an obstacle is there (FRONT), from 2000 ms: expected (after 50 ms): the robot stands still,
           but at 2207 ms the robot drives forward at 50 % (since 2207 ms)
```

**Measurements** at the end of the run, relative to the start (the robot faces ahead; left is to its left):

| Key | Measures |
|---|---|
| `distance_cm` | the mean of both wheels' travel, backward negative (a turn on the spot adds nothing) |
| `heading_deg` | the change of heading, counterclockwise (left) positive, not wrapped: a square driven to the right gives −360 |
| `end_position` | `{"ahead_cm": a, "left_cm": l, "tol_cm": t}`: the robot ended within t cm of that point |

Every test report has `pose`: `{"x_cm", "y_cm", "heading_deg", "distance_cm"}` (x ahead, y left).

**How reliable they are** (see `edpy-test-engine.md` §7):
- **Robust:** "at the end", always / never / at some point, counts, and reactions to events. Distances and turns after
  "drive … cm" and "turn … °" blocks follow EdPy's tick maths.
- **Approximate:** when a distance drive ends, and every absolute time after it (the wheel speed is an assumption:
  2.5 cm/s per level). The same holds for the distance of a drive that a wait stops. Durations include 1 ms per Ed
  call, so an LED switched on for "200 ms" is on for 202 ms. Use ranges, or "about" in the blocks (± 5 %, at least
  10 ms).
- **Not modelled:** what the robot does after the program ends, and the world's geometry (§9).

**The example:** `examples/patrol.xml` drives until an obstacle, beeps, drives a 20 cm square with a counter, and runs
the left motor alone. Its functions are `square(side)`, `blink(times)` and `curveLeft()`. `patrol.tests.json` has 7
state tests. One fails on purpose: after the beep, the program drives the square at once, into the obstacle that is
still there. `patrol_with_tests.xml` is the same suite made of test blocks.

### 4.11 Simulation tests

A **simulation test** is a test of a **simulation world**: a world the learner draws once (the Tests tab's
*Simulation* window, `nepo-test-blocks.md` §5), with the places the robot can start. A world holds many tests. Each
test starts the robot at one of the world's starts (and can set up the past: claps, keys, variables), runs the whole
program, and checks what the robot did. **It passes only if every check holds**, and the program doesn't fail. It has
no `expect`. (Until 2026-10-26, a simulation test had a world of its own, and its goal and fail areas decided.)

**It runs on the Lab's own simulator** (since 2026-10-22), in the Tests tab
(`OpenRobertaWeb/src/app/nepotest/nepoTest.simRun.ts`), not on the EdPy engine:
- **The program** is compiled for the simulator, as the Program tab's simulation does it (`POST
  /rest/projectWorkflow/sourceSimulation`): the stack machine's program, not EdPy. It is always the whole program;
  `globals` (the set-up's variables) replace the start values the program declares.
- **The simulator's own code runs it:**
  - the interpreter (`interpreter.interpreter`, `interpreter.robotSimBehaviour`);
  - the Edison (`robot.edison`): `EdisonChassis` with its motion and bumping, the line tracker, the light and obstacle
    sensors, the LEDs, the keys and the sound sensor;
  - the simulator's objects: obstacles, coloured areas, the ground.

  The floor picture the sensors read is drawn as the simulator draws its sensor canvas (`SimulationScene.drawColorAreas`),
  with the coloured areas drawn by the simulator's objects.
- **Offscreen:** nothing is shown while a test runs. The Simulation window replays the run.
- **The command line and the Python API** don't run simulation tests. `run_spec` reports them as `skipped` ("simulation
  tests run on the Lab's simulator: run them in the Tests tab"); `simulation.py` still checks their data. Until
  2026-10-22, `simulation.py` ran them with a copy of the simulator that moved the EdPy engine's robot (`SimRobot`,
  `run_simulation_test`). That copy is kept, with its tests, but nothing uses it.

```json
{"name": "follows the track to the finish", "max_time_ms": 20000,
 "simulation": {
   "world_name": "Edison track",
   "world": {"background": "simpleBackgroundEdison",
             "starts": [{"id": "A", "name": "A", "x": 46.67, "y": 10, "heading": -30},
                        {"id": "B", "name": "B", "x": 49.87, "y": 39.25, "heading": -84.2}],
             "items": [{"id": "obstacle", "name": "Obstacle", "kind": "rect", "role": "obstacle", "x": 64.07, "y": 50.74, "w": 9.63, "h": 9.63},
                       {"id": "finish", "name": "Finish", "kind": "circle", "role": "goal", "x": 28, "y": 67.5, "r": 3.5},
                       {"id": "shortcut", "name": "Shortcut", "kind": "rect", "role": "fail", "x": 55, "y": 28, "w": 10, "h": 10}]},
   "start": "A",
   "until": "finish",
   "checks": [{"check": "never_touches", "item": "shortcut", "rule": true},
              {"check": "reaches", "item": "finish"},
              {"check": "path", "path": [[46.67, 10, -30], [47.04, 10.24, -34.3], ...], "time_ms": 7383.3, "tolerance_cm": 2}]}}
```

- **`start`:** the id of one of the world's `starts` (each: `id`, `name`, `x`, `y`, `heading`).
- **`until`:** optional, the id of an area (goal, fail or coloured): the run ends when the robot touches it. If the
  robot starts on it, it has to leave it first.
- **`max_time_ms`:** the run ends then at the latest (default 30 s). It also ends when the program ends, or fails.
- **`checks`:** what must hold. A check with `"rule": true` is a rule of the world: the Tests tab copies the world's
  rules into each of its tests.

| Check | Holds if | `item` |
|---|---|---|
| `reaches` | the robot's outline touches the area at some time | an area; none: any goal area |
| `never_touches` | it never touches the area | an area; none: any fail area |
| `ends_in` | the whole outline is in the area when the run ends | an area |
| `never_bumps` | it never bumps into the obstacle (its wheels are turned back, as in the simulator) | an obstacle; none: anything, the wall too |
| `path` | a corner or the middle of an edge of the robot's outline never gets farther than `tolerance_cm` (default 2) from the robot's outline at some pose of `path`, the recorded run | – (`path`, `time_ms`, `tolerance_cm`; no `path`: not recorded yet, the check checks nothing) |

**A run never stops at a failed check:** every check is decided, after every simulator frame in which the robot moved.
`reaches` that hasn't held at the end fails; the `never_…` checks and `path` that haven't failed hold. After a runtime
error, the checks still open aren't decided (`passed: null`), and the test fails. The bumped obstacle is the one at most
1 cm from the robot's outline (none: the wall).

- **Coordinates:** cm from the background's top left corner; x points right and y down, as on the screen. Angles are
  degrees, counterclockwise as seen from above, 0 pointing right. `start` is the robot's pose: the centre of its wheel
  axle and where it faces. The simulator itself works in units of 1/3 cm, with the background at (10, 10):
  u = 10 + 3 × cm.
- **`background`:**
  - `peach` (the default for a new test): the tests' own floor, plain light peach (`#f7d1b3`), 300 × 200 cm, without
    the simulator's striped wall. Its edge is still the floor's edge: the robot bumps into it, and the obstacle
    detection sees it, as at the simulator's wall. The sensors read 83 % on it.
  - The Edison's backgrounds in the simulator: `simpleBackgroundEdison` (the simulator's default), `drawBackground`
    (white), `rescueBackground`, `mathBackground`. The floor has the simulator's wall around it, 10 units wide, which
    the robot can't leave.
- **A new world** (`simulation.default_world`, `nepoTest.sim.ts defaultWorld`): the peach floor, start A in its middle
  (150, 100) facing right, and nothing on it.
- **Items:**
  - The simulator's objects: `rect` (top left `x`, `y`; `w`, `h`; not rotated, as there), `circle` (`x`, `y`, `r`) and
    `triangle` (`points`). Their `role`:
    - `obstacle`: the robot bumps into it and the obstacle detection sees it (default colour `#33B8CA`);
    - `color`: a coloured area the line tracker and the light sensors see (`color`, default `#FBED00`);
    - `goal`, `fail`: areas for the checks; the robot touches them but doesn't see them. They are what the checks are
      usually about, but any area works (a check "never touches" a coloured area, too).
  - `name`: optional, what the blocks show (without one: its kind and number, "Goal 2").
  - The test's own `line` (`points`; optionally `smooth`, a Catmull-Rom curve through them; `closed`; `width`, the
    black core): drawn like the track of `simpleBackgroundEdison`, a black core of 4.44 units on a white band of 16
    units.
  - Drawing order on the floor: the background, the wall, the coloured areas, every line's band, every line's core.
- **The set-up:** a simulation test's `world` events may only be `clap` and `key` (the past, or events during the
  run). The drawn world gives the obstacles, the line and the light. The simulator has no IR remote control and no IR
  messages: the Tests tab rejects those blocks in simulation worlds. `globals` need no `call`.
- **No `call`, no `args`:** a test of a world always runs the whole program.
- **`skip`: true:** the test doesn't run (`skipped`). **`should`: "fail"** turns only the test's own checks round
  (and a runtime error): a failed rule fails the test anyway.

When the program ends, the robot moves for the rest of that frame and then stops, as in the simulator.

**What a test run does differently from the simulator's own loop** (`SimulationRoberta.render`,
`SimulationScene.update`):

| The simulator | A test run |
|---|---|
| real time: a frame whenever the browser draws one (about 60 per second) | virtual time: every frame is 1/60 s, and a run takes only as long as the browser needs to compute it |
| in a frame, the interpreter runs as many operations as fit into about 15 ms (it stops at the first action anyway) | at most 10,000 operations per frame (`OPS_PER_FRAME`), so a run gives the same result every time |
| a program starts 250 ms after *start*; the sensors already measure | one frame of measuring, then the program |
| tones play (WebAudio), and the program waits until they end | no sound: a tone takes its time (a sound file: its length in `WebAudio`) |
| the microphone; the keys on the robot's picture | "given" claps reach the sound sensor through the simulator's volume meter (`volume-meter.js`): it jumps to full volume, then gets 5 % quieter every 512 samples at 48 kHz, so the sensor hears the clap (above 25 %) for about 0.3 s. "Given" keys are held for 200 ms |
| the pen trail, movable obstacles, markers, uploaded backgrounds | not used: the trail is off, and the editor makes none of the others |

**Measured** (in a browser, 2026-10-22):
- **Motion:** the line follower ran from the same pose on the Edison track, in the simulator (the Program tab) and in
  a test. The two paths stayed within 0.15 cm of each other for 7.4 s.
- **The floor picture:** with a rectangle, a circle and a triangle as coloured areas, the test's picture and the
  simulator's sensor canvas were identical, pixel for pixel.
- **Calls, variables, keys, tones:**
  - the clap counter's functions: `average(4, 8)` returned 6, and `clampSpeed(150)` returned 100;
  - its variable `goal`, given as 1, was 1 in the run;
  - a key pressed at 2 s, then a tone of 500 ms: the robot started driving at 2.6 s.
- **Speed:** the line follower's 7.4 s to the goal took 0.45 s to compute (with compiling); 2 minutes of driving took
  0.6 s. The example suite ran in about 1 s.

**The simulator's semantics, not the robot's.** A test shows what the Lab's simulator does, and that isn't always what
the Edison does:
- **Sensors are states.** "Sound" is true while it is loud, "obstacle" while something is there. On the Edison, a clap
  or an obstacle is latched until the program reads it. So the clap counter (`while claps < goal: wait until sound;
  claps + 1`) counts one clap three times in the simulator: the wait sees the sound and goes on, three times in the same
  frame. On the robot it counts one.
- **Powers and distances.** The simulator uses a power as it is (15 % is 15 %; on the Edison, a 10 % step). It measures
  drives and turns as distances and angles; the Edison measures them in wheel ticks. A drive "for 20 cm" against a wall
  never ends in the simulator.
- **A bug of the Lab:** in the Lab's simulator, the Edison's sound sensor never hears the microphone. In
  `RobotBaseMobile`'s constructor, `configure()` makes the `SoundSensorBoolean` before `RobotEdison`'s fields exist, so
  the sensor has no `WebAudio` to connect the microphone to (verified 2026-10-22: its `webAudio` is undefined). A test
  sets the meter's volume itself, so "given" claps work.

**The recorded path.** A run with *Record path* doesn't check the test's path; its path becomes the new `path` of the
test's `path` check (the check block's data):
- **The corridor:** the robot's outline at each recorded pose (poses at least every 0.5 cm or 3°), widened by
  `tolerance_cm`.
- **The check:** looks near the last matching pose first, then in a grid, so long paths stay cheap.

**The report** of a simulation test has the shape of the others (§4.8), with `kind: "simulation"`, `world_block_id`,
`checks` and `simulation`:
- `checks`: `[{block_id, check, text, rule, passed, t, item, point, message}]`, every check with what it found
  (`passed`: true, false, or null: not decided);
- `simulation.result`, `t`: why and when the run ended (ms): `finished`, `until`, `time_limit`, `error`;
- `item`, `point`: what the replay marks: the area touched or obstacle bumped into by the first failed check, where
  the robot left its path;
- `path`: `[[t, x, y, heading], …]`, for the replay; `start`: `[x, y, heading]`;
- `leds`: `[[t, left, right], …]`;
- `bumps`: the frames in which the robot pushed against something.

Failures: one per failed check, `expect: "simulation"`, a message in words ("the robot left its recorded path (by
more than 2 cm) after 0.6 s"; a rule's starts with "rule:") and `check_block_id`. `covered_blocks` are the blocks whose
operations ran (the stack machine's operations carry their block ids), so simulation tests count for coverage. A
runtime error is `{"kind": "runtime_error", "message", "block_id", "block_type"}`, with the block whose operation ran
last.

**Goal and fail areas are coordinates, not colours.** We considered painting goal and fail areas in special colours
into the background and checking the pixels under the robot. Instead, they are invisible shapes with coordinates:
- **The robot must not see them.** The line tracker reads the floor. A coloured area would change what it reads, on a
  printed mat as well as in the simulator, and so change the robot's behaviour.
- **They're exact and cheap.** Polygons touch or they don't, and areas may overlap lines. The editor still shows them,
  hatched green and red.

What the sensors see, on the other hand, *is* a picture: the simulator's sensors read the pixels of its sensor canvas.

**Validation:**
- `spec.validate_spec` checks the `simulation` object (`simulation.validate`): the world (background, starts,
  objects, roles), the start, the `until` area, the checks and what they refer to, and the allowed events.
- The Tests tab (`blocks.py`) also reports, at the block: a start or an item that isn't in the world (any more), a
  test outside a world, a robot that starts off the floor or on an obstacle (errors); a robot that starts on an area
  the test checks, a test that checks nothing, a path not recorded yet, a set-up variable the program sets at once
  (warnings).

**The example:**
- **The program:** `examples/line_follower.xml` follows the left edge of a line with the single line tracker. On black
  it curves left (10 % / 40 %), on white it curves right (40 % / 10 %). Its function `toTheWall()` drives until the
  obstacle detection sees something ahead, and stops.
- **The suite:** `line_follower_with_tests.xml` has the world "Edison track" with two starts and the rule "the robot
  never touches Shortcut" (a fail area beside the track); its path was recorded on the simulator.
  `line_follower.tests.json` is the same suite as JSON (the command line runs only its third test). In the Tests tab,
  its three tests pass:
  - from start A, until it touches the goal area "Finish": it reaches it and stays on its recorded path (7.4 s);
  - from start B, halfway down the track: it reaches "Finish" too (3.9 s);
  - `toTheWall()` as a BDD test with a scripted obstacle (a world's test always runs the whole program).

---

## 5. The Python API

```python
from nepotest import TestSubject, World, NepoError, ConversionError

subject = TestSubject.load('prog.xml', bundle='prog.bundle.json', lab='http://localhost:1999')
subject = TestSubject.from_lab(xml_text, lab)           # always convert
subject = TestSubject.from_bundle('prog.bundle.json')   # never convert

result = subject.call('f', 1, [2, 3], globals={'goal': 5}, world=World().clap(300), max_steps=100000)
result.returned            # the value; re-raises result.error (a NepoError) if the call failed
result.error               # NepoError or None: kind, message, block_id, block_type, function, edpy_line
result.actions, result.actions_of('actions_led_edison'), result.calls, result.variables, result.coverage

run = subject.run(World().key('PLAY', 500), max_time_ms=10000)
run.status, run.finished, run.running, run.variables, run.actions, run.calls, run.error
run.sensor_reads           # {block_id: {'type', 'reads', 'values': {value: count}}}
run.coverage.uncovered     # block ids; coverage.merge(other) across tests; coverage.to_json()
run.format_actions()       # readable timeline
run.timeline               # the robot's state over time (§4.10): .at(t).state, .moments, .spans(a, b), .format()
run.pose                   # {'x_cm', 'y_cm', 'heading_deg', 'distance_cm'} at the end
subject.run(world, track_variables=True)   # also record the global variables over time (for variable states)
run.robot                  # the engine's virtual robot (trace, state_log, pose, sounds...), for low-level checks

subject.describe()         # the program summary with test hints (§7.2)
subject.check_with_edpy()  # Level 0: the reference EdPy compiler's verdict
```

`NepoTest/examples/test_clap_counter.py` shows it with `unittest`: subtests over inputs, an expected failure, errors
on blocks, and coverage merged across tests. pytest collects the same files.

---

## 6. How results map back to blocks

The observer (`nepotest/observer.py`) is an engine listener (`edpy-test-engine.md` §9).

### 6.1 Statement hooks and block executions

- The engine inserts `__edtest__.stmt(k)` before every statement of the EdPy. This changes nothing but the
  notification.
- Statement k maps to the innermost block whose code spans the whole statement.
- If the statement also **starts** that block's code, it starts an **execution** of the block. So:
  - one execution per LED block run;
  - one per "wait until", however often it polls;
  - one per loop *statement* (not per iteration);
  - loop *bodies* execute per iteration, since each body statement starts its block.
- Function definitions don't count as executions.

### 6.2 Ed calls

At every `Ed.<name>(…)` call, the observer walks the Python stack. In the first frame of the program whose current
instruction lies inside a block's code, it takes the instruction's position (CPython 3.11+ `co_positions()`). The
call belongs to every block whose code spans that position, and to the current execution of each.
- For a call made inside a generated helper (`_diffDrive`, `_diffTurn`, `_diffCurve`, `_motorOn`, `_irSend`,
  `_obstacleDetection`, …), the helper's frame lies outside any block. The walk continues to the helper's call site.
  The helper's parameters are kept, because they are the NEPO values, e.g. `speed = 150` before `_shorten`.
- Calls of the setup block belong to no block.

### 6.3 Function calls

After the prelude, every `____name` function in the program's namespace is wrapped. The wrapper records NEPO
arguments, the result (lists as lists), start and end time, and nesting depth. Recursion and calls between functions
go through the wrappers too, because generated code calls functions by their global names.

### 6.4 Errors

- Every engine error carries the code positions of the program frames.
- The framework takes the innermost position and the innermost block spanning it. Example: the overflow in
  `average(32767, 2)` is attributed to the `math_arithmetic` block `cc38` in function `average`.
- `edpy_line` is kept for developers.

### 6.5 Coverage

- The coverable blocks are all blocks with code in the source map, except comments.
- A block is covered by any of these:
  - the innermost executed statement containing its code's start (so expression blocks count when their statement
    ran, and the `return 100` of `if speed > 100: return 100` counts only if the return was taken);
  - an Ed call attributed to it;
  - for a function definition: a call of the function;
  - for the start block: a program run.
- Coverage merges across tests, and `run_spec` reports the merged coverage.

### 6.6 Precision and limits

- **Loop conditions:** a loop condition that is evaluated again belongs to the loop block (the same statement). That
  is correct for coverage.
- **One-line `if … return`:** the generator writes `if c: return v` on one line. Coverage still distinguishes the two
  parts, because they are separate statements.
- **Same line, same span:** two blocks whose code has exactly the same span can't be told apart. The innermost one,
  by length, wins.
- **The model is the engine's:** timing, speeds and sensor latency follow the engine's assumptions
  (`edpy-test-engine.md` §7). Assert on values, order and what was commanded; treat absolute times as approximate.

---

## 7. For the AI integration (generating tests)

### 7.1 The loop

```
describe(program) + test file schema + authoring rules (§7.3)
      -> AI proposes a test file (JSON)
      -> validate_spec(spec, subject): problems go back to the AI
      -> run_spec(spec, subject): failures, errors, uncovered blocks go back to the AI
      -> repeat until the coverage goal is met and no test is broken; show results to the learner
```

- The test file is data: generating it can't execute code, and it can be checked mechanically before and after
  running.
- Budgets bound every run.
- Every result refers to block ids, so the Lab can highlight the blocks.

### 7.2 What `describe()` returns

```json
{"robot_group": "edison",
 "variables": [{"name": "claps", "type": "Number", "initial": 0, "block_id": "cc03"}],
 "functions": [{"name": "clampSpeed", "block_id": "cc33", "returns": "Number", "params": [{"name": "speed", "type": "Number"}],
                "calls": [], "sensors": [], "actions": []}],
 "main": [{"block_id": "cc14", "type": "controls_whileUntil", "condition": "claps < goal", "body": ["..."]}],
 "sensors": [{"block_id": "cc01", "type": "robSensors_sound_getSample", "mode": "SOUND", "function": null}],
 "actions": [{"block_id": "cc43", "type": "actions_led_edison", "actorport": "LLED", "mode": "ON", "function": "blink"}],
 "test_hints": [{"kind": "boundary", "block_id": "cc23", "function": "clampSpeed", "detail": "speed > 100",
                 "suggested": {"values": [99, 100, 101], "of": "speed"}}]}
```

Test hints are static heuristics, not proofs:

| `kind` | Found at | Suggests |
|---|---|---|
| `function` | every NEPO function | a function test, with boundary inputs, 0, negatives, values near ±32767 |
| `boundary` | a comparison of an expression with an int literal | inputs n−1, n, n+1 |
| `division` | `/` or remainder with a non-literal divisor | a zero divisor (`error: "division_by_zero"`) |
| `integer_division` | every `/` | a case where the result isn't whole (7 / 2 = 3) |
| `list_index` | list get/set with a computed index | −1, 0, length−1, length |
| `wait_for_sensor` | "wait until" | the event never, once, twice between two reads, during the setup block; the reaction as a state (`after`, `while`) |
| `movement` | drive, turn, curve and motor blocks | states of the robot or its motors, and distance, turn and end position (§4.10). A note if a literal power stops the motor (below 5 %) or runs at a different step (45 → 50 %). |
| `loop` | loops | 0, 1, many iterations; forever loops end as `running` |
| `eager_and_or` | AND/OR with a sensor or a function call on the right | both sides are always evaluated (quirk #29) |
| `output` | tone blocks | the buzzer plays 4× the NEPO frequency (quirk #26) |

Runtime signals complement them: `coverage.uncovered`, `sensor_reads` (which sensors a run polled), the final
status, and errors.

### 7.3 Rules to give a test generator

- **Use only NEPO names from `describe()`:** function and variable names, ports, block types, and field spellings as
  in the XML (`FOREWARD`).
- **Numbers are 16-bit ints.** Division rounds down. There are no strings or floats.
- **Script events after the setup block** (t > 254 ms) unless you are testing it, and **one latched event per read**.
- **Programs with a forever loop never finish:** use `"status": "running"` and a small `max_time_ms`.
- **Prefer order and values** (`actions`, `calls`, `variables`) over absolute times. Use ranges for times.
- **Test behaviour with `states`:** what the robot does at the end, never / at some point, and reactions (`after`,
  `while`) are robust. Absolute times after a distance drive depend on the assumed wheel speed. Give `power` as the
  NEPO value a program would use; it's compared in the robot's 10 % steps.
- **Mark authorship** with `origin`.
- **A failure isn't always the learner's fault.** Known generator quirks (`edisonv2-nepo-to-edpy.md` §13) make correct
  NEPO programs behave differently. Example: `(a + b) / 2` computes `a + b / 2` (quirk #14). A generator, or the Lab
  UI, should check a failure against that list before blaming the learner's program.

### 7.4 Where tests run in the Lab

**Implemented: in the browser.** The Tests tab (`nepo-test-blocks.md`) converts through `sourceForTest` and runs
NepoTest in Pyodide in a Web Worker. Generated tests could be shown and run there once they are converted to test
blocks. Other options:

- **Server:** the Lab calls `nepotest` in a Python subprocess (3.11+) with the program and a test file, and gets the
  results JSON. The engine's restricted builtins are **not a sandbox**. Generated code comes from blocks and is
  constrained, but run it in a separate process with a wall-clock timeout and resource limits.
- **Conversion:** a server-side integration could skip REST and read `SourceMapBean` directly after the `showsource`
  workflow.
- **Browser (what the Tests tab does):** the framework only needs the standard library. It runs unchanged under
  Pyodide 314.0.7 (verified in Chrome and under Node). Conversion is still the `sourceForTest` request. Simulation tests
  run on the page itself, on the Lab's simulator (`nepoTest.simRun`, §4.11); the worker only translates them.

---

## 8. Extending

- **A new action block:**
  - add its type to `ACTION_TYPES` (`nepo.py`) and a branch to `decode_action` (`observer.py`), with NEPO fields plus
    helper parameters or Ed call arguments;
  - add it to the table in §4.7;
  - if it emits a new `Ed` function, the engine needs it too (`edpy-test-engine.md` §11);
  - if it changes the robot's state, log that in the engine (`Robot.log_state`) and map it to NEPO terms in
    `states._nepo_state`, so state expectations see it.
- **A new sensor block:** add it to `SENSOR_TYPES`, and, if the world needs a new kind of event, add that to
  `world.py` (JSON name, NEPO ports, mapping to the engine's robot).
- **New test hints:** `summary.py`, `_hints()`. Keep hints about *where* and *what to vary*, with suggested values.
- **Another robot:**
  - its generator must fill a `SourceMapBean`: the same two hooks as in `EdisonPythonVisitor`, and the bean
    registration in its generator worker;
  - it needs an engine for its target language;
  - it needs world ports and action decoders for its blocks.
- **After generator changes:** run the Java golden tests, `EdisonSourceMapTest`, and `tests/test_lab_live.py` against
  a rebuilt Lab, then convert the bundles again.

---

## 9. Limitations and open questions

- **The engine's assumptions** (speeds, beep length, tempo, detection latency, what happens at program end) are listed
  in `edpy-test-engine.md` §7. They're configurable, and uncalibrated against a real Edison.
- **What isn't modelled:** events (`Ed.RegisterEventHandler`, never generated), the distance counters, and physical
  collisions. In a scripted world an obstacle doesn't stop the robot; the robot only reports it. In a simulation test,
  the Lab's simulator moves the robot, and it bumps into obstacles.
- **Two kinds of world.**
  - **Scripted** (§4.4): the world is set by time, not by position. The line tracker sees what `world` says at that
    moment, wherever the robot has driven.
  - **Drawn** (simulation tests, §4.11): lines and obstacles have positions, and the sensors read them at the robot's
    pose. "Follows the line" and "stops before the wall" are tested there.
  - The drawn world is the Lab's simulator: robot body, sensor positions and ranges, speeds, collisions, and the
    program as the simulator runs it. That's the simulator's model of the Edison, not a calibration against a robot,
    and its semantics: sensors are states, powers aren't in 10 % steps (§4.11).
- **Test data:** there are no floats and no strings in tests, because NEPO programs for the Edison have none.
- **Only the Edison has a source map.** `sourceForTest` works for every robot but returns a map only for the Edison.
- **Python:** the framework needs CPython 3.11+ (`co_positions`). The engine alone runs on 3.8+.
- **Future:** a block-based test editor in the Lab, which would write the JSON of §4; highlighting failing and
  uncovered blocks; and calibration measurements on a robot.

---

## 10. File map

```
NepoTest/
  nepotest/
    __init__.py, __main__.py  public API; CLI (convert, describe, run, validate)
    lab.py                    LabClient (REST), Bundle
    nepo.py                   NepoProgram: blocks, variables, functions, main; ACTION_TYPES, SENSOR_TYPES
    summary.py                describe(): program summary and test hints
    sourcemap.py              SourceMap: ranges, positions -> blocks
    world.py                  World: NEPO-level events -> engine robot
    observer.py               block executions, Ed call attribution, function calls, actions, coverage
    subject.py                TestSubject, CallResult, ProgramRun, Coverage, NepoError, ConversionError
    spec.py                   test files: validate_spec, run_spec
    matching.py               value matchers (shared by spec.py and states.py)
    states.py                 the robot's state over time (Timeline), state expectations, measurements (§4.10)
    simulation.py             simulation tests: their data and its checks; a copy of the simulator, no longer used (§4.11)
    blocks.py                 NEPO test blocks (Tests tab) -> test file; split_program for programs with embedded suites
    browser.py                the functions the Lab's Pyodide worker calls (JSON strings in and out)
    engine/                   the EdPy engine (edpy-test-engine.md)
  schema/nepo-tests.schema.json
  examples/                   clap_counter.xml, its bundle, clap_counter.tests.json, test_clap_counter.py
  examples/clap_counter_with_tests.xml   the example program with a test suite made of test blocks (as the Lab saves it)
  examples/patrol.xml, .bundle.json, .tests.json, patrol_with_tests.xml   the state tests' example (§4.10)
  examples/line_follower.xml, .bundle.json, .tests.json, line_follower_with_tests.xml   simulation tests (§4.11)
  tests/                      test_framework.py, test_blocks.py, test_states.py, test_simulation.py, test_lab_live.py,
                              test_engine*.py, fixtures/, data/edison_track_floor.json (the copy's floor picture)
OpenRobertaWeb/src/app/nepotest/*, …/controller/tests.controller.ts   the Tests tab (nepo-test-blocks.md §2)
OpenRobertaWeb/src/app/nepotest/nepoTest.simRun.ts                  simulation tests on the Lab's simulator (§4.11)
OpenRobertaServer/staticResources/nepotest/nepotest-files.json      the nepotest package for the browser (generated by gulp)
OpenRobertaRobot/…/bean/SourceMapBean.java
RobotEdison/…/visitor/codegen/EdisonPythonVisitor.java (preVisitCheck/postVisitCheck), …/worker/codegen/EdisonPythonGeneratorWorker.java
OpenRobertaServer/…/controller/ProjectWorkflowRestController.java (sourceForTest), ProjectSourceForTestResponse.java
OpenRobertaServer/src/test/java/…/javaServer/EdisonSourceMapTest.java
```
