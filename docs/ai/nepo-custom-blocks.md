# NEPO blocks on the Edison V2 — how they're defined and how to create custom ones

> **Audience:** AI coding agents (and humans) adding or changing NEPO blocks for the `edisonv2` robot plugin.
> The plugin is shared with `edisonv3`: every block change applies to both.
> **Companion doc:** `docs/ai/edisonv2-nepo-to-edpy.md` (pipeline, generated EdPy, `Ed` API, tests, quirks).
> **Status:** written 2026-09-25 against branch `work` @ `a87f69b37`.
> - The **Java/server side (§4–§7) was verified by building a real custom Edison block end to end** in a throwaway git
>   worktree. It compiled, validated, generated EdPy, ran through `compile` and the simulator workflow, round-tripped
>   XML, and passed the golden-file suite (317/317). The worktree was deleted afterwards.
> - The **Blockly/browser side (§2–§3)** is documented from the compiled Blockly bundle and existing TypeScript
>   precedents. It was **not** run in a browser.

Paths are repo-relative. `…/` abbreviates `src/main/java/de/fhg/iais/roberta/` inside a module.

---

## 0. The short version

A NEPO block is a **string name** (its *block type*, e.g. `actions_led_edison`) that must be known, identically, in
eight places. Nothing checks consistency at build time.

