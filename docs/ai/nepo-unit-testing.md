# Unit tests for NEPO programs: NepoTest

**NepoTest** tests learners' **NEPO programs** for the Edison V2. The Lab converts the program to EdPy, exactly as
for the robot. The EdPy runs against a virtual robot, and everything it does is translated back to **NEPO terms**:
- which blocks ran;
- what the action blocks did (power in %, distance in cm, frequency in Hz);
- which NEPO functions were called, with which arguments and results;
- which runtime error happened in which block;
- which blocks no test executed.

Tests are written in NEPO terms too. They're either a JSON file (made for test editors and **AI test generators**) or
Python code. This is parts 1 to 3 of the project goal in `CLAUDE.md`: writing and running tests (§4, §5), detecting
what is worth testing (§7.2), and generating tests (§7).

```
learner's NEPO program (Lab XML)
   |  POST /rest/projectWorkflow/sourceForTest            a running Lab, built from this repository (§3)
   v
bundle: EdPy (the unchanged robot code) + source map (block id -> EdPy ranges) + the Lab's annotated XML
   |  nepotest.engine: EdPy semantics, virtual clock, scripted world    (edpy-test-engine.md)
   v
observer: statements and Ed calls -> block executions -> actions, function calls, coverage, errors per block (§6)
   |
   v
test file (JSON) or Python API  ->  results (JSON): outcome and failures per test, block ids, coverage (§4.8)
```

Code: `NepoTest/` (Python, standard library only, CPython **3.11+**). Server side: `SourceMapBean`, the recording in
`EdisonPythonVisitor`, and the REST service `sourceForTest` (§3.2).

**Status (2026-09-25):**
- **Python:** 65 tests in `NepoTest/tests` and 8 in `NepoTest/examples` pass with `unittest` and pytest 9.1.1. They
  include the live-Lab tests against a server built from this repository, and the Level-0 check with the reference
  EdPy compiler.
- **Java:** `EdisonSourceMapTest` (4 tests) passes, and the golden files are unchanged (317/317).
- **Timings** measured on a laptop:

  | Step | Time |
  |---|---|
  | Conversion through the Lab | ≈ 50 ms |
  | Loading a bundle | ≈ 9 ms |
  | A function test | ≈ 1 ms |
  | A 4.6-second scenario with ≈ 2,750 sensor polls | ≈ 90 ms |

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
| **status** | of a run: `finished`, or still running when the budget ran out (`time_limit`, `step_limit`), or `error` |
| **error** | a runtime problem (16-bit overflow, division by zero, list index out of range, …) with the block where it happened |
| **virtual time** | milliseconds from program start. Nothing runs in real time; a 60-second scenario takes milliseconds. |

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
| `name` (required, unique), `description`, `origin` | `origin` says who wrote it, e.g. `"learner"`, `"teacher"`, `"ai:<model>"` |
| `call`, `args`, `globals` | a function test: call NEPO function `call` with `args`, after setting global variables `globals` |
| `world` | events (§4.4), for runs and for calls |
| `max_time_ms`, `max_steps` | budgets. Defaults: 60,000 ms virtual; 2,000,000 steps for runs, 100,000 for calls. |
| `expect` (required) | expectations (§4.5); all must hold |

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
| `action_count` | both | `{"<block type>": n}`: executions per action block type (n may be a matcher) |
| `calls` | both | these NEPO function calls happened in this order (`function`, `args`, `returns`) |
| `error` | both | `null` (the default: no runtime error allowed), an error **kind**, or a matcher on `kind`, `block_id`, `block_type`, `function` |
| `covers` | both | these block ids were executed |

