# CLAUDE.md — AI agent guide for this repository

This is a fork of the **OpenRoberta Lab** (Fraunhofer IAIS): a web IDE where learners program robots with the
graphical language **NEPO** (built on Blockly). The Java server turns NEPO programs into robot code.

## Scope: micro:bit V2 only

**Every coding task in this repository is about the BBC micro:bit V2 (robot plugin `microbitv2`) and nothing else.**

- Ignore all other boards and robots (EV3, Calliope, Arduino, Spike, NXT, WeDo, joycar, calliopev3, micro:bit V1, …).
  Don't read, extend, or fix their code unless it's on the micro:bit V2 code path.
- The only language that matters is **NEPO → MicroPython** (the Python generated for the micro:bit V2).
  The browser simulator (stack machine) is a separate path. Touch it only when a task asks for it.
- **Shared code may be changed freely** when micro:bit V2 needs it (`MbedPythonVisitor`, `MbedV2PythonVisitor`,
  `AbstractPythonVisitor`, common workers/beans, `common.methods.yml`, …). Output or tests of other boards may change
  or break as a result. That's accepted: don't spend effort keeping other boards green. Do report it when you knowingly
  break them.
- Name to use in code and config: the robot/plugin name is `microbitv2` (file `RobotMbed/src/main/resources/microbitv2.properties`).
  The Python it generates imports the MicroPython module `microbit`.

## Project goal (context for all work)

The ultimate goal is a **unit-testing framework for learners' NEPO programs on the micro:bit V2**, running inside the
Lab. It has three parts:

1. Learners (or teachers) can write and run unit tests for their NEPO programs.
2. The system automatically detects what in a program is worth testing (AI-assisted where useful).
3. The system generates those test cases.

The generated MicroPython is the artefact under test. It's executed against a mocked micro:bit runtime.
Keep this goal in mind when you make design choices.

## Read this before touching code generation

**`docs/ai/microbitv2-nepo-to-python.md`** is the detailed reference. It covers the whole pipeline (Blockly XML → AST →
validation/collection → type check → Python), the anatomy of the generated program, the runtime API surface that must be
mocked, a block-by-block inventory, the existing test infrastructure, Lab integration points, known quirks and test
candidates. Read the relevant sections before you change the generator or build test tooling.

**`docs/ai/nepo-custom-blocks.md`** is the guide to **NEPO blocks**: how they're defined (the Blockly side: hand-written
and data-driven sensor/configuration blocks, messages, toolbox) and how to create a custom one (XML ↔ Java annotations,
which visitors to implement, which tests). It includes a complete example block that was built and verified end to end.
Read it before adding or changing any block.

## Where the micro:bit V2 code lives (short map)

| What | Where |
|---|---|
| Plugin definition (workers, workflows, toolbox files) | `RobotMbed/src/main/resources/microbitv2.properties` (+ `#include microbitCommon.properties`) |
| Toolboxes, default program/config | `RobotMbed/src/main/resources/microbitV2/*.xml` |
| **Python generator** (visitor chain) | `RobotMbed/.../visitor/codegen/MicrobitV2PythonVisitor` → `MbedV2PythonVisitor` → `MbedPythonVisitor` → `OpenRobertaRobot/.../visitor/lang/codegen/prog/AbstractPythonVisitor` → `AbstractLanguageVisitor` |
| Validation + hardware/method collection | `RobotMbed/.../visitor/validate/MicrobitV2ValidatorAndCollectorVisitor` (→ `MbedV2…` → `Mbed…` → `CommonNepoValidatorAndCollectorVisitor`) |
| Type checking | `RobotMbed/.../visitor/validate/MicrobitV2TypecheckVisitor` |
| Python helper functions (e.g. `receive_message`) | `RobotMbed/src/main/resources/mbed.methods.yml` (includes `OpenRobertaRobot/src/main/resources/common.methods.yml`) |
| micro:bit-specific AST classes | `RobotMbed/src/main/java/de/fhg/iais/roberta/syntax/**` |
| Generic AST classes (control flow, math, lists, text, …) | `OpenRobertaRobot/src/main/java/de/fhg/iais/roberta/syntax/**` |
| Golden-file tests (input XML) | `OpenRobertaServer/src/test/resources/crossCompilerTests/robotSpecific/microbitv2/*.xml`, `…/common/**` |
| Golden-file tests (expected Python) | `OpenRobertaServer/src/test/resources/crossCompilerTests/_expected/{robotSpecific,common}/targetLanguage/microbitv2/*.py` |
| Test runner for golden files | `OpenRobertaServer/src/test/java/.../integrationTest/ReuseIntegrationAsUnitTest.java` (configured by `crossCompilerTests/testSpec.yml`) |
| Frontend (TypeScript sources) | `OpenRobertaWeb/src/**` (compiles into `OpenRobertaServer/staticResources`) |

