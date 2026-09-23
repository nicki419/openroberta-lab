# NEPO blocks on the micro:bit V2 — how they're defined and how to create custom ones

> **Audience:** AI coding agents (and humans) adding or changing NEPO blocks for the `microbitv2` robot plugin.
> **Companion doc:** `docs/ai/microbitv2-nepo-to-python.md` (pipeline, generated Python, runtime API, tests, quirks).
> **Status:** written 2026-09-23 against `develop` @ `a6efc03c7`.
> - The **Java/server side (§4–§7) was verified by building a real custom block end to end** in a throwaway git
>   worktree. It compiled, validated, generated Python, ran in the simulator workflow, round-tripped XML, and passed
>   the golden-file suite (316/316 programs). The worktree was deleted afterwards.
> - The **Blockly/browser side (§2–§3)** is documented from the compiled Blockly bundle and existing TypeScript
>   precedents. It was **not** run in a browser.

Paths are repo-relative. `…/` abbreviates `src/main/java/de/fhg/iais/roberta/` inside a module.

---

## 0. The short version

A NEPO block is a **string name** (its *block type*, e.g. `mbedActions_display_text`) that must be known, identically,
in eight places. Nothing checks consistency at build time. Mismatches show up at runtime or in the golden tests.

| # | Layer | Where | What it defines |
|---|---|---|---|
| 1 | **Blockly definition** (browser) | compiled into `OpenRobertaServer/staticResources/blockly/blockly_compressed.js`, or registered at runtime from `OpenRobertaWeb/src` (§2.6) | shape, fields, inputs, input types, colour, tooltip |
| 2 | **Messages** | `OpenRobertaServer/staticResources/blockly/msg/js/<lang>.js` (`Blockly.Msg.*`) | labels, tooltips, dropdown texts |
| 3 | **Toolbox** | `RobotMbed/src/main/resources/microbitV2/program.toolbox.{beginner,expert}.xml` | whether learners see the block, and with which default sub-blocks |
| 4 | **Blockly XML** | produced by Blockly, stored in the DB, sent to the server | `<block type=…>` with `<field>`, `<value>`, `<statement>`, `<mutation>`, `<hide>`, `<data>` |
| 5 | **Java AST class** | `RobotMbed/…/syntax/**` | XML ↔ Java mapping (annotations) |
| 6 | **Visitors** | `RobotMbed/…/visitor/**` | validation + hardware collection, type check, **Python**, simulator ops, textly |
| 7 | **Simulator** (optional) | `OpenRobertaWeb/src/app/nepostackmachine/**`, `…/simulation/simulationLogic/robot.microbitv2.ts` | behaviour in the browser simulator |
| 8 | **Tests** | `OpenRobertaServer/src/test/resources/crossCompilerTests/**` | golden program + expected AST, Python, collector output |

Verified minimal change set for a new micro:bit V2 statement block (§7 has all the code):

- **New (5 files):**
  - the AST class
  - one golden test program
  - three expected-output files (`.ast`, `.py`, collector `.txt`)
- **Edited (7 files):**
  - `IMicrobitV2Visitor`
  - `MbedV2ValidatorAndCollectorVisitor`
  - `MicrobitV2TypecheckVisitor`
  - `MbedV2PythonVisitor`
  - `MbedV2StackMachineVisitor`
  - `MbedV2RegenerateTextlyJavaVisitor`
  - the expert toolbox XML
- **Plus,** for the block to be usable in the editor, a Blockly definition and its messages (layers 1–2).

---

## 1. Anatomy of a block, using one real example

The micro:bit V2 block **"speaker on/off"** (`actions_sound_toggle`), traced through all layers.

**Layer 1: Blockly definition** (de-minified from `blockly_compressed.js`):

```js
Blockly.Blocks.actions_sound_toggle = {
    init: function () {
        var ports = getConfigPorts("buzzer");          // dropdown of configuration components of type "buzzer"
        this.hide = {};                                // bind invisibly to that component (see §2.4)
        this.hide.name = "ACTORPORT";
        this.hide.port = true;
        this.hide.value = ports.getValue();            // e.g. "_B"
        this.jsonInit({
            message0: Blockly.Msg.SPEAKER + " %1",
            args0: [{ type: "field_dropdown", name: "MODE",
                      options: [[Blockly.Msg.ON, "ON"], [Blockly.Msg.OFF, "OFF"]] }],
            colour: Blockly.CAT_ACTION_RGB,
            previousStatement: true, nextStatement: true,  // a statement block
            tooltip: Blockly.Msg.SOUND_TOGGLE_TOOLTIP
        });
        /* … */
    }
};
```

**Layer 2: messages.** `Blockly.Msg.SPEAKER = "Speaker"` and `Blockly.Msg.SOUND_TOGGLE_TOOLTIP = "Turn the speaker on
or off."` are in `blockly/msg/js/en.js`, and the same keys are in every other `<lang>.js`.

**Layer 3: toolbox.** `microbitV2/program.toolbox.expert.xml`, category `TOOLBOX_SOUND`: `<block type="actions_sound_toggle"></block>`.

**Layer 4: XML** (from the golden program `robotSpecific/microbitv2/v2_sounds.xml`):

