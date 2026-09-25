# CLAUDE.md — AI agent guide for this repository

This is a fork of the **OpenRoberta Lab** (Fraunhofer IAIS): a web IDE where learners program robots with the
graphical language **NEPO** (built on Blockly). The Java server turns NEPO programs into robot code.

## Scope: Edison V2 only

**Every coding task in this repository is about the Edison V2 educational robot (robot plugin `edisonv2`) and nothing
else.**

- Ignore all other boards and robots (micro:bit, Calliope, EV3, Arduino, Spike, NXT, WeDo, …). Don't read, extend, or
  fix their code unless it's on the Edison V2 code path.
- The only language that matters is **NEPO → EdPy**, the restricted, integer-only Python 2 dialect that the Edison
  runs. The browser simulator (stack machine) is a separate path. Touch it only when a task asks for it.
- **The Edison plugin is shared with `edisonv3`.** Both use `RobotEdison/src/main/resources/edison.properties`
  (group `edison`) and the same Java classes, and they generate identical EdPy. Any change for V2 changes V3 too.
  That's expected. Don't try to separate them unless a task asks for it.
- **Shared code may be changed freely** when Edison V2 needs it (`AbstractPythonVisitor`, common workers/beans, …).
  Output or tests of other robots may change or break as a result. That's accepted: don't spend effort keeping other
  robots green. Do report it when you knowingly break them.
- Names to use in code and config: the robot name is `edisonv2` (`RobotEdison/src/main/resources/edisonv2.properties`),
  and the robot group, used in XML `robottype` and Blockly, is `edison`. The generated EdPy does `import Ed`.

## Project goal (context for all work)

The ultimate goal is a **unit-testing framework for learners' NEPO programs on the Edison V2**, running inside the
Lab. It has three parts:

1. Learners (or teachers) can write and run unit tests for their NEPO programs.
2. The system automatically detects what in a program is worth testing (AI-assisted where useful).
3. The system generates those test cases.

The generated EdPy is the artefact under test. It's executed against a mocked `Ed` runtime.
Keep this goal in mind when you make design choices.

**Three facts shape any design** (all verified; details in the reference doc):
- A generated program runs its statements at **module top level**. There's no `main()` and no `if __name__` guard,
  so importing the file executes the program.
- EdPy is **integer-only Python 2**. Under CPython 3, `/` becomes float division, and ints never overflow, whereas
  EdPy integers are 16-bit. A CPython-based mock doesn't reproduce EdPy semantics as-is.
- **The real EdPy compiler isn't in this repo.** The browser posts the source to Edison's external web service
  (`https://api.edisonrobotics.net/`), which returns a WAV file. Nothing local can check that a program is valid EdPy.

## Read this before touching code generation

**`docs/ai/edisonv2-nepo-to-edpy.md`** is the detailed reference. It covers the whole pipeline (Blockly XML → AST →
validation/collection → EdPy → external compiler → WAV), the anatomy of the generated program, the `Ed` runtime API
surface a mock must provide, the fixed ports, a block-by-block inventory, EdPy restrictions, the existing test
infrastructure, Lab integration points, and known quirks and test candidates. Read the relevant sections before you
change the generator or build test tooling.

**`docs/ai/nepo-custom-blocks.md`** is the guide to **NEPO blocks** for the Edison: how they're defined (the Blockly
side: hand-written Edison blocks, generic blocks with Edison branches, data-driven sensor blocks, hard-coded ports,
messages, toolbox) and how to create a custom one (XML ↔ Java annotations, the three visitors to implement, tests). It
includes a complete example block that was built and verified end to end. Read it before adding or changing any block.

## Where the Edison V2 code lives (short map)

| What | Where |
|---|---|
| Plugin definition (workers, workflows, toolbox files) | `RobotEdison/src/main/resources/edisonv2.properties` (`#include edison.properties`, shared with `edisonv3`) |
| Toolboxes, default program, (fixed) configuration | `RobotEdison/src/main/resources/edison.program.toolbox.{beginner,expert}.xml`, `edison.program.default.xml`, `edison.configuration.*.xml` |
| **EdPy generator** | `RobotEdison/…/visitor/codegen/EdisonPythonVisitor` → `OpenRobertaRobot/…/visitor/lang/codegen/prog/AbstractPythonVisitor` → `AbstractLanguageVisitor` |
| Validation + hardware/method collection | `RobotEdison/…/visitor/validate/EdisonValidatorAndCollectorVisitor` (→ `CommonNepoValidatorAndCollectorVisitor`) |
| Visitor interface for Edison blocks | `RobotEdison/…/visitor/IEdisonVisitor` |
| EdPy helper functions (integer math, drive helpers, …) | `RobotEdison/src/main/resources/helperMethodsEdison.yml`, enum `RobotEdison/…/visitor/EdisonMethods` |
| Edison-specific AST classes | `RobotEdison/src/main/java/de/fhg/iais/roberta/syntax/**` |
| Generic AST classes (control flow, math, lists, motors, sensors, …) | `OpenRobertaRobot/src/main/java/de/fhg/iais/roberta/syntax/**` |
| Simulator ops | `RobotEdison/…/visitor/codegen/EdisonStackMachineVisitor`; browser model `OpenRobertaWeb/src/app/simulation/simulationLogic/robot.edison.ts` |
| Upload to the robot (external EdPy → WAV service) | `OpenRobertaWeb/src/app/roberta/controller/connections/connections.ts` (`Edisonv2Connection`) |
| Golden-file tests (input XML, shared by V2 and V3) | `OpenRobertaServer/src/test/resources/crossCompilerTests/robotSpecific/edison/*.xml` |
| Golden-file tests (expected EdPy) | `OpenRobertaServer/src/test/resources/crossCompilerTests/_expected/robotSpecific/targetLanguage/{edisonv2,edisonv3}/*.py` |
| Test runner for golden files | `OpenRobertaServer/src/test/java/.../integrationTest/ReuseIntegrationAsUnitTest.java` (configured by `crossCompilerTests/testSpec.yml`) |
| Frontend (TypeScript sources) | `OpenRobertaWeb/src/**` (compiles into `OpenRobertaServer/staticResources`) |

