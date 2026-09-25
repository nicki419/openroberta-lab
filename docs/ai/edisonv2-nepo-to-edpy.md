# Edison V2 — how NEPO becomes EdPy (reference for AI agents)

> **Audience:** AI coding agents (and humans) working in this repository.
> **Scope:** the Edison V2 robot plugin `edisonv2` **only**. Other robots are deliberately ignored (see `CLAUDE.md`).
> The Edison plugin is shared with `edisonv3`, and everything here applies to both unless stated otherwise.
> **Goal context:** a learner-facing unit-testing framework for NEPO programs on the Edison V2, with automated or
> AI-assisted detection and generation of test cases. The generated EdPy is the artefact under test.
> **Status:** written 2026-09-25 against branch `work` @ `a87f69b37` (version `5.2.33-SNAPSHOT`). Statements marked
> **verified** were checked by running code: probe tests, golden-file runs, CPython with a stub `Ed` module, and the
> real **EdPy 1.2.11 compiler** run locally. Other statements come from reading code.
> **Companion docs:** `docs/ai/edpy-reference.md` (the EdPy language, the exact `Ed` API with constant values, the
> compiler and how to run it locally, firmware facts) and `docs/ai/nepo-custom-blocks.md`.

Paths are repo-relative. `…/` abbreviates `src/main/java/de/fhg/iais/roberta/` inside a module.

---

## 1. Glossary

| Term | Meaning |
|---|---|
| **NEPO** | OpenRoberta's graphical language (Blockly blocks). Stored as **Blockly XML** (`<block_set robottype="edison" xmlversion="3.1">`). |
| **Edison V2** | A small two-wheeled educational robot by Microbric. It has two drive motors, two LEDs, an obstacle detector (IR, left/front/right), two light sensors, a line tracker, a clap (sound) sensor, two buttons (play/record), IR send/receive, and a buzzer. |
| **EdPy** | The Python-*like* language Edison runs: a restricted **Python 2** dialect. No `import` except `Ed`, **integers only**, no floats, lists only as fixed-size `Ed.List(n, […])`. Programs are compiled to a WAV file by Edison's compiler (not in this repo). Reference implementation: <https://github.com/Bdanilko/EdPy>. |
| **`Ed` module** | The EdPy runtime API (`Ed.Drive(...)`, `Ed.LeftLed(...)`, `Ed.ReadClapSensor()`, constants like `Ed.FORWARD`, …). This is what a test harness must mock. |
| **WAV transfer** | The compiled program is an **audio file**. The learner plays it from the computer's headphone jack to the robot through the EdComm cable. The Lab's step-by-step instructions are the `POPUP_DOWNLOAD_STEP_*_EDISON` messages. |
| **Program / configuration** | Every NEPO project has a program XML and a configuration XML, exchanged as an **export XML**. For the Edison the configuration is **fixed and empty**: a single `robBrick_Edison-Brick` block (§7). |
| **Robot plugin** | A `.properties` file plus Java classes. Ours: `edisonv2.properties` → `#include edison.properties` (group `edison`, shared with `edisonv3`). |
| **AST / Phrase** | The Java syntax tree built from the XML (`OpenRobertaRobot/…/syntax/Phrase.java`). |
| **Worker / workflow** | A processing step (`IWorker.execute(Project)`) and a named list of workers from the plugin properties. |
| **Project** | The mutable container flowing through a workflow: ASTs, beans, source code, result key. |
| **Bean** | A worker result stored in the Project: `UsedHardwareBean`, `UsedMethodBean`, `ErrorAndWarningBean`, `NNBean`, `CodeGeneratorSetupBean`. |
| **Visitor** | One `visitXxx(Xxx)` per AST class. Validation, EdPy generation, and simulator generation are visitors. |
| **Stack machine** | JSON op-codes the *browser simulator* interprets (`EdisonStackMachineVisitor`). Not EdPy. |
| **Helper method** | An EdPy function emitted only when used, defined in `RobotEdison/src/main/resources/helperMethodsEdison.yml`. Because EdPy has no `math` module, these re-implement math on integers. |

---

## 2. The pipeline at a glance

```
 Browser (Blockly)                         Server (Java)                                      Browser                Robot
 ─────────────────  export XML  ┌─────────────────────────────────────────────┐
 NEPO program ───────────────▶ │ Project.Builder.build()  XML → AST          │
 (fixed config)                 │ executeWorkflow("run"):                     │
                                │  validate.and.collect  EdisonValidatorAnd…  │→ UsedHardware/UsedMethod beans, errors
                                │  generate              EdisonPythonVisitor  │→ EdPy source
                                │  setup, compile        EdisonCompilerWorker │→ "compiledCode" = the EdPy source (no compilation!)
                                │  regenerateNepo        RegenerateNepoWorker │→ annotated program XML (always runs)
                                └─────────────────────────────────────────────┘
                                          │ response.compiledCode (EdPy text)
                                          ▼
                     Edisonv2Connection.run() ── POST EdPy ──▶ https://api.edisonrobotics.net/ep/wav/{long|short}
                                                  ◀── {compile: "true", wav: <audio>} or {message: <compiler error>}
                     new Audio(wav) + play button ─────── audio via EdComm cable ─────────────────────▶ Edison V2
```

There's **no type-check worker** and **no textly** (`getProgramAsTextly()` returns `"- no textly -"`, verified).

---

## 3. The plugin definition

`RobotEdison/src/main/resources/edisonv2.properties`:

```properties
#include classpath:/edison.properties
robot.plugin.fileExtension.binary = wav
robot.real.name = Edison V2
robot.vendor = na
```

`edisonv3.properties` is the same, except for `robot.real.name = Edison V3`, `robot.vendor = 0x16D0` (WebUSB), and
`robot.announcement = beta`. Everything else is in **`edison.properties`**:

| Property | Value | Meaning |
|---|---|---|
| `robot.plugin.group` | `edison` | Group name: XML `robottype`, Blockly `workspace.device`, simulator model `robot.edison.ts`, help file `progHelp_edison_*.html` |
| `robot.plugin.fileExtension.source` | `py` | |
| `robot.configuration` / `.type` / `.old.toplevelblock` | `false` / `old-S` / `robBrick_Edison-Brick` | Learners can't configure anything (§7) |
| `robot.helperMethods` | `classpath:/helperMethodsEdison.yml` | |
| `robot.nn` / `robot.nn.activations` | `selectable` / `linear` | Neural-network blocks available with the `nn` extension |
| `robot.multisim` | `true` | Multi-robot simulation |
| `robot.program.default.nn` | `/edison.program.default.nn.xml` | **Points to a file that doesn't exist**, and nothing reads it |

### Workers and workflows

| Key | Class | Does |
|---|---|---|
| `validate.and.collect` | `worker.validate.EdisonValidatorAndCollectorWorker` | `EdisonValidatorAndCollectorVisitor(isSim=false)`, plus `EdisonMethods` as an additional helper enum |
| `validate.and.collect.sim` | `worker.validate.EdisonSimValidatorAndCollectorWorker` | Same, with `isSim=true` (marks blocks unsupported in the simulator) |
| `generate` | `worker.codegen.EdisonPythonGeneratorWorker` | `new EdisonPythonVisitor(programTree, beans)`. The configuration AST isn't passed at all. |
| `setup` | `worker.CompilerSetupWorker` | Unused paths for the Edison |
| `compile` | `worker.compile.EdisonCompilerWorker` | **Copies the EdPy source into `compiledHex`.** Success if the source is non-empty. Verified: `compile` returns `COMPILERWORKFLOW_SUCCESS` with the EdPy text. |
| `generatesimulation` | `worker.codegen.EdisonStackMachineGeneratorWorker` | `EdisonStackMachineVisitor` → stack-machine JSON |
| `regenerateNepo` | `worker.RegenerateNepoWorker` (generic, no textly) | AST → XML; always runs |

