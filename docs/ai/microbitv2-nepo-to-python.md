# micro:bit V2 — how NEPO becomes MicroPython (reference for AI agents)

> **Audience:** AI coding agents (and humans) working in this repository.
> **Scope:** the BBC micro:bit V2 robot plugin `microbitv2` **only**. Other boards are deliberately ignored (see `CLAUDE.md`).
> **Goal context:** a learner-facing unit-testing framework for NEPO programs on the micro:bit V2, with automated or
> AI-assisted detection and generation of test cases. The generated MicroPython is the artefact under test.
> **Status:** written 2026-09-23 against `develop` @ `a6efc03c7` (version `5.2.33-SNAPSHOT`). Statements marked
> **verified** were checked by running code. Statements marked **suspected** come from reading code only.

Paths are repo-relative. `…/` abbreviates `src/main/java/de/fhg/iais/roberta/` inside a module.

---

## 1. Glossary

| Term | Meaning |
|---|---|
| **NEPO** | OpenRoberta's graphical language (Blockly blocks). Stored as **Blockly XML** (`<block_set>`, `xmlversion="3.1"`). |
| **Program / configuration** | Every NEPO project has two XML documents: the *program* (blocks the learner writes) and the *robot configuration* (which sensors and actors exist, their port names and pins). They're exchanged together as an **export XML**: `<export><program>…</program><config>…</config></export>`. |
| **Robot plugin** | A `.properties` file plus Java classes that define toolbox, workers, and workflows for one robot. Ours: `microbitv2`. |
| **AST / Phrase** | The Java abstract syntax tree built from the XML. Every node is a `Phrase` (`OpenRobertaRobot/…/syntax/Phrase.java`). Subclasses: `Expr`, `Stmt`, `Action`, `Sensor`, `Method`, … |
| **Worker** | One processing step (`IWorker.execute(Project)`), such as validate, typecheck, generate, compile. |
| **Workflow** | A named, ordered list of workers declared in the plugin properties, such as `showsource` or `compile`. |
| **Project** | The mutable container that flows through a workflow: ASTs, beans, source code, hex, result key (`OpenRobertaRobot/…/components/Project.java`). |
| **Bean** | A worker result stored in the Project, such as `UsedHardwareBean`, `UsedMethodBean`, `ErrorAndWarningBean`, `NNBean`, `CodeGeneratorSetupBean`, `CompilerSetupBean`. |
| **Visitor** | Visitor-pattern class with one `visitXxx(Xxx)` method per AST class. Code generation, validation, type checking, and textly regeneration are all visitors. |
| **Textly** | A Java-like **text** form of NEPO (ANTLR grammar `OpenRobertaRobot/src/main/antlr4/de/fhg/iais/roberta/textly/generated/TextlyJava.g4`). It has micro:bit V2 syntax such as `microbitv2.showText(...)`. See §11. |
| **Stack machine** | The JSON op-code program the *browser simulator* interprets. It's a separate generator (`MicrobitV2StackMachineVisitor`). Not Python. |
| **Helper method** | A Python function emitted only when used, defined in YAML (`mbed.methods.yml` → `common.methods.yml`). |

---

## 2. The pipeline at a glance

```
 Browser (Blockly)                                   Server (Java)                                           Device
 ─────────────────   export XML    ┌──────────────────────────────────────────────────────────────┐
 NEPO program  ────────────────▶  │ Project.Builder.build()                                       │
 + configuration                   │   JaxbHelper.xml2BlockSet  → Jaxb2ProgramAst (AstFactory)    │
                                   │   Jaxb2ConfigurationAst.blocks2NewConfig                      │
                                   │ ProjectService.executeWorkflow(<name>, project):              │
                                   │   validate.and.collect  MicrobitV2ValidatorAndCollectorWorker │  → UsedHardwareBean,
                                   │                                                               │    UsedMethodBean, errors
                                   │   typecheck             MicrobitV2TypecheckWorker             │  → type errors (NepoInfo)
                                   │   generate              MicrobitV2PythonGeneratorWorker       │  → project.sourceCodeBuilder
                                   │   setup                 CompilerSetupWorker                   │  (compile/run only)
                                   │   compile               MicrobitV2CompilerWorker ─ python compile.py ─▶ .hex ──▶ micro:bit
                                   │   regenerateNepo        MicrobitV2RegenerateNepoWorker        │  → XML + textly (always runs)
                                   └──────────────────────────────────────────────────────────────┘
```

---

## 3. The plugin definition

`RobotMbed/src/main/resources/microbitv2.properties` (first line: `#include classpath:/microbitCommon.properties`).
The plugin is enabled in `OpenRobertaServer/src/main/resources/openRoberta.properties` (`robot.whitelist = … microbitv2 …`).
`Util.configureRobotPlugin("microbitv2", …)` loads `classpath:/microbitv2.properties` and follows the `#include` directives.
`RobotFactory` (`OpenRobertaRobot/…/factory/RobotFactory.java`) instantiates every `robot.plugin.worker.*` class **once**
and builds the workflows from `robot.plugin.workflow.*`.

### Workers

| Key | Class (package `de.fhg.iais.roberta.worker…`) | Does |
|---|---|---|
| `validate.and.collect` | `validate.MicrobitV2ValidatorAndCollectorWorker` | Configuration check (`MbedConfigurationValidatorWorker`), then walks the AST with `MicrobitV2ValidatorAndCollectorVisitor(isSim=false)`. Produces `UsedHardwareBean`, `UsedMethodBean`, `NNBean` and errors/warnings. |
| `validate.and.collect.sim` | `validate.MicrobitV2SimValidatorAndCollectorWorker` | Same, with `isSim=true`: marks blocks unsupported in the simulator (play file, speaker on/off). |
| `typecheck` | `validate.MicrobitV2TypecheckWorker` | `MicrobitV2TypecheckVisitor` (extends `TypecheckCommonLanguageVisitor`). Type errors → `Key.PROGRAM_INVALID_STATEMETNS`. |
| `generate` | `codegen.MicrobitV2PythonGeneratorWorker` | Builds `CodeGeneratorSetupBean` (helper-method generator from `robot.helperMethods`) and runs `MicrobitV2PythonVisitor.generateCode(withWrapping)`. |
| `setup` | `CompilerSetupWorker` | Puts compiler bin and resource dirs into `CompilerSetupBean`. |
| `compile` | `MicrobitV2CompilerWorker` (extends `MbedCompilerWorker("microbit-v2")`) | Runs `<compilerBinDir>python <resourcesDir>/compile.py "<source>" <resourcesDir>/runtimeHex microbit-v2` and stores stdout as the hex. |
| `generatesimulation` | `codegen.MicrobitV2StackMachineGeneratorWorker` | Stack-machine JSON for the browser simulator. |
| `resetFirmware` | `MbedResetFirmwareWorker` | Flash factory firmware (`robot.factory.default = firmware/MicroBit`). |
| `regenerateNepo` | `codegen.MicrobitV2RegenerateNepoWorker` | AST → Blockly XML (program and config) and AST → textly (`MbedV2RegenerateTextlyJavaVisitor`). `mustRunEvenIfPreviousWorkerFailed() == true`. |

### Workflows

| Workflow | Workers |
|---|---|
| `showsource` | validate.and.collect, typecheck, generate, regenerateNepo |
| `compile` / `run` | validate.and.collect, typecheck, generate, setup, compile, regenerateNepo |
| `getsimulationcode` | validate.and.collect.sim, typecheck, generatesimulation, regenerateNepo |
| `runnative` / `compilenative` | setup, compile (learner-edited Python source, no NEPO) |
| `reset` | resetFirmware |

Execution rule (`OpenRobertaServer/…/javaServer/restServices/all/service/ProjectService.java`): workers run in order.
After the first failure (`!project.hasSucceeded()`), only workers with `mustRunEvenIfPreviousWorkerFailed()` still run.

Other properties that matter: `robot.plugin.fileExtension.source = py`, `robot.plugin.fileExtension.binary = hex`,
`robot.helperMethods = classpath:/mbed.methods.yml`, `robot.class.textlyJava = …Microbitv2TextlyJavaVisitor`,
`robot.configuration.type = new`, `robot.nn = selectable`. micro:bit V2 has **no** old-XML transform workflow, so only
`xmlversion="3.1"` programs are supported.

---

## 4. Stage by stage

### 4.1 XML → AST

- `Project.Builder.build()` (standard case) calls `transformConfiguration()` then `transformProgram()`.
  A missing or empty XML sets `Key.COMPILERWORKFLOW_ERROR_PROGRAM_NOT_FOUND` / `…CONFIGURATION_NOT_FOUND`, and JAXB errors
  set `…TRANSFORM_FAILED`.
- `Jaxb2ProgramAst.block2ast` lowercases the block `type` and looks it up with `AstFactory.getByBlocklyName`.
  `AstFactory.loadBlocks()` scans **every** class under `de.fhg.iais.roberta.syntax.*` on the classpath (all robots) and
  registers them by their annotation:
  - `@NepoPhrase(name, category, blocklyNames = {...})`: statements and actions. Fields are mapped with `@NepoField`
    (Blockly `<field>`), `@NepoValue` (Blockly `<value>`, typed), `@NepoMutation`, `@NepoHide`, `@NepoData`.
  - `@NepoExpr(..., blocklyType, precedence = 999 default, sampleValues = {@F2M(field, mode)})`: expressions. Sensors
    use `sampleValues` so that the generic `robSensors_getSample` block resolves to the right sensor class and mode.
  - `@NepoBasic`: the class implements its own `static xml2ast(Block, Jaxb2ProgramAst)` and `ast2xml()`
    (e.g. `RobotMbed/…/syntax/expr/mbed/Image.java`).
  - AST classes **must be `final`**, otherwise `DbcException`.
- **Tree shape:** `ProgramAst.getTree()` is `List<List<Phrase>>`, one inner list per Blockly *instance*
  (top-level stack): `[Location, block1, block2, …]`. The main stack is `[Location, MainTask, stmt…]`.
  Function definitions are separate stacks (`MethodVoid` / `MethodReturn`, category `METHOD`).
- `BlocklyProperties.blocklyRegion` carries `inTask` and `disabled`. **Blocks that aren't connected to the start
  block (`inTask=false`) or are disabled aren't generated** (filter in the `AbstractLanguageVisitor` constructor).
