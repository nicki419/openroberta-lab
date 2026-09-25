# The Tests tab: NEPO test blocks in the Lab

Learners build unit tests for their Edison V2 program **from blocks** in a third tab, **Tests**, next to Program and
Robot configuration. They run the tests in the browser and see the results per test and per block. This is part 1 of
the project goal in `CLAUDE.md`, on top of the NepoTest framework (`nepo-unit-testing.md`).

```
Tests tab
+-------------------------------------------------------+---------------------------------------------+
| toolbox   test suite: run these tests   (red start)   | [Test runner] [Code]                        |
| Tests     run test [clampSpeed limits 150 to 100 v]    |  > Run tests   Stop                         |
| Given     run test [three claps ...              v]    |  7 passed, 1 failed, 0 test errors          |
| When                                                   |  ✓ clampSpeed limits 150 to 100    passed   |
| Expect    test [clampSpeed limits 150 to 100]          |  ✗ average of 4 and 6 is 5         failed   |
| Actions     given                                      |      returns: 5 ≠ 7                         |
| Values      when  call function [clampSpeed v]         |  Blocks of the program executed: 47 of 47   |
|                     speed (150)                        |  ██████████████████████████████████         |
|             then  expect the result [= v] (100)        |                                             |
+-------------------------------------------------------+---------------------------------------------+
```

**How a learner uses it:**
1. Build a **test** block. Under *given*, put what happens around the robot. Under *when*, put what runs: the whole
   program, or one of its functions. Under *then*, put what must be true.
2. Put a **run test** block for it under the red **start block**. Only tests under the start block run, so a learner
   can keep drafts.
3. Press **Run tests**. Each test turns ✓, ✗ or ⚠. Failures say what was expected and what happened. Clicking a
   runtime error opens the Program tab with the failing block selected. Clicking a test selects its test block.
4. The **Code** panel shows what the suite translates to (NepoTest JSON), and the program's generated EdPy.

**The suite is saved with the program:** with save, save as, export, and "get link". It comes back when the program is
loaded or imported. The tab appears only for the Edison robots, since NepoTest supports only them.

**Status (2026-09-25), verified in Chrome against a Lab built from this repository:**
- **Loading and running:** the example program with its suite was imported through the Lab's real import path (all 77
  test blocks landed in the Tests tab and none in the program). All 8 tests ran live in the browser: 7 passed and 1
  failed, the latter being the deliberate quirk #14 catch. Coverage was 47/47.
- **The Code panel:** both views, JSON and EdPy.
- **Problems and errors:** problem links select the block; runtime-error links open the Program tab and select the
  block.
- **Saving:** a save/load round trip brings back a suite edited in the browser, and editing marks the program unsaved.
- **Controls:** Stop works, and a live switch to German re-labels everything.
- **Automated tests:**
  - Python: `NepoTest/tests/test_blocks.py`.
  - Java: `NepoTestSuitePersistenceTest`.
  - The runner protocol was replayed under Node's Pyodide.

---

## 1. The blocks

All block types start with `nepoTest_`. They're defined at runtime in `OpenRobertaWeb/src/app/nepotest/nepoTest.blocks.ts`;
Blockly itself isn't rebuilt. They're translated to NepoTest's JSON by `NepoTest/nepotest/blocks.py`. **Keep both in
sync:** the field and input names below are the contract between them.