```xml
<block type="actions_sound_toggle" id="ghTrN}t^2{GXae:vDT0r" intask="true">
    <field name="MODE">OFF</field>
    <hide name="ACTORPORT" value="_B"></hide>
</block>
```

**Layer 5: Java AST class** (`RobotMbed/…/syntax/action/mbed/microbitV2/SoundToggleAction.java`):

```java
@NepoPhrase(name = "SOUND_TOGGLE_ACTION", category = "ACTOR", blocklyNames = {"actions_sound_toggle"})
public final class SoundToggleAction extends Action {
    @NepoField(name = "MODE") public final String mode;   // ← <field name="MODE">
    @NepoHide public final Hide hide;                      // ← <hide name="ACTORPORT" value="_B"/>

    public SoundToggleAction(BlocklyProperties properties, String mode, Hide hide) {
        super(properties); this.mode = mode; this.hide = hide; setReadOnly();
    }
}
```

**Layer 6: visitors.** `visitSoundToggleAction` is declared in `IMbedV2Visitor` and implemented in:

| Visitor | Implementation |
|---|---|
| `MbedV2ValidatorAndCollectorVisitor` | Errors with `CONFIGURATION_ERROR_ACTOR_MISSING` unless the hidden port exists; adds `UsedActor BUZZER`. |
| `MicrobitV2ValidatorAndCollectorVisitor` | Adds a `SIM_BLOCK_NOT_SUPPORTED` warning in the simulator workflow. |
| `MicrobitV2TypecheckVisitor` | `Sig.of(BlocklyType.VOID)…` |
| `MbedV2PythonVisitor` | → `microbit.speaker.off()` / `microbit.speaker.on()` |
| `MbedV2StackMachineVisitor` | no-op |
| `MbedV2RegenerateTextlyJavaVisitor` | → `microbitv2.speaker(off);` |

**Layer 7: simulator.** Nothing; the block is flagged as unsupported in the sim.

**Layer 8: tests.** The block is used in `v2_sounds.xml`, with expected
`_expected/robotSpecific/targetLanguage/microbitv2/v2_sounds.py` and the matching `.ast` and collector files.

---

## 2. Layer 1–2: how blocks are defined in the browser (Blockly)

### 2.1 Where the definitions come from

- **The block definitions and messages don't have editable source in this repository.** All definitions live in
  `OpenRobertaServer/staticResources/blockly/blockly_compressed.js`. That file is minified, about 3,300 lines, and its
  first line is `// Do not edit this file; automatically generated by build.py.` It's built in the separate
  **OpenRoberta/blockly** repository (a fork of Google Blockly), which isn't checked out here, and the build output is
  copied into `staticResources/blockly/`.
- Messages are in `staticResources/blockly/msg/js/<lang>.js`. There are also `msg/messages.js` and `msg/json/`.
- **Two ways to add a block:**
  1. **Standard:** add the definition and messages in the Blockly repo, rebuild, and copy the build output here.
  2. **Inside this repo:** register it at runtime from `OpenRobertaWeb/src` (§2.6).
- To read an existing definition, search the bundle, e.g. `grep -o "Blockly.Blocks.mbedActions_display_text=.\{0,800\}"`.

### 2.2 How the editor loads blocks

1. `OpenRobertaWeb/src/main.js` (RequireJS) maps `blockly` → `blockly/blockly_compressed` and loads it as a plain
   script. Its top-level `var`s (`Blockly`, `sensors`, `sensorsAll`, `confBlocks`, …) are **globals**.
2. At load, the bundle runs `initSensors()` and `initConfBlocks()`, which *generate* many blocks from data tables (§2.3).
3. `programController.init()` (`OpenRobertaWeb/src/app/roberta/controller/program.controller.js`) calls
   `Blockly.inject('blocklyDiv', {toolbox: GUISTATE_C.getProgramToolbox(), …})`.
   - The toolbox XML comes from the server: `RobotFactory` reads the toolbox file of the plugin, and `POST
     /rest/admin/setRobot` returns it.
   - Then `blocklyWorkspace.setDevice({group: GUISTATE_C.getRobotGroup(), robot: GUISTATE_C.getRobot()})` sets
     `workspace.device`. For micro:bit V2 that's **`"microbitv2"`** (the plugin has no `robot.plugin.group`, so the
     group is the robot name).
4. Instantiating a block whose type has no `Blockly.Blocks[type]` entry fails the assertion
   **`Error: "<type>" is an unknown language block.`** This applies to toolbox entries and to saved programs alike, so
   a definition must exist before the toolbox or program containing it is rendered.

### 2.3 Three definition styles

**(a) Hand-written blocks.** `Blockly.Blocks.<type> = { init: function () { … } }`, used by most action blocks.
There are two sub-styles:

- declarative `this.jsonInit({...})`, as in `actions_sound_toggle` above;
- imperative, e.g. `mbedActions_display_getPixel` (de-minified):

```js
Blockly.Blocks.mbedActions_display_getPixel = {
    init: function () {
        this.setColour(Blockly.CAT_ACTION_RGB);
        this.appendValueInput("X").setCheck("Number")                       // <value name="X">, must be a Number
            .appendField(Blockly.Msg.GET + " " + Blockly.Msg.DISPLAY_PIXEL_TITLE)
            .appendField(Blockly.Msg.DISPLAY_PIXEL_BRIGHTNESS).setAlign(Blockly.ALIGN_RIGHT)
            .appendField(Blockly.Msg.X);
        this.appendValueInput("Y").setCheck("Number").setAlign(Blockly.ALIGN_RIGHT).appendField(Blockly.Msg.Y);
        this.setTooltip(Blockly.Msg.DISPLAY_GET_PIXEL_TOOLTIP);
        this.setOutput(true, "Number");                                    // an expression block returning Number
    }
};
```