| Workflow | Workers |
|---|---|
| `showsource` | validate.and.collect, generate, regenerateNepo |
| `compile` / `run` | validate.and.collect, generate, setup, compile, regenerateNepo |
| `getsimulationcode` | validate.and.collect.sim, generatesimulation, regenerateNepo |
| `runnative` / `compilenative` | setup, compile (the learner-edited EdPy source is passed through) |

Execution rule (`ProjectService.executeWorkflow`): after the first failing worker, only workers with
`mustRunEvenIfPreviousWorkerFailed()` (`regenerateNepo`) still run.

---

## 4. Stage by stage

### 4.1 XML → AST

- `Jaxb2ProgramAst` looks up each block type in `AstFactory`. Every class under `de.fhg.iais.roberta.syntax.` from
  all plugins is registered there through `@NepoPhrase` / `@NepoExpr` / `@NepoBasic`.
- The tree is `List<List<Phrase>>`, one list per top-level stack, and the main stack is `[Location, MainTask, stmt…]`.
- Blocks not attached to the start block (`intask="false"`) or disabled blocks aren't generated.
- The **configuration** goes through the *old* path: `Jaxb2ConfigurationAst.blocks2OldConfig(…,
  "robBrick_Edison-Brick", "S")`. The top block has no fields, so the `ConfigurationAst` has **zero components**. All
  ports are fixed strings chosen in the blocks' dropdowns (§7).

### 4.2 validate.and.collect

`AbstractValidatorAndCollectorWorker` visits all phrases with `EdisonValidatorAndCollectorVisitor`
(`RobotEdison/…/visitor/validate/`, extends `CommonNepoValidatorAndCollectorVisitor`). Unlike boards with a user
configuration, it does **no configuration checks**. It does:
- **register helper methods** (`usedMethodBuilder.addUsedMethod(EdisonMethods.X)` or common `FunctionNames`). Drive,
  curve, and turn register `DIFFDRIVE`/`DIFFCURVE`/`DIFFTURN` + `SHORTEN` + `GETDIR`; motor on registers `MOTORON`;
  obstacle detection `OBSTACLEDETECTION`; IR `IRSEND`/`IRSEEK`; math and list functions register their helpers.
- **record used sensors** (`UsedSensor` for infrared, light, IR seeker, sound). There are no used actors.
- **add errors**, e.g. `NO_CONST_NOT_SUPPORTED` when a tone frequency isn't a literal number,
  `ERROR_MISSING_PARAMETER` for empty sockets (through `requiredComponentVisited`, verified), and
  `SIM_BLOCK_NOT_SUPPORTED` (error or warning) in the simulator workflow.
- Any error sets `Key.PROGRAM_INVALID_STATEMETNS` and generation is skipped (verified).

### 4.3 generate

`AbstractLanguageGeneratorWorker` → `EdisonPythonVisitor.generateCode(true)`. The order is:
- `AbstractPythonVisitor.generateProgramPrefix`: imports, helpers, NN code, globals;
- the main body;
- `EdisonPythonVisitor.generateProgramSuffix`, which emits only blank lines.

See §5. **Exceptions thrown here aren't block annotations.** The REST controller turns them into a generic
`SERVER_ERROR` for the learner. Examples: `DbcException("Not supported!")` for timer or cast blocks,
`IllegalArgumentException("Not an integer")` for a decimal number (verified).

### 4.4 compile, and the real compilation (browser + external service)

1. `EdisonCompilerWorker` copies the source (verified). `/rest/projectWorkflow/run` returns it as `compiledCode`
   (with result `ROBOT_PUSH_RUN`).
2. `Edisonv2Connection.run(result)` (`OpenRobertaWeb/src/app/roberta/controller/connections/connections.ts`,
   `extends AbstractPromptConnection`) shows download instructions (`POPUP_DOWNLOAD_STEP_*_EDISON`). It then calls
   `PROGRAM.externAPIRequest(urlAPI, result.compiledCode, …)`, which is a jQuery POST of the **raw EdPy text** to
   `https://api.edisonrobotics.net/ep/wav/long`. On ChromeOS/Windows it uses `ep/wav/short`, and it switches once on
   "permission denied".
3. There are three possible responses:
   - `compile == "true"`: the frontend does `new Audio(response.wav)` and shows a play button. The learner plays the
     audio into the robot.
   - A compiler error: a generic popup `Compiler Error:<br>` + the service's message. It's **not mapped back to
     blocks**.
   - Network failure: `Compiler … not available, please try it again later!`.