Runtime error kinds: `overflow`, `division_by_zero`, `index_out_of_range`, `shift_out_of_range`, `negative_value`,
`type_error`, `recursion`, `step_limit` (a call that doesn't return), `invalid_arguments`, `invalid_list`,
`unsupported`, `python_error`. The engine also has kinds for programs EdPy rejects (`edpy_incompatible`, `syntax`,
`unknown_ed`, …); generated programs don't produce them.

### 4.6 Matchers

- An action or call matcher is an object: every key must be present in the action or call, and its value must match.
- A value matches if it's equal (numbers numerically; booleans only booleans), within `{"min": a, "max": b}`, or
  within `{"approx": x, "tol": d}`.

Example: `{"block": "robActions_motorDiff_on_for", "power": {"min": 90, "max": 100}}`.

### 4.7 Actions

Every action has these keys:
- `t`: start time, in ms;
- `block`: the block type;
- `block_id`;
- `function`: the NEPO function it runs in, `null` for the main program.

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
  matters when tests are generated.
- Failures name the expectation, like `variables.claps` or `actions[1]`, and give the expected and actual values. For
  action expectations, `actual` is the (shortened) list of actions.
- `uncovered` lists blocks that no test executed, as `{block_id, type, function}`.
- The CLI's exit code is 0 only if every test passed.

### 4.9 Validation

- `validate_spec(spec)` checks the structure: unknown keys, duplicate names, bad world events, `status` on a call, and
  `returns`/`args` without `call`.
- `validate_spec(spec, subject)` also checks that functions and variables exist, and that the number of arguments
  fits.
- The CLI refuses to run an invalid file. Validate generated tests **before** running them, and give the problems
  back to the generator.

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
run.robot                  # the engine's virtual robot (trace, pose, sounds...), for low-level checks

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
| `wait_for_sensor` | "wait until" | the event never, once, twice between two reads, during the setup block |
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
- **Mark authorship** with `origin`.
- **A failure isn't always the learner's fault.** Known generator quirks (`edisonv2-nepo-to-edpy.md` §13) make correct
  NEPO programs behave differently. Example: `(a + b) / 2` computes `a + b / 2` (quirk #14). A generator, or the Lab
  UI, should check a failure against that list before blaming the learner's program.

### 7.4 Where tests run in the Lab

- **Server:** the Lab calls `nepotest` in a Python subprocess (3.11+) with the program and a test file, and gets the
  results JSON. The engine's restricted builtins are **not a sandbox**. Generated code comes from blocks and is
  constrained, but run it in a separate process with a wall-clock timeout and resource limits.
- **Conversion:** a server-side integration could skip REST and read `SourceMapBean` directly after the `showsource`
  workflow.
- **Browser:** the framework only needs the standard library, so Pyodide may run it (unverified). Conversion would
  still be the `sourceForTest` request.

---

## 8. Extending

- **A new action block:**
  - add its type to `ACTION_TYPES` (`nepo.py`) and a branch to `decode_action` (`observer.py`), with NEPO fields plus
    helper parameters or Ed call arguments;
  - add it to the table in §4.7;
  - if it emits a new `Ed` function, the engine needs it too (`edpy-test-engine.md` §11).
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
  collisions. An obstacle doesn't stop the robot; the robot only reports it.
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
    spec.py                   test files: validate_spec, run_spec, matchers
    engine/                   the EdPy engine (edpy-test-engine.md)
  schema/nepo-tests.schema.json
  examples/                   clap_counter.xml, its bundle, clap_counter.tests.json, test_clap_counter.py
  tests/                      test_framework.py, test_lab_live.py, test_engine*.py, fixtures/ (golden bundles)
OpenRobertaRobot/…/bean/SourceMapBean.java
RobotEdison/…/visitor/codegen/EdisonPythonVisitor.java (preVisitCheck/postVisitCheck), …/worker/codegen/EdisonPythonGeneratorWorker.java
OpenRobertaServer/…/controller/ProjectWorkflowRestController.java (sourceForTest), ProjectSourceForTestResponse.java
OpenRobertaServer/src/test/java/…/javaServer/EdisonSourceMapTest.java
```