**(b) Data-driven sensor blocks** (`robSensors_<name>_getSample`). These aren't hand-written:

```js
// bundle, verbatim logic:
function initSensors() {
    for (var a in sensors)
        Blockly.Blocks["robSensors_" + a + "_getSample"] = { sensor: a,
            init: function () { Blockly.Blocks.robSensors_generic.init.call(this, sensors[this.sensor][this.workspace.device]); } };
}
initSensors();
```

Each sensor is a **data entry per robot group**. The micro:bit V2 entries are real values from the bundle:

```js
sensors.logotouch.microbitv2 = { title: "LOGOTOUCH", modes: [{ name: "PRESSED", type: "Boolean", question: true }],
                                 ports: "CONFIGURATION", portsHidden: true };
sensors.accelerometer.microbitv2 = sensors.accelerometer.calliope;   // = { title: "ACCELEROMETER",
    //   modes: [{ name: "VALUE", type: "Number", unit: "MILLIG", op: "NUM_REV", value: 0 }],
    //   slots: [["x","X"],["y","Y"],["z","Z"],["STRENGTH","STRENGTH"]], ports: "CONFIGURATION", portsHidden: true }
sensors.pintouch.microbitv2 = sensors.pintouch.microbit;            // = { title: "PINTOUCH",
    //   ports: [[" 0","0"],[" 1","1"],[" 2","2"]], modes: [{ name: "PRESSED", type: "Boolean", question: true }], standardPort: "1" }
sensorsAll.microbitv2 = [ sensors.key.microbitv2, sensors.pintouch.microbitv2, sensors.logotouch.microbitv2, … ];
                                                                     // → the options of the generic robSensors_getSample block
```

What `robSensors_generic` does with such an entry:

| Entry key | Effect in the block | XML produced |
|---|---|---|
| `title` | label from `Blockly.Msg["SENSOR_<title>_<GROUP>"]`, else `Blockly.Msg["SENSOR_<title>"]` | – |
| `modes[]` (`name`, `type`, `unit`, `question`) | several modes give a `MODE` dropdown (labels `Blockly.Msg["MODE_<name>"]`), one mode a hidden field. `type` is the output type (`setOutput(true, type)`), `unit` shows `Blockly.Msg["SENSOR_UNIT_<unit>"]`, and `question: true` gives the "is pressed?" wording (`Blockly.Msg["SENSOR_IS_<name>"]`). | `<mutation mode="<MODE>"/>`, `<field name="MODE">` |
| `ports: "CONFIGURATION"` | the `SENSORPORT` dropdown lists the configuration components of type `title.toLowerCase()` (`getConfigPorts`) | `<field name="SENSORPORT">_T</field>` |
| `ports: [[label, value], …]` | a fixed port dropdown | `<field name="SENSORPORT">1</field>` |
| `portsHidden: true` | if there's only one component, the port dropdown is hidden and a `hide` is used instead | `<hide name="SENSORPORT" value="_T"/>` |
| `slots` | `SLOT` dropdown (e.g. accelerometer axis) | `<field name="SLOT">X</field>` (empty if there are no slots) |
| `standardPort` | default port value | – |
| tooltip | `SENSOR_<title>_<MODE>_GETSAMPLE_TOOLTIP[_<GROUP>]`, else `SENSOR_<title>_GETSAMPLE_TOOLTIP` | – |

The resulting XML is exactly what the Java `ExternalSensor` classes expect (§4.4): fields `MODE`, `SENSORPORT`, and
`SLOT`, plus a mutation and a hide.

**(c) Data-driven configuration blocks** (`robConf_<name>`), generated by `initConfBlocks()` from
`confBlocks.<name>.<group>` through `robConf_generic`:

```js
confBlocks.logotouch.microbitv2 = { title: "LOGOTOUCH", sensor: true, inbuilt: true };
confBlocks.buzzer.microbitv2 = confBlocks.buzzer.calliope;   // others: light, accelerometer, compass, temperature, key,
                                                             // sound, digitalout, analogout, digitalin, analogin
```

- `sensor` picks the colour and message prefix (`SENSOR_` or `ACTION_`).
- `inbuilt` gives a hidden name with a leading underscore (e.g. `_LO`).
- The block's first field is `NAME` (the user-defined port name the program blocks refer to), plus pin fields such as
  `PIN1` where applicable.

### 2.4 Binding program blocks to the configuration

- `getConfigPorts(type)` scans the configuration workspace (`bricklyDiv`) for blocks whose `getConfigDecl()` has that
  type. It returns a dropdown of their names, or "no port" if there are none.
- For single, built-in components, blocks store the choice invisibly: `this.hide = {name: "ACTORPORT" | "SENSORPORT",
  value: …}` (hand-written), or `hidePortIfOnlyInbuilt(block)` (generated sensors). That becomes
  `<hide name="…" value="…"/>` in the XML, and Java reads it with `@NepoHide` or through the `ExternalSensor` machinery.