`…` = `src/main/java/de/fhg/iais/roberta`. Paths are repo-relative.

## Build and test

Prerequisites: JDK 8–13 (the code is Java 8 source level; CI uses JDK 11; JDK 13 works locally) and Maven 3. Python 3 is
only needed to run generated code against a stub or for the pylint integration test.

```bash
# full build incl. all unit tests of all modules (slow; other robots' tests may fail — see Scope)
mvn clean install

# build without tests (needed once so that OpenRobertaServer sees the current RobotEdison/OpenRobertaRobot jars)
mvn clean install -DskipTests

# golden-file tests for the robot-specific programs (all robots, incl. edisonv2 and edisonv3)
mvn -pl OpenRobertaServer -am test -Dtest='ReuseIntegrationAsUnitTest#testAllRobotSpecificProgramsAsUnitTests' -DfailIfNoTests=false

# every toolbox block must be used in some test program
mvn -pl OpenRobertaServer -am test -Dtest=TestToolboxBlocksAreUsedInTestFiles -DfailIfNoTests=false

# faster loop once the jars are installed and only OpenRobertaServer tests/resources changed
mvn -o -pl OpenRobertaServer test -Dtest=ReuseIntegrationAsUnitTest -DfailIfNoTests=false
```

The golden-file run was verified on 2026-09-25 (about 2 minutes with `-am`). To run several test classes at once,
separate them with commas (`-Dtest=A,B`); `+` only joins method names within one class.

Edison isn't covered by the "common programs" test (`testAllCommonProgramsAsUnitTests`), by `TestTypecheck`, or by any
test in `RobotEdison`. Its only unit-level coverage is the five programs in `robotSpecific/edison/`.

The golden-file runner writes what it actually generated to `OpenRobertaServer/target/unitTests/` (AST dumps, generated
`.py`, regenerated XML, collector results). Diff against `_expected/` to debug. To accept a new output, copy it into
`_expected/`, **for both `edisonv2` and `edisonv3`**.

Integration tests (`-PrunIT`, `@Category(IntegrationTest.class)`) aren't needed for Edison generator work. For the
Edison, "compile" only checks that the source is non-empty, and pylint checks Python 3 syntax, not EdPy.

Run the server locally: `./admin.sh -git-mode create-empty-db` once, then `./ora.sh start-from-git` → http://localhost:1999.
On Windows use Git Bash. "Show source" works offline. Running a program on a real Edison needs the external Edison
compile service and the EdComm audio cable.

## Rules and gotchas

- **Never edit generated files**: `OpenRobertaServer/staticResources/js/**` is built from `OpenRobertaWeb/src`. Blockly
  itself is built in a separate repo and copied in.
- AST classes must be `final` and annotated (`@NepoPhrase` / `@NepoExpr` / `@NepoBasic` …) with their `blocklyNames`.
  `AstFactory.loadBlocks()` must run before any XML → AST transformation. Tests call it in `@BeforeClass`.
- Workers are instantiated **once per RobotFactory** and reused across requests, so keep them stateless.
- A new Edison block needs a `visitXxx` in `IEdisonVisitor` and implementations in **three** visitors:
  `EdisonPythonVisitor`, `EdisonValidatorAndCollectorVisitor`, `EdisonStackMachineVisitor`. The Edison has no type
  checker and no textly visitor.
- **Generator exceptions become server errors, not block annotations.** For example, a decimal number crashes the
  generator with `IllegalArgumentException: Not an integer` (verified). Reject unsupported input in the validator,
  where it becomes a visible block error.
- The golden-file comparison **ignores all whitespace inside lines, including Python indentation** (it keeps only line
  breaks). Indentation bugs aren't caught by `ReuseIntegrationAsUnitTest`.
- `ValidationFileAssert` auto-creates a missing expected file with a header line and then fails. Review it, delete the
  header line, and re-run.
- **Golden files record current behaviour, not correct behaviour.** Several generator quirks are baked into them (see
  §13 of the reference). Don't treat `_expected/` as a specification when you derive or generate tests.
- Keep the code style of the surrounding code (formatter: `Resources/formatter/openRobertaIdea.xml`; spaces inside
  `if ( … )` parentheses).
- Git: work happens on branch `work`; the upstream default branch is `develop`. Don't commit or push unless asked.