- The configuration becomes a `ConfigurationAst` of `ConfigurationComponent`s, keyed by **user-defined port name**
  (e.g. `A`, `_C`). Each component has a `componentType` (`KEY`, `BUZZER`, `DIGITAL_PIN`, …) and string properties
  (e.g. `PIN1`). See §7.

### 4.2 validate.and.collect

`MbedValidatorAndCollectorWorker.execute` first checks the configuration (free and occupied pins), then
`AbstractValidatorAndCollectorWorker.execute`:

1. Visit the `MainTask` of each stack first, so global variables are known (`collectGlobalVariables`).
2. Visit every phrase with `MicrobitV2ValidatorAndCollectorVisitor`. It:
   - adds **UsedActor / UsedSensor** entries (`UsedHardwareBean`). These entries drive conditional imports in the
     generator: `SC.RADIO` → `import radio` and `radio.on()`, `SC.MUSIC` → `import music`, `SC.PIN_VALUE` →
     `import machine`.
   - adds **used helper methods** (`UsedMethodBean`), e.g. `MicrobitMethods.RECEIVE_MESSAGE`, plus common
     `FunctionNames` helpers such as `PRIME`, `MEDIAN`, `STD_DEV`.
   - attaches **NepoInfo** errors or warnings to phrases (`addErrorToPhrase(phrase, "CONFIGURATION_ERROR_ACTOR_MISSING")`,
     `addWarningToPhrase(…, "VALIDATION_PIN_TAKEN_BY_LED_MATRIX")`, …). The Lab shows them as block annotations.
     Any error sets `Key.PROGRAM_INVALID_STATEMETNS`, and generation is skipped.
   - records loop metadata (`getLoopsLabelContainer`). It decides whether a loop needs the
     `BreakOutOfALoop` / `ContinueLoop` exception mechanism (break or continue from a nested wait block).
   - records `inScopeVariables` (global user variables) and `programEmpty`.
3. `getAdditionalMethodEnums()` adds `MicrobitMethods` so `RECEIVE_MESSAGE` is resolvable by the helper generator.

### 4.3 typecheck

`AbstractTypecheckWorker` visits all phrases with `MicrobitV2TypecheckVisitor`. It uses `Sig.of(returnType, argTypes…)`
per block and records type errors as NepoInfos on phrases. Common constructs are covered by
`TypecheckCommonLanguageVisitor` (`OpenRobertaRobot/…/visitor/validate/`).

### 4.4 generate (the Python)

`AbstractLanguageGeneratorWorker.execute` creates the visitor with `(programTree, configurationAst, beans)` and calls:

```java
visitor.setStringBuilders(project.getSourceCodeBuilder(), project.getIndentationBuilder());
visitor.generateCode(project.isWithWrapping());   // prefix → main body → suffix
```

`AbstractLanguageVisitor.generateCode` → `generateProgramPrefix` → `generateProgramMainBody` → `generateProgramSuffix`.
The output is written through a `SourceBuilder` (`src.add(...)`, `nlIndent()`, `incrIndentation()` / `decrIndentation()`).
See §5 for the exact output layout.

### 4.5 regenerateNepo

It always runs and never changes the result. It sets `project.getProgramAsBlocklyXML()`,
`project.getConfigurationAsBlocklyXML()` and `project.getProgramAsTextly()`. It temporarily swaps the source builder
and restores it afterwards.

### 4.6 setup + compile (real device only)