### 2.5 Types and messages

- **Input and output types:** `setCheck(...)` / `setOutput(true, …)` use the NEPO type names `"Number"`, `"Boolean"`,
  `"String"`, `"Image"`, `"Array_Number"`, `"Array_String"`, `"Array_Boolean"`, `"Array_Image"`. Keep them consistent
  with the Java type check (`BlocklyType`) and the `@NepoValue(type = …)` of the AST class.
- **Messages:** a missing `Blockly.Msg` key falls back to `Blockly.checkMsgKey(key)`. That logs `This message is not
  translated: <key>` and shows the raw key. Add keys for **every** language file, or at least `en.js` and `de.js`.
- **Colours:** use `Blockly.CAT_ACTION_RGB`, `Blockly.CAT_SENSOR_RGB`, etc., so the block matches its toolbox
  category.

### 2.6 Registering a custom block from this repo (no Blockly rebuild)

There's a working precedent. `OpenRobertaWeb/src/app/configVisualization/robotBlock.ts` exports a block definition,
and `confVisualization.ts:98` registers it with `window.Blockly.Blocks['robConf_robot'] = createRobotBlock(…)`. It's
wired into `OpenRobertaWeb/src/main.js` in four places:

1. a RequireJS `paths` entry: `robotBlock: 'js/app/configVisualization/robotBlock'`;
2. a `shim` entry: `robotBlock: { deps: ['blockly'] }`;
3. an entry in the `require([...])` list;
4. `robotBlock = require('robotBlock')`.

The TypeScript compiles with `tsc` (AMD modules, `outDir` `../OpenRobertaServer/staticResources/js`); see
`OpenRobertaWeb/README.md` (`npm install && npm run build && npx gulp`).

The same pattern works for a custom micro:bit V2 block. The sketch below is **not run**. Register before
`programController.init()` runs:

```ts
// OpenRobertaWeb/src/app/customBlocks/microbitv2.customBlocks.ts   (hypothetical file)
const B = (<any>window).Blockly;

B.Msg.DISPLAY_SCROLL_DELAY = B.Msg.DISPLAY_SCROLL_DELAY || 'scroll text';        // provide defaults for missing keys
B.Msg.DISPLAY_SCROLL_DELAY_TOOLTIP = B.Msg.DISPLAY_SCROLL_DELAY_TOOLTIP || 'Scrolls the text; delay = ms per column.';

B.Blocks['mbedActions_display_scroll_delay'] = {
    init: function () {
        this.setColour(B.CAT_ACTION_RGB);
        this.appendValueInput('OUT').setCheck(['Number', 'Boolean', 'String']).appendField(B.Msg.DISPLAY_SCROLL_DELAY);
        this.appendValueInput('DELAY').setCheck('Number').setAlign(B.ALIGN_RIGHT).appendField('delay (ms)');
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setTooltip(B.Msg.DISPLAY_SCROLL_DELAY_TOOLTIP);
    },
};

// A data-driven sensor instead needs a data entry, then a re-run of the generator:
// (<any>window).sensors.mysensor = { microbitv2: { title: 'MYSENSOR', modes: [{ name: 'VALUE', type: 'Number' }],
//                                                   ports: 'CONFIGURATION', portsHidden: true } };
// (<any>window).sensorsAll.microbitv2.push((<any>window).sensors.mysensor.microbitv2);
// (<any>window).initSensors();
```

Caveats for runtime registration:
- Messages are replaced when the learner switches language (`msg/js/<lang>.js` is reloaded). Defaults set with `||`
  won't be re-translated.
- The block is unknown to every other tool that uses the Blockly bundle, e.g. anything built from the Blockly repo.
- Keep all runtime-registered blocks in **one** module, so they're easy to move into the Blockly repo later.

---

## 3. Layer 3: toolbox

- Files: `RobotMbed/src/main/resources/microbitV2/program.toolbox.beginner.xml` and `program.toolbox.expert.xml`
  (level 1/2 tabs in the editor). The format:

  ```xml
  <toolbox_set id="toolboxExpert">
    <category name="TOOLBOX_ACTION" svg="true">
      <category name="TOOLBOX_DISPLAY" svg="true">
        <block type="…">…default sub-blocks…</block>
  ```

  - Category names are message keys.
  - `#ifdef nn … #end` sections are kept only when the neural-network extension is on (`Util.applyTemplate`).
  - `custom="VARIABLE"` / `custom="PROCEDURE"` are Blockly's dynamic flyouts.
- A toolbox entry can pre-attach **default inputs**, which is what learners get when they drag the block in:

  ```xml
  <block type="mbedActions_display_scroll_delay">
      <value name="OUT"><block type="text"><field name="TEXT">Hallo</field></block></value>
      <value name="DELAY"><block type="math_number"><field name="NUM">150</field></block></value>
  </block>
  ```

- The server serves the toolbox, so a toolbox change needs a server rebuild or restart, not a frontend build.
- **A toolbox block must appear in a test program.** `TestToolboxBlocksAreUsedInTestFiles` fails otherwise
  (verified; see §6).
- Blocks that are implemented but not in the toolbox can still be loaded from saved or imported programs. That's how
  `robActions_assert`/`robActions_debug` exist today; they're only reachable with hidden shortcuts.