| # | Layer | Where | What it defines |
|---|---|---|---|
| 1 | **Blockly definition** (browser) | compiled into `OpenRobertaServer/staticResources/blockly/blockly_compressed.js`, or registered at runtime from `OpenRobertaWeb/src` (§2.6) | shape, fields, inputs, input types, dropdown values (**including Edison's hard-coded port names**), tooltip |
| 2 | **Messages** | `OpenRobertaServer/staticResources/blockly/msg/js/<lang>.js` (`Blockly.Msg.*`) | labels, tooltips, dropdown texts |
| 3 | **Toolbox** | `RobotEdison/src/main/resources/edison.program.toolbox.{beginner,expert}.xml` | whether learners see the block, and its default sub-blocks |
| 4 | **Blockly XML** | produced by Blockly (`robottype="edison"`) | `<block type=…>` with `<field>`, `<value>`, `<statement>`, `<mutation>`, `<data>` |
| 5 | **Java AST class** | `RobotEdison/…/syntax/**` (Edison-specific) or `OpenRobertaRobot/…/syntax/**` (generic) | XML ↔ Java mapping (annotations) |
| 6 | **Visitors** | `IEdisonVisitor` + `EdisonPythonVisitor`, `EdisonValidatorAndCollectorVisitor`, `EdisonStackMachineVisitor` | EdPy, validation + collection, simulator ops |
| 7 | **Simulator** (optional) | `OpenRobertaWeb/src/app/simulation/simulationLogic/robot.edison.ts`, `…/nepostackmachine/**` | behaviour in the browser simulator |
| 8 | **Tests** | `OpenRobertaServer/src/test/resources/crossCompilerTests/**` | golden program (`robotSpecific/edison/`) + expected files for **edisonv2 and edisonv3** |

Verified minimal change set for a new Edison statement block (§7 has all the code):

- **New (1 + 1 + 6 files):**
  - the AST class
  - one golden test program
  - 2 × 3 expected-output files (`.ast`, `.py`, collector `.txt`, for `edisonv2` and for `edisonv3`)
- **Edited (5 files):**
  - `IEdisonVisitor`
  - `EdisonPythonVisitor`
  - `EdisonValidatorAndCollectorVisitor`
  - `EdisonStackMachineVisitor`
  - `edison.program.toolbox.expert.xml`
- **Plus,** for the editor, a Blockly definition and its messages (layers 1–2).

Compared with boards that have a type checker and a textly representation, the Edison needs **only three visitor
implementations**. `RegenerateNepoWorker` is generic (no textly), and there's no type-check worker.

---

## 1. Anatomy of a block, using one real example

The Edison block **"LED on/off"** (`actions_led_edison`), traced through all layers.

**Layer 1: Blockly definition** (de-minified from `blockly_compressed.js`):

```js
Blockly.Blocks.actions_led_edison = {
    init: function () {
        this.jsonInit({
            message0: Blockly.Msg.SET_LED + " %1 %2",
            args0: [
                { type: "field_dropdown", name: "ACTORPORT",                 // ← Edison port names are hard-coded here
                  options: [[Blockly.Msg.LEFT, "LLED"], [Blockly.Msg.RIGHT, "RLED"]] },
                { type: "field_dropdown", name: "MODE",
                  options: [[Blockly.Msg.ON, "ON"], [Blockly.Msg.OFF, "OFF"]] }
            ],
            colour: Blockly.CAT_ACTION_RGB,
            previousStatement: true, nextStatement: true,                   // a statement block
            tooltip: Blockly.Msg.LED_ON_TOOLTIP
        });
    }
};
```

**Layer 2: messages.** `SET_LED`, `LEFT`, `RIGHT`, `ON`, `OFF`, `LED_ON_TOOLTIP` in `blockly/msg/js/<lang>.js`.

**Layer 3: toolbox.** In `edison.program.toolbox.expert.xml` and `beginner.xml`, category `TOOLBOX_LIGHT`, twice with
different presets.

**Layer 4: XML**, e.g.:

```xml
<block type="actions_led_edison" id="…" intask="true">
    <field name="ACTORPORT">LLED</field>
    <field name="MODE">ON</field>
</block>
```

**Layer 5: Java AST class.** It's a *generic* class shared with other robots:
`OpenRobertaRobot/…/syntax/action/light/LedAction.java`, with `@NepoField ACTORPORT` (`port`) and `MODE` (`mode`).

**Layer 6: visitors.** `IEdisonVisitor.visitLedAction(...)` is implemented in:

| Visitor | Implementation |
|---|---|
| `EdisonPythonVisitor.visitLedAction` | `LLED` → `Ed.LeftLed(Ed.ON/OFF)`, `RLED` → `Ed.RightLed(…)`. An unknown port or mode throws `DbcException`. |
| `EdisonValidatorAndCollectorVisitor.visitLedAction` | nothing (`return null`) |
| `EdisonStackMachineVisitor.visitLedAction` | op `LED_ACTION` with `port=lled/rled`, `mode=ON/OFF` |

**Layer 7: simulator.** `EdisonLeds` in `robot.edison.ts` lights the left or right LED red.

**Layer 8: tests.** The block is used in `robotSpecific/edison/action.xml`, with expected
`_expected/robotSpecific/targetLanguage/{edisonv2,edisonv3}/action.py`.

---

## 2. Layer 1–2: how blocks are defined in the browser (Blockly)

### 2.1 Where the definitions come from

- **The block definitions and messages don't have editable source in this repository.** All definitions live in
  `OpenRobertaServer/staticResources/blockly/blockly_compressed.js`. That file is minified, about 3,300 lines, and its
  first line is `// Do not edit this file; automatically generated by build.py.` It's built in the separate
  **OpenRoberta/blockly** repository, which isn't checked out here.
- Messages are in `staticResources/blockly/msg/js/<lang>.js` (also `msg/messages.js`, `msg/json/`).
- **Two ways to add a block:**
  1. **Standard:** edit the Blockly repo, rebuild, and copy the build output.
  2. **Inside this repo:** register it at runtime from `OpenRobertaWeb/src` (§2.6).
- To read an existing definition, search the bundle, e.g. `grep -o "Blockly.Blocks.actions_led_edison=.\{0,800\}"`.

### 2.2 How the editor loads blocks, and what `device` is for the Edison

1. `OpenRobertaWeb/src/main.js` (RequireJS) loads `blockly/blockly_compressed` as a plain script. Its top-level `var`s
   (`Blockly`, `sensors`, `sensorsAll`, `confBlocks`) are **globals**.
2. At load, the bundle runs `initSensors()` / `initConfBlocks()`, which generate data-driven blocks (§2.3 c).
3. `programController.init()` (`OpenRobertaWeb/src/app/roberta/controller/program.controller.js`) calls
   `Blockly.inject(…, {toolbox})`. The toolbox XML comes from the server.
4. Then `blocklyWorkspace.setDevice({group, robot})` sets **`workspace.device = "edison"`** (the robot group) and
   `workspace.subDevice = "edisonv2"`. Many generic block definitions branch on `this.workspace.device ===
   "edison"`.
5. Instantiating an unknown block type fails the assertion `Error: "<type>" is an unknown language block.` This applies
   to toolbox entries and saved programs alike.

### 2.3 Definition styles used by Edison blocks

**(a) Hand-written Edison blocks** (all four Edison-specific toolbox blocks):

| Block type | Definition (de-minified essentials) | Java class |
|---|---|---|
| `actions_led_edison` | §1: dropdowns `ACTORPORT` (`LLED`/`RLED`) and `MODE` (`ON`/`OFF`), statement | `LedAction` (generic) |
| `edisonSensors_sensor_reset` | Dummy input `SENSOR_RESET` + dropdown `SENSOR` `[[SENSOR_INFRARED,"OBSTACLEDETECTOR"],[SENSOR_KEYPAD,"KEYPAD"],[SENSOR_SOUND,"SOUND"],[SENSOR_IRSEEKER_EDISON,"RCCODE"]]` + `SENSOR_RESET_II`, statement | `RobotEdison/…/syntax/sensors/edison/ResetSensor` (`@NepoField SENSOR`) |
| `edisonCommunication_ir_sendBlock` | Alias of `bob3Communication_sendBlock`. For device edison: `appendValueInput("sendData").setCheck("Number")`, statement | `RobotEdison/…/syntax/actors/edison/SendIRAction` (`@NepoValue sendData`) |
| `edisonCommunication_ir_receiveBlock` | Alias of `bob3Communication_receiveBlock`: `setOutput(true, "Number")` | `ReceiveIRAction` (`@NepoExpr`, NUMBER) |

The IR tooltips use message keys `CONNECTION_SEND/RECEIVE_TOOLTIP_EDISON`, which **aren't defined** in `en.js`.

**(b) Generic blocks with Edison branches.** The shared definition checks `this.workspace.device === "edison"`:

| Block | Edison branch |
|---|---|
| `robActions_motor_on(_for)`, `robActions_motor_stop` | ports `[[MOTOR+" "+MOTOR_LEFT,"LMOTOR"],[MOTOR+" "+MOTOR_RIGHT,"RMOTOR"]]`; motor stop has no FLOAT/BRAKE mode |
| variable type dropdown (`Blockly.TYPE_DROPDOWN`) | only Number, Boolean, Array_Number |
| `robLists_create_with` | new Number items are `math_integer` |
| `robLists_getIndex` / `robLists_setIndex` | only GET/SET with FROM_START |
| `math_single` | only ABS, NEG, POW10 |
| `math_number_property` | no WHOLE |
| `math_on_list` | only SUM, MIN, MAX, AVERAGE |
| `robControls_start` | `DEBUG` hidden; global declarations default to `math_integer` |

**(c) Data-driven sensor blocks** (`robSensors_<name>_getSample`), generated by `initSensors()` from
`sensors.<name>.edison` through `robSensors_generic`. These are the exact Edison entries from the bundle:

```js
sensors.infrared.edison = { title: "INFRARED", ports: [["LEFT","LEFT"],["RIGHT","RIGHT"],["SLOT_FRONT","FRONT"]],
                            modes: [{ name: "OBSTACLE", type: "Boolean" }] };
sensors.irseeker.edison = { title: "IRSEEKER", modes: [{ name: "RCCODE", type: "Number" }] };
sensors.key.edison      = { title: "KEY", modes: [{ name: "PRESSED", type: "Boolean", question: true }],
                            ports: [["SENSOR_KEY_PLAY","PLAY"],["SENSOR_KEY_REC","REC"]] };
sensors.light.edison    = { title: "LIGHT", modes: [
                              { name: "LIGHT", type: "Number", unit: "PERCENT", ports: [["LEFT","LLIGHT"],["RIGHT","RLIGHT"],["BELOW","LINETRACKER"]] },
                              { name: "LINE",  type: "Boolean", ports: [["BELOW","LINETRACKER"]] } ] };
sensors.sound.edison    = { title: "SOUND", modes: [{ name: "SOUND", type: "Boolean" }] };
sensorsAll.edison = [ sensors.key.edison, sensors.infrared.edison, sensors.irseeker.edison,
                      sensors.light.edison, sensors.sound.edison ];     // → options of the generic robSensors_getSample
```

What `robSensors_generic` makes of such an entry:

| Entry key | Effect in the block | XML produced |
|---|---|---|
| `title` | label from `Blockly.Msg["SENSOR_<title>_EDISON"]`, else `SENSOR_<title>` | – |
| `modes[]` (`name`, `type`, `unit`, `question`, per-mode `ports`) | several modes give a `MODE` dropdown (`MODE_<name>` labels), one mode a hidden field. `type` is the output type. `question: true` gives "… pressed?" wording. Per-mode `ports` rebuild the port dropdown when the mode changes (light: LINE only offers `LINETRACKER`). | `<mutation mode="…"/>`, `<field name="MODE">` |
| `ports: [[label, value], …]` | a fixed `SENSORPORT` dropdown; this is where the **Edison port names** come from | `<field name="SENSORPORT">FRONT</field>` |
| no `ports` | hidden, empty port (`- EMPTY_PORT -` in Java) | `<field name="SENSORPORT"></field>` |
| `slots` | not used for Edison (SLOT is always hidden) | `<field name="SLOT"></field>` |

Edison has **no `confBlocks.*.edison`** (no configurable components), and no blocks using `getConfigPorts` or
`hide`.

### 2.4 Ports: hard-coded, not configured

`robBrick_Edison-Brick` has **no Blockly definition**. The configuration tab only shows a picture, and the
configuration AST on the server has zero components. Port names therefore live in the block definitions (§2.3), and
the Java generators switch on `getUserDefinedPort()`:
- `LMOTOR`/`RMOTOR`
- `LLED`/`RLED`
- `LEFT`/`RIGHT`/`FRONT` (infrared)
- `PLAY`/`REC` (keys)
- `LLIGHT`/`RLIGHT`/`LINETRACKER`

**A new block that addresses hardware must use the same port strings in its dropdown and in the Java `switch`.**

### 2.5 Types and messages

- **Input and output types:** `setCheck(...)` / `setOutput(true, …)` with `"Number"` or `"Boolean"` (and
  `"Array_Number"`). The Edison has no strings or images.
- **Numbers:** Edison programs use **`math_integer`** blocks. A decimal value that reaches the Java generator crashes
  it (`Not an integer`, verified), so constrain inputs to integers in the Blockly definition and the toolbox presets.
- **Messages:** a missing `Blockly.Msg` key falls back to `Blockly.checkMsgKey(key)`. It logs a warning and shows the
  raw key. Add keys for every language file, or at least `en.js` and `de.js`.

### 2.6 Registering a custom block from this repo (no Blockly rebuild)

There's a working precedent: `OpenRobertaWeb/src/app/configVisualization/robotBlock.ts` exports a block definition that
`confVisualization.ts:98` registers (`window.Blockly.Blocks['robConf_robot'] = createRobotBlock(…)`). It's wired
into `OpenRobertaWeb/src/main.js` in four places: a RequireJS `paths` entry, a `shim` with `deps: ['blockly']`, the
`require([...])` list, and a `require('robotBlock')` call. TypeScript compiles with `tsc` (AMD, `outDir`
`../OpenRobertaServer/staticResources/js`); see `OpenRobertaWeb/README.md` (`npm install && npm run build && npx gulp`).

The same pattern works for a custom Edison block. The sketch below is **not run**. Register before
`programController.init()`:

```ts
// OpenRobertaWeb/src/app/customBlocks/edison.customBlocks.ts   (hypothetical file)
const B = (<any>window).Blockly;
B.Msg.EDISON_PLAY_BEEP = B.Msg.EDISON_PLAY_BEEP || 'play beep, tone';
B.Msg.EDISON_PLAY_BEEP_TOOLTIP = B.Msg.EDISON_PLAY_BEEP_TOOLTIP || 'Plays a short beep with the given tone.';

B.Blocks['edisonActions_play_beep'] = {
    init: function () {
        this.setColour(B.CAT_ACTION_RGB);
        this.appendValueInput('TONE').setCheck('Number').appendField(B.Msg.EDISON_PLAY_BEEP);
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setTooltip(B.Msg.EDISON_PLAY_BEEP_TOOLTIP);
    },
};

// A new data-driven Edison sensor instead needs a data entry, then a re-run of the generator:
// (<any>window).sensors.mysensor = { edison: { title: 'MYSENSOR', modes: [{ name: 'VALUE', type: 'Number' }] } };
// (<any>window).sensorsAll.edison.push((<any>window).sensors.mysensor.edison);
// (<any>window).initSensors();
```

Caveats:
- Messages are replaced on language switch, so `||` defaults won't be re-translated.
- Keep all runtime-registered blocks in **one** module, so they can move into the Blockly repo later.

---

## 3. Layer 3: toolbox

- Files: `RobotEdison/src/main/resources/edison.program.toolbox.beginner.xml` and `…expert.xml` (level 1/2 tabs).
- Expert categories:
  - `TOOLBOX_ACTION` (`TOOLBOX_MOVE`, `TOOLBOX_DRIVE`, `TOOLBOX_SOUND`, `TOOLBOX_LIGHT`)
  - `TOOLBOX_SENSOR`
  - `TOOLBOX_CONTROL` (`TOOLBOX_DECISION`, `TOOLBOX_LOOP`, `TOOLBOX_WAIT`)
  - `TOOLBOX_LOGIC`, `TOOLBOX_MATH`, `TOOLBOX_NN` (inside `#ifdef nn … #end`), `TOOLBOX_TEXT`, `TOOLBOX_LIST`
  - `TOOLBOX_COMMUNICATION`
  - `TOOLBOX_VARIABLE`, `TOOLBOX_PROCEDURE`
- A toolbox entry can pre-attach **default inputs** (use `math_integer` for numbers):

  ```xml
  <block type="edisonActions_play_beep">
      <value name="TONE"><block type="math_integer"><field name="NUM">200</field></block></value>
  </block>
  ```

- The server serves the toolbox (`RobotFactory` → `/rest/admin/setRobot`), so a toolbox change needs a server
  rebuild or restart.
- **A toolbox block must appear in a test program.** `TestToolboxBlocksAreUsedInTestFiles` checks both `edisonv2` and
  `edisonv3` against `common/**` + `robotSpecific/edison/**`.
- Blocks that are implemented but not in the toolbox can still be loaded from imported XML, or created with the hidden
  shortcuts (assert, debug). Generator exceptions for those surface as server errors.

---

## 4. Layer 4–5: the XML ↔ Java contract

### 4.1 Registration

`AstFactory.loadBlocks()` (`OpenRobertaRobot/…/util/ast/AstFactory.java`) scans every class under
`de.fhg.iais.roberta.syntax.` from **all** plugins. `Jaxb2ProgramAst` lowercases the XML type and looks it up. Rules:

- `blocklyNames` are **globally unique across plugins**, case-insensitive (`AST classes … mapped both blockly name …`).
- The class must be **`final`**.
- `category` must be a `Category` constant: `EXPR, SENSOR, ACTOR, STMT, TASK, FUNCTION, METHOD, HELPER, CONFIGURATION_*`.
- Sensor **modes** must be listed in `AstFactory.allLegalModesArray`, otherwise you get `Undefined mode …`. Edison
  modes such as `OBSTACLE`, `RCCODE`, `EDISON_CODE`, `LINE`, `LIGHT`, `PRESSED`, and `SOUND` are there.
- Existing Edison-specific classes: `RobotEdison/…/syntax/actors/edison/{SendIRAction,ReceiveIRAction}`,
  `…/sensors/edison/ResetSensor`. The naming convention for Edison-only blocks is `edison<Category>_<name>`
  (`edisonCommunication_ir_sendBlock`, `edisonSensors_sensor_reset`); `actions_led_edison` is the exception.

### 4.2 Field annotations (`AnnotationHelper`)

| XML | Java | Allowed Java type | If missing in the XML |
|---|---|---|---|
| `<field name="MODE">ON</field>` | `@NepoField(name = "MODE", value = "<default>")` | `String`, `boolean`/`Boolean`, `double`/`Double`, `enum` | the `value` default (`""`) |
| `<value name="TONE"><block …/></value>` | `@NepoValue(name = "TONE", type = BlocklyType.NUMBER)` | `Expr` (or `Var`) | `EmptyExpr` → `ERROR_MISSING_PARAMETER` from the validator (verified) |
| `<mutation …/>` | `@NepoMutation` | `Mutation` | `null` |
| `<hide …/>` | `@NepoHide` | `Hide` | `null` (not used by Edison blocks) |
| `<data>…</data>` | `@NepoData` | `String` | **exception** |
| `<statement name="DO">…</statement>` | not supported → `@NepoBasic` with hand-written `xml2ast`/`ast2xml` | `StmtList` | |

**Constructor contract.** The constructor is `public X(BlocklyProperties properties, <annotated fields in declaration
order>)`, and it ends with `setReadOnly()`.
- Direct `ExternalSensor` subclasses use `(BlocklyProperties, ExternalSensorBean)`. `SENSORPORT`, `MODE`, `SLOT` and
  the mutation are read automatically.
- The Javadoc on `@NepoPhrase`/`@NepoExpr` describes an outdated signature.

A wrong constructor fails at XML → AST time (`Constructor in annotated AST class X not found or invalid`).
`NepoAnnotationValidTest` doesn't reliably catch it: it runs 0 tests alone.

### 4.3 Choosing the class kind

| Block shape | Annotation | Base class | Edison examples |
|---|---|---|---|
| statement, hardware action | `@NepoPhrase(category = "ACTOR")` | `Action` | `SendIRAction`, the verified `PlayBeepAction` (§7) |
| statement acting on sensors | `@NepoPhrase(category = "SENSOR")` | `Sensor` | `ResetSensor` |
| expression reading hardware | `@NepoExpr(category = "ACTOR" \| "SENSOR", blocklyType = …)` | `Action` / `Sensor` | `ReceiveIRAction` (NUMBER) |
| data-driven sensor `robSensors_<x>_getSample` | `@NepoExpr(category = "SENSOR", blocklyNames = {"robSensors_<x>_getSample"}, sampleValues = {@F2M(field = "<TITLE>_<MODE>", mode = "<MODE>")})` | `ExternalSensor` | the generic `InfraredSensor`, `LightSensor`, `KeysSensor`, `SoundSensor`, `IRSeekerSensor` |
| statement inputs or unusual XML | `@NepoBasic` + `static Phrase xml2ast(Block, Jaxb2ProgramAst)` + `List<Block> ast2xml()` | any | `IfStmt`, `RepeatStmt`, `WaitStmt` |

- An `Action` or `Sensor` is wrapped automatically in `ActionStmt`/`SensorStmt` (statement position) or
  `ActionExpr`/`SensorExpr` (value socket).
- Expressions default to `precedence = 999` (never parenthesised). Set a real precedence if the EdPy contains operators.

---

## 5. Layer 6: which visitors must learn the block (verified)

Declaring `V visitX(X x);` in **`RobotEdison/…/visitor/IEdisonVisitor.java`** breaks exactly **three** classes until
they implement it (verified by compiling):

| # | Class | Responsibility |
|---|---|---|
| 1 | `RobotEdison/…/visitor/codegen/EdisonPythonVisitor` | The EdPy. Use `this.src.add("Ed.…(")` + `child.accept(this)`. Don't emit a leading newline; the caller does `nlIndent()`. Follow the Edison convention of emitting `nlIndent(); this.src.add("Ed.ReadClapSensor()")` after blocks that make noise or move, so the robot's own sound doesn't register as a clap. **Don't throw for learner-reachable input.** Exceptions become `SERVER_ERROR` (§8). |
| 2 | `RobotEdison/…/visitor/validate/EdisonValidatorAndCollectorVisitor` | `requiredComponentVisited(block, children…)` validates and collects nested blocks, and gives `ERROR_MISSING_PARAMETER` for empty sockets. Also `usedMethodBuilder.addUsedMethod(EdisonMethods.X)` for helper functions, `usedHardwareBuilder.addUsedSensor(…)` for sensors, `addErrorToPhrase(block, "<KEY>")` to reject unsupported input (e.g. `NO_CONST_NOT_SUPPORTED`), and `addToPhraseIfUnsupportedInSim(block, isError, isSim)` for sim limits. |
| 3 | `RobotEdison/…/visitor/codegen/EdisonStackMachineVisitor` | Simulator ops: `makeNode(C.<OP>)…; return add(o);`, or `return null` for a no-op. A new op also needs `C.java` + `interpreter.constants.ts` + an interpreter case + behaviour in `robot.edison.ts` / `interpreter.robotSimBehaviour.ts`. |

There's **no type checker** and **no textly** for Edison, so nothing else is needed. `RegenerateNepoWorker` uses the
generic annotation-based `ast2xml`.

**Optional: a helper function.** Add an enum constant to `RobotEdison/…/visitor/EdisonMethods.java` and a YAML entry
with a `PYTHON: |` implementation to `RobotEdison/src/main/resources/helperMethodsEdison.yml` (EdPy: integers only,
no imports). Register it in the collector with `usedMethodBuilder.addUsedMethod(EdisonMethods.X)`. Emit the call with
`getBean(CodeGeneratorSetupBean.class).getHelperMethodGenerator().getHelperMethodName(EdisonMethods.X)`. Helpers are
emitted **before** the fixed setup block.

---

## 6. Layer 8: tests (verified sequence)

| Step | Action | Observed result |
|---|---|---|
| 1 | Add the golden program `OpenRobertaServer/src/test/resources/crossCompilerTests/robotSpecific/edison/<name>.xml` (export XML: `robottype="edison"`, config = `<block type="robBrick_Edison-Brick" id="1" intask="true" deletable="false"/>`). Add the block to the toolbox. Run `mvn -pl OpenRobertaServer -am test -Dtest='TestToolboxBlocksAreUsedInTestFiles,ReuseIntegrationAsUnitTest#testAllRobotSpecificProgramsAsUnitTests' -DfailIfNoTests=false` | Toolbox test **passes**. The golden test **fails for both** `edisonv2/<name>` and `edisonv3/<name>` (regeneration, code generation, collector), because the expected files are missing. Actual outputs are written to `OpenRobertaServer/target/unitTests/_expected/robotSpecific/{astGenerated,targetLanguage,collectorResults}/{edisonv2,edisonv3}/`. Both collector files are **auto-created in `src/test/resources`** with a header line. |
| 2 | Review the outputs. For each of `edisonv2` and `edisonv3`, copy `.ast` and `.py` into `src/test/resources/crossCompilerTests/_expected/robotSpecific/…/<robot>/`, and delete the header line of the collector `.txt`. Re-run. | **passes:** `succeeding regeneration/code generation/collector tests: 317` (315 + 2) |
| 3 | `python -m py_compile <generated .py>` | OK. This is **Python 3** syntax only; EdPy validity is decided solely by the external Edison compiler. |

---

## 7. The complete verified example

An Edison statement block **"play beep"**: `edisonActions_play_beep`, with one value input `TONE` (Number). It
generates `Ed.PlayMyBeep(<tone>)` followed by the usual `Ed.ReadClapSensor()`, and isn't simulated. `Ed.PlayMyBeep`
is taken from the EdPy API as documented by Edison; it wasn't run on a robot.

**AST class** (new): `RobotEdison/src/main/java/de/fhg/iais/roberta/syntax/actors/edison/PlayBeepAction.java`

```java
package de.fhg.iais.roberta.syntax.actors.edison;

import de.fhg.iais.roberta.syntax.action.Action;
import de.fhg.iais.roberta.syntax.lang.expr.Expr;
import de.fhg.iais.roberta.transformer.forClass.NepoPhrase;
import de.fhg.iais.roberta.transformer.forField.NepoValue;
import de.fhg.iais.roberta.typecheck.BlocklyType;
import de.fhg.iais.roberta.util.ast.BlocklyProperties;

@NepoPhrase(category = "ACTOR", blocklyNames = {"edisonActions_play_beep"}, name = "PLAY_BEEP")
public final class PlayBeepAction extends Action {

    @NepoValue(name = "TONE", type = BlocklyType.NUMBER)
    public final Expr tone;

    public PlayBeepAction(BlocklyProperties properties, Expr tone) {
        super(properties);
        this.tone = tone;
        setReadOnly();
    }
}
```

**Interface** (`IEdisonVisitor.java`, plus the import):

```java
    V visitPlayBeepAction(PlayBeepAction playBeepAction);
```

**EdPy generator** (`EdisonPythonVisitor.java`):

```java
@Override
public Void visitPlayBeepAction(PlayBeepAction playBeepAction) {
    this.src.add("Ed.PlayMyBeep(");
    playBeepAction.tone.accept(this);
    this.src.add(")");
    nlIndent();
    this.src.add("Ed.ReadClapSensor()");
    return null;
}
```

**Validator/collector** (`EdisonValidatorAndCollectorVisitor.java`):

```java
@Override
public Void visitPlayBeepAction(PlayBeepAction playBeepAction) {
    requiredComponentVisited(playBeepAction, playBeepAction.tone);
    addToPhraseIfUnsupportedInSim(playBeepAction, false, isSim);
    return null;
}
```

**Simulator** (`EdisonStackMachineVisitor.java`):

```java
@Override
public Void visitPlayBeepAction(PlayBeepAction playBeepAction) {
    return null; // not simulated; the validator adds a SIM_BLOCK_NOT_SUPPORTED warning
}
```

**Toolbox**: the `<block type="edisonActions_play_beep">…` entry from §3, inserted into `TOOLBOX_SOUND` of
`edison.program.toolbox.expert.xml`, after `mbedActions_play_note`.

**Golden program** (`robotSpecific/edison/play_beep.xml`), program part:

```xml
<block type="robControls_start" id="pbStart01" intask="true" deletable="false">
    <mutation declare="false"></mutation><field name="DEBUG">TRUE</field>
</block>
<block type="edisonActions_play_beep" id="pbBeep01" intask="true">
    <value name="TONE"><block type="math_integer" id="pbNum01" intask="true"><field name="NUM">200</field></block></value>
</block>
<block type="edisonActions_play_beep" id="pbBeep02" intask="true">
    <value name="TONE">
        <block type="math_arithmetic" id="pbArith01" intask="true">
            <field name="OP">ADD</field>
            <value name="A"><block type="math_integer" id="pbNum02" intask="true"><field name="NUM">100</field></block></value>
            <value name="B"><block type="math_integer" id="pbNum03" intask="true"><field name="NUM">50</field></block></value>
        </block>
    </value>
</block>
```

The config part is `<block_set robottype="edison" …><instance x="213" y="213"><block type="robBrick_Edison-Brick" id="1"
intask="true" deletable="false"/></instance></block_set>`.

**Observed results (verified):**

```python
# showsource → COMPILERWORKFLOW_PROGRAM_GENERATION_SUCCESS   (compile → COMPILERWORKFLOW_SUCCESS, same text)
import Ed
Ed.EdisonVersion = Ed.V2
Ed.DistanceUnits = Ed.CM
Ed.Tempo = Ed.TEMPO_SLOW
obstacleDetectionOn = False
Ed.LineTrackerLed(Ed.ON)
Ed.ReadClapSensor()
Ed.ReadLineState()
Ed.TimeWait(250, Ed.TIME_MILLISECONDS)

Ed.PlayMyBeep(200)
Ed.ReadClapSensor()
Ed.PlayMyBeep(100 + 50)
Ed.ReadClapSensor()
```

```text
AST dump:  PlayBeepAction[tone: NumConst[value: 200]]
           PlayBeepAction[tone: Binary [ADD, NumConst[value: 100], NumConst[value: 50]]]
Collector: Sensors: []  Actors: []  Methods: []
Sim:       getsimulationcode succeeds; ops contain no action for the block;
           regenerated XML carries the SIM_BLOCK_NOT_SUPPORTED warning
Textly:    "- no textly -"
Without the TONE input      → PROGRAM_INVALID_STATEMETNS, 1 error (ERROR_MISSING_PARAMETER); no EdPy
With NUM 1.5 instead of 200 → the workflow throws IllegalArgumentException: Not an integer
```

---

## 8. Gotchas

1. **String names are the only glue.** The Blockly type, the `blocklyNames`, the toolbox `type`, the field and value
   names, and the **port strings** must match across JS, XML, and Java.
2. **Generator exceptions aren't learner-friendly.** Anything thrown in `EdisonPythonVisitor` (`DbcException`,
   `IllegalArgumentException("Not an integer")`) reaches the learner as `SERVER_ERROR`. Detect unsupported input in
   `EdisonValidatorAndCollectorVisitor` with `addErrorToPhrase`, so it appears on the block.
3. **Integers only.** Use `math_integer` in toolbox presets and golden programs. EdPy has no floats, and division is
   integer division.
4. **Changes affect `edisonv3` too.** It's the same plugin and the same visitors. Golden tests need expected files for
   both robots.
5. **`requiredComponentVisited` is mandatory** for child expressions. Without it, nested blocks aren't collected (no
   helper functions registered, so the EdPy calls undefined functions) and empty sockets aren't reported.
6. **Helper functions go before the setup block.** Names without a leading underscore (`max`, `min`, `sum`) shadow
   builtins. Prefer `_name` for new helpers.
7. **EdPy validity isn't checked locally.** The real compiler is Edison's external service, called from the browser
   at run time. `py_compile`/pylint only check Python 3 syntax.
8. **`NepoAnnotationValidTest` runs 0 tests alone.** The golden tests are the real guard.
9. **Top-level stacks not attached to the start block (`intask="false"`) aren't generated.** A block with a statement
   body needs `@NepoBasic`.
10. **Sim ops are mirrored by hand** between `OpenRobertaRobot/…/util/basic/C.java` and
    `OpenRobertaWeb/src/app/nepostackmachine/interpreter.constants.ts`.