`MbedCompilerWorker` passes the **whole Python source as a command-line argument** to `compile.py`. That script lives in
the external **`ora-cc-rsc`** repository (directory `RobotMbed/`, with a `runtimeHex/` MicroPython runtime). It isn't in
this checkout. It embeds the script into the MicroPython `.hex`. `runBuild` computes
`Key.COMPILERWORKFLOW_ERROR_PROGRAM_COMPILE_FAILED` on failure, but `execute` discards it (§13 #13). **Nothing about
the Python itself happens here**, so a Python-level test framework doesn't need this step.

---

## 5. Anatomy of the generated program

Adapted from real output for a program with global variables, a user function, and an assert block
(`_expected/common/targetLanguage/microbitv2/functionsBasic.py`, shortened and reordered; comments added):

```python
import microbit                                   # always
import random                                     # always
import math                                       # always
# import radio / import music / import machine    # only if UsedHardwareBean has RADIO / MUSIC / PIN_VALUE
# <helper methods from mbed.methods.yml/common.methods.yml, only the used ones>
# <xNN variables + def ____nnStep(): … if neural-network blocks are used>

class BreakOutOfALoop(Exception): pass            # always (used by break/continue inside nested wait blocks)
class ContinueLoop(Exception): pass

timer1 = microbit.running_time()                  # always; timer sensor = running_time() - timer1
# radio.on()                                      # if radio used

___n1 = 0                                         # global NEPO variables: prefix ___  (Var.CODE_SAFE_PREFIX)
___b = False

def ____retNumber2(___x):                         # user functions: prefix ____ (Method.CODE_SAFE_PREFIX); params ___
    global timer1, ___n1, ___b                    # every function declares ALL globals
    ___x = ___x / float(2)                        # NEPO division is float division
    return ___x

def run():                                        # the program body (blocks under the start block)
    global timer1, ___n1, ___b
    ___n1 = ____retNumber2(10)
    if not 5 == ___n1:                            # robActions_assert → print, no exception
        print("Assertion failed: ", "pos-1", 5, "EQ", ___n1)

def main():
    try:
        run()
    except Exception as e:
        raise

if __name__ == "__main__":
    main()
```

Order of generation (`AbstractPythonVisitor.generateProgramPrefix`, then `MbedPythonVisitor.visitMainTask`,
`generateProgramSuffix`):

1. `collectVariablesForFunctionGlobals()`: `timer1` plus `___<v>` for each `UsedHardwareBean.getInScopeVariables()`.
2. `visitorGenerateImports()` (`MbedPythonVisitor`).
3. `visitorGenerateHelperMethods()`: the YAML implementations of the used methods.
4. `visitorGenerateNN()`.
5. `visitorGenerateGlobalVariables()`: exception classes, `timer1`, `radio.on()`.
6. Main body: `MainTask` emits the global variable declarations and **all user-defined functions**, then `def run():`
   and the `global …` line. The remaining statements of the start stack follow, indented inside `run()`.
7. Suffix: `def main(): try: run() except Exception as e: raise`, then `if __name__ == "__main__": main()`.

With `withWrapping == false`, steps 1–5 and 7 are skipped and only the body is produced (`def run():` is still
emitted). Nothing in the repo sets it to `false` today, so it's an unused hook.

**Consequences for a test harness (verified):**
- The program is importable as a module. On import, only the top-level code runs: imports, helper and function
  definitions, `timer1 = microbit.running_time()`, globals, and `radio.on()`. `main()` is guarded by
  `__name__ == "__main__"`, so it does **not** run.
- After import, `run()` and each `____<function>` can be called directly. Globals can be read and set as module
  attributes `___<name>`. A stub `microbit` module on `sys.path` is enough to import it.
- Programs frequently contain `while True:` (repeat forever, wait-until). A harness needs a step or time budget, or
  mocks that eventually satisfy the wait condition. `microbit.sleep` and `running_time` should use a virtual clock.

Other code shapes worth knowing:

| NEPO | Python |
|---|---|
| repeat N times | `for ___k0 in range(int(0), int(N), int(1)):` (a synthetic loop variable `___k<n>`) |
| count with i from a to b by s (`robControls_for`) | `for ___i in range(int(a), int(b), int(s)):`. `b` is **exclusive** (NEPO "from 1 to 6" → `range(1, 6)`), and non-integer bounds are truncated by `int()`. |
| repeat forever / while / until | `while True:` / `while cond:` / `while not (cond):` |
| wait until (`robControls_wait_for`) | `while True:` + `if <cond>: break` per branch (`MbedPythonVisitor.visitWaitStmt`) |
| wait ms | `microbit.sleep(ms)` |
| break / continue | `break` / `continue`, or `raise BreakOutOfALoop` / `raise ContinueLoop` when the loop needs the try-wrapper |
| number literal | int if it parses as `Integer`, else `float(x)` |
| a / b | `a / float(b)` |
| text join | `"".join(str(arg) for arg in [...])` |
| show text | `microbit.display.scroll(x)`, with `str(x)` unless `x` is a string literal |
| comment block | `# text` |

---

## 6. Where to change the generator

```
BaseVisitor<Void>                                   OpenRobertaRobot/…/visitor/BaseVisitor.java
 └─ AbstractLanguageVisitor                          OpenRobertaRobot/…/visitor/lang/codegen/AbstractLanguageVisitor.java
     └─ AbstractPythonVisitor                        OpenRobertaRobot/…/visitor/lang/codegen/prog/AbstractPythonVisitor.java   (generic Python: math, lists, text, control flow, functions)
         └─ MbedPythonVisitor (abstract)             RobotMbed/…/visitor/codegen/MbedPythonVisitor.java    (display, images, buttons, pins, radio, music, imports, run()/main())
             └─ MbedV2PythonVisitor (abstract)       RobotMbed/…/visitor/codegen/MbedV2PythonVisitor.java  (V2 only: speaker, volume, microphone, logo touch, touch mode, V2 sounds, RGB tuples)
                 └─ MicrobitV2PythonVisitor          RobotMbed/…/visitor/codegen/MicrobitV2PythonVisitor.java  (sets firmware = "microbit"; otherwise empty)
```

Interfaces: `IMicrobitV2Visitor` → `IMbedV2Visitor` (V2 blocks) → `IMbedVisitor` (mbed blocks) → `IVisitor`.

- The `firmware` field (`"microbit"`) prefixes every runtime call (`this.firmware + ".display.show("`).
- `JoyCarPythonVisitor` extends `MicrobitV2PythonVisitor`, and `CalliopeV3PythonVisitor` extends `MbedV2PythonVisitor`.
  Per `CLAUDE.md`, changing shared classes for micro:bit V2 is allowed even if it changes their output.
- **Adding a block:** see **`docs/ai/nepo-custom-blocks.md`** (verified end to end). In short:
  - an AST class (final, annotated) in `RobotMbed/…/syntax/…`;
  - a `visitXxx` in **`IMicrobitV2Visitor`**;
  - implementations in `MbedV2ValidatorAndCollectorVisitor`, `MicrobitV2TypecheckVisitor`, `MbedV2PythonVisitor`,
    `MbedV2StackMachineVisitor` (simulator) and `MbedV2RegenerateTextlyJavaVisitor` (textly);
  - the block in the toolbox XML, a Blockly block definition, and a golden test program.

  Declaring the method in the interface makes every concrete visitor fail
  to compile until it's implemented. An AST class whose `visitXxx` isn't declared on the visitor at all (e.g. a block
  of another robot pasted into a micro:bit V2 program) fails at **runtime**: `BaseVisitor.visit` throws
  `DbcException("visit Method not found for phrase …")`.
- **Changing output for an existing block:** override the `visitXxx` in the most specific class, then update the golden
  files in `_expected/**/microbitv2/` (see §10.1).

---

## 7. Robot configuration

Each configuration block becomes a `ConfigurationComponent`:
- its **user-defined port name** is the block's first field (`NAME`, or `ROBOT` for the board);
- its **component type** is the `@NepoConfiguration(name=…)` of the block (`Jaxb2ConfigurationAst`);
- all other fields become properties.

Program blocks refer to components by port name, either through a visible dropdown (`SENSORPORT`, `PIN`) or a
hidden `<hide name="SENSORPORT|ACTORPORT" value="…"/>`.

**Default configuration** (`RobotMbed/src/main/resources/microbitV2/configuration.default.xml`):

| Port | Config block | Component type | Properties | Used by, and how the Python uses it |
|---|---|---|---|---|
| `A` | `robConf_key` | KEY | `PIN1=A` | key sensor with `SENSORPORT=A` → `getProperty("PIN1")` → `microbit.button_a.is_pressed()` |
| `B` | `robConf_key` | KEY | `PIN1=B` | → `microbit.button_b.is_pressed()` |
| `_A` | `robConf_accelerometer` | ACCELEROMETER | – | Existence check only. Python: `microbit.accelerometer.get_<slot>()`. Gesture doesn't check the config. |
| `_C` | `robConf_compass` | COMPASS | – | existence + type check → `microbit.compass.heading()` |
| `_T` | `robConf_temperature` | TEMPERATURE | – | → `microbit.temperature()` |
| `_L` | `robConf_light` | LIGHT | – | → `round(microbit.display.read_light_level() / 2.55)` |
| `_S` | `robConf_sound` | SOUND | – | microphone → `int((microbit.microphone.sound_level() / 255) * 100)` |
| `_LO` | `robConf_logotouch` | LOGOTOUCH | – | → `microbit.pin_logo.is_touched()` / `.set_touch_mode(...)` |
| `_B` | `robConf_buzzer` | BUZZER | – | Required by tone, note, play file/expression (checked by type) and by volume and speaker toggle (checked through the hidden port `_B`). The port never appears in the Python. |
| `undefined` | `robConf_robot` | ROBOT | – | the board itself; not used by the generator |

**Pin blocks** a learner adds from `configuration.toolbox.xml`. Each has the fields `NAME` (port) and `PIN1`.
The naming is from the pin's point of view: the "…in" blocks are *written to*, the "…out" blocks are *read*.

| Config block | Component type | PIN1 choices | Program block | Python |
|---|---|---|---|---|
| `robConf_digitalin` | DIGITAL_INPUT | 0–16, 19, 20 | `mbedActions_write_to_pin` (DIGITAL) | `microbit.pin<PIN1>.write_digital(v)` |
| `robConf_analogin` | ANALOG_INPUT | 0–4, 10 | `mbedActions_write_to_pin` (ANALOG) | `microbit.pin<PIN1>.write_analog(v)` |
| `robConf_digitalout` | DIGITAL_PIN | 0–16, 19, 20 | `robSensors_pin_getSample` (DIGITAL / PULSEHIGH / PULSELOW) | `microbit.pin<PIN1>.read_digital()` / `machine.time_pulse_us(microbit.pin<PIN1>, 1/0)` |
| `robConf_analogout` | ANALOG_PIN | 0–4, 10 | `robSensors_pin_getSample` (ANALOG) | `microbit.pin<PIN1>.read_analog()` |

Examples from the golden tests: `robConf_digitalin NAME=Pin0 PIN1=0` → `microbit.pin0.write_digital(1)` (`pin_write.xml`).
`robConf_digitalout NAME=S7 PIN1=6` → `microbit.pin6.read_digital()` (`sensor_pins.xml`).

**Configuration validation** (`MbedConfigurationValidatorWorker`, parameters from `MicrobitV2ValidatorAndCollectorWorker`):
- Components whose type is in `DEFAULT_PROPERTIES` (KEY, ACCELEROMETER, COMPASS, TEMPERATURE, LIGHT, ROBOT, SOUND,
  BUZZER, LOGOTOUCH) are skipped.
- Every other component needs a `PIN1` from `FREE_PINS` (0–16, 19, 20). Two components on one pin give
  `CONFIGURATION_ERROR_OVERLAPPING_PORTS`.
- A pin outside the list throws `DbcException("Invalid pin for configuration block …")`.
- At program level, pins 3, 4, 6, 7, 9, 10 (LED matrix; suppressed if the program uses `mbedActions_switch_led_matrix`)
  and 5, 11, 12, 19, 20 (internal components) only produce **warnings**.

---

## 8. Block inventory (toolbox → AST → Python)

Built from the toolboxes (`microbitV2/program.toolbox.{beginner,expert}.xml`), the `@Nepo…` annotations, the visitor
chain, and the golden files.
- All 103 block types that the toolboxes and default files can produce map to an annotated AST class.
- All of them have a Python and a type-check visit method.

Legend:
- **Lvl:** B+E = beginner and expert toolbox, E = expert only. The beginner toolbox is a strict subset.
- **Gen:** the most-derived class implementing the Python: **V2** = `MbedV2PythonVisitor`, **Mbed** = `MbedPythonVisitor`,
  **Py** = `AbstractPythonVisitor`, **Lang** = `AbstractLanguageVisitor`, **Base** = `BaseVisitor` delegation.
- AST class packages are relative to `de.fhg.iais.roberta.syntax.`. `[ORR]` = OpenRobertaRobot, `[Mbed]` = RobotMbed.
- Imports: `import radio` / `import music` / `import machine` are driven by the collector's UsedActor `RADIO` /
  `MUSIC` / `PIN_VALUE`.

### Action › Display, Sound, Pin

| Blockly type | Lvl | AST class | Gen | Python | Notes |
|---|---|---|---|---|---|
| `mbedActions_display_text` | B+E | `action.mbed.DisplayTextAction` [Mbed] | Mbed | TYPE=TEXT → `microbit.display.scroll(<msg>)`; CHARACTER → `microbit.display.show(<msg>)`. `<msg>` is raw only if it's a `text` literal, else `str(<msg>)`. | UsedActor DISPLAY; typecheck msg: PRIM |
| `mbedActions_display_image` (presets with `mbedImage_image` / `mbedImage_get_image`) | B+E | `action.mbed.DisplayImageAction` [Mbed] | Mbed | `microbit.display.show(<img or list>)` for both IMAGE and ANIMATION (the mode is ignored by the generator) | typecheck: IMAGE → Image, ANIMATION → Array_Image |
| `mbedActions_display_clear` | B+E | `action.display.ClearDisplayAction` [ORR] | Mbed | `microbit.display.clear()` | |
| `mbedActions_display_setPixel` | E | `action.mbed.DisplaySetPixelAction` [Mbed] | Mbed | `microbit.display.set_pixel(<x>, <y>, <b>)` | no range check (§13 #3) |
| `mbedActions_display_getPixel` | E | `action.mbed.DisplayGetPixelAction` [Mbed] (`@NepoExpr`, NUMBER_INT) | Mbed | `microbit.display.get_pixel(<x>, <y>)` | |
| `robActions_serial_print` | E | `action.serial.SerialWriteAction` [ORR] | Py | `print(<v>)` | |
| `mbedActions_play_tone` | E | `action.sound.ToneAction` [ORR] | Mbed | `music.pitch(<freq>, <duration>)` | BUZZER required; warning `BLOCK_NOT_EXECUTED` if duration literal ≤ 0; `import music` |
| `mbedActions_play_note` | B+E | `action.sound.PlayNoteAction` [ORR] | Mbed | `music.pitch(<int(FREQUENCE)>, <DURATION>)` (both fields; e.g. `261.626` → `261`; duration 2000/1000/500/250/125) | BUZZER required; `import music` |
| `actions_play_file` | E | `action.sound.PlayFileAction` [ORR] | V2 | `music.play(music.<FILE>)` (21 melodies, §9) | BUZZER required; `import music`; sim: unsupported |
| `actions_play_expression` | E | `action.sound.PlayFileAction` [ORR] (same class) | V2 | `microbit.audio.play(microbit.Sound.<FILE>)` (10 sounds, §9) | `import music` too (not needed); unknown name → `DbcException` (not reachable from UI) |
| `robActions_play_setVolume` | E | `action.sound.SetVolumeAction` [ORR] | V2 | `microbit.set_volume(int(2.55 * <v>))` | hidden ACTORPORT `_B` must exist |
| `actions_sound_toggle` | E | `action.mbed.microbitV2.SoundToggleAction` [Mbed] | V2 | MODE=OFF → `microbit.speaker.off()`, else `microbit.speaker.on()` | worked example in `nepo-custom-blocks.md` §1 |
| `mbedActions_write_to_pin` | E | `action.generic.MbedPinWriteValueAction` [ORR] | Mbed | DIGITAL → `microbit.pin<PIN1>.write_digital(<v>)`, else `…write_analog(<v>)`; PIN1 from the config port in field `PIN` | error if the port is missing; pin warnings (§7) |
| `mbedActions_switch_led_matrix` | E | `action.mbed.SwitchLedMatrixAction` [Mbed] | Mbed | STATE=ON → `microbit.display.on()`, else `microbit.display.off()` | its presence suppresses the LED-matrix pin warnings |

### Sensors

The beginner toolbox has the same blocks except `robSensors_set_pin_mode` and `robSensors_pin_getSample`.

| Blockly type | Lvl | AST class | Gen | Python | Notes |
|---|---|---|---|---|---|
| `robSensors_key_getSample` | B+E | `sensor.generic.KeysSensor` [ORR] | Mbed | `microbit.button_<lower(PIN1)>.is_pressed()` | KEY required; UsedActor KEY |
| `robSensors_sound_getSample` | B+E | `sensor.generic.SoundSensor` [ORR] | V2 | `int((microbit.microphone.sound_level() / 255) * 100)` | SOUND (`_S`) required |
| `robSensors_gesture_getSample` | B+E | `sensor.generic.GestureSensor` [ORR] | Mbed | `("<g>" == microbit.accelerometer.current_gesture())`, where g ∈ `up, down, face up, face down, shake, freefall` | no config check; SHAKE adds the dead method `IS_GESTURE_SHAKE` (§13 #4) |
| `robSensors_compass_getSample` | B+E | `sensor.generic.CompassSensor` [ORR] | Mbed | `microbit.compass.heading()` | COMPASS required |
| `robSensors_timer_getSample` | B+E | `sensor.generic.TimerSensor` [ORR] | Mbed | `( microbit.running_time() - timer1 )` | |
| `mbedSensors_timer_reset` | B+E | `sensor.generic.TimerReset` [ORR] | Mbed | `timer1 = microbit.running_time()` | |
| `robSensors_temperature_getSample` | B+E | `sensor.generic.TemperatureSensor` [ORR] | Mbed | `microbit.temperature()` | |
| `robSensors_pintouch_getSample` | B+E | `sensor.generic.PinTouchSensor` [ORR] | Mbed | `microbit.pin<SENSORPORT>.is_touched()` (fixed dropdown 0/1/2, **not** from config) | `import machine` (not needed) |
| `robSensors_set_pin_mode` | E | `sensor.mbed.microbitV2.PinSetTouchMode` [Mbed] | V2 | `microbit.pin<P>.set_touch_mode(microbit.pin<P>.<CAPACITIVE\|RESISTIVE>)` | |
| `robSensors_logotouch_getSample` | B+E | `sensor.mbed.microbitV2.LogoTouchSensor` [Mbed] | V2 | `microbit.pin_logo.is_touched()` | LOGOTOUCH (`_LO`) required |
| `robSensors_pin_getSample` (preset DIGITAL) | E | `sensor.generic.PinGetValueSensor` [ORR] | Mbed | ANALOG → `microbit.pin<PIN1>.read_analog()`; DIGITAL → `…read_digital()`; PULSEHIGH/PULSELOW → `machine.time_pulse_us(microbit.pin<PIN1>, 1/0)` | `import machine`; pin warnings |
| `robSensors_accelerometer_getSample` | B+E | `sensor.generic.AccelerometerSensor` [ORR] | Mbed | SLOT X/Y/Z → `microbit.accelerometer.get_x/y/z()`; STRENGTH → `math.sqrt(x**2 + y**2 + z**2)` (milli-g) | ACCELEROMETER (`_A`) required |
| `robSensors_light_getSample` | B+E | `sensor.generic.LightSensor` [ORR] | Mbed | `round(microbit.display.read_light_level() / 2.55)` | |
| `robSensors_getSample` (preset inside `robControls_wait_for`) | B+E | `sensor.generic.GetSampleSensor` [ORR] (`@NepoBasic`) | Base | same as the concrete sensor. SENSORTYPE is one of `KEY_PRESSED, PINTOUCH_PRESSED, LOGOTOUCH_PRESSED, GESTURE_*, SOUND_SOUND, COMPASS_ANGLE, TIMER_VALUE, TEMPERATURE_VALUE, PIN_ANALOG/DIGITAL/PULSEHIGH/PULSELOW, ACCELEROMETER_VALUE, LIGHT_VALUE`. | §13 #15 |
| `robSensors_set_logo_mode` (**not in toolbox**) | – | `sensor.mbed.microbitV2.LogoSetTouchMode` [Mbed] | V2 | `microbit.pin_logo.set_touch_mode(microbit.pin_logo.<MODE>)` | covered by `v2_logo_and_pin_touch_mode.xml` |

### Control (decision, loops, wait)

| Blockly type | Lvl | AST class | Gen | Python | Notes |
|---|---|---|---|---|---|
| `robControls_if`, `robControls_ifElse` | B+E | `lang.stmt.IfStmt` [ORR] (`@NepoBasic`) | Lang/Py | `if c0:` / `elif cN:` / `else:`; an empty branch gets `pass` | |
| `robControls_loopForever` | B+E | `lang.stmt.RepeatStmt` FOREVER | Py | `while True:` | all loops: body wrapped in `try: … except BreakOutOfALoop: break / except ContinueLoop: continue` when break/continue occurs inside a nested wait |
| `controls_repeat_ext` | B+E | `RepeatStmt` TIMES | Py | `for ___k<n> in range(int(0), int(<times>), int(1)):` | synthetic loop variable |
| `controls_whileUntil` | E | `RepeatStmt` WHILE / UNTIL | Py | `while <c>:` / `while not (<c>):` | |
| `robControls_for` | E | `RepeatStmt` FOR | Py | `for ___i in range(int(<from>), int(<to>), int(<by>)):` (TO exclusive) | |
| `robControls_forEach` | E | `RepeatStmt` FOR_EACH | Py | `for ___x in <list>:` | |
| `controls_flow_statements` | E | `lang.stmt.StmtFlowCon` [ORR] | Py | `break` / `continue`, or `raise BreakOutOfALoop` / `raise ContinueLoop` inside a wait | |
| `robControls_wait` | E | `lang.stmt.WaitStmt` [ORR] | Mbed | `while True:` + per branch `if <c_i>:` body `break` (busy wait, no sleep) | |
| `robControls_wait_for` | B+E | `WaitStmt` (single branch) | Mbed | e.g. `while True:` / `if microbit.button_a.is_pressed() == True:` / `break` | |
| `robControls_wait_time` | B+E | `lang.stmt.WaitTimeStmt` [ORR] | Mbed | `microbit.sleep(<ms>)` | |

### Logic, Math

| Blockly type | Lvl | AST class | Gen | Python | Notes |
|---|---|---|---|---|---|
| `logic_compare` | B+E | `lang.expr.Binary` | Py | `a == b`, `!=`, `<`, `<=`, `>`, `>=` (a Binary operand is always parenthesised) | |
| `logic_operation` | B+E | `Binary` | Py | `a and b` / `a or b` | |
| `logic_negate` | E | `lang.expr.Unary` NOT | Lang | `not <x>` (parentheses only if x has lower NEPO precedence) | **Python precedence bug, §13 #1** |
| `logic_boolean`, `logic_null` | B+E / E | `BoolConst`, `NullConst` | Py | `True`/`False`, `None` | |
| `logic_ternary` | E | `lang.stmt.TernaryExpr` | Py | `<then> if ( <c> ) else <else>` | |
| `math_number` | B+E | `lang.expr.NumConst` | Py | integer literal as is, else `float(<lit>)` | |
| `math_arithmetic` | B+E | `Binary`; POWER → `lang.functions.MathPowerFunct` | Py | `+ - *`, `a / float(b)`, `math.pow(a, b)` | |
| `math_single` | E | `MathSingleFunct` (NEG → `Unary`) | Py | `math.sqrt`, `math.pow(x, 2)`, `math.fabs`, `- (x)`, `math.log`, `math.log10`, `math.exp`, `math.pow(10, x)` | |
| `math_trig` | E | `MathSingleFunct` | Py | `math.sin(x)` etc. (**radians**, no degree conversion) | |
| `math_constant` | E | `lang.expr.MathConst` | Py | `math.pi`, `math.e`, `(1 + 5 ** 0.5) / 2`, `math.sqrt(2)`, `math.sqrt(0.5)`, `float('inf')` | |
| `math_number_property` | E | `MathNumPropFunct` | Py | `(x % 2) == 0`, `(x % 2) == 1`, `_isPrime(x)`, `(x % 1) == 0`, `x > 0`, `x < 0`, `(x % d) == 0` | PRIME → helper |
| `robMath_change` | E | `lang.stmt.MathChangeStmt` | Lang | `___v += <d>` | |
| `math_round` | E | `MathSingleFunct` | Py | `round(x)`, `math.ceil(x)`, `math.floor(x)` | |
| `math_on_list` | E | `MathOnListFunct` | Py | `sum`, `min`, `max`, `float(sum(l))/len(l)`, `_median(l)`, `_standard_deviation(l)`, RANDOM → **`l[0]`** | §13 #20 |
| `math_modulo` | E | `MathModuloFunct` | Lang | `( ( a ) % ( b ) )` | |
| `math_constrain` | E | `MathConstrainFunct` | Py | `min(max(v, lo), hi)` | |
| `math_random_int` / `math_random_float` | B+E / E | `MathRandomIntFunct` / `MathRandomFloatFunct` | Py | `random.randint(a, b)` / `random.random()` | |
| `math_cast_toString` / `math_cast_toChar` | E | `MathCastStringFunct` / `MathCastCharFunct` | Py | `str(x)` / `chr((int)(x))` | |

### Neural network (only with the `nn` extension; `#ifdef nn` in the toolboxes)

| Blockly type | Lvl | AST class | Python |
|---|---|---|---|
| `robActions_NNstep` | B+E | `lang.stmt.NNStepStmt` | `____nnStep()` |
| `robActions_set_inputneuron_val` | B+E | `NNSetInputNeuronVal` | `____<n> = <v>` |
| `robSensors_get_outputneuron_val` | B+E | `NNGetOutputNeuronVal` | `____<n>` |
| `robActions_set_weight` / `robActions_set_bias` | E | `NNSetWeightStmt` / `NNSetBiasStmt` | `____w_<a>_<b> = <v>` / `____b_<n> = <v>` |
| `robSensors_get_weight` / `robSensors_get_bias` | E | `NNGetWeight` / `NNGetBias` | `____w_<a>_<b>` / `____b_<n>` |

Any NN block emits module-level neuron, weight, and bias variables plus `def ____nnStep():`. This happens only if
the network (JSON in the start block's `<data>`) has at least one input and one output neuron. The activation
`bool` produces **invalid Python** (§13 #19).

### Text, Lists, Images

| Blockly type | Lvl | AST class | Gen | Python | Notes |
|---|---|---|---|---|---|
| `text` | B+E | `lang.expr.StringConst` | Lang | `"<escaped>"`: `<`, `>`, `$` removed, then `StringEscapeUtils.escapeEcmaScript` | `/` → `\/` bug (§13 #18); non-ASCII → `\uXXXX` |
| `text_comment` | B+E | `lang.stmt.StmtTextComment` | Py | `# <text>` | |
| `robText_join` | E | `TextJoinFunct` | Py | `"".join(str(arg) for arg in [a, b])` | |
| `robText_append` | E | `TextAppendStmt` | Py | `___v += str(<t>)` | |
| `text_cast_string_toNumber` / `text_cast_char_toNumber` | E | `TextStringCastNumberFunct` / `TextCharCastNumberFunct` | Py | `float(s)` / `ord(s[i])` | |
| `robActions_eval_expr` | E | `lang.expr.EvalExpr` (`@NepoBasic`) | Base | the Python of the parsed textly expression | parse and type errors are lifted onto the block |
| `robLists_create_with` | E | `lang.expr.ListCreate` | Py | `[a, b, …]` / `[]` | |
| `robLists_repeat` | E | `ListRepeat` | Py | `[item] * n` | |
| `robLists_length` | E | `LengthOfListFunct` | Py | `len( l)` | |
| `robLists_isEmpty` | E | `IsListEmptyFunct` | Py | `not l` | **§13 #1** |
| `robLists_indexOf` | E | `IndexOfFunct` | Py | FIRST `l.index(x)`; LAST `(len(l) - 1) - l[::-1].index(x)` | raises `ValueError` if absent |
| `robLists_getIndex` | E | `ListGetIndex` | Py | GET `l[idx]`; (GET_)REMOVE `l.pop(idx)`; idx: FROM_START `i`, FROM_END `-1 -i`, FIRST `0`, LAST `-1` | |
| `robLists_setIndex` | E | `ListSetIndex` | Py | SET `l[idx] = v`; INSERT `l.insert(idx, v)` | INSERT at LAST → `insert(-1, v)` inserts **before** the last element (§13 #21) |
| `robLists_getSublist` | E | `GetSubFunct` | Py | `l[start:end]` | |
| `mbedImage_image` | B+E | `expr.mbed.Image` [Mbed] (`@NepoBasic`) | Mbed | `microbit.Image('90009:09090:…')` (fields `P<col><row>`; `#` → 9, empty → 0, digits kept) | |
| `mbedImage_get_image` | B+E | `expr.mbed.PredefinedImage` [Mbed] | Mbed | `microbit.Image.<NAME>` (43 names in `PredefinedImageNames`) | an empty image socket → `microbit.Image.SILLY` / `microbit.Image()` |
| `mbedImage_shift` / `mbedImage_invert` | E | `functions.mbed.ImageShiftFunction` / `ImageInvertFunction` | Mbed | `<img>.shift_up/down/left/right(n)` / `<img>.invert()` | |

### Variables, functions, start block

| Blockly type | AST class | Python |
|---|---|---|
| `robControls_start` | `lang.blocksequence.MainTask` | globals, functions, `def run():` + `global timer1, …` (the DEBUG field is ignored) |
| `robGlobalVariables_declare` | `lang.expr.VarDeclaration` | module level `___v = <init>` (empty init → `None`), listed in every `global` line |
| `variables_get` / `variables_set` | `lang.expr.Var` / `lang.stmt.AssignStmt` | `___v` / `___v = <e>` |
| `robProcedures_defnoreturn` / `robProcedures_defreturn` | `lang.methods.MethodVoid` / `MethodReturn` | `def ____f(___p):` + `global …` + body (+ `return <e>`); an empty body gets `pass` |
| `robProcedures_callnoreturn` / `callreturn` | `lang.methods.MethodCall` | `____f(<args>)` |
| `robProcedures_ifreturn` | `lang.methods.MethodIfReturn` | `if <c>: return <v>` (or `return None`) |

Variable types offered: Number, Boolean, String, Image, Array_Number, Array_Boolean, Array_String, Array_Image. There's
no Colour type.

### Communication (radio, expert only)

| Blockly type | AST class | Python | Notes |
|---|---|---|---|
| `mbedCommunication_sendBlock` | `action.mbed.RadioSendAction` [Mbed] | `radio.config(power=<POWER>)` then `radio.send(str(<v>))` | TYPE only matters for type checking; `import radio` + `radio.on()` |
| `mbedCommunication_receiveBlock` | `action.mbed.RadioReceiveAction` [Mbed] (`@NepoExpr`) | `receive_message("<Number\|Boolean\|String>")` | emits the helper |
| `mbedCommunication_setChannel` | `action.mbed.RadioSetChannelAction` [Mbed] | `radio.config(group=<ch>)` | |

### Implemented but not in any micro:bit V2 toolbox

`robSensors_set_logo_mode`, `robActions_debug` and `robActions_assert` (hidden shortcuts, §12.4), `text_print`
(`print(x)`), and RGB colours (`MbedV2PythonVisitor.visitRgbColor` → `(r, g, b)`). `mbedColour_picker`
(`ColorConst`) would throw `UnsupportedOperationException`, but it isn't reachable because micro:bit V2 has no colour
type.

---

## 9. Runtime API surface the generated code uses (what a mock must provide)

MicroPython for the micro:bit V2 (module `microbit`, plus `music`, `radio`, `machine`). This list is complete for the
current generator. It was built from the visitor sources plus a scan of all micro:bit V2 golden files.

### `microbit`

| Member | Used by / notes |
|---|---|
| `running_time()` | `timer1` init; timer sensor `( microbit.running_time() - timer1 )`; timer reset `timer1 = microbit.running_time()` (ms) |
| `sleep(ms)` | wait block |
| `temperature()` | temperature sensor (°C) |
| `set_volume(int)` | set volume: `microbit.set_volume(int(2.55 * v))` (NEPO 0–100 → 0–255) |
| `display.scroll(str)` | show text, mode TEXT |
| `display.show(x)` | show text mode CHARACTER (`str(x)`), show image or animation (image or list of images) |
| `display.clear()`, `display.on()`, `display.off()` | clear; switch LED matrix on/off |
| `display.set_pixel(x, y, b)`, `display.get_pixel(x, y)` | NEPO brightness is passed through unchanged (see §13) |
| `display.read_light_level()` | light sensor: `round(microbit.display.read_light_level() / 2.55)` (0–255 → 0–100) |
| `Image(str)` | user image `microbit.Image('90009:09090:00900:09090:90009')` (`#` → 9, empty → 0, else digit) |
| `Image()` | empty-image default |
| `Image.<NAME>` | predefined images (`HEART`, `HEART_SMALL`, `HAPPY`, `SMILE`, `SAD`, `CONFUSED`, `ANGRY`, `ASLEEP`, `SURPRISED`, `SILLY`, `FABULOUS`, `MEH`, `YES`, `NO`, …). The enum with pixel data is `RobotMbed/…/syntax/expr/mbed/PredefinedImage.java` (`PredefinedImageNames`, 0–255 scale), useful for a mock. |
| `<image>.invert()`, `<image>.shift_left/right/up/down(n)` | image functions |
| `button_a.is_pressed()`, `button_b.is_pressed()` | key sensor. The button letter comes from the configuration property `PIN1` of the used port, lower-cased. |
| `accelerometer.get_x/get_y/get_z()` | accelerometer value per axis. Strength: `math.sqrt(x**2 + y**2 + z**2)`. |
| `accelerometer.current_gesture()` | gesture sensor: `("<gesture>" == microbit.accelerometer.current_gesture())`, gesture ∈ `up`, `down`, `face up`, `face down`, `shake`, `freefall`, … (mode lower-cased, `_` → space) |
| `compass.heading()` | compass angle |
| `pin<N>.read_digital()`, `pin<N>.read_analog()` | pin value sensor. `N` = configuration property `PIN1` of the used port. |
| `pin<N>.write_digital(v)`, `pin<N>.write_analog(v)` | write pin |
| `pin<N>.is_touched()` | pin touch sensor. **N is the block's own `SENSORPORT` dropdown value (0/1/2)**. It isn't mapped through the configuration, unlike the read and write blocks. |
| `pin<N>.set_touch_mode(microbit.pin<N>.CAPACITIVE/RESISTIVE)` | set touch mode |
| `pin_logo.is_touched()`, `pin_logo.set_touch_mode(microbit.pin_logo.CAPACITIVE/RESISTIVE)` | logo touch (V2) |
| `microphone.sound_level()` | sound sensor: `int((microbit.microphone.sound_level() / 255) * 100)` |
| `speaker.on()`, `speaker.off()` | sound toggle (V2) |
| `audio.play(microbit.Sound.<NAME>)` | V2 sound expressions: `GIGGLE HAPPY HELLO MYSTERIOUS SAD SLIDE SOARING SPRING TWINKLE YAWN` |

### `music`, `radio`, `machine`, `random`, `math`, builtins

| Member | Used by |
|---|---|
| `music.pitch(freq, duration)` | tone block; play-note block (frequency truncated to int) |
| `music.play(music.<MELODY>)` | play file: `DADADADUM ENTERTAINER PRELUDE ODE NYAN RINGTONE FUNK BLUES BIRTHDAY WEDDING FUNERAL PUNCHLINE PYTHON BADDY CHASE BA_DING WAWAWAWAA JUMP_UP JUMP_DOWN POWER_UP POWER_DOWN` |
| `radio.on()`, `radio.config(power=p)` (before **every** send), `radio.config(group=g)`, `radio.send(str(x))`, `radio.receive()` | radio blocks. Receive goes through the helper `receive_message(type)`. |
| `machine.time_pulse_us(microbit.pin<N>, 1/0)` | pin value modes PULSEHIGH / PULSELOW |
| `random.randint(a, b)`, `random.random()` | math random |
| `math.*` (`pi e sqrt pow fabs log log10 exp sin cos tan asin acos atan ceil floor`), builtins `round min max sum len str float int chr ord print` | generic math, lists, and text (`AbstractPythonVisitor`) |
| `print(x)` | "show on serial" (`SerialWriteAction`), debug action, and the **assert** block |

### Helper functions (emitted only when used)

Only YAML entries with a `PYTHON:` implementation are emitted. They're placed after the imports, before
`class BreakOutOfALoop`.
- Config: `robot.helperMethods = classpath:/mbed.methods.yml`, which includes `OpenRobertaRobot/src/main/resources/common.methods.yml`.
- Enums registered with `HelperMethodGenerator`: `FunctionNames`, `ListElementOperations`, and `MicrobitMethods`
  (the last one through `getAdditionalMethodEnums`).

| Key (enum) | Python function | File | Triggered by |
|---|---|---|---|
| `PRIME` (`FunctionNames`) | `_isPrime(number)` | common.methods.yml | `math_number_property` "is prime" |
| `MEDIAN` (`FunctionNames`) | `_median(l)` | common.methods.yml | `math_on_list` MEDIAN |
| `STD_DEV` (`FunctionNames`) | `_standard_deviation(l)` | common.methods.yml | `math_on_list` STD_DEV |
| `RECEIVE_MESSAGE` (`MicrobitMethods`) | `receive_message(type)`: `radio.receive()`, then Number → `float(msg)` (0 on error), Boolean → `msg == 'True'` (False for None), String → `msg` ('' for None) | mbed.methods.yml | `mbedCommunication_receiveBlock` |

These are the only four helpers micro:bit V2 Python can contain. Other used-method markers are collected but have no
Python entry, so they're silently ignored: `CAST`, `POWER`, `RANDOM`, trig functions, `LISTS_REPEAT`, `SUM` and
`AVERAGE` (Java only), and `CalliopeMethods.IS_GESTURE_SHAKE`.

**A mock runtime therefore doesn't need to provide helpers.** They're part of the generated program, and only
`radio.receive()` must be mocked for `receive_message`.

---

## 10. Existing test infrastructure

### 10.1 Golden-file tests: `ReuseIntegrationAsUnitTest` (the main safety net, verified)

File: `OpenRobertaServer/src/test/java/de/fhg/iais/roberta/javaServer/integrationTest/ReuseIntegrationAsUnitTest.java`.
It runs in the normal `mvn install` build (it's **not** an `@Category(IntegrationTest)` test, despite the package name).
Config file: `OpenRobertaServer/src/test/resources/crossCompilerTests/testSpec.yml`.

```yaml
robots:
  microbitv2:
    template: microbitv2            # common/template/microbitv2.xml wraps common programs
    dir: microbitv2                 # robotSpecific/microbitv2/*.xml are the robot-specific test programs
    suffix: ".py"
    pylintIgnoredModules: [ "microbit", "radio", "music", "machine" ]
progs:                              # common programs; each may exclude robots
  controlFlowLoops: { decl: controlFlowLoops, exclude: { … } }
```

- **`testAllRobotSpecificProgramsAsUnitTests`**: for each robot in `robots:` and each `robotSpecific/<dir>/*.xml`
  (an *export* XML with program and config; `error.xml` and `exclude:` entries are skipped):
  1. **AST dump** vs `_expected/robotSpecific/astGenerated/microbitv2/<prog>.ast` (the `toString()` of each
     top-level phrase after the start block)
  2. **XML round trip**: program XML → AST → XML, compared with XMLUnit (similar, not identical)
  3. **Generated Python** (`showsource` workflow) vs `_expected/robotSpecific/targetLanguage/microbitv2/<prog>.py`
  4. **Collector results** (used sensors, actors, methods) vs
     `_expected/robotSpecific/collectorResults/microbitv2/<prog>.txt` (through `ValidationFileAssert`)
- **`testAllCommonProgramsAsUnitTests`**: each `progs:` entry is assembled from `common/template/microbitv2.xml`, with
  `[[decl]]` ← `common/decl/<decl>.xml` (variable declarations), `[[prog]]` ← `common/prog/<name>.xml`,
  `[[fragment]]` ← `common/fragment/<fragment>.xml` (extra stacks such as function definitions), `[[nn]]` and
  `[[conf]]` ← the robot's default configuration. It's generated for `ev3lejosv1, calliope2017NoBlue, ev3dev, wedo, microbitv2`
  (`ROBOTS_FOR_TARGET_LANGUAGE_GENERATION`) and compared with `_expected/common/targetLanguage/microbitv2/<prog>.py`.
  It also produces stack-machine JSON (`_expected/common/stackmachineLanguage/`) for simulator robots.
- `@Ignore`d helpers `testOneCommonProgrammAsUnitTest` and `testOneRobotSpecificProgramAsUnitTests` run a single
  program. Edit the robot and program name in the source and remove `@Ignore` locally.
- **The comparison is whitespace-insensitive:** `\r` removed, `\n` → `<NL>`, then *all* `\s+` removed. Python
  indentation errors therefore **aren't detected**. Only line structure and tokens are compared.
- Everything actually produced is written to `OpenRobertaServer/target/unitTests/` (same sub-paths as `_expected/`,
  plus `progGenerated`, `progRegenerated`, `configGenerated`, `targetSource`). Copy files from there to accept a new
  expected output.
- `ValidationFileAssert` (`OpenRobertaRobot/src/test/java/de/fhg/iais/roberta/ValidationFileAssert.java`) **creates a
  missing expected file** with a header line (`<-- This file was automatically generated, if the content is alright,
  remove this line -->`) and then fails. Remove the line to accept it.
- Some `collectorResults/microbitv2/*.txt` files have no matching input XML any more (`error_math_arithmetic`,
  `forEach_wait`, `math_arithmetic`, `sensor_buttons`, `sensor_other`, `sound_expressions`). They're stale and harmless.

Commands (verified, ~2 min):

```bash
mvn -pl OpenRobertaServer -am test -Dtest='ReuseIntegrationAsUnitTest#testAllRobotSpecificProgramsAsUnitTests' -DfailIfNoTests=false
mvn -pl OpenRobertaServer -am test -Dtest='ReuseIntegrationAsUnitTest#testAllCommonProgramsAsUnitTests' -DfailIfNoTests=false
# faster, after one `mvn install -DskipTests`, if only OpenRobertaServer tests or resources changed:
mvn -o -pl OpenRobertaServer test -Dtest=ReuseIntegrationAsUnitTest -DfailIfNoTests=false
```

Because the robot-specific test loops over **all** robots in one JUnit method, a broken expectation for another board
fails the whole test. Per the scope rules, either update that board's expected files from `target/unitTests/` or
remove that board from `testSpec.yml`/`ROBOTS_FOR_TARGET_LANGUAGE_GENERATION` in your branch. Don't debug other boards.

### 10.2 Type-checker tests: `TestTypecheck` (textly-driven)

`OpenRobertaServer/src/test/java/de/fhg/iais/roberta/javaServer/typecheck/TestTypecheck.java` +
`TestTypecheckUtil.java`. Test cases are **textly strings** (e.g. `TC.of(BlocklyType.VOID, "while(2){num=1;};", ROBOTS_ALL)`).
They're injected into `robotSpecific/microbitv2/textly/templateProgramStmtExpr.xml` or `templateProgramExprEval.xml`, in the
`STMTEXPRESSION` field of a `robActions_eval_stmt` / eval-expr block. That template predeclares `num`, `boolT`, `boolF`,
`listN`, `str`, `listN2`, `ima`, `listIma`. micro:bit V2 is the reference robot for the parser-error tests.

**This template trick is the cheapest way to produce test programs from text (verified):**
`TestTypecheckUtil.getProgramUnderTestForEvalStmt(factory, "boolT = isEmpty(listN) == false;")` gives an export XML.
Run it through `ProjectService.executeWorkflow("showsource", project)` and the Python comes out. Don't use it for
string literals with punctuation or non-ASCII characters (§13 #22).

### 10.3 Other tests that touch micro:bit V2

| Test | What it checks |
|---|---|
| `OpenRobertaServer/…/javaServer/TestToolboxBlocksAreUsedInTestFiles.java` | Every block type in the micro:bit V2 toolboxes (beginner + expert, with `nn`) must appear in some test XML (`common/**` or `robotSpecific/microbitv2/**`). **Adding a block to the toolbox requires a test program that uses it.** |
| `OpenRobertaServer/…/javaServer/NepoAnnotationValidTest.java` | Meant to check the AST annotation and constructor contract. **Run alone it executes 0 tests (verified):** it never calls `AstFactory.loadBlocks()`, so its parameter list is empty. Don't rely on it. |
| `…/integrationTest/PythonLinterWorkflowRobotSpecificIT.java` (`-PrunIT`) | Runs `pylint` 3.x (`--disable=E1101,E0107`, ignored modules from `testSpec.yml`) on every expected `.py`. Only E/F messages fail. This is the only existing check that the Python is syntactically valid. |
| `…/integrationTest/CompilerWorkflowRobotSpecificIT.java`, `CompilerWorkflowRobotCommonIT.java` (`-PrunIT`) | Full compile to `.hex`. Needs `ora-cc-rsc` and cross compilers. |
| `RobotMbed/src/test/java/…/syntax/MicrobitTwo2ThreeTransformerTest.java` | micro:bit **V1** XML transformation. Not relevant. |

There are **no** unit tests in `RobotMbed` for the micro:bit V2 visitors themselves. A pattern for worker-level tests
without the server exists in another module: `RobotArdu/src/test/java/de/fhg/iais/roberta/visitor/WorkflowTestHelper.java`.
It builds a `Project` from hand-made AST phrases, runs a worker chain, and asserts on `UsedHardwareBean` and NepoInfos.
Tests that need `ProjectService` or `ProjectWorkflowRestController.splitExportXML` must live in `OpenRobertaServer`,
which depends on all plugins. Alternatively, replicate the five-line worker loop.

Maven notes: Surefire 2.22, JUnit 4, AssertJ, XMLUnit. `runOrder=alphabetical`. `@Category(IntegrationTest)` tests are
excluded from `mvn test` and run only with `-PrunIT`.

---

## 11. Textly: the text form of a NEPO program

- Grammar: `OpenRobertaRobot/src/main/antlr4/de/fhg/iais/roberta/textly/generated/TextlyJava.g4`
  (`program : declaration* mainBlock userFunc*`). The micro:bit V2 rules are `robotMicrobitv2Expr` / `robotMicrobitv2Stmt`,
  e.g. `microbitv2.showText(expr)`, `microbitv2.pitch(f, d)`, `microbitv2.keysSensor.isPressed(A)` (see the grammar
  for exact token spellings).
- Text → AST: `RobotMbed/…/textlyJava/Microbitv2TextlyJavaVisitor.java`, used by the `robActions_eval_stmt` and
  eval-expression blocks (`OpenRobertaRobot/…/syntax/lang/stmt/EvalStmts.java`, `…/expr/EvalExpr.java`) during XML → AST.
- AST → text: `RobotMbed/…/visitor/codegen/MbedV2RegenerateTextlyJavaVisitor.java`. It runs in **every** workflow, so
  `project.getProgramAsTextly()` is always available after a workflow. Example (verified):

```text
Number num = 0;
Boolean boolT = true;
Array_Number listN = [0,0,0];

void main() {
    boolT = isEmpty(listN) == false;
    boolF = !(boolT) == boolF;
}
```

For AI work this is the most compact, LLM-friendly representation of a learner's program. Use it to reason about
"what to test", and write generated test programs in it. There are two caveats:
- AST → textly drops some blocks, e.g. set logo touch mode (§13 #16).
- Textly → AST mangles string literals: spaces are inserted around punctuation, and apostrophes and non-ASCII are
  dropped (§13 #22).

Treat textly as a *view*, and keep Blockly XML as the source of truth.

---

## 12. Lab integration points (for building the learner-facing feature)

### 12.1 REST endpoints (server)

Controller: `OpenRobertaServer/…/javaServer/restServices/all/controller/ProjectWorkflowRestController.java`
(`@Path("/projectWorkflow")`, served under `/rest`).

**Request.** The body is `{log, data, initToken}` (frontend `OpenRobertaWeb/src/helper/comm.js`). `data` is read by
`ProjectWorkflowRequest` and has the fields `programName, configurationName, progXML, confXML, SSID, password,
language, robot`.

**Project.** `request2project(...)` builds the `Project`. It always uses the **session's** `RobotFactory`, chosen earlier
with `POST /rest/admin/setRobot`, even if `robot` is sent. The config XML comes from the DB (`configurationName`), else
from `confXML`, else from the plugin default.

| Endpoint | Workflow | Response (main fields) |
|---|---|---|
| `/source` | `showsource` | `sourceCode` (the MicroPython), `progXML` (regenerated, with `<error>`/`<warning>` annotations), `confAnnos` |
| `/sourceSimulation` | `getsimulationcode` | `javaScriptProgram` (stack machine `{"ops":[…]}`), `configuration` (JSON: `SENSORS`, `ACTUATORS`, …), `progXML` |
| `/run` | `run` | `compiledCode` (Intel HEX text), `progXML`. Success is reported as `ROBOT_PUSH_RUN`. |
| `/compileProgram` | `compile` (export XML split by `splitExportXML`) | `compiledCode`, `progXML` |
| `/runNative`, `/compileNative` | `runnative` / `compilenative` (`progXML` carries **Python source**) | `compiledCode` |
| `/reset` | `reset` | factory firmware hex |

**Results.** `rc` is `ok`/`error`. `message` and `cause` hold the `Key` (e.g. `PROGRAM_INVALID_STATEMETNS`). Block
errors travel inside the returned `progXML`, and `PROG_C.reloadProgram(result)` re-renders the annotations.

**Two facts to remember:**
- `Project.setWithWrapping(false)` is **never called** anywhere, so the full program is always generated.
- The Python itself is only returned by `/source`; `/run` returns the hex.

### 12.2 Frontend (`OpenRobertaWeb/src`, TypeScript/JS; builds into `OpenRobertaServer/staticResources`)

- REST calls live in `app/roberta/models/program.model.js`: `showSourceProgram` → `/source`, `runOnBrick` → `/run`,
  `runInSim` → `/sourceSimulation`, `runNative`, `compileN`, `compileP`, `resetProgram`.
- **Show source:** `app/roberta/controller/progCode.controller.js` (`#codeButton` → side panel with the Python,
  `#codeDownload` saves `<name>.py`). The editable source tab is `sourceCodeEditor.controller.ts`.
- **Run on device:** `progRun.controller.ts` → `CONNECTION_C.getConnectionInstance()`. The connection class comes from
  the robot name (`Microbitv2Connection extends AutoConnection`, `app/roberta/controller/connections/connections.ts`).
  It offers WebUSB flashing with DAPLink (`dapjs`, vendor `0xd28`) on Chromium, otherwise a `.hex` file download.
  There's **no serial monitor** in the frontend, so `print()` output from a real device isn't visible in the Lab.
- The page DOM is in `OpenRobertaServer/staticResources/index.html` (tracked and hand-edited; not generated).

### 12.3 Simulator (the other execution path)

1. The server generates stack-machine ops with `MicrobitV2StackMachineVisitor`. The chain is `MbedV2StackMachineVisitor`
   → **`MicrobitStackMachineVisitor` (the V1 class)** → `MbedStackMachineVisitor` → `AbstractStackMachineVisitor`.
2. The browser runs them in `OpenRobertaWeb/src/app/nepostackmachine/`:
   - `interpreter.interpreter.ts` (opcode switch in `evalSingleOperation`)
   - `interpreter.state.ts`
   - `interpreter.aRobotBehaviour.ts` (hardware API)
   - `interpreter.robotSimBehaviour.ts` (browser implementation)
3. The robot model is `app/simulation/simulationLogic/robot.microbitv2.ts` (`RobotMicrobitv2 → RobotMicrobit →
   RobotCalliope`). It maps configuration `SENSORS`/`ACTUATORS` to simulated buttons, pins, logo, gesture, compass,
   light, temperature, microphone, buzzer, and display.

Opcode constants are mirrored **by hand** between Java `OpenRobertaRobot/…/util/basic/C.java` and
`interpreter.constants.ts`.

A headless Node runner exists: `interpreter.runStackMachineJson.ts`. It runs the ops JSON with a test behaviour and
compares the output with a `START-RESULT…END-RESULT` section in the program description (data in
`OpenRobertaWeb/testData/`). It's a precedent for running NEPO programs without the device. It executes the stack
machine, **not** the Python.

### 12.4 Test-like features that already exist

| Block | AST | Python (micro:bit V2) | Simulator | In micro:bit V2 toolbox? |
|---|---|---|---|---|
| `robActions_serial_print` | `SerialWriteAction` | `print(x)` | `serialWriteAction` | **yes**, expert toolbox (Action › Display) |
| `robActions_debug` | `DebugAction` | `print(x)` | `console.log` | **no**; only through the hidden shortcut Ctrl/Cmd+2 (`menu.controller.ts`) |
| `robActions_assert` (message `TEXT` + fixed `logic_compare`) | `AssertStmt` | `if not <cmp>: print("Assertion failed: ", "<msg>", <left>, "<OP>", <right>)` | `console.assert` | **no**; only through the hidden shortcut Ctrl/Cmd+3 |
| `robActions_eval_expr` / `robActions_eval_stmt` (textly inside a block) | `EvalExpr` / `EvalStmts` | whatever the text parses to | ✓ | eval_expr: expert toolbox; eval_stmt: shortcut Ctrl+5 |

The golden **common** programs already use asserts as self-checks (`common/prog/*.xml`), but nothing in the Lab UI
collects assert results. A learner-facing framework would add that layer.

### 12.5 Where a learner test feature can hook in (facts, not a design)

- **New workflow:** add `robot.plugin.workflow.<name>` + `robot.plugin.worker.<type>` in `microbitv2.properties`.
  Workers are reusable, e.g. `validate.and.collect,typecheck,generate,<yourTestWorker>`. Expose it through a new
  endpoint next to `/source`.
- **Inputs a test runner gets for free:**
  - the Python (`project.getSourceCodeBuilder()`)
  - the used hardware (`UsedHardwareBean`, i.e. what to mock)
  - the textly form (`getProgramAsTextly()`)
  - the configuration JSON (`project.getConfigurationJSON()`)
  - block ids on every phrase (`BlocklyProperties`), which lets results be mapped back onto blocks as annotations,
    like validation errors
- **Execution options:**
  1. **CPython plus a mocked `microbit`/`music`/`radio`/`machine`**, on the server or in the browser via Pyodide
     (verified approach, see §14).
  2. The **stack-machine interpreter** with a scripted `ARobotBehaviour`, which reuses the simulator's sensor model.
     Note that this tests the stack-machine output, not the Python.
- **New NEPO blocks** for tests (e.g. "expect", "set simulated sensor value") follow §15.

---

## 13. Known quirks, bugs and test candidates

Verified items were reproduced by generating code for micro:bit V2 and, where relevant, running it under CPython with a
stub `microbit` module.

| # | Status | Finding | Where |
|---|---|---|---|
| 1 | **verified bug** | Python `not` binds looser than `==`, but the generator emits `not x` without parentheses. `isEmpty(listN) == false` → `not ___listN == False`, i.e. `not (listN == False)`, which is `True` for **every** list. Wrong result for an empty list. `!(b) == c` → `not ___b == ___c` has the same shape. It's harmless for pure booleans but wrong for non-booleans. | `AbstractPythonVisitor.visitIsListEmptyFunct`, `AbstractLanguageVisitor.visitUnary`/`generateExprCode`, `generateSubExpr` (precedence model is Java-like; `@NepoExpr.precedence` defaults to 999) |
| 2 | verified | Golden comparison ignores indentation (§10.1), so a mis-indented block would pass. | `ReuseIntegrationAsUnitTest.replace` |
| 3 | verified | `display.set_pixel` brightness isn't range-checked or clamped. The golden `display.py` emits `set_pixel(0, 0, 100)`, which MicroPython rejects at runtime (valid 0–9). | `MbedPythonVisitor.visitDisplaySetPixelAction` |
| 4 | verified | Gesture `SHAKE` adds `CalliopeMethods.IS_GESTURE_SHAKE` to the used methods (collector output shows `Methods: [IS_GESTURE_SHAKE]`). There's no Python implementation, so nothing is emitted, and the generated code compares `"shake" == current_gesture()`. Dead collector entry. | `MbedValidatorAndCollectorVisitor.visitGestureSensor` |
| 5 | verified | Pin touch uses the block's `SENSORPORT` value (a fixed 0/1/2 dropdown) directly as the pin number (`microbit.pin<port>.is_touched()`). Read and write go through the configuration property `PIN1` instead. Pin touch also adds `UsedActor PIN_VALUE`, so an unneeded `import machine` is emitted. | `MbedPythonVisitor.visitPinTouchSensor`, `MbedValidatorAndCollectorVisitor.visitPinTouchSensor` |
| 6 | verified | Every radio send re-emits `radio.config(power=…)`. | `MbedPythonVisitor.visitRadioSendAction` |
| 7 | verified | `import music` is added for V2 `audio.play(Sound.*)` too (both mapped to `SC.MUSIC`). Harmless. | `MbedV2ValidatorAndCollectorVisitor.visitPlayFileAction` |
| 8 | code | `this.firmware == "calliopemini"` compares strings by reference. It works only because literals are interned; always false for micro:bit V2. | `MbedPythonVisitor.visitorGenerateImports/GlobalVariables` |
| 9 | code | `visitAssertStmt` casts the condition to `Binary`. The Blockly assert block ships a fixed (non-deletable) compare block, so the cast is safe from the UI but crashes if the XML is hand-written with another expression. | `AbstractPythonVisitor.visitAssertStmt` |
| 10 | code | `main()` catches `Exception` and re-raises. There's no cleanup for micro:bit V2 (the `finally` part is Calliope-only). | `MbedPythonVisitor.generateProgramSuffix` |
| 11 | code | Workers are singletons per `RobotFactory`, and `Project.addWorkerResult` asserts that no bean of the same class exists yet. Running a workflow twice on one Project fails. | `RobotFactory.loadWorkers`, `Project.addWorkerResult` |
| 12 | code | `MicrobitV2TypecheckVisitor.visitPlayNoteAction` and others check no arguments. Field values (note names, durations) aren't type-checked. | `MicrobitV2TypecheckVisitor` |
| 13 | code | **Compile failures aren't reported.** `MbedCompilerWorker.execute` discards the `Key` returned by `runBuild`. A failed cross-compile still ends with a success result and `compiledHex == null`, and `/run` answers `ROBOT_PUSH_RUN`. | `RobotMbed/…/worker/MbedCompilerWorker.java` |
| 14 | verified (read) | Frontend argument-order bug: `program.controller.js:594` calls `showSourceProgram(name, conf, xml, confXml, language, SSID, password, cb)`, but the signature is `(…, SSID, password, language, cb)`. The language arrives as `SSID`. It's irrelevant for micro:bit V2 Python today. | `OpenRobertaWeb/src/app/roberta/controller/program.controller.js`, `models/program.model.js:245` |
| 15 | suspected | `GetSampleSensor.xml2ast` special-cases the robot group `"microbit"` (accelerometer/gyro default slot `X`). micro:bit V2's group is `"microbitv2"` (no `robot.plugin.group`), so the default becomes `NO_SLOT`. If the `SLOT` field is empty, the generator would emit `accelerometer.get_no_slot()`. The UI always fills `SLOT`, so this is only reachable with hand-written XML. | `OpenRobertaRobot/…/syntax/sensor/generic/GetSampleSensor.java` |
| 16 | code | Textly regeneration is lossy: e.g. `visitLogoSetTouchMode` emits nothing. The textly form isn't a complete representation of every program. | `MbedV2RegenerateTextlyJavaVisitor` |
| 17 | code | `robActions_assert` and `robActions_debug` aren't in any micro:bit V2 toolbox. Learners can only create them with the hidden keyboard shortcuts Ctrl/Cmd+3 and Ctrl/Cmd+2 (`OpenRobertaWeb/src/app/roberta/controller/menu.controller.ts`). | toolboxes |
| 18 | **verified bug** | String literals are escaped with `StringEscapeUtils.escapeEcmaScript`, which turns `/` into `\/`. In Python, `"\/"` is an *invalid* escape: CPython keeps the backslash (and emits a `SyntaxWarning`), so `"1/2"` becomes the four-character string `1\/2`. A learner's scrolled text shows a backslash. Non-ASCII becomes `\uXXXX`, which is fine in Python. | `AbstractLanguageVisitor.visitStringConst` |
| 19 | code (reachable) | The NN activation `bool` emits the C-style ternary `____n = ____n < 1 ? 0 : 1` for Python. That's a **syntax error**. micro:bit V2 offers `bool` (`robot.nn.activations` in `microbitCommon.properties`), and no golden test covers it. | `AbstractLanguageVisitor.mkActivationFunctionTerm` |
| 20 | code | `math_on_list` RANDOM → `l[0]`: always the first element, never random. | `AbstractPythonVisitor.visitMathOnListFunct` |
| 21 | code | `robLists_setIndex` INSERT at LAST → `l.insert(-1, v)`, which inserts *before* the last element instead of appending. FROM_END indices use `-1 -i`. | `AbstractPythonVisitor.visitListSetIndex` / `visitListGetIndex` |
| 22 | verified | The **textly string-literal parser is lossy**. The literal is re-assembled from tokens: `"1/2 it's ä"` became `"1 / 2 it s"` (spaces inserted, apostrophe and `ä` dropped, token-recognition errors logged). Generated test programs that need exact strings should use Blockly `text` blocks in XML, not `robActions_eval_stmt`. | `TextlyJava.g4` (`ConstStr`), `Microbitv2TextlyJavaVisitor` |
| 23 | code | `robot.program.default.nn = /microbitV2/program.default.nn.xml` points to a file that doesn't exist. Nothing reads the property; NN defaults come from `#ifdef nn` in `program.default.xml`. | `microbitv2.properties` |
| 24 | agent-reported | `MAP_CORRECT_CONFIG_PINS = {BUZZER: "0"}` looks dead. BUZZER is in `DEFAULT_PROPERTIES`, which the configuration validator skips, so pin 0 isn't reserved for the buzzer. | `MicrobitV2ValidatorAndCollectorWorker` |

Good generic test-candidate classes for the generator: operator precedence and mixed-type comparisons; empty lists and
strings; float vs int (`float(x)` wrapping, `/` → float division); loop bounds and step signs; break/continue inside
nested waits (exception mechanism); variables shadowed by function parameters; blocks not connected to the start block;
disabled blocks; configuration ports renamed by the learner.

---

## 14. Recipes

**See the Python for any NEPO program (no server):** write a JUnit test in `OpenRobertaServer/src/test/java` (it
needs every plugin on the classpath). Delete it afterwards if it's only a probe.

```java
AstFactory.loadBlocks();                                                        // once, @BeforeClass
RobotFactory f = Util.configureRobotPlugin("microbitv2", "", "", new ArrayList<>());
String export = TestTypecheckUtil.getProgramUnderTestForEvalStmt(f, "num = 7 / 2;");   // or read an export XML file
Pair<String, String> pc = ProjectWorkflowRestController.splitExportXML(export);
Project p = UnitTestHelper.setupWithConfigAndProgramXML(f, pc.getFirst(), pc.getSecond()).setRobot("microbitv2").build();
ProjectService.executeWorkflow("showsource", p);
p.getResult();                        // Key.COMPILERWORKFLOW_PROGRAM_GENERATION_SUCCESS on success
p.getSourceCodeBuilder().toString();  // the MicroPython
p.getProgramAsTextly();               // textly form
p.getWorkerResult(UsedHardwareBean.class);  // what hardware the program touches → what to mock
```

Run it: `mvn -o -pl OpenRobertaServer test -Dtest=<YourTest> -DfailIfNoTests=false` (after one `mvn install -DskipTests`).

**Run the generated Python under CPython (verified):** put a stub `microbit.py` (and `music.py`, `radio.py`,
`machine.py` if imported) on `sys.path`, then `importlib.import_module("<prog>")`. `main()` won't run. Set
`mod.___<var>`, call `mod.run()` or `mod.____<func>(…)`, and inspect globals and stub call logs.

**Add a golden test for micro:bit V2:** export a program from the Lab (or write the export XML) into
`OpenRobertaServer/src/test/resources/crossCompilerTests/robotSpecific/microbitv2/<name>.xml` (xmlversion 3.1,
`robottype="microbitv2"`). Run `testAllRobotSpecificProgramsAsUnitTests` once; it fails and writes outputs to
`OpenRobertaServer/target/unitTests/…`. Review the files and copy them to `_expected/robotSpecific/{astGenerated,targetLanguage,collectorResults}/microbitv2/`,
removing the auto-generated header line from the collector file. Then re-run.

**Change the Python for a block:** find the block in §8. Change or override its `visitXxx` in
`MbedV2PythonVisitor` / `MicrobitV2PythonVisitor` (or in the shared parent if the logic is generic). Update the
golden `.py` files that change, and add a golden program that pins the new behaviour.

**Add a new block:** follow §15.

---

## 15. Custom NEPO blocks

This topic has its own verified guide: **`docs/ai/nepo-custom-blocks.md`**. It covers how blocks are defined on the
Blockly side (hand-written, data-driven sensor and configuration blocks, the hidden configuration binding, messages,
runtime registration from `OpenRobertaWeb`), the toolbox, the XML ↔ Java annotation contract, and which visitors to
touch. It includes a complete custom micro:bit V2 block that was built and run end to end.

Key facts, in brief:
- A block is glued together only by string names across 8 layers: Blockly definition, messages, toolbox, XML, AST
  class, visitors, simulator, tests.
- Declare the new `visitXxx` in **`IMicrobitV2Visitor`**. That needs 5 implementations. Declaring it in
  `IMbedV2Visitor` also drags in Calliope's C++ generator.
- The five implementations: `MbedV2ValidatorAndCollectorVisitor`, `MicrobitV2TypecheckVisitor`, `MbedV2PythonVisitor`,
  `MbedV2StackMachineVisitor`, `MbedV2RegenerateTextlyJavaVisitor`.
- Every toolbox block needs a golden test program (`TestToolboxBlocksAreUsedInTestFiles`).
- `NepoAnnotationValidTest` runs 0 tests on its own. Rely on the golden tests.