`…` = `src/main/java/de/fhg/iais/roberta`. Paths are repo-relative.

## Build and test

Prerequisites: JDK 8–13 (the code is Java 8 source level; CI uses JDK 11; JDK 13 works locally) and Maven 3. Python 3 is only
needed to run generated code or the pylint integration test.

```bash
# full build incl. all unit tests of all modules (slow; other boards' tests may fail — see Scope)
mvn clean install

# build without tests (needed once so that OpenRobertaServer sees the current RobotMbed/OpenRobertaRobot jars)
mvn clean install -DskipTests

# run the golden-file tests (all robots, incl. microbitv2) for the robot-specific programs
mvn -pl OpenRobertaServer -am test -Dtest='ReuseIntegrationAsUnitTest#testAllRobotSpecificProgramsAsUnitTests' -DfailIfNoTests=false

# run the common programs (assign, loops, math, lists, …) for the target-language robots, incl. microbitv2
mvn -pl OpenRobertaServer -am test -Dtest='ReuseIntegrationAsUnitTest#testAllCommonProgramsAsUnitTests' -DfailIfNoTests=false

# type-checker tests (use micro:bit V2 as the main robot)
mvn -pl OpenRobertaServer -am test -Dtest=TestTypecheck -DfailIfNoTests=false

# faster loop once the jars are installed and only OpenRobertaServer tests/resources changed
mvn -o -pl OpenRobertaServer test -Dtest=ReuseIntegrationAsUnitTest -DfailIfNoTests=false
```

All of these were run successfully on 2026-09-23. The robot-specific run takes about 2 minutes with `-am`. To run
several test classes at once, separate them with commas (`-Dtest=A,B`); `+` only joins method names within one class.

The golden-file runner writes what it actually generated to `OpenRobertaServer/target/unitTests/` (AST dumps, generated
`.py`, regenerated XML, collector results). Diff against `_expected/` to debug. To accept a new output, copy it into `_expected/`.

Integration tests (`-PrunIT`, `@Category(IntegrationTest.class)`) need cross-compiler resources or `pylint` 3.x.
They aren't needed for micro:bit V2 generator work.

Run the server locally: `./admin.sh -git-mode create-empty-db` once, then `./ora.sh start-from-git` → http://localhost:1999.
On Windows use Git Bash. Compiling a real `.hex` needs the external `ora-cc-rsc` resources (not present in this checkout).
Generating and viewing Python ("show source") works without them.

## Rules and gotchas

- **Never edit generated files**: `OpenRobertaServer/staticResources/js/**` is built from `OpenRobertaWeb/src`. Blockly
  itself is built in a separate repo and copied in.
- AST classes must be `final` and annotated (`@NepoPhrase` / `@NepoExpr` / `@NepoBasic` …) with their `blocklyNames`.
  `AstFactory.loadBlocks()` must run before any XML → AST transformation. Tests call it in `@BeforeClass`.
- Workers are instantiated **once per RobotFactory** and reused across requests, so keep them stateless.
- A new visitor method for a new AST class must exist in *every* visitor on the micro:bit V2 workflows. Those are the
  validator/collector, type checker, Python generator, stack machine (sim), and textly regeneration. Otherwise the
  workflow throws.
- The golden-file comparison **ignores all whitespace inside lines, including Python indentation** (it keeps only line
  breaks). Indentation bugs aren't caught by `ReuseIntegrationAsUnitTest`. Assert on exact text or run the code if
  indentation matters.
- `ValidationFileAssert` auto-creates a missing expected file with a header line and then fails. Review it, delete the
  header line, and re-run.
- **Golden files record current behaviour, not correct behaviour.** Several confirmed generator bugs are baked into
  them, e.g. `not` precedence and `/` escaped as `\/` in strings (see §13 of the reference). Don't treat `_expected/`
  as a specification when you derive or generate tests.
- Nothing in the default build checks that generated Python is syntactically valid. The pylint IT only runs with
  `-PrunIT`. When you change the generator, at least `python -m py_compile` the output.
- Keep the code style of the surrounding code (formatter: `Resources/formatter/openRobertaIdea.xml`; spaces inside
  `if ( … )` parentheses).
- Git: default branch is `develop`. Don't commit or push unless asked.