---

## 4. Layer 4–5: the XML ↔ Java contract

### 4.1 Registration

`AstFactory.loadBlocks()` (`OpenRobertaRobot/…/util/ast/AstFactory.java`) scans every class under
`de.fhg.iais.roberta.syntax.` on the classpath (**all robot plugins**). Each class is registered through its class
annotation. `Jaxb2ProgramAst.block2ast` lowercases the XML `type` and looks it up. Rules enforced at startup or XML
parsing:

- `blocklyNames` are **globally unique across plugins** (case-insensitive). A duplicate gives the assertion
  `AST classes … mapped both blockly name …`.
- The class must be **`final`**. Otherwise you get `DbcException("class X is not final …")`.
- `category` must be a `de.fhg.iais.roberta.components.Category` constant: `EXPR, SENSOR, ACTOR, STMT, TASK, FUNCTION,
  METHOD, HELPER, CONFIGURATION_*`. Stacks whose top phrase has category `METHOD` are treated as function definitions.
- Sensor **modes** must be listed in `AstFactory.allLegalModesArray`, otherwise you get `Undefined mode …`.
- `@F2M` field names (for the generic get-sample block) form one global map. A duplicate silently overwrites.

### 4.2 Field annotations (`AnnotationHelper.block2astByAnnotation` / `ast2xml`)

| XML | Java | Allowed Java type | If missing in the XML |
|---|---|---|---|
| `<field name="MODE">ON</field>` | `@NepoField(name = "MODE", value = "<default>")` | `String`, `boolean`/`Boolean`, `double`/`Double`, any `enum` | the `value` default (`""`) |
| `<value name="OUT"><block …/></value>` | `@NepoValue(name = "OUT", type = BlocklyType.STRING)` | `Expr` (or `Var`) | `EmptyExpr` of that type, which the validator turns into `ERROR_MISSING_PARAMETER` (verified) |
| `<mutation …/>` | `@NepoMutation` | `Mutation` | `null` |
| `<hide name="…" value="…"/>` | `@NepoHide` | `Hide` | `null` (at most one) |
| `<data>…</data>` | `@NepoData` | `String` | **exception** |
| `<statement name="DO">…</statement>` | not supported → use `@NepoBasic` (§4.4) | `StmtList` | |

**Constructor contract.** The constructor is `public X(BlocklyProperties properties, <annotated fields in declaration
order>)`, and it ends with `setReadOnly()`.
- The Javadoc of `@NepoPhrase`/`@NepoExpr` still describes an older signature with `BlockDescriptor`/`BlocklyComment`.
  Ignore it.
- Direct `ExternalSensor` subclasses use `(BlocklyProperties, ExternalSensorBean)` instead.

A wrong constructor fails at XML → AST time with `Constructor in annotated AST class X not found or invalid`.
`NepoAnnotationValidTest` is meant to catch this, but see §8 #2.

### 4.3 Choosing the class kind

| Block shape (Blockly) | Annotation | Base class | Examples |
|---|---|---|---|
| statement, hardware action (`previousStatement/nextStatement`) | `@NepoPhrase(category = "ACTOR")` | `Action` | `SoundToggleAction`, `DisplayTextAction` |
| statement configuring a sensor | `@NepoPhrase(category = "SENSOR")` | `Sensor` | `PinSetTouchMode`, `LogoSetTouchMode` |
| expression reading hardware (`setOutput`) | `@NepoExpr(category = "ACTOR", blocklyType = …)` | `Action` | `DisplayGetPixelAction` |
| data-driven sensor `robSensors_<x>_getSample` | `@NepoExpr(category = "SENSOR", blocklyNames = {"robSensors_<x>_getSample"}, sampleValues = {@F2M(field = "<TITLE>_<MODE>", mode = "<MODE>")})` | `ExternalSensor` | `LogoTouchSensor`, `RadioRssiSensor` |
| pure function / operator | `@NepoExpr(category = "FUNCTION", blocklyType = …, precedence = …)` | `Function` | `ImageInvertFunction` |
| statement inputs, repetitions, unusual XML | `@NepoBasic` + `static Phrase xml2ast(Block, Jaxb2ProgramAst)` + `List<Block> ast2xml()` | any | `Image`, `IfStmt`, `RepeatStmt`, `WaitStmt`, `GetSampleSensor` |

- **Wrapping is automatic.** An `Action`/`Sensor` in statement position is wrapped in `ActionStmt`/`SensorStmt`; in a
  value socket it's wrapped in `ActionExpr`/`SensorExpr`. You only implement `visitXxx` for your class.
- **Precedence.** Expressions default to `precedence = 999`, which means "atomic, never parenthesised". If your Python
  contains operators, set a real precedence, or wrap the output in parentheses yourself. See
  `microbitv2-nepo-to-python.md` §13 #1 for the bug this default causes today.
- **`@NepoBasic` helpers:** `Jaxb2Ast.extractFields/extractField/extractValues/extractBlocklyProperties`,
  `helper.extractValue(values, new ExprParam(name, type))`, and `helper.extractStatement(block.getStatement(), "DO")`.
  Going back: `Ast2Jaxb.setBasicProperties/addField/addValue/addStatement/addMutation`.

### 4.4 Sensor blocks on the Java side