| Block | Looks like | Fields / inputs | Becomes (NepoTest JSON) |
|---|---|---|---|
| `nepoTest_suite` | red: *test suite: run these tests* | (next: `run` blocks) | the list and order of the tests |
| `nepoTest_run` | *run test* [name ▾] | `NAME` (dropdown of the workspace's tests) | selects a test |
| `nepoTest_test` | *test* [name] *given / when / then* | `NAME`; statements `GIVEN`, `WHEN`, `THEN` | one test (`name`, `block_id`, `origin: "blocks"`) |
| `nepoTest_given_clap` | *at* [1000] *ms: a clap* | `AT` | world `clap` |
| `nepoTest_given_key` | *at … ms: key* [▶ PLAY ▾] *is pressed* | `AT`, `PORT` (PLAY/REC) | world `key` |
| `nepoTest_given_obstacle` | *from … ms for … ms: an obstacle* [FRONT ▾] | `FROM`, `DURATION` (0 = until the end), `PORT` | world `obstacle` |
| `nepoTest_given_light` | *from … ms: light sensor* [LLIGHT ▾] *reads* [50] % | `AT`, `PORT`, `VALUE` | world `light` |
| `nepoTest_given_line` | *from … ms: the line tracker sees* [black ▾] | `AT`, `COLOR` | world `line` |
| `nepoTest_given_remote` | *at … ms: remote control code* [0 ▾] | `AT`, `CODE` (0–7) | world `remote` |
| `nepoTest_given_ir` | *at … ms: IR message* [1] | `AT`, `VALUE` (0–255) | world `ir_message` |
| `nepoTest_given_variable` | *variable* [claps ▾] *is* ⟨value⟩ | `VAR` (the program's globals), input `VALUE` | `globals` (function tests only) |
| `nepoTest_when_run` | *run the program for at most* [10] *s* | `SECONDS` | a program run, `max_time_ms` |
| `nepoTest_when_call` | *call function* [clampSpeed ▾] + one input per parameter | `FUNCTION`; inputs `ARG0…`; mutation `name` + `<arg name type/>` | `call`, `args` |
| `nepoTest_expect_result` | *expect the result* [= ≠ < ≤ > ≥] ⟨value⟩ | `OP`, input `VALUE` | `returns` |
| `nepoTest_expect_variable` | *expect variable* [claps ▾] [= ▾] ⟨value⟩ | `VAR`, `OP`, input `VALUE` | `variables` |
| `nepoTest_expect_status` | *expect the program* [to finish / to be still running] | `STATUS` | `status` |
| `nepoTest_expect_action` | *expect* ⟨action⟩ | input `ACTION` | `actions` (consecutive ones: **in this order**) |
| `nepoTest_expect_no_action` | *expect no* ⟨action⟩ | input `ACTION` | `no_actions` |
| `nepoTest_expect_count` | *expect* ⟨action⟩ [= ▾] [1] *times* | input `ACTION`, `OP`, `COUNT` | `action_count` (matcher form) |
| `nepoTest_expect_called` | *expect function* [f ▾] *to be called* | `FUNCTION` | `calls` |
| `nepoTest_expect_error` | *expect the error* [any error ▾] | `KIND`: any, division_by_zero, overflow, index_out_of_range, recursion, step_limit, negative_value | `error` |
| `nepoTest_action_led` | *LED* [any/LLED/RLED] [any/on/off] | `PORT`, `MODE` | `{"action": "led", ...}` |
| `nepoTest_action_drive` | *drive* [any/forward/backward], *power %*, *distance cm* | `DIR`; optional inputs `POWER`, `DISTANCE` | `{"action": "drive", "dir", "power", "distance_cm"}` |
| `nepoTest_action_turn` | *turn* [any/right/left], *power %*, *degrees* | `DIR`; `POWER`, `DEGREES` | `{"action": "turn", ...}` |
| `nepoTest_action_curve` | *curve* [dir], *power left/right %*, *distance cm* | `DIR`; `POWER_LEFT`, `POWER_RIGHT`, `DISTANCE` | `{"action": "curve", ...}` |
| `nepoTest_action_motor` | *motor* [any/LMOTOR/RMOTOR], *power %* | `PORT`; `POWER` | `{"action": "motor", ...}` |
| `nepoTest_action_stop` | *stop* | – | `{"action": "stop"}` |
| `nepoTest_action_tone` | *tone*, *frequency Hz*, *duration ms* | `FREQUENCY` (±1 Hz), `DURATION` | `{"action": "tone", ...}` (tone and note blocks) |
| `nepoTest_action_sound_file` | *sound file*, *number* | `FILE` | `{"action": "sound_file", ...}` |
| `nepoTest_action_ir_send` | *send IR message*, *value* | `VALUE` | `{"action": "ir_send", ...}` |
| `nepoTest_action_wait` | *wait*, *ms* | `MS` | `{"action": "wait", ...}` |

- **Connection checks** keep the structure valid while the learner builds. `GIVEN` accepts only *given* blocks,
  `WHEN` exactly one *when* block (no next connection), `THEN` only *expect* blocks, and ⟨action⟩ inputs only action
  blocks. Run blocks attach only below the start block.
- **Values** are NEPO literal blocks from the *Values* category: `math_number`, `logic_boolean`,
  `robLists_create_with`. The translator rejects anything else, and non-whole numbers, with a message on that block.
- **In action blocks, an empty input or "any" matches everything.** For example, *expect no* ⟨drive any⟩ means "never
  drives".
- **The program's names come from the Program tab, live:** function names and parameters for *call function* and
  *expect function*, and global variables for *variable* dropdowns. The *call function* block gets one labelled input
  per parameter, and re-shapes when the learner picks another function.
- **Colours** follow NEPO:
  - start block: red (activity);
  - tests: green (procedure);
  - *given*: sensor green;
  - *when*: control orange;
  - *expect*: logic cyan;
  - actions: action orange;
  - values: math blue.
- **Messages** are in English and German (`MESSAGES` in `nepoTest.blocks.ts`). The panel texts are in
  `tests.controller.ts`. Failure texts come from NepoTest and are English only.

**Problems** (translation errors and warnings) come with the block id and appear in the runner as clickable lines.
Examples:
- "put "run the program" or "call function" under "when"";
- "there are two tests named …";
- "there is no test named …";
- "the program has no function …";
- "the Edison only knows whole numbers";
- "expect the result only works with call function".

A test that isn't under the start block, and a test listed twice, are **warnings**. Everything else is an error and
stops the run.

---

## 2. How it is built

```
OpenRobertaWeb/src/app/nepotest/nepoTest.blocks.ts     block definitions, toolbox, messages, empty suite
OpenRobertaWeb/src/app/nepotest/nepoTest.suite.ts      split/merge of test instances in program XML (no imports: no cycles)
OpenRobertaWeb/src/app/nepotest/nepoTest.runner.ts     client of the Web Worker (promises, progress, cancel)
OpenRobertaWeb/src/app/nepotest/nepotest.worker.js     module Web Worker: Pyodide + nepotest.browser
OpenRobertaWeb/src/app/roberta/controller/tests.controller.ts   the tab: workspace, dropdowns, panels, running
OpenRobertaServer/staticResources/index.html          #tabTests, pane #tests (#testsBlocklyDiv, #testsSide ...)
OpenRobertaWeb/css/roberta.css                         the tab's styles (section "the Tests tab")
NepoTest/nepotest/blocks.py                            test blocks -> NepoTest JSON (+ problems with block ids)
NepoTest/nepotest/browser.py                           the functions the worker calls (JSON strings in and out)
```

The wiring into the Lab consists of:
- `main.js`: a path per module, a `blockly` shim for the blocks module, the require list, and `testsController.init()`
  right after `configurationController.init()`;
- `tsconfig.json`: `paths`;
- `guiState.controller.js`: a `tabTests` branch in `setView`, which keeps the program menu, and `addLanguageListener`;
- `program.controller.js`: the persistence hooks (§3).

**Running a suite** (`tests.controller.ts runTests`):
1. The program workspace XML goes to `POST /rest/projectWorkflow/sourceForTest` (`nepo-unit-testing.md` §3). The
   request is the same as for "show source".
2. The answer becomes a NepoTest **bundle**: EdPy, source map, the Lab's annotated XML, and `rc`/`message`.
3. The worker gets the bundle and the suite XML:
   - `browser.prepare` translates the suite and validates it against the program. If the Lab rejected the program, it
     reports the conversion errors with block ids instead.
   - `browser.run_one(i)` runs each test and posts progress, so results appear one by one.
   - `browser.finish()` returns the summary and the merged coverage.
4. The panel renders each report.
   - Links use `data-block` and `data-workspace` (`tests` or `program`).
   - An unexpected runtime error is shown once, as "The program failed in block … (function): …".
   - Coverage is a bar plus the list of never-executed program blocks.

**The worker** (`nepotest.worker.js`) is a **module worker** (`new Worker(url, {type: 'module'})`):
- **Loading Pyodide:** it loads Pyodide 314.0.7 (CPython 3.14; NepoTest needs 3.11+) with
  `import(PYODIDE_URL + 'pyodide.mjs')` from `https://cdn.jsdelivr.net/pyodide/v314.0.7/full/`.
  - **Why `import()` and not `importScripts`:** `importScripts` makes a cross-origin *no-cors* request. In the Chrome
    this was tested in, every cross-origin `importScripts` failed, even jQuery from the same CDN. Meanwhile `import()`,
    a CORS request, and `fetch` worked.
  - The `import()` is created with `new Function`, because tsc would compile a literal `import()` into an AMD
    `require`.
- **Loading NepoTest:** it fetches `/nepotest/nepotest-files.json` (with `cache: 'no-cache'`), writes the package into
  Pyodide's file system under `/home/pyodide`, and imports `nepotest.browser`.
- **Cost:** the first run downloads about 12 MB (then cached); start-up takes about 3–5 s, and a suite like the
  example takes about 1 s.
- **Stop** terminates the worker; the next run starts a new one.
- **The Code panel's JSON** also comes from the worker (`browser.translate_tests`), so the first view starts Python.
  The EdPy view is the `sourceCode` of `sourceForTest`.

---

## 3. Saving and loading

A program's suite is stored **in the program's own XML**, as extra `<instance>`s of its `block_set`: every instance
whose first block has a `nepoTest_` type. There's no database or REST change.

| Where | What happens | Code |
|---|---|---|
| Save, save as | the program workspace XML plus the suite | `program.controller.js` `saveToServer`, `saveAsProgramToServer` → `NEPOTEST_SUITE.merge` |
| Export, get link | the same, inside `<export><program>` | `exportXml`, `linkProgram` |
| Load (list, gallery, import, new program, robot switch) | test instances are split off and put into the Tests tab; a program without them gets a new, empty suite | `programToBlocklyWorkspace(xml, fromShowSource, keepTests)` → `NEPOTEST_SUITE.split` / `loadTests` |
| Reloads with a workflow result (show source, simulation, run, source editor) and re-renders (language, toolbox) | the regenerated XML has no tests, so the current suite is **kept** | `reloadProgram(result)` and `reloadView` pass `keepTests` |

**The rules this relies on:**
- **The program workspace never contains test blocks,** so code generation, simulation and run never see them.
  `programToBlocklyWorkspace` always splits.
- **The server keeps test instances unchanged:**
  - saving doesn't validate;
  - import and listing validate against `blockly.xsd`, re-marshal through JAXB, and run the XSLT/Java transformer;
  - `NepoTestSuitePersistenceTest` checks that all test blocks, names, mutations and `<arg>`s survive;
  - the test blocks only use XSD-valid parts (fields, values, statements, and mutation `name` with `<arg>`).
- **An empty suite** (only the start block) isn't stored, so programs without tests stay byte-for-byte unchanged.
- **An edit in the Tests tab** marks the program unsaved, like an edit in the Program tab.
- **Compatibility:** a Lab without this feature would show unknown test blocks when it opens such a program. That's
  accepted for this fork.

`python -m nepotest run program.xml` runs a suite saved this way from the command line: it splits the program, converts
it with a running Lab, and runs the suite (`nepo-unit-testing.md` §1). `NepoTest/examples/clap_counter_with_tests.xml`
is the example.

---

## 4. Building and changing

- **After changes in `OpenRobertaWeb`:** in `OpenRobertaWeb`, run `npx tsc --noEmit -p .` (type check), then
  `npx gulp`. This builds TypeScript, CSS, **and the NepoTest bundle**. Reload the page; the server serves
  `staticResources` directly.
- **After changes in `NepoTest/nepotest`:** `npx gulp nepotest` regenerates
  `OpenRobertaServer/staticResources/nepotest/nepotest-files.json` (`{generated, version, files: {path: source}}`).
  **It's generated; never edit it.** The Tests tab uses whatever that file contains.
- **Adding a test block:**
  1. Define it in `nepoTest.blocks.ts` (`DEFINITIONS`, with the connection check of its section), put it into
     `toolbox()`, and add its messages (EN, DE).
  2. Translate it in `blocks.py` (`_translate_test` or `_action_matcher`).
  3. Add a case to `tests/test_blocks.py`.
  4. Extend the table in §1.
  5. Mutations must use XSD-allowed attributes only (`name`, `items`, `value`, `type`, …, plus `<arg>`); otherwise
     saving still works, but loading and importing fail.
- **Pyodide version:** `PYODIDE_URL` in `nepoTest.runner.ts`. To run without internet access, host a Pyodide
  distribution on the Lab's own server (under `staticResources`) and point `PYODIDE_URL` at it.

---

## 5. Limits and open points

- **Internet access:** the first run needs to reach the CDN, unless Pyodide is hosted on the Lab's own server (§4).
- **Browsers:** module workers are needed (Chrome/Edge 80+, Firefox 114+, Safari 15+).
- **Messages:**
  - failure texts from NepoTest are English;
  - block names in results are block types (`math_arithmetic`), not the block's label;
  - a translated "expected vs. got" view would help learners.
- **Error links are live:** a link in the results points to a block id of the program as it was converted. If the
  learner changes the program meanwhile, the link may point to a deleted block.
- **Suites are edited in the Tests tab only.** There's no test block inside the Program tab, and no generated tests
  yet. The JSON format and `describe()` (`nepo-unit-testing.md` §7) are the entry points for AI-generated tests,
  which the Tests tab can show once they are converted back to blocks, the inverse of `blocks.py` (not implemented).
- **The simulator isn't involved.** Tests run on NepoTest's virtual robot, which models the real Edison
  (`edisonv2-nepo-to-edpy.md` §11).
