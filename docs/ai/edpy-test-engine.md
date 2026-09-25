# The EdPy test engine

The engine of the NEPO unit-test framework **NepoTest** (`nepo-unit-testing.md`). It runs the EdPy that the Lab
generates for an Edison V2 program under CPython, with EdPy semantics, against a mocked `Ed` module and a virtual
robot. Test authors normally don't use it directly: they write tests in NEPO terms, and the framework drives the
engine. Read this document to understand, extend or calibrate what happens underneath.

```
NepoTest/nepotest/engine/     (standard library only, CPython 3.8+; the framework on top needs 3.11+)
  program.py                  EdProgram, run(), load() / Session, RunResult, arithmetic runtime, listener hooks
  transform.py                static EdPy guard, constant folding, source rewriting, statement instrumentation
  robot.py                    the virtual robot: clock, scripted world, actuators, trace
  ed_module.py                the mock `Ed` module
  containers.py               Ed.List, Ed.TuneString
  values.py                   EdPy constants and signatures (dumped from EdPy 1.2.11)
  edpy_check.py               runs the reference EdPy compiler in check mode
  errors.py                   exception classes, each with a machine-readable `kind`
NepoTest/tests/
  test_engine.py              self-tests: the EdPy semantics the mock implements
  test_engine_clap_counter.py engine-level tests of the example program (EdPy: clap_counter.edpy.py)
  test_engine_golden.py       the engine against the six Edison golden programs
```

Related documents:
- `nepo-unit-testing.md`: the framework (NEPO-level tests, the Lab conversion, the source map, results).
- `edisonv2-nepo-to-edpy.md`: the generator and the anatomy of a generated program.
- `edpy-reference.md`: the EdPy language, the `Ed` API and the reference compiler.

**Status (2026-09-25):**
- The engine tests (46) pass with `unittest` (CPython 3.14.7) and with pytest 9.1.1. One of them is an intentional
  expected failure.
- The Level-0 test also ran against the real EdPy 1.2.11 compiler.
- Python 3.8 is the minimum by design (the engine uses `ast.Constant`), but only 3.14 was actually tested.

---

## 1. Quick start

```bash
cd NepoTest
python -m unittest discover -s tests -p "test_engine*.py" -t .

# optional: let the Level-0 test run the reference EdPy compiler (setup: edpy-reference.md §2)
export EDPY_HOME=/path/to/EdPy/src EDPY_PYTHON=/path/to/python3.6
```

The engine on its own, against the example program's EdPy (§4):

```python
from nepotest.engine import EdProgram, Robot

program = EdProgram.from_file('tests/clap_counter.edpy.py')

def test_clamp_speed():                       # a learner function, called in isolation
    session = program.load()
    assert session.call('clampSpeed', 150) == 100

def test_three_claps_then_drive():            # the whole program against a scripted world
    robot = Robot().clap(at=1000).clap(at=2000).clap(at=3000)
    result = program.run(robot)
    assert result.finished and result.vars['claps'] == 3
    assert [c.args for c in robot.calls('Drive')] == [(1, 10, 10)]    # Ed.FORWARD, speed level 10, 10 cm
```

The same tests in NEPO terms (framework): `subject.call('clampSpeed', 150).returned == 100`, and the drive shows up as
`{'block': 'robActions_motorDiff_on_for', 'direction': 'FOREWARD', 'power': 100, 'distance_cm': 10}`.

---

## 2. Why you can't just import the generated file

