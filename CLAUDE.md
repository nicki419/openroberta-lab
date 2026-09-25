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

The generated EdPy is the artefact under test. It's executed against a mocked `Ed` runtime. This is implemented by
**NepoTest** (`NepoTest/`, `docs/ai/nepo-unit-testing.md`).
Keep this goal in mind when you make design choices.

**Three facts shape any design** (all verified; details in the reference doc):
- A generated program runs its statements at **module top level**. There's no `main()` and no `if __name__` guard,
  so importing the file executes the program.
- EdPy is **integer-only Python 2**. Under CPython 3, `/` becomes float division, and ints never overflow, whereas
  EdPy integers are 16-bit. A CPython-based mock doesn't reproduce EdPy semantics as-is.
- **The real EdPy compiler isn't in this repo.** The browser posts the source to Edison's external web service
  (`https://api.edisonrobotics.net/`), which returns a WAV file. The **reference compiler**
  (<https://github.com/Bdanilko/EdPy>, GPL-2.0, v1.2.11) can be run locally in check mode on Python 2.7/3.6 (verified).
  It's the authority on what EdPy accepts; CPython accepts far more (`print`, builtin `sum`, floats, `and`/`or`, …).

## Read this before touching code generation

**`docs/ai/edisonv2-nepo-to-edpy.md`** is the detailed reference. It covers the whole pipeline (Blockly XML → AST →
validation/collection → EdPy → external compiler → WAV), the anatomy of the generated program, the `Ed` runtime API
surface a mock must provide, the fixed ports, a block-by-block inventory, EdPy restrictions, the existing test
infrastructure, Lab integration points, and known quirks and test candidates. Read the relevant sections before you
change the generator or build test tooling.

**`docs/ai/edpy-reference.md`** documents **EdPy** itself, from the upstream compiler source and specs:
- the language rules (16-bit ints, no floats or strings, fixed-type variables, what compiles and what doesn't);
- the exact `Ed` API with constant values and semantics (read-and-clear sensors, blocking calls, units);
- the compiler's 45 error messages, and firmware facts;
- how to run the compiler locally;
- a checklist for building a mock `Ed`.

Read it before building a mock runtime or deciding what a generated program may contain.

**`docs/ai/nepo-custom-blocks.md`** is the guide to **NEPO blocks** for the Edison: how they're defined (the Blockly
side: hand-written Edison blocks, generic blocks with Edison branches, data-driven sensor blocks, hard-coded ports,
messages, toolbox) and how to create a custom one (XML ↔ Java annotations, the three visitors to implement, tests). It
includes a complete example block that was built and verified end to end. Read it before adding or changing any block.

**`docs/ai/nepo-unit-testing.md`** documents **NepoTest** (`NepoTest/`), the unit-test framework for learners' NEPO
programs, which implements the project goal. It covers:
- **conversion:** a running Lab converts the NEPO program (REST `/rest/projectWorkflow/sourceForTest`), which returns
  the unchanged EdPy plus a **source map** (block id → EdPy ranges);
- **tests in NEPO terms**, as JSON files (made for test editors and AI generators; schema in `NepoTest/schema/`) or
  in Python: NEPO functions, variables, world events on NEPO ports, and the executed action blocks with NEPO values;
- **results per block:** failures, runtime errors attributed to blocks, and block coverage;
- `describe()`: a program summary with test hints, as input for AI test generation.

Read it before working on testing.

**`docs/ai/nepo-test-blocks.md`** documents the Lab's **Tests tab**: learners build test suites from NEPO test blocks
(red start block, test blocks with given / when / then, run-test blocks), see the converted code, and run the tests in
the browser (NepoTest in Pyodide, in a Web Worker). It covers the block vocabulary (the contract between
`nepoTest.blocks.ts` and `NepoTest/nepotest/blocks.py`), how suites are saved inside the program XML, and how results
link back to blocks. Read it before changing the Tests tab or adding a test block.

**`docs/ai/edpy-test-engine.md`** documents the framework's engine (`NepoTest/nepotest/engine`). The engine runs
generated EdPy under CPython with EdPy semantics: 16-bit ints, floor division, constant folding, a virtual clock, and
latched sensors from EdPy's library. The document also lists which behaviour is verified, derived or assumed.

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
| **NEPO unit-test framework** (Python) | `NepoTest/` (`nepotest/`, `nepotest/engine/`, `examples/`, `tests/`, `schema/`) |
| **Tests tab** (test blocks, runner) | `OpenRobertaWeb/src/app/nepotest/*` (blocks, suite storage, runner, Web Worker), `OpenRobertaWeb/src/app/roberta/controller/tests.controller.ts`; markup in `staticResources/index.html` (`#tabTests`, `#tests`); translation `NepoTest/nepotest/blocks.py` |
| Source map for tests (block id → EdPy ranges) | `OpenRobertaRobot/…/bean/SourceMapBean`, filled by `EdisonPythonVisitor.preVisitCheck/postVisitCheck`, served by `ProjectWorkflowRestController` `/projectWorkflow/sourceForTest`; test `OpenRobertaServer/src/test/java/…/javaServer/EdisonSourceMapTest` |

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
test in `RobotEdison`. Its only unit-level coverage is the six programs in `robotSpecific/edison/`.

The golden-file runner writes what it actually generated to `OpenRobertaServer/target/unitTests/` (AST dumps, generated
`.py`, regenerated XML, collector results). Diff against `_expected/` to debug. To accept a new output, copy it into
`_expected/`, **for both `edisonv2` and `edisonv3`**.

Integration tests (`-PrunIT`, `@Category(IntegrationTest.class)`) aren't needed for Edison generator work. For the
Edison, "compile" only checks that the source is non-empty, and pylint checks Python 3 syntax, not EdPy.

To check that generated EdPy really compiles, run the reference compiler in check mode (setup in
`docs/ai/edpy-reference.md` §2): `python EdPy.py -c en_lang.json <file.py>` → `{"error": false, …}`. All six Edison
golden files pass (verified). Don't vendor EdPy into this repo without a licence review (GPL-2.0 vs Apache-2.0).

The NEPO unit-test framework (CPython 3.11+, standard library only; `docs/ai/nepo-unit-testing.md`):

```bash
cd NepoTest
python -m unittest discover -s tests -t .              # framework + engine tests (live-Lab tests need a running Lab)
python -m unittest discover -s examples -t .           # the example's Python tests
python -m nepotest run examples/clap_counter.tests.json
python -m nepotest run examples/clap_counter_with_tests.xml   # a program with a suite from the Tests tab
```

These passed on 2026-09-25: 76 + 8 tests, including the live-Lab tests and the reference-compiler check. Each suite has
one deliberate expected failure, which shows generator quirk #14; the example test file reports it as its one failure.
The live-Lab tests skip if no Lab answers at `$NEPOTEST_LAB` (default `http://localhost:1999`). The Level-0 check skips
unless `EDPY_HOME`/`EDPY_PYTHON` point to the reference compiler. The same tests run with pytest. After generator
changes, rebuild and restart the Lab, run `EdisonSourceMapTest` and `tests/test_lab_live.py`, and re-create the
bundles (`python -m nepotest convert <xml> -o <bundle>`).

The frontend (including the Tests tab): in `OpenRobertaWeb`, `npx tsc --noEmit -p .` (type check), then `npx gulp`
(TypeScript, CSS, and the NepoTest bundle for the browser); `npx gulp nepotest` after changes in `NepoTest/nepotest`.
Reload the page; the server serves `staticResources` directly.

Run the server locally: `./admin.sh -git-mode create-empty-db` once, then `./ora.sh start-from-git` → http://localhost:1999.
On Windows use Git Bash. "Show source" works offline. Running a program on a real Edison needs the external Edison
compile service and the EdComm audio cable.

## Rules and gotchas

- **Never edit generated files**: `OpenRobertaServer/staticResources/js/**` is built from `OpenRobertaWeb/src`, and
  `OpenRobertaServer/staticResources/nepotest/nepotest-files.json` from `NepoTest/nepotest` (gulp). Blockly itself is
  built in a separate repo and copied in.
- **The test blocks** (`nepoTest_*`) are defined in `nepoTest.blocks.ts` and translated by `NepoTest/nepotest/blocks.py`.
  Change both together, and keep the block table in `docs/ai/nepo-test-blocks.md` current. Test blocks are never part
  of the program workspace or code generation. They are saved as extra instances of the program XML.
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
- Nothing in the default build checks that generated EdPy is valid. When you change the generator, run the EdPy
  check on the output (see Build and test).
- Keep the code style of the surrounding code (formatter: `Resources/formatter/openRobertaIdea.xml`; spaces inside
  `if ( … )` parentheses).
- Git: work happens on branch `work`; the upstream default branch is `develop`. Don't commit or push unless asked.