- An `ExternalSensor` subclass gets `SENSORPORT`, `MODE`, `SLOT`, mutation, and hide automatically
  (`ExternalSensor.extractPortModeSlotMutationHide`).
- `@F2M(field = "LOGOTOUCH_PRESSED", mode = "PRESSED")` connects the generic `robSensors_getSample` block's
  `SENSORTYPE` value to the class and mode. The field is `<title>_<mode>`, matching the Blockly data entry.
- Validators usually call `checkSensorExists(sensor, "<CONFIG TYPE>")`, which yields
  `CONFIGURATION_ERROR_SENSOR_MISSING`. They add `UsedSensor(port, type, mode)`.

### 4.5 Configuration blocks on the Java side

- A new component type needs an empty marker class. Example: `RobotMbed/…/syntax/configuration/sensor/Logo.java`,
  which has `@NepoConfiguration(name = "LOGOTOUCH", category = "CONFIGURATION_SENSOR", blocklyNames =
  {"robConf_logotouch"})` and a private constructor that throws.
- Add the block to `microbitV2/configuration.toolbox.xml` or `configuration.default.xml`.
- Pin validation parameters are in `MicrobitV2ValidatorAndCollectorWorker`: `FREE_PINS`, `DEFAULT_PROPERTIES` (types
  that skip pin checks), `MAP_CORRECT_CONFIG_PINS`.

---

## 5. Layer 6: which visitors must learn the block (verified)

**Pick the interface deliberately.** The experiment compiled both variants:

| Declare `visitX` in | Classes that stop compiling until implemented |
|---|---|
| `IMbedV2Visitor` | **13**, including Calliope's C++ generator (`CalliopeCppVisitor`), because `ICalliopeVisitor extends IMbedV2Visitor` |
| **`IMicrobitV2Visitor`** (recommended for micro:bit-only blocks) | **10**. They're all satisfied by **5 implementations**, because most are subclasses of the three abstract V2 bases. |

The five implementations (verified code in §7):

| # | Class | Responsibility |
|---|---|---|
| 1 | `RobotMbed/…/visitor/validate/MbedV2ValidatorAndCollectorVisitor` | `requiredComponentVisited(block, child1, child2, …)` for **every** `Expr` child: it validates and collects nested blocks and reports empty sockets as `ERROR_MISSING_PARAMETER`. Also configuration checks (`addErrorToPhrase(…, "CONFIGURATION_ERROR_ACTOR_MISSING")`), `usedHardwareBuilder.addUsedActor/addUsedSensor(…)` (drives imports and tells a test harness what to mock), `usedMethodBuilder.addUsedMethod(…)` (helper functions), and `addToPhraseIfUnsupportedInSim(…)` (override in `MicrobitV2ValidatorAndCollectorVisitor`, which knows `isSim`). |
| 2 | `RobotMbed/…/visitor/validate/MicrobitV2TypecheckVisitor` | `return Sig.of(<returnType>, <argTypes…>).typeCheckPhrases(block, this, <args…>);` |
| 3 | `RobotMbed/…/visitor/codegen/MbedV2PythonVisitor` | The Python. Use `this.src.add(this.firmware + "…")` and `child.accept(this)`. Don't emit a leading newline; the caller does `nlIndent()`. New imports go in `MbedPythonVisitor.visitorGenerateImports` guarded by `UsedHardwareBean`, new globals in `visitorGenerateGlobalVariables`. |
| 4 | `RobotMbed/…/visitor/codegen/MbedV2StackMachineVisitor` | Simulator ops: `makeNode(C.<OP>)…; return add(o);`, reuse an existing op, or `return null`. A new op also needs `C.java` + `interpreter.constants.ts` + a case in `interpreter.interpreter.ts` + behaviour in `interpreter.robotSimBehaviour.ts` / `robot.microbitv2.ts`. |
| 5 | `RobotMbed/…/visitor/codegen/MbedV2RegenerateTextlyJavaVisitor` | Textly text form (a view only). Parsing textly back into the block additionally needs `TextlyJava.g4` + `Microbitv2TextlyJavaVisitor`. |

Classes 1, 3, and 4 are shared with joycar and calliopev3, which inherit the new method. In the experiment their golden
tests still passed.

**Optional: a helper function.** Add an enum constant to `RobotMbed/…/visitor/MicrobitMethods.java` and a
`PYTHON: |` entry to `RobotMbed/src/main/resources/mbed.methods.yml`. Register it in the collector with
`usedMethodBuilder.addUsedMethod(MicrobitMethods.X)`. Emit the call with
`getBean(CodeGeneratorSetupBean.class).getHelperMethodGenerator().getHelperMethodName(MicrobitMethods.X)`.

---

## 6. Layer 8: tests (verified sequence)