4. **No EdPy compiler exists in this repo** (no JS port, no Python package, no test). The server-side download
   endpoint `RobotDownloadProgram` has an `edison` → `.wav` case that never sets a file path. It's broken or unused.
   The **reference compiler** (<https://github.com/Bdanilko/EdPy>, GPL-2.0) can be run locally in check mode. That was
   verified with version 1.2.11 on a portable Python 3.6; see `edpy-reference.md` §2.
5. For comparison, `edisonv3` uses `Edisonv3Connection` (WebUSB, `…/open_roberta/compile`, returns hex).

---

## 5. Anatomy of the generated program

Real output from the golden file `_expected/robotSpecific/targetLanguage/edisonv2/math_lists.py`, shortened:

```python
import Ed                                   # the only import EdPy allows

def _abs(num):                              # ← helper functions come FIRST, only the used ones
    if (num < 0):
        return -num
    else:
        return num

def max(list):                              # ← helpers named max/min/sum SHADOW the Python builtins
    listMax = list[0]
    ...
def _pow(base, exp):                        # integer power by repeated multiplication
    ...

Ed.EdisonVersion = Ed.V2                    # ← fixed setup block (always emitted, also for edisonv3!)
Ed.DistanceUnits = Ed.CM
Ed.Tempo = Ed.TEMPO_SLOW
obstacleDetectionOn = False
Ed.LineTrackerLed(Ed.ON)
Ed.ReadClapSensor()                         # read once to clear the clap flag
Ed.ReadLineState()
Ed.TimeWait(250, Ed.TIME_MILLISECONDS)

___numberVar = 0                            # global NEPO variables: prefix ___
___booleanVar = True
___numberList = Ed.List(3, [0,0,0])         # lists are fixed-size Ed.List(n, [...])

def ____math():                             # user functions: prefix ____; every function declares all globals
    global ___numberVar, ___booleanVar, ___numberList
    ___numberVar = ___numberVar / ___numberVar          # integer division in EdPy (no float() cast)
    ___numberVar = _pow(___numberVar, ___numberVar)
    ___numberVar = ((___numberVar+5)/10)*10             # the "round" block, see §13
    ...

____math()                                  # ← main-program statements at MODULE TOP LEVEL
____lists()                                 #   (no main(), no run(), no `if __name__ == "__main__"`)
```

Generation order:
1. `import Ed`.
2. Helper methods for all used methods (from `helperMethodsEdison.yml`).
3. NN variables and `____nnStep` if NN blocks are used.
4. The fixed setup block (`EdisonPythonVisitor.visitorGenerateGlobalVariables`).
5. `visitMainTask`: user variables and user functions.
6. The start-block statements at indentation level 0.
7. The suffix, which is blank lines only.

**Consequences for a test harness (verified with CPython 3 and a stub `Ed`):**
- **Importing a generated program runs it.** It runs the setup block, then every top-level statement. In the
  experiment, importing `math_lists.py` made the setup calls `LineTrackerLed`, `ReadClapSensor`, `ReadLineState`,
  `TimeWait`, then crashed on the program's own `0 / 0`. Programs with `while True:` never return. A harness must
  either execute the file as a script under a step or time budget, or transform the source (e.g. wrap the top-level
  statements in a function) before importing.
- **Division differs.** EdPy / Python 2 `7 / 2 == 3`; CPython 3 `7 / 2 == 3.5`. Under CPython 3 the program must be
  rewritten (`/` → `//`) or run by a Python 2-compatible interpreter.
  - The EdPy spec defines `/` as floor division (`-7/2 == -4`), and Python `//` matches it.
  - The compiler's constant folding truncates under Python 3 and floors under Python 2.7.
  - The firmware's rounding for negative runtime division isn't documented anywhere; it's still an open question.

  Details are in `edpy-reference.md` §4.3.
- **Integer width differs.** EdPy integers are signed 16-bit (literals ±32767, verified with the compiler). CPython
  ints never overflow, and runtime overflow on the robot isn't specified. Tests around large values need an explicit
  model.
- **Builtins are replaced.** The helpers `max`, `min`, and `sum` shadow the builtins within the program module.
- **Globals are introspectable.** Variables are module attributes `___<name>`, and functions `____<name>` can be
  called directly once the top-level statements are neutralised.

Other code shapes:

| NEPO | EdPy |
|---|---|
| repeat N times (`controls_repeat_ext`) | `for ___k0 in range(<N>):` (Edison overrides the for-loop form: only the count is used) |
| repeat forever / while / until | `while True:` / `while <c>:` / `while not <c>:` |
| wait until (`robControls_wait_for`) | `while True:` + `if <c>: break` + `pass` |
| wait ms | `Ed.TimeWait(<ms>, Ed.TIME_MILLISECONDS)` |
| a / b | `a / b` (no cast) |
| number literal | integer as is. A **decimal throws** `IllegalArgumentException("Not an integer")` (verified). |
| list | `Ed.List(<n>, [a,b,…])` |
| any sensor via `robSensors_getSample` | wrapped in parentheses `( … )` |
| motor/drive/sound blocks | followed by `Ed.ReadClapSensor()`, so the robot's own noise doesn't count as a clap |

---

## 6. Where to change the generator

```
BaseVisitor<Void>
 └─ AbstractLanguageVisitor                 OpenRobertaRobot/…/visitor/lang/codegen/AbstractLanguageVisitor.java
     └─ AbstractPythonVisitor               OpenRobertaRobot/…/visitor/lang/codegen/prog/AbstractPythonVisitor.java  (generic Python; shared with all Python robots)
         └─ EdisonPythonVisitor             RobotEdison/…/visitor/codegen/EdisonPythonVisitor.java  (EdPy overrides; implements IEdisonVisitor)
```

- `EdisonPythonVisitor` overrides what EdPy can't do generically: imports, the setup block, the suffix, the for-loop
  form, number literals, division, lists, math functions (to helpers), wait statements, and all Edison
  sensors/actors. It also **throws** for unsupported generic blocks: timer, casts, motor get/set power, volume.
- Everything it doesn't override comes from `AbstractPythonVisitor`: control flow, logic, variables, functions,
  assert/debug/serial print (`print(...)`), NN, and more.
- `IEdisonVisitor` (`RobotEdison/…/visitor/IEdisonVisitor.java`) declares the Edison-relevant visit methods. It's
  implemented by exactly three classes: `EdisonPythonVisitor`, `EdisonValidatorAndCollectorVisitor`, and
  `EdisonStackMachineVisitor` (verified by compilation, see `nepo-custom-blocks.md`).
- **Adding or changing a block:** see `docs/ai/nepo-custom-blocks.md`. **Changing output for an existing block:**
  change the `visitXxx` in `EdisonPythonVisitor`, then update the golden `.py` files for **both** `edisonv2` and
  `edisonv3` (§10).

---

## 7. Fixed ports (no user configuration)

`robot.configuration = false`: the configuration tab only shows a picture (`css/img/edisonBackgroundConf.svg`), and the
configuration XML is always a single `<block type="robBrick_Edison-Brick" id="1"/>`, which has no Blockly
definition. Ports are **hard-coded dropdown values** in the Blockly definitions (`workspace.device === "edison"`
branches), and the generator switches directly on `getUserDefinedPort()`:

| Hardware | Port values (XML `SENSORPORT` / `MOTORPORT` / `ACTORPORT`) | Blocks |
|---|---|---|
| Drive motors | `LMOTOR`, `RMOTOR` | `robActions_motor_on(_for)`, `robActions_motor_stop` |
| LEDs | `LLED`, `RLED` | `actions_led_edison` |
| Obstacle detector (IR) | `LEFT`, `RIGHT`, `FRONT` | `robSensors_infrared_getSample` |
| Light sensors | `LLIGHT`, `RLIGHT`, `LINETRACKER` | `robSensors_light_getSample` (mode LIGHT; mode LINE only `LINETRACKER`) |
| Buttons | `PLAY` (triangle), `REC` (round) | `robSensors_key_getSample` |
| Clap sensor, IR seeker | no port (`- EMPTY_PORT -`) | `robSensors_sound_getSample`, `robSensors_irseeker_getSample` |

More port details:
- The generator also accepts **legacy** values from old programs: motor stop `B`/`C`, LED `2`/`1`, reset `IRCODE`.
- The reset block's `SENSOR` values are `OBSTACLEDETECTOR`, `KEYPAD`, `SOUND`, `RCCODE`.
- Nothing validates ports. An unknown port silently produces an empty expression (keys) or a `DbcException` (LED).
- `Jaxb2ConfigurationAst.blocks2OldConfig` builds zero components, so `robotConfiguration` is useless for Edison
  blocks.

---

## 8. Block inventory (toolbox → AST → EdPy)

Sources: the toolboxes `RobotEdison/src/main/resources/edison.program.toolbox.{beginner,expert}.xml`, the `@Nepo…`
annotations, `EdisonPythonVisitor` / `AbstractPythonVisitor`, the Edison branches of the Blockly definitions, and
the five golden files.

- Every toolbox block maps to an annotated AST class with an EdPy visit method.
- **Lvl:** B+E = beginner and expert toolbox, E = expert only. The beginner toolbox is flat: all actions under
  `TOOLBOX_ACTION`, all control blocks under `TOOLBOX_CONTROL`.
- **Gen** = where the EdPy comes from: **Ed** = `EdisonPythonVisitor`, **Py** = `AbstractPythonVisitor`, **Lang** =
  `AbstractLanguageVisitor`.
- AST class packages are relative to `de.fhg.iais.roberta.syntax.` (OpenRobertaRobot unless marked **[RE]**,
  RobotEdison).

### Action › Move, Drive, Sound, Light

| Blockly type | Lvl | AST class | Gen | EdPy | Notes (collector / validation) |
|---|---|---|---|---|---|
| `robActions_motor_on` | E | `action.motor.MotorOnAction` | Ed | `_motorOn(0\|1, <POWER>, Ed.DISTANCE_UNLIMITED)` for `LMOTOR`/`RMOTOR` | helpers `_motorOn`, `_shorten`, `_getDirection`; the Edison block has no duration |
| `robActions_motor_stop` | E | `action.motor.MotorStopAction` | Ed | `Ed.DriveLeftMotor(Ed.STOP, Ed.SPEED_1, 1)` / `Ed.DriveRightMotor(…)`, then `Ed.ReadClapSensor()` | |
| `robActions_motorDiff_on_for` / `_on` | B+E | `action.motor.differential.DriveAction` | Ed | `_diffDrive(Ed.FORWARD\|Ed.BACKWARD, <POWER>, <DISTANCE>\|Ed.DISTANCE_UNLIMITED)` (+ `Ed.ReadClapSensor()` if limited) | distance in cm; helpers `_diffDrive`, `_shorten`, `_getDirection` |
| `robActions_motorDiff_stop` | B+E | `action.motor.differential.MotorDriveStopAction` | Ed | `Ed.Drive(Ed.STOP, Ed.SPEED_1, 1)`, then `Ed.ReadClapSensor()` | |
| `robActions_motorDiff_turn_for` / `_turn` | B+E | `action.motor.differential.TurnAction` | Ed | `_diffTurn(Ed.SPIN_RIGHT\|Ed.SPIN_LEFT, <POWER>, <DEGREE>\|Ed.DISTANCE_UNLIMITED)` (+ clap reset if limited) | helper `_diffTurn` |
| `robActions_motorDiff_curve_for` / `_curve` | B+E | `action.motor.differential.CurveAction` | Ed | `_diffCurve(dir, <POWER_LEFT>, <POWER_RIGHT>, <DISTANCE>\|Ed.DISTANCE_UNLIMITED)` (+ clap reset if limited) | helper `_diffCurve` |
| `robActions_play_tone` | B+E | `action.sound.ToneAction` | Ed | `Ed.PlayTone(8000000/<FREQ>, <DUR>)`, `Ed.TimeWait(<DUR>, Ed.TIME_MILLISECONDS)`, `Ed.ReadClapSensor()` (DUR is emitted twice) | **error `NO_CONST_NOT_SUPPORTED`** unless FREQ is a number literal |
| `mbedActions_play_note` | B+E | `action.sound.PlayNoteAction` | Ed | `Ed.PlayTone(4000000/<int(freq)>, <dur>)`, `Ed.TimeWait(<dur>, …)`, `Ed.ReadClapSensor()` | Both are fields. Note frequency truncated (`261.626` → `261`); dur ∈ 2000/1000/500/250/125. `4000000` rather than `8000000` because "numbers get too big for Edison". |
| `robActions_play_file` | B+E | `action.sound.PlayFileAction` | Ed | `___soundfile<N> = Ed.TuneString(len, "…")`, `Ed.PlayTune(___soundfile<N>)`, `while (Ed.ReadMusicEnd() == Ed.MUSIC_NOT_FINISHED): pass`, `Ed.ReadClapSensor()` | 5 fixed tunes (FILE `0`–`4`); sim warning; `___soundfileN` can collide with a user variable `soundfileN` |
| `actions_led_edison` | B+E | `action.light.LedAction` | Ed | `Ed.LeftLed(Ed.ON\|Ed.OFF)` for `LLED`, `Ed.RightLed(…)` for `RLED` | other values → `DbcException` |

### Sensors

The Blockly `sensorsAll.edison` is key, infrared, irseeker, light, sound. There's **no timer**.

| Blockly type | Lvl | AST class | Gen | EdPy | Notes |
|---|---|---|---|---|---|
| `robSensors_key_getSample` | B+E | `sensor.generic.KeysSensor` | Ed | `(Ed.ReadKeypad() == Ed.KEYPAD_TRIANGLE)` for `PLAY`, `… KEYPAD_ROUND)` for `REC` | not collected; an unknown port gives an empty expression |
| `robSensors_infrared_getSample` | B+E | `sensor.generic.InfraredSensor` | Ed | `_obstacleDetection(Ed.OBSTACLE_AHEAD\|OBSTACLE_LEFT\|OBSTACLE_RIGHT)` for `FRONT`/`LEFT`/`RIGHT` | `UsedSensor(port, INFRARED, OBSTACLE)`; helper switches the IR beam on |
| `robSensors_irseeker_getSample` | B+E | `sensor.generic.IRSeekerSensor` | Ed | `_irSeek(1)` (RCCODE; legacy EDISON_CODE → `_irSeek(0)`) | sim error |
| `robSensors_light_getSample` | B+E | `sensor.generic.LightSensor` | Ed | LIGHT: `Ed.ReadLeftLightLevel() / 10`, `Ed.ReadRightLightLevel() / 10`, `Ed.ReadLineTracker() / 10`. LINE (only `LINETRACKER`): `(Ed.ReadLineState() == Ed.LINE_ON_BLACK)` | simulated. LLIGHT/RLIGHT approximate ground brightness (§12.3). |
| `robSensors_sound_getSample` | B+E | `sensor.generic.SoundSensor` | Ed | `(Ed.ReadClapSensor() == Ed.CLAP_DETECTED)` | `UsedSensor(- EMPTY_PORT -, SOUND, SOUND)` |
| `edisonSensors_sensor_reset` | B+E | `sensors.edison.ResetSensor` [RE] | Ed | a bare read to clear: `Ed.ReadObstacleDetection()`, `Ed.ReadKeypad()`, `Ed.ReadClapSensor()`, or `Ed.ReadRemote()` + `Ed.ReadIRData()` | sim warning |
| `robSensors_getSample` (preset in `robControls_wait_for`) | B+E | `sensor.generic.GetSampleSensor` | Ed | `(` + sensor code + `)`; SENSORTYPE ∈ `KEY_PRESSED`, `INFRARED_OBSTACLE`, `IRSEEKER_RCCODE`, `LIGHT_LIGHT`, `LIGHT_LINE`, `SOUND_SOUND` | |

### Control

| Blockly type | Lvl | AST class | Gen | EdPy |
|---|---|---|---|---|
| `robControls_if`, `robControls_ifElse` | B+E | `lang.stmt.IfStmt` | Py | `if c:` / `elif c:` / `else:`; an empty branch gets `pass` (a comment-only branch doesn't, §13) |
| `robControls_loopForever` | B+E | `lang.stmt.RepeatStmt` FOREVER | Py | `while True:` |
| `controls_repeat_ext` | B+E | `RepeatStmt` TIMES | Py + Ed | `for ___k<N> in range(<TIMES>):` |
| `controls_whileUntil` | E | `RepeatStmt` WHILE/UNTIL | Py | `while <c>:` / `while not <c>:` |
| `robControls_wait`, `robControls_wait_for` | E / B+E | `lang.stmt.WaitStmt` | Ed | `while True:` + per branch `if <c>:` … `break`, then `pass`. Busy wait, no sleep. |
| `robControls_wait_time` | B+E | `lang.stmt.WaitTimeStmt` | Ed | `Ed.TimeWait(<ms>, Ed.TIME_MILLISECONDS)` |

### Logic, Math, Text, Lists

| Blockly type | Lvl | AST class | Gen | EdPy | Notes |
|---|---|---|---|---|---|
| `logic_compare` | B+E | `lang.expr.Binary` | Py | `==`, `!=`, `<`, `<=`, `>`, `>=` (a Binary operand is parenthesised) | |
| `logic_negate` | E | `lang.expr.Unary` NOT | Lang | `not <x>` | |
| `logic_boolean` | B+E | `lang.expr.BoolConst` | Py | `True`/`False` | |
| `math_integer` | B+E | `lang.expr.NumConst` | Ed | integer literal | a decimal throws (§13) |
| `math_arithmetic` | B+E | `Binary` (POWER → `lang.functions.MathPowerFunct`) | Ed / Py | `+ - *`, **`a / b` without parentheses** (§13), POWER → `_pow(a, b)` | |
| `math_single` | E | `MathSingleFunct` / `Unary` NEG | Ed | ABS → `_abs(x)`, NEG → `- (x)`, POW10 → `_pow(10, x)` (only these three offered) | |
| `math_number_property` | E | `MathNumPropFunct` | Py | EVEN `(x % 2) == 0`, ODD `… == 1`, PRIME `_isPrime(x)`, POSITIVE `x > 0`, NEGATIVE `x < 0`, DIVISIBLE_BY `(x % d) == 0` | no WHOLE |
| `robMath_change` | E | `lang.stmt.MathChangeStmt` | Lang | `___v += <d>` | |
| `math_on_list` | E | `MathOnListFunct` | Ed / Py | SUM `sum(l)`, MIN `min(l)`, MAX `max(l)` (helpers named like builtins), AVERAGE `sum(l) / len(l)` | **AVERAGE alone doesn't emit `sum`** (§13) |
| `math_modulo` | E | `MathModuloFunct` | Lang | `( ( a ) % ( b ) )` | |
| `text_comment` | B+E | `lang.stmt.StmtTextComment` | Py | `# <text>` | the only text block; there are no strings |
| `robLists_create_with` | E | `lang.expr.ListCreate` | Ed | `Ed.List(<n>, [a,b,…])` | fixed size, Number only |
| `robLists_length` | E | `LengthOfListFunct` | Py | `len( l)` | |
| `robLists_getIndex` / `robLists_setIndex` | E | `ListGetIndex` / `ListSetIndex` | Py | `l[i]` / `l[i] = v` | only GET/SET with FROM_START (0-based) |

### Neural network (`#ifdef nn`)

- `robActions_NNstep` → `____nnStep()`
- `robActions_set_inputneuron_val` → `____<n> = <v>`
- `robSensors_get_outputneuron_val` → `____<n>`
- expert only: set weight `____w_<a>_<b> = <v>`, set bias `____b_<n> = <v>`, get weight, get bias

The NN variables and `def ____nnStep():` go into the prefix. Float weights and biases are emitted as they are,
without rejection.

### Communication (expert only)

| Blockly type | AST class | EdPy | Notes |
|---|---|---|---|
| `edisonCommunication_ir_sendBlock` | `actors.edison.SendIRAction` [RE] | `_irSend(<sendData>)` | sim warning |
| `edisonCommunication_ir_receiveBlock` | `actors.edison.ReceiveIRAction` [RE] (`@NepoExpr`, Number) | `_irSeek(0)` → `Ed.ReadIRData()` | sim error |

### Variables and functions (custom flyouts)

| Blockly type | AST class | EdPy |
|---|---|---|
| `robGlobalVariables_declare` (start block) | `lang.expr.VarDeclaration` | module-level `___v = <init>`. Types offered: Number, Boolean, Array_Number. |
| `variables_get` / `variables_set` | `Var` / `AssignStmt` | `___v` / `___v = <e>` |
| `robProcedures_defnoreturn` / `defreturn` (E) | `MethodVoid` / `MethodReturn` | `def ____f(___p):` + `global <all globals>` (only if globals exist) + body (+ `return <e>`) |
| `robProcedures_callnoreturn` / `callreturn` (E) | `MethodCall` | `____f(<args>)` |
| `robProcedures_ifreturn` (E) | `MethodIfReturn` (**Ed** override) | `if <c>: return <v>` or `if <c>: return` |

### Not in the Edison toolbox, but accepted if imported

- `logic_operation` (and/or): "not supported" per `testSpec.yml`, but nothing rejects it.
- `controls_flow_statements` (break/continue): inside a wait-in-loop it emits `raise BreakOutOfALoop`, and **that
  class is never defined** in Edison output.
- `math_round`: legacy integer tricks (§13).
- `robActions_assert` / `robActions_debug`: via hidden shortcuts, they emit `print`, which EdPy rejects (verified).
- Anything else that `AbstractPythonVisitor` handles generically (`math.*`, `random.*`, `str()`, `"".join`, list
  `.pop`/`.insert`) is emitted **without rejection**, even though it isn't valid EdPy.

---

## 9. The `Ed` runtime API the generated code uses (what a mock must provide)

This is the complete list for the current generator: the union of `EdisonPythonVisitor`, `helperMethodsEdison.yml`,
and all golden files. **Exact constant values, signatures, and semantics** (read-and-clear sensors, blocking vs
non-blocking, units) come from the EdPy source and are in `edpy-reference.md` §5–§8. A mock must use those values,
because generated code compares against them (e.g. `Ed.KEYPAD_ROUND == 4`).

| Group | Name | Kind | Emitted forms |
|---|---|---|---|
| Setup | `EdisonVersion`, `DistanceUnits`, `Tempo` | module attributes that are **assigned** | `Ed.EdisonVersion = Ed.V2`, `Ed.DistanceUnits = Ed.CM`, `Ed.Tempo = Ed.TEMPO_SLOW` |
| | `V2`, `CM`, `TEMPO_SLOW` | constants | |
| Driving | `Drive(dir, speed, dist)` | function | `(Ed.STOP, Ed.SPEED_1, 1)`, `(Ed.STOP, 1, 1)`, `(Ed.FORWARD\|Ed.BACKWARD, spd, dist\|Ed.DISTANCE_UNLIMITED)`, `(Ed.SPIN_LEFT\|Ed.SPIN_RIGHT, spd, degrees\|…)` |
| | `DriveLeftMotor(dir, speed, dist)`, `DriveRightMotor(…)` | functions | `(Ed.STOP, Ed.SPEED_1, 1)`, `(Ed.STOP, 0, 0)`, `(Ed.FORWARD\|Ed.BACKWARD, spd, dist\|…)` |
| | `FORWARD`, `BACKWARD`, `SPIN_LEFT`, `SPIN_RIGHT`, `STOP`, `SPEED_1`, `DISTANCE_UNLIMITED`, `MOTOR_LEFT` (**code assumes 0**), `MOTOR_RIGHT` (**assumes 1**) | constants | speeds are 0–10 after `_shorten` |
| LEDs | `LeftLed(state)`, `RightLed(state)`, `LineTrackerLed(state)`, `ObstacleDetectionBeam(state)` | functions | `(Ed.ON)` / `(Ed.OFF)` |
| | `ON`, `OFF` | constants | |
| Sound | `PlayTone(period, durationMs)` | function | `Ed.PlayTone(8000000/<f>, <d>)`, `Ed.PlayTone(4000000/<f>, <d>)` |
| | `TuneString(length, "notes")`, `PlayTune(tune)`, `ReadMusicEnd()`, `MUSIC_NOT_FINISHED` | functions + constant | `while (Ed.ReadMusicEnd() == Ed.MUSIC_NOT_FINISHED): pass` |
| Buttons | `ReadKeypad()`, `KEYPAD_TRIANGLE`, `KEYPAD_ROUND` | function + constants | comparison, or a bare call (reset) |
| Obstacle | `ReadObstacleDetection()`, `OBSTACLE_AHEAD`, `OBSTACLE_LEFT`, `OBSTACLE_RIGHT` | function + constants | inside `_obstacleDetection`; bare call (reset) |
| Light | `ReadLeftLightLevel()`, `ReadRightLightLevel()`, `ReadLineTracker()` | functions → int | always `… / 10` |
| | `ReadLineState()`, `LINE_ON_BLACK` | function + constant | comparison; bare call in the setup block |
| Clap | `ReadClapSensor()`, `CLAP_DETECTED` | function + constant | comparison; **bare call** after setup, stops, limited drives/turns/curves, and tones/notes/tunes, and as a reset |
| IR | `SendIRData(int)`, `ReadIRData()`, `ReadRemote()` | functions | via `_irSend` / `_irSeek`; bare calls (reset) |
| Timing | `TimeWait(t, unit)`, `TIME_MILLISECONDS` | function + constant | `Ed.TimeWait(<t>, Ed.TIME_MILLISECONDS)` |
| Lists | `List(size, [init…])` | constructor | `Ed.List(3, [0,0,0])`, `Ed.List(0, [])`. It must support `[i]`, `[i] = v`, `len()`; fixed size. |

Python features the code relies on:
- `len` and `range`. `sum`/`min`/`max` are helpers, but CPython silently falls back to its builtins when a helper is
  missing (§13).
- `global`, `while`, `for … in range(n)`, `if/elif/else`, `not`, `%`, and `/` meaning **integer division**.

**Modelling hint:** the event sensors (clap, keypad, obstacle, remote, IR data) behave like **latched events that a
read clears**. That's why the generator emits bare "reset" reads. A mock should model them that way.

### Helper functions (from `helperMethodsEdison.yml`, emitted only when used)

- `helperMethodsEdison.yml` includes `common.methods.yml`. Edison keys replace common ones.
- Definitions are emitted **in alphabetical order of the enum name**, only for used methods with a `PYTHON:` body,
  before the setup block.
- The call-site name is taken from the `def` line.

| Key (enum) | EdPy function | Triggered by | Algorithm / caveats |
|---|---|---|---|
| `PRIME` | `_isPrime(num)` | "is prime" | trial division by 2…num−1, O(n) |
| `MIN`, `MAX`, `SUM` | `min(list)`, `max(list)`, `sum(list)` | `math_on_list` | linear scans. **Shadow the builtins.** min/max of an empty list → index error. The sum can overflow 16 bits. |
| `ABS` | `_abs(num)` | `math_single` ABS | |
| `POWER` | `_pow(base, exp)` | POWER, POW10 | repeated multiplication. `exp < 0` → returns **1**. Overflows 16 bits quickly. |
| `OBSTACLEDETECTION` | `_obstacleDetection(mode)` | infrared sensor | switches `Ed.ObstacleDetectionBeam(Ed.ON)` on first use (global `obstacleDetectionOn`), then `Ed.ReadObstacleDetection() == mode` |
| `IRSEND` | `_irSend(payload)` | IR send | beam off, then `Ed.SendIRData(payload)` |
| `IRSEEK` | `_irSeek(mode)` | IR seeker (1), IR receive (0) | beam off; `0` → `Ed.ReadIRData()`, `1` → `Ed.ReadRemote()` |
| `MOTORON` | `_motorOn(motor, power, distance)` | motor on | sign → direction; `_shorten(\|power\|)`; compares `motor` with `Ed.MOTOR_LEFT/RIGHT` (the generator passes 0/1) |
| `DIFFDRIVE` | `_diffDrive(direction, speed, distance)` | drive | a negative speed flips the direction; speed 0 → stop |
| `DIFFTURN` | `_diffTurn(direction, speed, degree)` | turn | a negative speed swaps SPIN_LEFT/RIGHT |
| `DIFFCURVE` | `_diffCurve(direction, left, right, distance)` | curve | Drives the faster wheel for `distance`. **When both speeds are equal, the right wheel's sign is ignored.** |
| `SHORTEN` | `_shorten(num)` | with all motor/drive helpers | `((num+5)/10)` maps percent to Edison speed 0–10. **No clamping:** power 1000 gives speed 100. |
| `GETDIR` | `_getDirection(dir, reverse)` | with all motor/drive helpers | flips FORWARD/BACKWARD |

These keys are collected but have no Python body, so they're silently ignored: AVERAGE, EVEN, ODD, POSITIVE,
NEGATIVE, DIVISIBLE_BY, ROUND, ROUNDUP, ROUNDDOWN, GET, SET. The common `_median`/`_standard_deviation` exist, but
Edison can't reach them. There's no square root, trigonometry, or random helper.

---

## 10. Existing test infrastructure

### 10.1 Golden-file tests (`ReuseIntegrationAsUnitTest`, verified)

- `OpenRobertaServer/src/test/resources/crossCompilerTests/testSpec.yml`:

  ```yaml
  edisonv2: { template: edison, dir: edison, suffix: ".py", pylintIgnoredModules: [ "Ed" ] }
  edisonv3: { template: edison, dir: edison, suffix: ".py", pylintIgnoredModules: [ "Ed" ] }
  ```

  **Both robots read the same input directory** `robotSpecific/edison/`.
- There are five input programs: `action.xml`, `control_logic.xml`, `math_lists.xml`, `sensors.xml`,
  `text_messages_functions.xml`. Expected outputs exist per robot:
  `_expected/robotSpecific/{astGenerated,targetLanguage,collectorResults}/{edisonv2,edisonv3}/`. The V2 and V3
  `.py` files are identical, because the generator hard-codes `Ed.EdisonVersion = Ed.V2`.
- `testAllRobotSpecificProgramsAsUnitTests` checks four things per program and robot: the AST dump, the XML round
  trip, the generated EdPy (`showsource`), and the collector output (used sensors and methods).
- **Adding one program needs expected files for both `edisonv2` and `edisonv3`** (verified: the run fails for both,
  writes both outputs to `OpenRobertaServer/target/unitTests/_expected/…`, and auto-creates both collector files with
  a header line).
- The comparison ignores all whitespace inside lines, **including indentation**.
- **Not covered:** the common programs (`testAllCommonProgramsAsUnitTests` only generates for ev3lejosv1,
  calliope2017NoBlue, ev3dev, wedo, microbitv2), so loops, math, and lists are only covered by the five Edison
  programs. There are no expected stack-machine outputs for Edison.

Commands:

```bash
mvn -pl OpenRobertaServer -am test -Dtest='ReuseIntegrationAsUnitTest#testAllRobotSpecificProgramsAsUnitTests' -DfailIfNoTests=false
mvn -o -pl OpenRobertaServer test -Dtest=ReuseIntegrationAsUnitTest -DfailIfNoTests=false   # after mvn install -DskipTests
```

### 10.2 Other tests

| Test | Relevance for Edison |
|---|---|
| `TestToolboxBlocksAreUsedInTestFiles` | Every block in the Edison toolboxes must appear in a test XML (`common/**` or `robotSpecific/edison/**`). Runs for both robots. |
| `NepoAnnotationValidTest` | Executes 0 tests when run alone (it never calls `AstFactory.loadBlocks()`). Don't rely on it. |
| `PythonLinterWorkflowRobotSpecificIT` (`-PrunIT`) | pylint 3.x on the expected `.py` with `--ignored-modules=Ed`. This checks **Python 3** syntax, not EdPy validity. |
| `CompilerWorkflowRobot{Specific,Common}IT` (`-PrunIT`) | For the Edison, "compile" only means a non-empty source. |
| `TestTypecheck` | Doesn't cover Edison, which has no type checker. |
| `RobotEdison/src/test` | **No Java tests.** `resources/collector/all_helper_methods.xml` is orphaned; no test references it. |
| `OpenRobertaWeb` | Nothing Edison-related (`testData/` and the headless stack-machine runner are WeDo-only). |

**No test in this repo compiles EdPy or calls the Edison service.** A manual local check with the reference compiler
showed that **all five golden files pass EdPy 1.2.11** (`EdPy.py -c` → `{"error": false}`), but nothing automates
that. Wiring such a check into the build or the test framework is an open option. Mind the GPL licence of EdPy (see
`edpy-reference.md`).

---

## 11. EdPy restrictions and what they mean for a mock

The authoritative rules are in the EdPy compiler; see `edpy-reference.md` §3–§4 and its error catalogue §9. Its
key rules:
- ints are signed 16-bit (literals ±32767)
- no floats and no strings except tune strings
- a variable's type is fixed on first assignment
- only `import Ed`
- no `print`, `raise`, or `**`; `and`/`or` don't work
- a comment-only body is a syntax error
- `Ed.EdisonVersion`/`DistanceUnits`/`Tempo` must be set once, in main code

The table below shows what the **OpenRoberta side** encodes in response:

| Restriction | Where it shows up |
|---|---|
| Integers only | `EdisonPythonVisitor.visitNumConst` throws on decimals; `visitBinary` emits `/` without `float()`; round, round-up, and round-down are rewritten as integer tricks (§13); `PlayNote` uses `4000000/f` so values stay small |
| No modules except `Ed` | Math and list functions are YAML helpers (`_abs`, `_pow`, `_isPrime`, `sum`, `min`, `max`, …) |
| Fixed-size lists | `Ed.List(n, […])`; the Blockly list blocks only offer GET/SET with FROM_START |
| No strings, casts, timer, volume, or motor power reading | The generator throws `DbcException`; the Blockly/toolbox side hides most of these |
| "No nested statements (e.g. `if (a and b):`)" | Class comment of `EdisonPythonVisitor`; `testSpec.yml` excludes many common programs for Edison ("not supported", "AND/OR blocks not supported", "no real numeric type", "no strings") |
| Blockly limits for `device === "edison"` | Variable types only Number, Boolean, Array_Number; `math_single` only ABS, NEG, POW10; `math_on_list` only SUM, MIN, MAX, AVERAGE; no WHOLE property |

**Fidelity gaps between CPython + stub and a real Edison** (design inputs for the framework):
1. Integer division semantics. Use floor semantics (`//`), per the EdPy spec. Negative runtime division on the
   firmware is unspecified.
2. 16-bit overflow. The range is known; the wrap behaviour isn't specified.
3. Top-level execution on import.
4. Real-time behaviour:
   - `Ed.TimeWait` blocks, with 10 ms resolution.
   - Driving for a limited distance blocks.
   - `PlayTone`/`PlayTune` **don't** block, so the generated code busy-waits
     `while Ed.ReadMusicEnd() == Ed.MUSIC_NOT_FINISHED: pass`, or calls `TimeWait`.

   These need a virtual clock and a scripted world model.
5. Sensor semantics, now confirmed from `edpy_code.py`:
   - clap, keypad, obstacle, remote, IR data, and line change are **latched events cleared by reading**;
   - line state and light levels are plain state;
   - see `edpy-reference.md` §5.1 and §8.
6. Programs CPython runs but EdPy rejects, e.g. builtin `sum`, `print`, `and`/`or`, and floats. **Run the local EdPy
   check (`EdPy.py -c`) before executing a program in a mock.** It's the same compiler family as the Edison service,
   although the service's deployed version is unknown.

---

## 12. Lab integration points (for building the learner-facing feature)

### 12.1 REST (server)

`ProjectWorkflowRestController` (`/rest/projectWorkflow/…`):

| Endpoint | Workflow | Returns |
|---|---|---|
| `/source` | `showsource` | `sourceCode` (EdPy) and the annotated `progXML` |
| `/sourceSimulation` | `getsimulationcode` | `javaScriptProgram` (stack-machine JSON) |
| `/run` | `run` | `compiledCode` (= the EdPy source), result `ROBOT_PUSH_RUN` |
| `/runNative` | `runnative` | learner-edited EdPy passed through |

Block errors come back inside `progXML` (`<error>`/`<warning>`). Worker exceptions become `SERVER_ERROR`.

### 12.2 Frontend

- REST calls: `OpenRobertaWeb/src/app/roberta/models/program.model.js` (`showSourceProgram`, `runOnBrick`,
  `runInSim`, `externAPIRequest`).
- Upload: `Edisonv2Connection` in `connections.ts` (§4.4). The connection class is chosen by name
  (`capitalizeFirstLetter(robot) + 'Connection'`).
- Show source: `progCode.controller.js`. Help: `OpenRobertaServer/staticResources/help/progHelp_edison_{en,de}.html`
  (outdated: it documents blocks that aren't in the toolbox).

### 12.3 Simulator (the other execution path)

- **Server:** `EdisonStackMachineVisitor` generates ops.
- **Browser:** `OpenRobertaWeb/src/app/simulation/simulationLogic/robot.edison.ts` (`RobotEdison extends
  RobotBaseMobile`). It has a differential chassis `EdisonChassis` (`LMOTOR`/`RMOTOR`), `EdisonLeds`,
  It has:
  - a differential chassis `EdisonChassis` (`LMOTOR`/`RMOTOR`);
  - `EdisonLeds`;
  - `EdisonInfraredSensors` (FRONT/LEFT/RIGHT, obstacle if the distance is under 3);
  - the line tracker `LineSensor` at (15, 0) (light 0–100, line if light < 50) → `values.infrared.light` / `.line`;
  - the **left/right light sensors** `EdisonLightSensors` at the LEDs (16.5, ∓4.5). They report the **ground brightness**
    below them (0–100 %) → `values.infrared.LLIGHT.light` / `values.infrared.RLIGHT.light`. That's an approximation:
    the real sensors measure the light in front of the robot, but the simulated scene has no light sources.
  - a clap sensor `SoundSensorBoolean` (microphone volume > 25);
  - buttons (play/rec).

  For LLIGHT/RLIGHT the server emits `GET_SAMPLE infrared` with `mode light` **and `port`**; the line tracker has no
  port.
- **Not simulated** (`SIM_BLOCK_NOT_SUPPORTED`):
  - errors: IR seeker, receive IR;
  - warnings (the block is a no-op): play file, send IR, reset sensor.
- **Sensor values panel** (`#sensorValuesView`). Every robot property with a `getLabel()` is listed, sorted by
  `labelPriority`:
  - infrared sensor → front / left / right (true/false)
  - line tracker, labelled "infrared sensor → bottom left → line / light"
  - light sensor → left / right (%)
  - sound sensor (true/false)

  Buttons, motors, and LEDs have no rows.

The simulator is a candidate test runtime with a ready-made world model. Note that it executes the **stack-machine**
program, not the EdPy.

### 12.4 Test-like features that already exist

`robActions_assert`, `robActions_debug`, and `robActions_serial_print` are **in no Edison toolbox**. Assert and debug can
still be created with the hidden shortcuts Ctrl/Cmd+3 and Ctrl/Cmd+2 (`menu.controller.ts`).
- The validator doesn't reject them.
- The generator emits `print(...)`, and for assert `if not <cmp>: print("Assertion failed: ", …)`. **EdPy rejects
  it** (`Unknown function print`, verified), so any program containing these blocks can't be run on the robot. The
  robot has no text output anyway. A learner-facing assertion mechanism therefore has to live outside the EdPy
  program, in the test harness or the mock, or compile to something EdPy accepts.
- In the simulator they work: `console.assert`/`console.log` in the browser, with no UI.

### 12.5 Where a learner test feature can hook in (facts, not a design)

- **New workflow:** add `robot.plugin.workflow.<name>` + `robot.plugin.worker.<type>` in `edison.properties`, e.g.
  `validate.and.collect,generate,<yourTestWorker>`. Expose it through a new endpoint.
- **Available inputs:**
  - the EdPy source (`project.getSourceCodeBuilder()`)
  - the used sensors and helper methods (`UsedHardwareBean`, `UsedMethodBean`), which tell a harness what to mock
  - the annotated XML
  - block ids on every phrase, which lets results be mapped back to blocks
- **Execution options:**
  1. EdPy under CPython with a mock `Ed`, after a source transformation that neutralises top-level execution and fixes
     `/` (§5, §11).
  2. The stack-machine interpreter with a scripted robot behaviour (the simulator's world model).
  3. **The EdPy reference compiler run locally** (`EdPy.py -c`, verified). It gives compile validity with exact
     error messages and line numbers, and can be mapped to blocks through line → phrase bookkeeping. It's
     GPL-licensed and runs only on Python 2.7/3.6. See `edpy-reference.md` §2.
  4. The Edison service itself. That's syntax validation plus a WAV, it needs network access, and it sends learner
     code to a third party.

---

## 13. Known quirks, bugs and test candidates

| # | Status | Finding | Where |
|---|---|---|---|
| 1 | **verified** | Importing a generated program executes it; there's no guard (§5). | `EdisonPythonVisitor.visitMainTask` / `generateProgramSuffix` |
| 2 | **verified** | A decimal number (e.g. `1.5` in XML) crashes generation with `IllegalArgumentException: Not an integer`. The learner gets `SERVER_ERROR`, not a block error. | `EdisonPythonVisitor.visitNumConst` |
| 3 | **verified** | `compile`/`run` "succeed" for any non-empty source. Real compile errors only surface in the browser, from the external service, as an unmapped popup. | `EdisonCompilerWorker`, `Edisonv2Connection.run` |
| 4 | **verified** | `edisonv3` output also says `Ed.EdisonVersion = Ed.V2` (the V2 and V3 golden files are identical). | `EdisonPythonVisitor.visitorGenerateGlobalVariables` |
| 5 | **verified** | Division is integer in EdPy but float under CPython 3 (`7/2` → `3` vs `3.5`). | `EdisonPythonVisitor.visitBinary` |
| 6 | code | Helpers `max`/`min`/`sum` shadow the builtins; `max`/`min` of an empty list fail with an index error; `_pow` with a negative exponent returns 1. | `helperMethodsEdison.yml` |
| 7 | code | The round block emits `((x+5)/10)*10`, rounding to tens. Round-up and round-down use similar tricks. It's marked "should be removed", and the round block isn't in the toolbox. | `EdisonPythonVisitor.visitMathSingleFunct` |
| 8 | code | The validator accepts timer blocks, but the generator throws `DbcException("Not supported!")`. They're not in the toolbox, so this is only reachable through imported XML. | `EdisonValidatorAndCollectorVisitor.visitTimerSensor` vs `EdisonPythonVisitor.visitTimerSensor` |
| 9 | code | `visitDriveAction` in the validator visits the speed expression twice (collector side effects are counted twice). | `EdisonValidatorAndCollectorVisitor` |
| 10 | code | `robot.program.default.nn` points to a missing file. | `edison.properties` |
| 11 | code | The server-side WAV download endpoint never sets a file path. | `RobotDownloadProgram` (`case "edison"`) |
| 12 | code | `RobotEdison/src/test/resources/collector/all_helper_methods.xml` is unused. | |
| 13 | **verified (EdPy)** | assert, debug, and serial print generate `print(...)`, which **never compiles**: EdPy → `Unknown function print`. The validator doesn't warn. | `AbstractPythonVisitor` |

| 14 | **verified bug** | **Division drops operand parentheses.** NEPO `(10+20)/(2+3)` → `10 + 20 / 2 + 3` (23 instead of 6). | `EdisonPythonVisitor.visitBinary` (DIVIDE branch skips `generateSubExpr`) |
| 15 | **verified bug (EdPy)** | **AVERAGE without SUM:** `sum(___l) / len(___l)` is emitted, but no `sum` helper is. EdPy rejects it with `Unknown function sum`, while CPython silently uses its builtin, so a CPython mock would *hide* this bug. | `EdisonPythonVisitor.visitMathOnListFunct` vs the collector (adds only `AVERAGE`) |
| 16 | **verified bug (EdPy)** | **A comment-only body is invalid.** `if True:` + `# only a comment` → CPython `IndentationError`, and EdPy → `Syntax error`. This applies to if/loop bodies always, and to function bodies when there are no global variables. The golden `text_messages_functions.py` hides it because `global …` precedes the comment. | `AbstractPythonVisitor` (`pass` is only added for *empty* bodies) |
| 17 | code | `robActions_play_tone` emits the DURATION expression twice, and FREQUENCE must be a literal (`NO_CONST_NOT_SUPPORTED`). | `EdisonPythonVisitor.visitToneAction` |
| 18 | code | `_motorOn` compares with `Ed.MOTOR_LEFT/RIGHT`, but the generator passes literals `0`/`1`, so it depends on those constant values. | `helperMethodsEdison.yml` MOTORON |
| 19 | code | `_shorten` doesn't clamp (power 1000 → speed 100). `_diffCurve` ignores the right wheel's sign when both speeds are equal. | `helperMethodsEdison.yml` |
| 20 | code | `break`/`continue` inside a wait-in-loop emits `raise BreakOutOfALoop`/`ContinueLoop`, but the classes are never defined in Edison output (the block isn't in the toolbox). | `AbstractPythonVisitor.visitStmtFlowCon` |
| 21 | code | The validator throws `DbcException("block is not implemented")` for motor get/set power and get/set volume (not in the toolbox). A `math_single` function without a helper (e.g. imported SIN) gives a NullPointerException. | `EdisonValidatorAndCollectorVisitor`, `HelperMethodGenerator` |
| 22 | code | `___soundfile1…5` (play file) live in the user-variable namespace. They collide with user variables named `soundfile1…5`. | `EdisonPythonVisitor.visitPlayFileAction` |
| 23 | code | Many generic constructs are emitted without rejection when imported (`math.*`, `random.*`, `str()`, `and`/`or`, list `.pop`/`.insert`), although they aren't valid EdPy. The validator enforces almost no EdPy limits. | `EdisonValidatorAndCollectorVisitor` |
| 24 | **verified bug (EdPy)** | **A tone frequency ≤ 244 Hz fails on the robot.** `8000000/244` folds to 32786, and EdPy rejects it with `constant 32786 is out of range`. The Lab's validator accepts it. For the note block the cut-off is 123 Hz, but its picker starts at 261.6 Hz. | `EdisonPythonVisitor.visitToneAction`, `EdisonValidatorAndCollectorVisitor.visitToneAction` |
| 25 | **verified (EdPy)** | **Tone frequency 0** passes the Lab's validator and **crashes the EdPy compiler** (division by zero in constant folding). | same |
| 26 | spec | **Pitch shift:** the firmware tone code is `32e6/Hz` (1–5 kHz), and the Lab emits `8000000/f` (tone) or `4000000/f` (note). A NEPO tone sounds at 4·f and a note at 8·f, apparently deliberately, to reach the buzzer's range. A test asserting the pitch must model this. | `edpy-reference.md` §6–§7 |
| 27 | **verified (EdPy)** | The literal `-32768` is rejected (`out of range`); the usable literal range is ±32767. | EdPy optimiser |
| 28 | **verified (EdPy)** | The `NO_CONST_NOT_SUPPORTED` rule for tone frequency exists because `8000000/<variable>` doesn't compile (`constant 8000000 is out of range`). | `EdisonValidatorAndCollectorVisitor.visitToneAction` |

Good test-candidate classes: integer arithmetic at the edges (division, negative numbers, values near ±32767); the
helper functions (empty lists, negative exponents, primes); drive, curve, and turn with distance vs unlimited; sensor
read-and-clear semantics (clap, keypad, obstacle); wait-until loops; list indices; blocks that are only valid in some
modes (light LINE vs LIGHT).

---

## 14. Recipes

**See the EdPy for any NEPO program (no server).** Edison has no textly, so feed an export XML. Put the test in
`OpenRobertaServer/src/test/java`, which has every plugin on the classpath. Delete it afterwards if it's only a probe.

```java
AstFactory.loadBlocks();                                                         // once, @BeforeClass
RobotFactory f = Util.configureRobotPlugin("edisonv2", "", "", new ArrayList<>());
String export = Util.readResourceContent("/crossCompilerTests/robotSpecific/edison/action.xml");
Pair<String, String> pc = ProjectWorkflowRestController.splitExportXML(export);
Project p = UnitTestHelper.setupWithConfigAndProgramXML(f, pc.getFirst(), pc.getSecond()).setRobot("edisonv2").build();
ProjectService.executeWorkflow("showsource", p);          // wrap in try/catch: generator exceptions propagate
p.getResult();                                            // COMPILERWORKFLOW_PROGRAM_GENERATION_SUCCESS or PROGRAM_INVALID_STATEMETNS
p.getSourceCodeBuilder().toString();                      // the EdPy
p.getWorkerResult(UsedHardwareBean.class);                // used sensors → what to mock
p.getProgramAsBlocklyXML();                               // annotated XML (errors/warnings per block)
```

Run it: `mvn -o -pl OpenRobertaServer test -Dtest=<YourTest> -DfailIfNoTests=false` (after one `mvn install -DskipTests`).

**Run generated EdPy under CPython (verified with a stub).**
1. Put a stub `Ed.py` on `sys.path`. A module-level `__getattr__` can return constants and recording functions, and
   `Ed.List(n, init)` can return `list(init)`.
2. **Don't import the program directly.** It executes. Load the source, then transform it: rewrite `/` → `//`, and
   wrap or guard the top-level statements.
3. Execute it with a time or step budget.

**Check generated EdPy with the real compiler (verified).** Set up EdPy 1.2.11 on Python 3.6 or 2.7 as in
`edpy-reference.md` §2. Then run `python EdPy.py -c en_lang.json <file.py>` from `EdPy/src`. The output is JSON:
`{"error": false, "messages": [], …}`, or `"messages": ["ERR: file:<line>:<col>: …"]`. A non-JSON traceback means the
compiler itself crashed.

**Add a golden test program:**
1. Save an export XML (`robottype="edison"`, `xmlversion="3.1"`, config = the single `robBrick_Edison-Brick` block) as
   `OpenRobertaServer/src/test/resources/crossCompilerTests/robotSpecific/edison/<name>.xml`.
2. Run `testAllRobotSpecificProgramsAsUnitTests` once. It fails and writes the outputs.
3. Copy `.ast` and `.py` from `OpenRobertaServer/target/unitTests/_expected/robotSpecific/…/{edisonv2,edisonv3}/` into
   `src/test/resources/crossCompilerTests/_expected/…`, and delete the header line of both auto-created collector files.
4. Re-run.

---

## 15. Custom NEPO blocks

See **`docs/ai/nepo-custom-blocks.md`** (verified end to end with a real Edison block). In brief:
- Declare `visitXxx` in `IEdisonVisitor` and implement it in `EdisonPythonVisitor`,
  `EdisonValidatorAndCollectorVisitor`, and `EdisonStackMachineVisitor`.
- Add the Blockly definition (using the Edison port conventions) and the toolbox entry.
- Add a golden program with expected files for both `edisonv2` and `edisonv3`.