| Problem (all verified) | Consequence | How the engine handles it |
|---|---|---|
| The program runs at **module top level**; there's no `main()` and no guard, and EdPy can't express one | `import` executes the whole program, including endless loops | `exec` of compiled code. `load()` runs only the prelude: helpers, setup, globals and function definitions (§5.2). |
| `import Ed`: the module only exists on the robot | `ImportError` | a mock `Ed` module with EdPy's exact constants, bound to a virtual `Robot` (§6) |
| EdPy ints are **signed 16-bit**, and `/` is **floor division** (EdPy is Python 2) | Under CPython 3, `7/2 == 3.5` and ints never overflow | every arithmetic operator is rewritten into a runtime call with EdPy semantics (§6.1) |
| EdPy **folds constants** before its ±32767 range check (`8000000/440` is fine, `8000000/___f` isn't) | CPython accepts anything | the same folding and range check at load time |
| CPython accepts much more than EdPy (`and`/`or`, `print`, builtin `sum`, floats, strings, chained comparisons, …) | Tests pass for programs the robot rejects | a static EdPy-subset guard, plus the real compiler as Level 0 (§5.3) |
| "Wait until" is a **busy loop**, and `Ed.TimeWait` / `Ed.Drive` with a distance **block** | Real-time tests would be slow and flaky | a **virtual clock**: Ed calls and waits move it, nothing sleeps (§6.2) |
| Clap, keypad, obstacle, remote, IR and music end are **latched and cleared by reading** | Naive mocks (a function returning a value) give wrong results | registers with EdPy's read-and-clear semantics, fed by a scripted timeline of events (§6.3) |
| Forever loops are normal robot programs | A test would hang | time and step budgets. Hitting a budget is a result (`status`), not an error. |

---

## 3. Getting the EdPy for a NEPO program

The engine works on the EdPy text. The framework gets it from a running Lab (REST `sourceForTest`, together with
the source map; `python -m nepotest convert`, see `nepo-unit-testing.md`). Other ways, which produce the same code:

1. **Golden files.** For programs under `OpenRobertaServer/src/test/resources/crossCompilerTests/robotSpecific/edison/`,
   the expected EdPy is in `_expected/robotSpecific/targetLanguage/edisonv2/`. After a golden-file run, the freshly
   generated EdPy is in `OpenRobertaServer/target/unitTests/…`.
2. **A throw-away Java test** (this is how `tests/clap_counter.edpy.py` was made first). Put this class into
   `OpenRobertaServer/src/test/java/de/fhg/iais/roberta/javaServer/`, run it, and delete it again:

   ```java
   public class TmpEdisonShowSourceProbeTest {
       @Test
       public void probe() throws Exception {
           AstFactory.loadBlocks();
           RobotFactory f = Util.configureRobotPlugin("edisonv2", "", "", new ArrayList<>());
           String export = new String(Files.readAllBytes(Paths.get(System.getProperty("probe.in"))), StandardCharsets.UTF_8);
           Pair<String, String> pc = ProjectWorkflowRestController.splitExportXML(export);
           Project p = UnitTestHelper.setupWithConfigAndProgramXML(f, pc.getFirst(), pc.getSecond()).setRobot("edisonv2").build();
           ProjectService.executeWorkflow("showsource", p);
           String info = "# RESULT=" + p.getResult() + " errors=" + p.getErrorCounter() + "\n";   // delete this line in the output
           Files.write(Paths.get(System.getProperty("probe.out")), (info + p.getSourceCodeBuilder().toString()).getBytes(StandardCharsets.UTF_8));
       }
   }
   ```

   ```bash
   mvn -B -q -o -pl OpenRobertaServer test -Dtest=TmpEdisonShowSourceProbeTest -DfailIfNoTests=false \
       -Dprobe.in=/abs/path/program.xml -Dprobe.out=/abs/path/program.py
   ```

   Imports: `java.nio.*`, `java.util.ArrayList`, `org.junit.Test`, and the `de.fhg.iais.roberta` classes
   `components.Project`, `factory.RobotFactory`, `javaServer.restServices.all.controller.ProjectWorkflowRestController`,
   `javaServer.restServices.all.service.ProjectService`, `util.Util`, `util.ast.AstFactory`, `util.basic.Pair`,
   `util.test.UnitTestHelper`. Check `errors=0`: block errors don't stop code generation.
3. **The running Lab.** "Show source" in the UI, or `POST /rest/projectWorkflow/source`, which returns `sourceCode`
   (`edisonv2-nepo-to-edpy.md` §12.1). This is the route the learner-facing framework will use.

---

## 4. The worked example: "clap counter"

`NepoTest/examples/clap_counter.xml` is an expert-mode program. It was built from real block XML, and it passes the Lab's
generator (`errors=0`) and the reference compiler (`{"error": false}`).

```
variables  claps := 0, goal := 3
main       while claps < goal:  wait until clap;  claps := claps + 1
           blink(claps)
           drive forward, speed clampSpeed(150), 10 cm
functions  clampSpeed(speed) returns: if speed > 100 return 100; if speed < 0 return 0; return speed
           average(a, b) returns (a + b) / 2          (not called; it shows a generator quirk)
           blink(times): repeat times: LED left on, wait 200 ms, LED left off, wait 200 ms
```

The generated EdPy (the helpers `_diffDrive`, `_getDirection`, `_shorten` and the setup block are shortened here):

```python
___claps = 0
___goal = 3

def ____clampSpeed(___speed):
    global ___claps, ___goal
    if ___speed > 100: return 100
    if ___speed < 0: return 0
    return ___speed

def ____average(___a, ___b):
    global ___claps, ___goal
    return ___a + ___b / 2                  # quirk #14: the parentheses of (a + b) are lost

def ____blink(___times):
    global ___claps, ___goal
    for ___k0 in range(___times):
        Ed.LeftLed(Ed.ON)
        Ed.TimeWait(200, Ed.TIME_MILLISECONDS)
        Ed.LeftLed(Ed.OFF)
        Ed.TimeWait(200, Ed.TIME_MILLISECONDS)


while ___claps < ___goal:
    while True:
        if (Ed.ReadClapSensor() == Ed.CLAP_DETECTED):
            break
        pass
    ___claps += 1
____blink(___claps)
_diffDrive(Ed.FORWARD, ____clampSpeed(150), 10)
Ed.ReadClapSensor()
```

`NepoTest/tests/test_engine_clap_counter.py` tests it at every level (§5.1). The trace of a three-clap run, printed with
`robot.format_trace()`, where runs of identical polling reads are collapsed:

```
    254.0 ms  Ed.ReadClapSensor() -> 0   x746 until 999.0 ms
   1000.0 ms  Ed.ReadClapSensor() -> 4
   1001.0 ms  Ed.ReadClapSensor() -> 0   x999 until 1999.0 ms
   ...
   3001.0 ms  Ed.LeftLed(1)
   3002.0 ms  Ed.TimeWait(200, 1)
   3203.0 ms  Ed.LeftLed(0)
   ...
   4213.0 ms  Ed.Drive(1, 10, 10)
   4614.0 ms  Ed.ReadClapSensor() -> 0
```

---

## 5. Writing tests

### 5.1 Four levels

| Level | Question | API | Needs |
|---|---|---|---|
| 0 compiles | Would the robot accept the program? | `edpy_check.check_file(path)`; the static guard in `EdProgram(...)` | the reference compiler for the real answer |
| 1 function | Does a learner function return the right value or cause the right effect? | `program.load()` → `session.call('f', args)` | user functions in the program |
| 2 scenario | Does the whole program react correctly to a scripted world? | `Robot()` + scenario methods → `program.run(robot)` → trace and state | – |
| 3 generated | Does a property hold for many inputs or scenarios? | loops or `subTest` over Level 1/2 calls | – |

All levels use plain `unittest` (or pytest) assertions. The engine has no test DSL of its own; the framework adds the
JSON test format for learner-written and generated tests (`nepo-unit-testing.md`).

### 5.2 Loading a program: `EdProgram`

```python
program = EdProgram.from_file(path)            # or EdProgram(source, filename='<edpy>')
program.variables    # ['claps', 'goal']: declared NEPO variables, in declaration order
program.functions    # {'clampSpeed': ['speed'], 'average': ['a', 'b'], 'blink': ['times']}
program.problems     # [(line, message)] from the static guard; empty for a clean program
```

- **Names are NEPO names.** The generator emits `___x` for a variable or parameter `x`, and `____f` for a function
  `f`. The engine strips the prefixes everywhere. Helpers (`_diffDrive`, `sum`, …) and `obstacleDetectionOn` aren't
  exposed.
- **`strict=True`** (the default) raises `EdPyCompatibilityError` for the first problem the guard finds.
  `strict=False` keeps the problems in `program.problems` and runs anyway.
- **How the program is split**, so `load()` can stop before the main code. The split relies on the generator's fixed
  order: imports → helpers → setup block (ending with `Ed.TimeWait(250, …)`) → global declarations → `____` functions
  → main statements.
  - The **prelude** is everything up to the last `____` function, and at least up to the declarations.
  - The declarations are the unbroken run of assignments to *new* `___` names right after the setup block. This is
    unambiguous, because main code can only assign already-declared variables.
  - For hand-written EdPy without the setup block, the split falls back to "after the last `Ed.X = …` assignment".

### 5.3 Level 0: does it compile?

```python
from nepotest.engine import edpy_check
if edpy_check.configured():                          # EDPY_HOME and EDPY_PYTHON are set
    result = edpy_check.check_file('program.py')     # or check_source(text)
    assert result.ok, result.messages                # messages like 'ERR: file:12:4: Unknown function print'
```

- The reference compiler is GPL-2.0 and isn't in the repository (licence note in `CLAUDE.md`). It needs Python 2.7 or
  3.6.
- `check_file` also handles compiler crashes. A crash counts as a failure, with the message
  `compiler crashed: <last output line>`. Examples: tone frequency 0, and every "internal error" under Python 3
  (`edpy-reference.md` §2).
- **The static guard** (`transform.check`) runs on every load. It rejects the constructs listed below, each verified
  as rejected by EdPy 1.2.11:
  - `and`/`or`
  - `x if c else y`
  - chained comparisons
  - `in`/`is`
  - `while … else`
  - comprehensions, tuples, lambdas, `**`
  - floats, strings outside `Ed.TuneString`
  - calls to undefined functions (`print`, `sum`, …)
  - `import` other than `import Ed`
  - unknown `Ed.X`, keyword arguments, nested functions, `global` not first in a function

  It also applies EdPy's constant folding and literal range check (`constant 32786 is out of range`).
- **The guard is a safety net, not a compiler.** A clean guard result doesn't prove that EdPy accepts the program.
  For example, it doesn't track variable types (EdPy: "a variable's type is fixed at its first assignment") or return
  types. Use the real compiler whenever it's available.

### 5.4 Level 1: function tests with `Session`

```python
session = program.load()                 # runs helpers, setup block (250 ms virtual), declarations, defs
session.call('clampSpeed', 150)          # -> 100
session.call('blink', 2)                 # side effects land in session.robot
session.robot.led_timeline('left')       # [(254.0, True), (456.0, False), (658.0, True), (860.0, False)]
session.vars                             # {'claps': 0, 'goal': 3}
session['goal'] = 5                      # set a global before a call
session.call('f', [1, 2, 3])             # a Python list becomes Ed.List(3, [1, 2, 3])
session.call('f', 1, max_steps=1000, max_time_ms=500)   # budget -> StepLimitExceeded if it doesn't return
```

- The arguments must be ints or booleans in −32768…32767, or lists of them. Return values are ints, booleans or
  `EdList`. An `EdList` compares equal to a Python list.
- A wrong number of arguments raises `TypeError` before the call.
- One session is one robot and one namespace. Globals and robot state carry over between calls, so use a fresh
  `load()` (in `setUp`) for independent tests.

### 5.5 Level 2: scenario tests with `Robot`

```python
robot = (Robot()
         .clap(at=1000)                          # latched event
         .press('triangle', at=1500)             # 'triangle' = PLAY key, 'round' = REC key
         .obstacle('ahead', start=2000, end=2500)
         .surface('black', at=3000)              # line tracker: black from 3 s on
         .light(left=250, right=900, at=0))      # raw levels; the program sees them / 10
result = program.run(robot, max_time_ms=10000)   # default budgets: 60 s virtual, 2,000,000 steps
result.status       # 'finished' | 'time_limit' | 'step_limit'
result.finished     # status == 'finished'
result.vars         # final values of the NEPO variables
result.time_ms      # virtual end time
```

**Scenario methods** (times are virtual ms from program start):

| Method | Models | Read by |
|---|---|---|
| `clap(at)` | a clap; **latched** | `Ed.ReadClapSensor()` (NEPO sound sensor) |
| `press(key, at)` | a key press; **latched**, bits ORed | `Ed.ReadKeypad()` (NEPO key PLAY = triangle, REC = round) |
| `remote(code, at)` | a TV-remote code 0–7; **latched** | `Ed.ReadRemote()` (NEPO IR seeker, "remote") |
| `ir_data(byte, at)` | a byte from another Edison; **latched** | `Ed.ReadIRData()` (NEPO IR receive) |
| `obstacle(where, start, end=None)` | an obstacle `'ahead'`/`'left'`/`'right'` during [start, end); re-latched while present and the **beam is on** | `Ed.ReadObstacleDetection()` via `_obstacleDetection` |
| `surface(color, at=0)` | `'black'`/`'white'` under the line tracker; the default is white | `Ed.ReadLineState()`; also latches `ReadLineChange()` |
| `light(left, right, tracker, at=0)` | raw light levels (state); the default is 0 | `Ed.ReadLeftLightLevel()` etc., which generated code divides by 10 |
| `strain(start, end=None)` | blocked wheels (state) | `Ed.ReadDriveLoad()` |

**Observation** after a run:

| Attribute / method | Content |
|---|---|
| `robot.trace` | every Ed call: `Call(t, name, args, result)`, `name` without `Ed.` |
| `robot.calls(*names, include_setup=False)` | the trace, filtered; the setup block's calls are left out by default |
| `robot.actions()`, `robot.action_names()` | only calls that change something (LEDs, driving, sound, IR send, waits) |
| `robot.format_trace()` | readable trace; repeated polling reads collapsed |
| `robot.led_timeline('left')`, `robot.leds` | `[(t, on)]`; current `{'left': bool, 'right': bool}` |
| `robot.odometer_cm`, `robot.pose`, `robot.heading_deg`, `robot.moving` | signed wheel travel; `(x, y, heading)` from start (0, 0) facing +x, counterclockwise positive; whether a wheel still turns |
| `robot.sounds` | `Sound(start, end, kind, code, freq_hz, tune)`; `freq_hz` is what the buzzer plays (`32e6 / code`) |
| `robot.ir_sent` | `[(t, byte)]` |
| `robot.program_start_ms` | when the fixed setup block was done (254 ms with the default costs) |
| `robot.now`, `robot.steps` | virtual time, and steps (Ed calls + loop iterations) |

**Pitfalls every scenario author meets** (all shown by tests in `test_engine_clap_counter.py`):
- **The setup block runs first.** Every generated program starts with `Ed.LineTrackerLed(ON)`,
  `Ed.ReadClapSensor()`, `Ed.ReadLineState()` and `Ed.TimeWait(250 ms)`. User code starts at ≈ 254 ms. A clap in
  the first ~1 ms is swallowed by that `ReadClapSensor()`; claps during the 250 ms wait are kept.
- **Latched events merge.** Two claps (or presses) between two reads are one event. Both keys pressed before a read
  give `ReadKeypad() == 5`, which equals neither `KEYPAD_TRIANGLE` nor `KEYPAD_ROUND`.
- **Generated code reads the clap sensor after every motor and stop block** to discard the robot's own noise. A clap
  scripted during a drive is therefore discarded, and so is a real one on the robot.
- **A program that waits forever ends with `status == 'time_limit'`.** A loop that never calls `Ed` doesn't advance
  virtual time and ends with `'step_limit'`. Assert on the status explicitly.
- **Motors aren't stopped when the program ends.** `robot.moving` tells you whether the last drive command was
  unlimited.

### 5.6 Level 3: generated test cases

Use ordinary loops. `subTest` gives one report line per case, in both unittest and pytest:

```python
def test_clamp_speed_properties(self):
    session = program().load()
    for speed in range(-300, 301, 7):
        got = session.call('clampSpeed', speed)
        with self.subTest(speed=speed):
            self.assertTrue(0 <= got <= 100)
            self.assertEqual(session.call('clampSpeed', got), got)    # idempotent
```

A property-testing library (e.g. Hypothesis) works as well, but the engine doesn't need one. Good generated inputs
are boundaries taken from the program: its comparison constants (100, 0), the 16-bit limits, 0 as a divisor, list
sizes as indices, and event times before, during and after the setup block (the framework's test hints list them).

### 5.7 Assertion cookbook

```python
[c.args for c in robot.calls('Drive')] == [(1, 10, 10)]                 # what was commanded: Ed.FORWARD, level 10, 10 cm
robot.action_names() == ['LeftLed', 'TimeWait', 'LeftLed', 'TimeWait']  # order of effects
[on for _, on in robot.led_timeline('left')] == [True, False] * 3       # LED pattern
robot.calls('Drive')[0].t > 3000                                        # timing, relative
abs(robot.pose[0] - 10.0) < 1e-6 and not robot.moving                   # where the robot ended up
[s.freq_hz for s in robot.sounds if s.kind == 'tone'] == [4000.0]       # a NEPO tone of 1000 Hz (4x pitch shift, quirk #26)
[byte for _, byte in robot.ir_sent] == [42]                             # IR messages
result.status == 'time_limit' and robot.calls('Drive') == []            # never got there
```

- Prefer **order and relative timing** over absolute timestamps. Absolute times depend on the cost model (§6.2).
- Compare numbers with `assertAlmostEqual`; drive durations and poses are floats.

### 5.8 Errors

| Exception | Raised when | Example message |
|---|---|---|
| `EdPyCompatibilityError` | load time (static guard, folding), or an Ed call with wrong arguments or setup-variable misuse | `'and'/'or' don't compile in Ed.Py (the Lab generates '&'/'|' instead) (line 12: …)` |
| `EdPyRuntimeError` | the program does something whose result on the robot is undefined: 16-bit overflow, division by zero, list index out of range, negative wait, shift out of range, or any Python error inside program code | `16-bit overflow: 32767 + 1 = 32768, outside -32768..32767 (the robot behaviour is unspecified) (line 47: return ___a + ___b / 2)` |
| `UnsupportedInMock` | an Ed function the Lab never generates and the mock doesn't model (events, distance counters, registers, `SimpleDrive*`) | `Ed.ResetDistance is not modelled by the mock` |
| `StepLimitExceeded` | `Session.call()` didn't return within its budget | `f() did not return within 1000 steps` |

Every `EdTestError` has `.line` and `.source_line`, which point into the EdPy program. Mapping them to NEPO blocks is
what the framework does with the source map (`nepo-unit-testing.md`).

---

## 6. What the mock does (semantics reference)

### 6.1 Integers, booleans, containers

- **Arithmetic** (`+ - * / // % << >> & | ^`, unary `- + ~`, `abs`) goes through the runtime (`__edtest__`):
  - Operands must be ints or bools; lists and floats are an error.
  - `/` and `//` are **floor division** (the EdPy spec; Python 2 on the website). `%` is Python's floor modulo.
  - Division by zero and shift counts outside 0–15 raise `EdPyRuntimeError`.
- **Overflow:** results outside −32768…32767 raise `EdPyRuntimeError` by default (`overflow='raise'`), because the
  robot's behaviour is unspecified. `run(..., overflow='wrap')` wraps them like two's complement instead, to test what
  a wrapping robot would do.
- **Constant folding at load time:**
  - Constant sub-expressions are folded with floor division, like the Python 2.7-hosted compiler of the Edison
    website.
  - After folding, any literal outside ±32767 is `constant N is out of range`, and so is −32768.
  - A constant division by zero is a load error; the real compiler crashes on it.
- **Booleans:** `True`/`False` stay Python bools, and EdPy's 0/1 compare equal to them. `not` is left unchanged.
  Generated AND/OR is `((a) & (b))` / `((a) | (b))`, so **both sides are evaluated**, as on the robot (verified in the
  EdPy assembly).
- **`x op= v`** becomes `x = x op v`. For a list element, the index expression is evaluated twice.
- **`Ed.List(n, [...])` → `EdList`:**
  - fixed size; `len()` is the size;
  - ints only;
  - any index outside 0…n−1 raises (EdPy doesn't range-check variable indices, so the robot would touch other
    memory);
  - no `append`.
- **`Ed.TuneString(n, "…")` → `TuneString`:** fixed size, and elements are single chars.
- **Builtins:** only `abs`, `len`, `ord`, `chr` and `range`. `import` resolves only `Ed`. Programs that rely on
  CPython builtins (e.g. `sum` without the generated helper) fail like on the robot.

### 6.2 Time

- **Virtual milliseconds from program start**, and nothing runs in real time. The clock moves by:
  - `call_cost_ms` per Ed call (default **1**; an assumption);
  - `loop_cost_ms` per loop iteration (default **0**);
  - the duration of blocking calls.
- **`Ed.TimeWait(t, units)`** waits `t // 10 * 10` ms, or `t * 1000` ms in seconds, like `edpy_code.py`. So
  `TimeWait(5)` doesn't wait at all, and `TimeWait(15)` waits 10 ms. A negative time is an error.
- **Blocking drives:** `Ed.Drive`/`DriveLeftMotor`/`DriveRightMotor` with a distance block until the wheels have
  travelled it. Meanwhile the world goes on: events latch and the budget counts.
- **Non-blocking:** `PlayTone`, `PlayTune`, `PlayBeep`, and unlimited drives. `StartCountDown`/`ReadCountDown` model
  the one-shot timer.
- **Budgets:** `max_time_ms` (virtual) and `max_steps` (Ed calls + loop iterations). When one runs out, `run()`
  unwinds the program with an internal `BaseException` and returns the status.

### 6.3 Sensors

| Ed function | Kind | Mock behaviour (from `edpy_code.py` unless marked) |
|---|---|---|
| `ReadClapSensor()` | latched | `CLAP_DETECTED` (4) once per latched clap, then 0 |
| `ReadKeypad()` | latched, bits ORed | the OR of the key bits pressed since the last read, then 0. Both keys → 5. |
| `ReadObstacleDetection()` | latched | 0 unless the beam is on. Then `OBSTACLE_AHEAD` (16) if ahead, else the LEFT (32) / RIGHT (8) bits. The read clears it; it re-latches while the obstacle is present (**assumption:** no detection delay). |
| `ReadRemote()` | latched | the code, then `REMOTE_CODE_NONE` (255) |
| `ReadIRData()` | latched | the byte, then 0 |
| `ReadLineChange()` | latched | 1 after the surface changed, then 0 |
| `ReadMusicEnd()` | latched, 2 bits | 1 if a tone *or* a tune has finished since the last read (the read clears both), else 0 |
| `ReadLineState()` | state | 1 on black, 0 on white. Returned even when the tracker LED is off (**assumption**). |
| `ReadLeftLightLevel()`, `ReadRightLightLevel()`, `ReadLineTracker()` | state | the scripted raw level. The raw range isn't documented. |
| `ReadDriveLoad()` | state | `DRIVE_STRAINED` (1) during a `strain()` interval |
| `ReadTuneError()` | state | 1 if the last tune string had an invalid note or duration character |
| `ReadRandom()` | – | seeded (`Robot(seed=…)`), 0–255 |

### 6.4 Actuators

- **LEDs, line-tracker LED, obstacle beam:** `state & 1`. Switching the beam off drops a pending obstacle detection
  (**assumption**).
- **Driving** (`DistanceUnits = CM`, which is the only value the Lab generates):
  - The speed level is clamped to 10 (so `_shorten(1000) = 100` → 10). `SPEED_FULL` (0) counts as level 10. A
    negative speed is an error.
  - Straight: `FORWARD`/`BACKWARD` drive both wheels. Only a distance > 0 limits the drive, as in `DriveSimple_CM`.
  - Turns: the distance is in degrees, at most one revolution (`d % 360 or 360`), with EdPy's `+1`/`+2`-tick
    corrections. Spins use half the ticks per wheel. `FORWARD_RIGHT` etc. pivot on one wheel.
  - Single motors: anything but `FORWARD` drives backward, as in `edpy_code.py`.
  - **Kinematics:** 8 ticks = 1 cm, and 1 tick ≈ 1° for a pivot turn, so the track width is 45/(2π) ≈ 7.16 cm. The
    pose is integrated exactly for piecewise-constant wheel speeds.
  - **Assumption:** level n drives at 2.5·n cm/s (`Robot(cm_per_s={1: …, …, 10: …})` to calibrate).
- **Sound:**
  - Tones last `duration // 10 * 10` ms. `PlayMyBeep` lasts 50 ms; `PlayBeep` lasts `beep_ms` (default 50;
    **assumption**).
  - Tunes: a pair of note char and duration char per note, until `z`. `1`/`2`/`4`/`8`/`6` = whole/half/quarter/
    eighth/sixteenth, and **a quarter lasts `Ed.Tempo` ms** (**assumption**: 500 ms at `TEMPO_SLOW`).
  - A new sound replaces a playing one.
  - `clear_music_end_on_play` (default False, like `edpy_code.py`): whether starting a sound clears an unread
    "finished" flag. It's unknown for the firmware (§8).
- **IR send:** recorded in `robot.ir_sent`.

### 6.5 Setup variables

`Ed.EdisonVersion`, `Ed.DistanceUnits` and `Ed.Tempo` can be set once, to an allowed value. They're recorded in
`robot.setup`. Writing any other `Ed` attribute is an error, like EdPy's `Ed.Py constant … can not be written`.

---

## 7. Fidelity: what's verified, derived or assumed

| Behaviour | Basis |
|---|---|
| Constants, signatures, setup-variable values | **dumped from EdPy 1.2.11** (`lib/edpy_values.py`) |
| Static guard rejections, literal range, constant folding | **verified with EdPy 1.2.11** (each case in `tests/test_engine.py`) |
| AND/OR evaluate both operands | **verified in the EdPy assembly** (`True \| f()` calls `f`) |
| Read-and-clear sensors, keypad bits, obstacle masks, music-end bits, TimeWait/PlayTone 10 ms units, drive tick maths, speed clamp | **derived from `lib/edpy_code.py`** (EdPy's implementation of `Ed`, which compiles to the robot's tokens) |
| Floor division at runtime, overflow behaviour | **spec only / unspecified.** The mock raises on overflow by default. |
| Wheel speed per level, beep length, tempo = quarter-note ms, call cost 1 ms, no detection delay, line state with the LED off, music flags not cleared by a new sound | **assumptions**, all configurable or documented. Calibrate against a robot if a test depends on them. |
| Program end | not modelled: the robot's motors and sounds stay as they were |

**Rule for test authors:** assert on things the "verified" and "derived" rows determine (values, order, what was
commanded, which branch ran). Treat absolute timings and distances-over-time as approximate.

---

## 8. What the engine found (verified runs)

These results come from `tests/test_engine_clap_counter.py` and `tests/test_engine_golden.py`:

| Program | Finding | Test |
|---|---|---|
| `clap_counter` | `average(4, 6)` returns **7**. Generator quirk #14 (`(a + b) / 2` → `a + b / 2`) is caught by a Level-1 test. | `test_average_of_4_and_6_is_5` (expected failure) |
| `clap_counter` | `average(32767, 2)` overflows 16 bits; the error points to the EdPy line | `test_average_overflows_16_bit` |
| `clap_counter` | a clap at t = 0 is swallowed by the setup block's `ReadClapSensor()` | `test_a_clap_at_the_very_start_…` |
| golden `math_lists` | The test program has **four** runtime problems, whatever the start value:<br>– `x / x` (line 68) and `x % x` (line 87) with x = 0, because the preceding `x - x` makes it 0;<br>– `list[x]` read and written with x = 3 on a 3-element list (lines 92–93). On the robot, that touches other memory.<br>Found by running it and neutralising each failing line in turn. The program exists to cover generator output, not to run. | `test_math_lists_divides_by_zero` |
| golden `control_logic` | starts with `while True: pass`, so it never ends and virtual time stands still | `test_control_logic_…` |
| golden `action` | **prediction, unverified on hardware:** the six `PlayTone` calls leave the "tone finished" flag set. The first `while ReadMusicEnd() == MUSIC_NOT_FINISHED` loop ends at once, and the second tune replaces the first after 3 ms. It holds if the firmware keeps the flag, as `edpy_code.py` implies (quirk #30 in `edisonv2-nepo-to-edpy.md`). | `test_action_plays_the_first_tune_…` and its counterpart with `clear_music_end_on_play=True` |
| golden `action` | the program ends while an unlimited backward curve is still driving | same test, `robot.moving` |
| golden `sensors` | finishes once every awaited event is scripted, which exercises every sensor path | `test_sensors_finishes_…` |

---

## 9. Coverage and hooks for the framework

The transformed code keeps the EdPy file name and line numbers, so tracebacks and tracing work in EdPy lines. For the
framework, the engine has three opt-in hooks (`EdProgram(..., instrument=True)` and `run/load(listeners=[...])`):

| Hook | When | Used for |
|---|---|---|
| `on_statement(index)` | before every statement of the program (`EdProgram.statements[index]` = its position) | block executions, statement coverage |
| `on_ed_call(trace_index, frame)` | at every Ed call, with the calling frame | attributing Ed calls to blocks (via code positions), helper arguments |
| `on_prelude_done(namespace)` | after helpers, setup, declarations and function definitions ran | wrapping NEPO functions to record calls |

Every engine error has a `kind` (`overflow`, `division_by_zero`, `index_out_of_range`, ...) and `positions`: the code
positions of the program frames when it happened, which the framework maps to the failing block.

Coverage per block, the source map, reporting to learners, the test data format and the detection of test-worthy
items are implemented in the framework: see `nepo-unit-testing.md`.

---

## 11. Extending and maintaining the engine

- **When the generator changes:**
  - Run `tests/test_engine_golden.py` and the framework tests. They fail if the mock stops understanding generated code.
  - The structural assumptions to watch are the setup block (ending with `Ed.TimeWait(250, …)`), the `___`/`____`
    prefixes, and the order declarations → functions → main (`program.py`, `_analyse`).
- **A new NEPO block that emits a new `Ed` function:**
  - implement `ed_<Name>` in `robot.py` (semantics from `edpy_code.py`);
  - add it to `ACTIONS` if it changes something;
  - its signature is already in `values.py` if EdPy knows it;
  - add a self-test.
- **Calibrating:** measure a real Edison V2 (cm/s per speed level, beep length, tune timing, whether a new sound
  clears the music flags). Then set the `Robot(...)` defaults, and move the rows in §7 from "assumption" to "measured".
- **Keep `tests/test_engine.py` green.** Each test there pins one semantic rule, and most rules were verified against the
  real compiler.
- **Style:** standard library only, and Python 3.8+ syntax (no `match`, no `X | Y` types). No state outside `Robot`
  and the program namespace, so tests can run in parallel.

---

## 12. Limitations and open questions

- **Runtime semantics the sources don't specify:**
  - division of negative numbers and overflow on the firmware;
  - obstacle detection latency;
  - wheel speeds;
  - tempo;
  - whether starting a sound clears the music flags;
  - what the robot does when the program ends.
- **Not modelled:**
  - `Ed.RegisterEventHandler` (the Lab never generates events);
  - the distance counters (`SetDistance`/`ReadDistance`);
  - register access;
  - `DistanceUnits` other than `CM`;
  - the robot's own noise triggering the clap sensor;
  - physical collisions (an obstacle doesn't stop the robot).
- **The static guard isn't the compiler.** It doesn't check variable types, return types, or the robot's memory and
  stack limits. Recursion is limited by CPython, not by the robot.
- **Only one program runs per robot.** Two robots talking over IR would need two robots sharing one clock. That's
  possible with this design, but not implemented.