| Step | Command / action | Observed result |
|---|---|---|
| 1 | Add the block to the toolbox, but no test program yet. Run `mvn -o -pl OpenRobertaServer -am test -Dtest=TestToolboxBlocksAreUsedInTestFiles -DfailIfNoTests=false` | **fails:** `block mbedActions_display_scroll_delay not found in common or specific tests for robot microbitv2` |
| 2 | Add the golden program `OpenRobertaServer/src/test/resources/crossCompilerTests/robotSpecific/microbitv2/display_scroll_delay.xml` (export XML: program + the default config). Run `…-Dtest='TestToolboxBlocksAreUsedInTestFiles,ReuseIntegrationAsUnitTest#testAllRobotSpecificProgramsAsUnitTests'` | Toolbox test **passes**. The golden test **fails** as expected: `expected …/astGenerated/microbitv2/display_scroll_delay.ast could not be read`, the same for `.py`, and a collector mismatch. Actual outputs are written to `OpenRobertaServer/target/unitTests/_expected/robotSpecific/{astGenerated,targetLanguage,collectorResults}/microbitv2/`. The collector expectation is **auto-created in `src/test/resources`** with a first line `<-- This file was automatically generated, if the content is alright, remove this line -->`. |
| 3 | Review the files, then copy `.ast` and `.py` from `target/unitTests/_expected/…` to `src/test/resources/crossCompilerTests/_expected/…`, and delete the header line of the collector `.txt`. Re-run. | **passes:** `succeeding regeneration/code generation/collector tests: 316` (the existing 315 + the new one, all robots) |
| 4 | `python -m py_compile <generated .py>` | OK. The golden comparison ignores indentation, so this is the only syntax check in the loop. |

The golden test automatically covers AST construction, the XML round trip (catches field names that don't survive
`ast2xml`), Python, and the collector output. It doesn't run the Python.

---

## 7. The complete verified example

A micro:bit V2 statement block **"scroll text with delay"**: `mbedActions_display_scroll_delay`, with value inputs
`OUT` (text) and `DELAY` (ms). It generates `microbit.display.scroll(str(<OUT>), delay=int(<DELAY>))`, a real
MicroPython API. Everything below compiled and ran as shown.

**AST class** (new): `RobotMbed/src/main/java/de/fhg/iais/roberta/syntax/action/mbed/microbitV2/DisplayScrollDelayAction.java`

```java
package de.fhg.iais.roberta.syntax.action.mbed.microbitV2;

import de.fhg.iais.roberta.syntax.action.Action;
import de.fhg.iais.roberta.syntax.lang.expr.Expr;
import de.fhg.iais.roberta.transformer.forClass.NepoPhrase;
import de.fhg.iais.roberta.transformer.forField.NepoValue;
import de.fhg.iais.roberta.typecheck.BlocklyType;
import de.fhg.iais.roberta.util.ast.BlocklyProperties;

@NepoPhrase(name = "DISPLAY_SCROLL_DELAY_ACTION", category = "ACTOR", blocklyNames = {"mbedActions_display_scroll_delay"})
public final class DisplayScrollDelayAction extends Action {

    @NepoValue(name = "OUT", type = BlocklyType.STRING)
    public final Expr msg;

    @NepoValue(name = "DELAY", type = BlocklyType.NUMBER)
    public final Expr delay;

    public DisplayScrollDelayAction(BlocklyProperties properties, Expr msg, Expr delay) {
        super(properties);
        this.msg = msg;
        this.delay = delay;
        setReadOnly();
    }
}
```

**Interface** (`IMicrobitV2Visitor.java`):

```java
public interface IMicrobitV2Visitor<V> extends IMbedV2Visitor<V> {

    V visitDisplayScrollDelayAction(DisplayScrollDelayAction displayScrollDelayAction);
}
```

**Validator/collector** (`MbedV2ValidatorAndCollectorVisitor.java`):

```java
@Override
public Void visitDisplayScrollDelayAction(DisplayScrollDelayAction displayScrollDelayAction) {
    requiredComponentVisited(displayScrollDelayAction, displayScrollDelayAction.msg, displayScrollDelayAction.delay);
    usedHardwareBuilder.addUsedActor(new UsedActor("", SC.DISPLAY));
    return null;
}
```

**Type check** (`MicrobitV2TypecheckVisitor.java`):

```java
@Override
public BlocklyType visitDisplayScrollDelayAction(DisplayScrollDelayAction displayScrollDelayAction) {
    return Sig.of(BlocklyType.VOID, BlocklyType.PRIM, BlocklyType.NUMBER)
        .typeCheckPhrases(displayScrollDelayAction, this, displayScrollDelayAction.msg, displayScrollDelayAction.delay);
}
```

**Python** (`MbedV2PythonVisitor.java`):

```java
@Override
public Void visitDisplayScrollDelayAction(DisplayScrollDelayAction displayScrollDelayAction) {
    this.src.add(this.firmware + ".display.scroll(str(");
    displayScrollDelayAction.msg.accept(this);
    this.src.add("), delay=int(");
    displayScrollDelayAction.delay.accept(this);
    this.src.add("))");
    return null;
}
```

**Simulator** (`MbedV2StackMachineVisitor.java`). This reuses the existing op, and the delay is ignored in the sim:

```java
@Override
public Void visitDisplayScrollDelayAction(DisplayScrollDelayAction displayScrollDelayAction) {
    displayScrollDelayAction.msg.accept(this);
    JSONObject o = makeNode(C.SHOW_TEXT_ACTION).put(C.MODE, "text");
    return add(o);
}
```

**Textly** (`MbedV2RegenerateTextlyJavaVisitor.java`). This is a view only, and it's lossy here, because the delay isn't
shown:

```java
@Override
public Void visitDisplayScrollDelayAction(DisplayScrollDelayAction displayScrollDelayAction) {
    this.src.nlI().add("microbitv2.showText(");
    displayScrollDelayAction.msg.accept(this);
    this.src.add(");");
    return null;
}
```

**Toolbox**: the `<block type="mbedActions_display_scroll_delay">…` entry from §3, inserted into `TOOLBOX_DISPLAY` of
`program.toolbox.expert.xml`.

**Golden program** (`robotSpecific/microbitv2/display_scroll_delay.xml`). This is the program part; the `<config>` part
is the micro:bit V2 default configuration, copied from `display.xml`:

```xml
<block type="mbedActions_display_scroll_delay" id="cbScroll01" intask="true">
    <value name="OUT"><block type="text" id="cbText01" intask="true"><field name="TEXT">Hi</field></block></value>
    <value name="DELAY"><block type="math_number" id="cbNum01" intask="true"><field name="NUM">80</field></block></value>
</block>
<block type="mbedActions_display_scroll_delay" id="cbScroll02" intask="true">
    <value name="OUT">
        <block type="robSensors_temperature_getSample" id="cbTemp01" intask="true">
            <mutation mode="VALUE"></mutation>
            <field name="MODE">VALUE</field><field name="SENSORPORT">_T</field><field name="SLOT"></field>
            <hide name="SENSORPORT" value="_T"></hide>
        </block>
    </value>
    <value name="DELAY"><block type="math_number" id="cbNum02" intask="true"><field name="NUM">150</field></block></value>
</block>
```

**Observed results:**

```python
# showsource → COMPILERWORKFLOW_PROGRAM_GENERATION_SUCCESS
def run():
    global timer1
    microbit.display.scroll(str("Hi"), delay=int(80))
    microbit.display.scroll(str(microbit.temperature()), delay=int(150))
```

```text
AST dump:   DisplayScrollDelayAction[msg: StringConst[value: Hi], delay: NumConst[value: 80]]
            DisplayScrollDelayAction[msg: SensorExpr [TemperatureSensor [_T, VALUE, - EMPTY_SLOT -]], delay: NumConst[value: 150]]
Collector:  Sensors: [UsedSensor [_T, TEMPERATURE, VALUE]]  Actors: [UsedActor [, DISPLAY]]  Methods: []
Sim ops:    … {"opc":"expr","expr":"STRING_CONST","value":"Hi"}, {"opc":"ShowTextAction","mode":"text"}, … {"opc":"GetSample","GetSample":"temperature","mode":"value"} …
Textly:     microbitv2.showText("Hi");  microbitv2.showText(microbitv2.temperatureSensor());
Without the second DELAY input → PROGRAM_INVALID_STATEMETNS, 1 error (ERROR_MISSING_PARAMETER); no Python generated.
```

**A refinement for production code.** `str("Hi")` is redundant. `MbedPythonVisitor.visitDisplayTextAction` shows the
idiom for emitting string literals raw:

```java
if ( !msg.getKind().hasName("STRING_CONST") ) { src.add("str("); msg.accept(this); src.add(")"); } else { msg.accept(this); }
```

---

## 8. Gotchas

1. **String names are the only glue.** The Blockly type, the `blocklyNames` entry, the toolbox `type`, and the
   field and value names must match exactly across JS, XML, and Java. The first sign of a mismatch is usually one of
   these runtime errors: `blockly name is not found`, `Error: "<type>" is an unknown language block.`, or a missing
   input turning into `ERROR_MISSING_PARAMETER`.
2. **`NepoAnnotationValidTest` doesn't reliably check anything (verified).** Run alone, it executes **0 tests**. Its
   parameter list comes from `AstFactory.getAstClasses()`, and the test never calls `AstFactory.loadBlocks()`. The
   real guard is XML → AST parsing in the golden tests, so always add a golden program.
3. **The blast radius of the interface choice:** `IMbedV2Visitor` also forces Calliope implementations (§5).
4. **`requiredComponentVisited` is mandatory** for child expressions. Without it, nested sensors aren't collected (no
   `UsedSensor`, missing imports), and empty sockets aren't reported.
5. **Every workflow runs every visitor over all phrases.** The validator, type check, and textly regeneration run in
   `showsource`/`run`, and the sim visitors in `getsimulationcode`. A missing implementation on a visitor that doesn't
   declare the method surfaces at runtime as `DbcException("visit Method not found for phrase …")`.
6. **Python is emitted inline and not validated.** The golden comparison ignores whitespace, so check syntax with
   `python -m py_compile` or run the code against a stub `microbit` module.
7. **Anything the Python visitor emits is also flashed to the device** (`run` workflow). Test-only scaffolding belongs
   in a dedicated workflow or visitor, not in `MbedV2PythonVisitor`.
8. **Top-level stacks not attached to the start block (`intask="false"`) aren't generated.** A "test case" block
   meant to live as its own stack needs a dedicated generator path. A block with a statement body needs `@NepoBasic`.
9. **Other boards may change behaviour.** Implementations in the shared `MbedV2*` bases are inherited by joycar and
   calliopev3. That's accepted in this repo (see `CLAUDE.md`), but re-run the golden suite to see what changed.
10. **Sim ops are mirrored by hand.** A new stack-machine op needs matching constants in `OpenRobertaRobot/…/util/basic/C.java`
    and `OpenRobertaWeb/src/app/nepostackmachine/interpreter.constants.ts`.
