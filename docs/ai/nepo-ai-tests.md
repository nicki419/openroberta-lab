# The AI test assistant: tests written by DeepSeek

The model is DeepSeek-V4.1-Flash, at DeepSeek's own API, with SDU's UCloud as the backup (see "The calls").

The assistant works **only when the learner asks**: they write what their program should do into its box, and it writes
**scenario-based simulation tests** for that. It is a tab of the Tests tab's side, "AI Assistant", beside Test runner,
Code and Simulation. (Until 2026-11-06 it was a panel beside the Program tab's simulator, and a run of a changed program
brought a guess of what it is meant to do and an offer to write tests: the call infer. Both are gone, see "Only on
request".) The tests are chosen by the testing strategy of `docs/tests/*_v3.md` (see "The testing strategy" below):
1. the program is analysed first: its decisions and their outcomes, the paths that target them (branch coverage), the
   inputs of each path (equivalence classes; no boundary value analysis since 2026-11-06, see "Deliberate deviations");
2. the tests are written from that analysis, each a complete case: path, inputs, expected results, postconditions,
   and where its expectation comes from.

The tests the learner keeps run on the simulator first, which shows which outcomes really happened. For those that
fail or aren't checked, the model fixes their inputs, or says the program is wrong. Then they become ordinary blocks
in the Tests tab.

This document covers:
- the calls through the Lab server (phase 1);
- the test JSON both ways (phase 2);
- the assistant in the Tests tab, with its switch (phase 3);
- its events in the study's telemetry (phase 4);
- the check and fix of the chosen tests (2026-11-03);
- the testing strategy (2026-11-04).

## What the model gets, and what it doesn't

- **It gets:**
  - the learner's program: its NEPO XML, its blocks with short ids `b1`, `b2`, … in document order, and its EdPy;
  - for analyze, generate and fix: the program's decisions, which the browser finds in the blocks;
  - the learner's tests, as test JSON;
  - the learner's earlier sentences about the program;
  - the task (analyze, generate or fix), with the learner's sentence: what they asked for. Generate and fix also get
    the checked analysis; a fix also gets the tests that failed or weren't checked, and how they ran on the simulator,
    in the tests' own worlds.
- **It never gets the level** the learner plays: no title, instructions, time limit or world (lines, areas, obstacles,
  starts). Tests made from the level would give its solution away and test the level instead of the learner's idea.
  The model draws the world of each test itself, or adds tests to one of the learner's worlds. The level's id goes
  along only to be logged (`levelId`); `AiPrompts` reads nothing else of the data. `AiServiceTest
  theModelGetsNothingOfTheLevel` sends a level and checks that none of it reaches DeepSeek, and `AiPromptsTest`
  checks that the context pack never mentions levels.

## The calls (OpenRobertaServer)

| What | Where |
|---|---|
| REST: `POST /rest/ai/analyze`, `POST /rest/ai/generate`, `POST /rest/ai/fix` (`/rest/ai/infer` until 2026-11-06; the usual request envelope; the response has `answer`, `meta`, or `aiError` and `aiMessage`) | `javaServer/restServices/all/controller/AiController`, `AiResponse` |
| the calls: limits per session (one of each kind at a time, but 6 generates; 30 analyses, 150 generates, 30 fixes per hour), the context pack first, the answer checked for its shape, the `ai_call` event; analyze and fix as generate (180 s, at most 32,000 tokens with the reasoning, repairs); each call its own effort per API; every call's meta has `contract` (`AiService.CONTRACT`: 1.4 since 2026-11-06, no infer and the learner's sentence required; 1.3 the same day, no boundary value analysis; 1.2 since 2026-11-05, with `tested_by` and one generate call per scenario; 1.1 before) | `ai/AiService` |
| the per-call message (`## The program`, `## The program's decisions`, `## The learner's tests`, `## What the learner said before`, `## The analysis` (generate, fix), `## Task: …` with "The learner's sentence", required: `bad_request` without it), the trimming of NEPO XML (positions, configuration and the start block's `<data>` go; the block ids stay) and EdPy, the answer checks (`checkAnalyze`: status, intent, arrays; `checkGenerate`: no worlds only with `generation_status` `no_valid_scenarios`; `checkFix`: `worlds`, `program_wrong` and `doubtful`, not all empty) | `ai/AiPrompts` |
| the model's chat API (OpenAI-compatible): JSON mode, reasoning effort, timeouts (180 s; `AiService.setTimeout`), one more try after 429, 5xx or no connection; the reasoning from `reasoning_content` (DeepSeek) or `reasoning` (UCloud's vLLM) | `ai/DeepSeekClient` |
| **two APIs, the same model** (DeepSeek-V4.1-Flash), asked in the order of `AI_PROVIDERS` (since 2026-11-05: DeepSeek's own API first, SDU's UCloud as the backup; before that the other way round). A call without an answer from the first (it can't be reached, doesn't answer in time, or an HTTP error) is made again at the next, and for the next 5 minutes the first is asked last (`COOL_DOWN_MS`). An answer that can't be used (cut off, not the JSON asked for) isn't made again: the browser repairs it. A timeout of the first followed by the next can make a call take up to 6 minutes | `ai/AiService` `order`; `AiServiceTest withoutAnAnswerFromTheFirst…`, `aTimeoutOfTheFirstGoesToTheNext`, `anAnswerThatCantBeUsedIsNotAskedAgainAtTheNext` |
| **the reasoning effort per API and call:** `<NAME>_EFFORT_ANALYZE`, `_GENERATE`, `_FIX` (none, low, high, max); preset for both: none, none, low (`docs/ai/nepo-ai-model-evaluation.md`: generate at none took about 17 s instead of 1 to 2.5 minutes, with first answers as valid). `_EFFORT_INFER` is no longer read. Each try is sent with its API's effort | `ai/AiSettings.Provider` `effort`; `AiServiceTest theFirstApiIsAskedFirstWithItsOwnEfforts` |
| **HTTPS trust:** the AI's calls trust the JDK's roots and the roots in `src/main/resources/ai/certs/` (`DeepSeekClient.EXTRA_ROOTS`): HARICA TLS RSA Root CA 2021, which signs UCloud's certificate (via GÉANT TLS RSA 1) and which older JDKs don't trust (13.0.2: "PKIX path building failed", so every call to UCloud failed). Taken from the Windows root store, SHA-256 `D9:5D:0E:8E:…:EC:CB:7B:1D`, valid until 2045. The JVM's own trust doesn't change | `ai/DeepSeekClient` `trustManager`; `AiServiceTest theAiCallsTrustTheUniversitysRootBesidesTheJdks` |
| a repair's problems are hints: more than 40 are cut to the first 40 (and how many more), one longer than 800 characters is cut; a fix's run text longer than 4,000 characters is cut. Before 2026-11-05 they were refused (`too_large`), and a refused repair lost the tests it would have saved | `ai/AiPrompts` `repairMessages`, `appendFix`; `AiServiceTest aRepairWithLongOrManyProblemsIsCutNotRefused` |
| the context pack: the system prompt, its `promptVersion` (hash); each version is saved once as `<telemetry>/ai-prompts/<promptVersion>.md` | `ai/ContextPack`, `src/main/resources/ai/` (`pack.txt` lists the files) |
| `.env`: `AI_PROVIDERS` (`deepseek,ucloud`); `DEEPSEEK_URL` (`https://api.deepseek.com`), `DEEPSEEK_MODEL` (`deepseek-flash`), `DEEPSEEK_EFFORT_*`; `UCLOUD_URL` (`https://ai.cloud.sdu.dk/v1`), `UCLOUD_MODEL` (`deepseek-ai/DeepSeek-V4.1-Flash-1017`), `UCLOUD_EFFORT_*`; `AI_TESTS_DEFAULT`, `AI_PACK_DIR` (read at every call: change the prompt without a rebuild). Both APIs take the efforts none, low, high, max (UCloud refuses medium, minimal, xhigh) | `main/EnvFile`, `ai/AiSettings`, `openRoberta.properties` (the defaults in brackets) |
| the API keys `DEEPSEEK_API_KEY` and `UCLOUD_API_KEY`: read on their own (`EnvFile.secret`), never server properties (those are logged), never logged, never sent to the browser. An API without a key isn't asked | `ai/AiSettings`; `AiServiceTest theKeyIsNeverLoggedAndNeverLeavesTheServer` |
| the browser learns `server.ai = {available, default}` | `ClientInit` |

Every call, failed or not, is a line `kind: "ai_call"` in the participant's telemetry file (`LevelsController.writeTelemetry`,
which adds `serverTime`, `userId`, `account` and `session`):

| Field | What |
|---|---|
| `callId`, `call`, `ai`, `level`, `fingerprint`, `contract` | which call (`ai` is always true: the browser calls only while the AI is on; `level` is the id, logged only) |
| `startTime`, `latencyMs` | when the call came in, and how long the APIs took (all tries together: what the learner waited at the server); `serverTime` is when the event was written |
| `promptVersion`, `prompt`, `repairAnswer`, `repair` | what was sent: the system prompt by its version (the text is in `ai-prompts/<promptVersion>.md`), the per-call message, and for a repair the earlier answer and the problems sent back |
| `effort`, `maxTokens`, `timeoutMs` | the request's settings (`effort`: that of the API that answered) |
| `provider`, `host`, `model`, `modelAnswered` | the API that answered (or was asked last): `deepseek` or `ucloud` (until 2026-11-05: `primary` or `fallback`), its host, the model asked for and the model the API says it used |
| `tries` | every API asked, in order: `provider`, `host`, `model`, `effort`, `ok`, `httpStatus`, `error`, `message`, `attempts`, `latencyMs` |
| `status`, `error`, `message`, `httpStatus`, `attempts` | the outcome (`attempts`: all tries together) |
| `answer`, `finishReason`, `tokens` | what came back: the raw answer, why it ended, and `in`, `cached`, `out`, `reasoning` (`null` if the API doesn't say: UCloud doesn't) |
| `reasoning`, `reasoningChars` | the model's reasoning (at most 200,000 characters: in practice all of it) and its length |

Measured on 2026-11-05: the experiments, their results and the discussion (why the same model behaves differently at
the two APIs) are in **`docs/ai/nepo-ai-model-evaluation.md`**. In short, with the presets (analyze low, generate
none), writing tests takes about 67 s at DeepSeek and 93 s at UCloud (medians); with both at low, about 2 and 2¾ minutes.
Earlier (2026-11-03, `deepseek-flash`, a prompt of 12,700 tokens): infer (the guess, gone since 2026-11-06) 3 to 5 s; generate 7 to 18 s at effort low,
71 s at high.

## The assistant in the Tests tab (`OpenRobertaWeb/src/app/levels/levels.aiAssistant.ts`)

| What | Where |
|---|---|
| **The switch:** "AI test assistant" in the Edit menu (`#menuAiTestsItem`, Edison only), with a tick; greyed out if the server has no API key (`server.ai.available`) | `index.html`, `levels.aiAssistant` `switchTo`, `renderMenu` |
| kept per test subject on the server: `POST /rest/ai/switch` (`{on}` switches, `{}` asks; the answer `{on: true, false or null, stored}`), in `ai-switch.json` beside the telemetry, keyed as the telemetry files (`user-<id>-<account>`). A POST, as every call that knows the session. An account never switched gets the default (`AI_TESTS_DEFAULT`), or the page's switch if it was switched before logging in. Nobody logged in: the open page only | `AiController.aiSwitch`, `ai/AiSwitches`; `AiSwitchesTest` |
| **The panel** (`#aiAssistant`): the pane (`#testsAiPane`) of the Tests tab's side tab **"AI Assistant"** (`#testsAiTab`, with the sparkles of AI before its name), beside Test runner, Code and Simulation. The tab is there while the AI is on; switched off, it is hidden, and if it was shown the Test runner is. A program's blocks in the panel are chips: a click shows the block in the Program tab. Until 2026-11-06 the panel sat to the right of the levels' simulator while a level was played (class `levelSidePanel`; the scene made room for it), and for a few hours of that day it also opened in the Tests tab from a ✦ button beside the workspace | `levels.aiAssistant` `build`, `renderVisibility`, `sideShown`; `tests.controller` `setAiTab`, `onSideShown`, `showSide`, `aiShowBlock`; `index.html` (`#testsSideTabs`); `roberta.css` (`#testsAiPane`) |
| **Only on request** (since 2026-11-06): the learner writes what their program should do into the box ("What should your program do?", at most 500 characters) and presses "Write tests" or Enter (Shift+Enter: a new line). The box grows with the text, so all of it is visible (`fitSentence`: its height is its `scrollHeight`). "Write tests" is greyed out while the box is empty. Then the program and its EdPy are taken as they are, analysed and the tests written. Before, every run of a changed program brought a guess (infer) and an offer with "Not now" and "Don't ask on this level": learners hadn't asked for it | `levels.aiAssistant` `ask`, `write`, `renderAsk` |
| the program's EdPy: the request the telemetry makes for a run (`attemptSource`, shared if the program is the same) | `levels.telemetry` `attemptSource` |
| **The check** of the tests the learner keeps, and "Add anyway" for those that fail (the fix is switched off: `FIX_TESTS`): see below | `levels.aiAssistant` `chooseTests`, `check`, `decide`, `fix`, `finish`; `nepoTest.ai` `runTests`, `resultText`, `fix` |
| **The states:** idle (the box), writing (analysing, then writing), the review list (all ticked; untick any), checking (test i of n runs), the results (each test: passed, failed with its failed checks and why, the program's blocks as chips; the questions), fixing, done (the tests are in the workspace beside it; they don't run by themselves), no new tests, discarded, an error ("Try again"). After done, no new tests, discarded and an error of a call, the box comes again ("Want other tests?"). Answers that come after the AI was switched off, or after another program was loaded, are dropped | `levels.aiAssistant` `render` |
| **Tests the learner has count** (since 2026-11-05): analyze says which of the learner's tests already test each scenario (`tested_by`), and those scenarios get no generate call. (Until 2026-11-06 the guess also said what their tests don't check yet, `not_covered`, shown with the offer and sent as `notCovered`.) The context pack (`tests.md`, "The learner's tests count") has generate defer what one of the learner's tests already tests, with the reason `tested by "<their test>"`, and counts a test that differs from theirs only in its numbers as the same. If nothing is left, generate answers with no tests: "Your tests already check what I would test". Before, every offer wrote the learner's line-following tests again (same world, starts 0.1 to 2 cm apart); in a replay of that call, the new rules wrote none of them in 2 of 2 runs, the old ones 7 in 3 | `nepoTest.aiStrategy` `scenariosToWrite`; the context pack's example 2 |
| **An answer that can't be read** (`bad_answer`: not JSON, or not the shape asked for) is asked for once more by itself, as it can't be repaired (2026-11-05: 1 of 3 generate answers at effort none was broken JSON) | `nepoTest.ai` `callReadable` |
| **The notes**, saved with the program as one more instance (`nepoAi_notes`, as the level progress): the learner's sentences word for word (`{text, time, level}`, sent as `said` with later calls), the ids of the tests it added. Version 2 since 2026-11-06; version 1 also had `answer` per sentence, the guess declined and the levels it didn't ask on: dropped when loaded | `nepoTest.suite` `setAiNotes`, `loadExtras`; `NepoTestSuitePersistenceTest`, `NepoTest/tests/test_blocks.py` |
| the added tests: `tests.controller` `addAiTests` (one undo step), with their provenance (the call that wrote them, and how they ran: `checked`) | `levels.aiAssistant` `finish` |

## Checking the chosen tests, and fixing those that fail

"Add n tests" in the review list doesn't add them at once: the ticked tests **run on the simulator first**, for the
program as it is in the Program tab, each in its own world (`nepoTest.ai` `runTests`: NepoTest's translator, then
`nepoTest.simRun`, as the Tests tab runs them, offscreen). The panel says which test runs. Then:

- **All pass:** they are added ("They passed on your program").
- **Not checked:** a test whose checks all passed is still **not checked** when one check had nothing to decide
  (`passed: null`), or when an outcome its run should take never happened (`nepoTest.aiStrategy` `notCheckedWhy`,
  from the run's `trace`). Of its `planned_branch_ids`, only those on the test's own paths count: since planned
  outcomes may be any of the program's, a test planned some it never needed and was shown as not checked though it
  had passed (2026-11-05). For the same reason, a `whenever` about turning away (`turns_left`, `turns_right`) with
  an `after_ms` above 50 goes back for a repair: the turn ends what the robot sees sooner, and the check would have
  nothing to decide. Two tests of turning away from a wall had `after_ms` 200, passed, and were shown as not checked. Its scenario didn't happen, so it counts as not
  passed. It is shown with "?", "not checked: it passed, but that doesn't show much", and what didn't happen, with the
  decision's block as a chip. It is decided as a failed test.
- **Some fail or aren't checked:** the results list each test (passed; failed, with its failed checks and why, as in
  the Tests tab, the program's blocks as chips that select them; not checked, with why) and ask: *Add the tests that
  failed or weren't checked anyway? A test that fails can show what your program doesn't do yet, but it can also be
  wrong itself.* "Add anyway" or "Discard them" ("The tests that passed are added either way"). Added anyway, a test
  keeps `checked: {passed: false}` in its provenance, and in the Tests tab it fails until the program does what it
  expects. **Since 2026-11-05 there is no "Fix"** (`FIX_TESTS = false` in `levels.aiAssistant.ts`): a test often fails
  or isn't checked because the program is wrong (a robot that stops in dim light never meets the wall its test is
  about), and then it is worth keeping; the learner decides. The fix below stays in the code, for `FIX_TESTS = true`.
  - **Fix** (`FIX_TESTS` only): the model gets the tests as it wrote them, how each ran (and which planned outcomes it took), and the
    names of the tests that passed (the task fix, `/rest/ai/fix`). For each test it decides one of three things:
    - **The test is wrong:** its world, start, set-up or timing don't make its scenario happen. It fixes **only the
      test's inputs**: the world, start, `until`, `max_time_ms`, the set-up and the realizations of its classes.
    - **The program is wrong:** the test makes its scenario happen, and the program doesn't do what the learner said.
      It leaves the test as it is and says why, for the learner (`program_wrong`), because a test changed until a
      wrong program passes it would hide the mistake.
    - **The test may expect more than the learner said:** it leaves the test as it is and says why (`doubtful`), and
      the learner decides.

    A fixed test must expect exactly what it did: its checks (with their times, the things they name compared by
    their role), expectations, postconditions, oracle, planned outcomes and classes are compared with the test it
    fixes (`nepoTest.aiStrategy` `frozenProblems`). A fix that changes them is sent back for a repair, so a fix never
    makes a test weaker.

    The answer is checked and repaired as a generate answer. Also: `program_wrong` and `doubtful` name the tests to
    fix, each once, none also fixed; a fixed test is one of the tests to fix. The fixed tests run again.
  - **Discard:** they aren't added.
- **The program is wrong** or **it may expect too much** (a test the model left as it is): the results show the reason
  ("I think this test is right, and your program is wrong:" or "This test may expect more than you said:") and ask
  *Add it anyway?* "Add anyway" or "Discard".
- **The program changed** between writing the tests and choosing them (its fingerprint differs): "Your program
  changed", with "Write them again" (analyse and write anew, for the program as it is) or "Check them anyway" (their
  provenance then says `stale`).
- **At most 2 fixes** (`FIXES`): a test that still fails after the second is shown as given up and isn't added; "Add
  the others" (or "OK") goes on.
- **Left out by a fix:** a fixed test that has problems after the repairs, that the model left out, or that checks
  the same as another test (`dropDuplicates`), with the reason.
- **Nothing is added until every failed test is decided**; then the tests to keep are added in one undo step. A test
  that fails and was added anyway, and one fixed, keep that in their provenance (`checked: {passed, fixes}`).
- If the tests can't run at all (the runner failed): "Try again", or "Add them without running" (`passed: null`). If
  a fix call fails: "Try again", or "Discard them".
- While tests are checked, fixed or decided, a run doesn't interrupt (as while they are written or reviewed). Switching
  the AI off or loading another program stops a check that runs and drops the batch.

**What the model reads of a run** (`resultText`, one item per failed or unchecked test): why the run ended and when
(or that it passed but wasn't checked, and why), where the robot started and ended and how far it drove, where it was
over time (at most 12 times; one entry while it stays at the same place), how often it bumped, the planned outcomes
of the program's decisions and how often the run took them ("Planned outcomes of the decisions: D1.1 (the condition
holds): taken 247×; …"), each check (passed, failed, not checked) with what happened, and for a failed
check of what the robot does: why (the verdict) and the facts of the second before it (sensed, ran, remembered,
did; `nepoTest.simProgram` `factLines`). The program's blocks are written as their labels in brackets
("[steer forwards speed % left 40 speed % right 10]"). The facts aren't shown to learners (GitHub issue #9), but the
model gets them. The context pack teaches the task in `tasks.md` ("Task: fix"), `schemas/fix.schema.json` and
`examples/4-fix-failed-tests.md` (one test wrong: too little time; one finding a mistake: no obstacle stop), whose
run texts were written by the browser.

## The testing strategy (`docs/tests/*_v3.md`, 2026-11-04)

The specification by the project group (`AI_Test_Generation_Orchestration_v3.md` = ORCH, `AnalysisAgent_v3.md` = AA,
`TestGenerationAgent_v3.md` = TGA) asks for four steps in this order (ORCH §6.3). Each is either done by code, or done
by the model and checked by code:

| Step | Technique | Model | Code (`OpenRobertaWeb/src/app/nepotest/nepoTest.aiStrategy.ts`) |
|---|---|---|---|
| 1 | Decisions and paths: **branch coverage** | analyze: what each decision means, whether the simulator can make each outcome happen (`feasibility`), a small set of paths that target every supported outcome, the scenarios (AA §A1–A6) | `indexOf`: the program's decisions (every if / else if / else, wait until, repeat while / until in a running instance), their outcomes with ids (`D1.1`, `D1.else`, `D1.waits`, `D1.repeats`, `D1.ends`), the blocks' short ids. `checkAnalysis`: every decision with exactly its outcomes, every supported outcome on a path, paths and scenarios naming each other, real blocks, `basis` matching the sentence, the enums |
| 2 | Inputs: **equivalence partitioning** (the spec's **boundary value analysis** is left out since 2026-11-06, see "Deliberate deviations") | analyze: each path's input dimensions with their classes; generate: each test's `input_selection`, a typical case of each class (clear of where readings change, `simulator.md`), what of the test realizes it | `checkTests`: every class word for word from the analysis, `realized_by` naming the test's own start, things, events or variables; for a line follower, a test of a class "beside the line" must not start on a line (`lineProblems`) |
| 3 | A complete test: **path + inputs + expected results + postconditions** | generate: `scenario_id`, `path_ids`, `planned_branch_ids`, `expected_results`, `postconditions` (with `check_indices`), `oracle` (`basis`, `confidence`, `assumptions`, `review_required`) | `checkTests`: everything resolves to the analysis, the indices to real checks, `learner_description` only with a sentence, a scenario with an `unknown` oracle gets no test, at least one positive check (anti-triviality) |
| 4 | **Consolidation** keeping unique coverage | generate: merges and leaves out, `coverage_plan`, `consolidation_notes`, `deferred_scenarios` | `checkTests`: at most 6 tests (`MAX_TESTS`); every target outcome planned or deferred with a reason; every class tested or deferred; every scenario tested or deferred. `planOf`: the coverage plan computed from the tests that are left (after repairs, left-out tests and duplicates), never taken from the model (`corrected` says whether the model's differed) |

**One generate call per scenario** (since 2026-11-05, `nepoTest.ai` `generate`):
- **Analyze says what is tested already:** each scenario's `tested_by` names the learner's tests that already test it
  (`checkAnalysis`: only names of the learner's tests; missing means none).
- **Generate runs per scenario:** one call per scenario that is testable, has an expected behaviour and isn't
  `tested_by` (`scenariosToWrite`), at most 6 at once (`GENERATE_AT_ONCE`; the server allows as many per session,
  `AiLimits`, and 150 generates per hour).
- **What each call gets and is checked against:** the whole analysis, with "Write tests only for scenario S2 "…", at
  most N tests" in its task (N = 6 / the number of calls, at least 1). Its checks and repairs are against its
  scenario's part of the analysis (`analysisFor`: its paths, outcomes and classes).
- **The merge:** worlds with the same name are told apart ("… 2"), duplicates across the calls are left out, and the
  coverage plan is computed for the whole analysis. The `tested_by` scenarios and their outcomes are deferred as
  `tested by "<their tests>"` (`testedDeferrals`).
- **When a call fails:** one refused as `busy` (more at once than the server allows) runs again after the others,
  one after the other. Without any test, a failed call makes the whole an error ("Try again"), not "No new tests".
- **A test of another scenario** is left out with "this call writes tests only for scenario S1 (see the task)" (the
  `only` of `checkTests`), not with the other problems it would have against the wrong part of the analysis.
- **The server must match:** browser code that makes one call per scenario needs a server of contract 1.2. With an
  older server (2026-11-05: the frontend rebuilt, the jar not), two of three calls came back `busy`, and the one that
  ran wasn't told its scenario. It wrote the tests of another, all were left out, and the panel said "No new tests".
- **When nothing needs a call:** "Your tests already check what I would test".
- **Telemetry:** `ai_tests_generated` has `scenarioCalls` (per call: its tests, what was left out, repairs, calls,
  error) and `testedBy`.
- **Why:**
  - one call for all scenarios crammed unrelated ones into one world (a tunnel in a world about stopping at a wall);
  - it repeated the learner's tests and placed things off the robot's way;
  - at effort low it ran into the 32,000-token cap after 3 minutes.

  Presets: analyze and generate at `none` (generate at `low` took 2 to 3 minutes for a hard scenario;
  `docs/ai/nepo-ai-model-evaluation.md`, E8 and E9).
- **What the context pack asks:**
  - a world per scenario with only what it needs, and a start per test;
  - placement recipes counted from the start, for heading 0 (`tests.md`, "Place things from the start"): a wall
    ahead (x + 8 seen at once, x + 10 just not), a box only the LEFT or RIGHT sensor sees, dim light by a tunnel
    around the start;
  - "count from the start, never back from a thing";
  - in `simulator.md`, the sensors' zones (all three look forward).
- **Checks that fit the behaviour** (`tests.md`, "Checks"): `does` is for what lasts, from `after_ms` to the end of
  the run. A short move (a turn by an angle) fails it although the robot made it: 2026-11-05, "turns away from a box
  on its left" turned right 20° in the first 0.3 s, then stood still, and `does turns_right` from 0.3 s failed. A
  reaction to something seen is `whenever` with the sensor condition (`obstacle_left` → `turns_right`). `after` with
  `event` `obstacle` has nothing to decide for something in view from the start: an event is a change. "It doesn't
  turn" is `does stands_still`. Two checks that can't both hold (`does turns_left` and `does turns_right`; two
  `whenever` with the same condition and opposite actions) are a problem for a repair (`contradictions`).
- **A program that follows a line gets its line in every world**:
  - the browser decides from the blocks (`nepoTest.aiStrategy` `readsLineTracker`: a block that runs reads the line
    tracker, not in a switched-off block, not in a function never called; `Index.lineTracker`);
  - each scenario call says "The program follows a line (it reads the line tracker): every test starts on a line or
    close beside it …" (`followsLine`, `AiPrompts`);
  - `tests.md` has the template: each test its own line and wall;
  - a test whose start has no line within 10 cm of its line tracker goes back for a repair (`lineProblems`,
    `LINE_NEAR_CM`).

  `simulator.md` "The line tracker" says how it reads the floor: 0 % on black, about 100 % on the white band, 83 % on
  the peach floor. On a plain floor a line follower circles. Rules alone didn't make the model draw the line at
  `none` (0 of 6 tests); the sentence and the template did (8 of 8; `nepo-ai-model-evaluation.md`, E10).
- **The sensors it reads** (2026-11-06, E13): the browser finds the sensors the program's blocks that run read
  (`nepoTest.aiStrategy` `sensorsRead`: LINETRACKER, LLIGHT, RLIGHT, OBSTACLE_FRONT/LEFT/RIGHT, SOUND, KEY, IR;
  `Index.sensors`). Analyze and generate get them (`sensors`, `AiPrompts.appendSensors`), with what the program can't
  notice ("It reads no light sensor: dim light … changes nothing it reads"). Before, a line follower got a test in a
  dim tunnel: the model had taken the line tracker's "light %" for dim light.
- **Few, readable tests** (2026-11-06, `nepo-ai-model-evaluation.md` E12):
  - at most 4 scenarios, each a situation the learner would name, not one per decision outcome or input class
    (`checkAnalysis`: more than `MAX_SCENARIOS`, or two scenarios with the same outcomes, go back for a repair);
  - at most 6 tests (`MAX_TESTS`), at least 1 per scenario;
  - a line follower is tested by where it gets to: a test whose only positive checks are about steering
    ("whenever it sees the line, it turns", "always turns") goes back for a repair (`checkTests`).

  Before, a line follower got 8 tests, 7 of them about its steering.
- **No boundary value analysis** (2026-11-06, `nepo-ai-model-evaluation.md` E14): analyze gives each input dimension
  its classes only (no `boundary_candidates`), and generate takes a typical case of each class, clear of where the
  readings change (no `boundary_values`, no tests just below, at or above a threshold). `checkTests` no longer asks for
  two sides of a boundary; an older answer's boundary fields are ignored. Contract 1.3.
- **A start beside the line** (2026-11-06, E14): the recipe "A line beside the start" (`tests.md`) draws the line
  8 cm to the side the program turns to on the plain floor. A test of a class "beside the line" whose line tracker
  is on a line goes back for a repair (`lineProblems`). Before, most such tests either had a line through their start
  or the line on the side the robot turns away from, where a right program never finds it (a real session: it spun
  left for 90 s with the line on its right, and the test failed).
- **Two checks are looser than TGA §8:** a planned outcome must be an outcome of the program, not necessarily of the
  test's paths (a run takes outcomes on its way: a wall test drives with nothing ahead before it sees the wall). A
  class must be one of the analysis' (`whole`), not necessarily of the test's paths. Both had left out
  most good tests. A planned outcome that never happens still makes the test "not checked".

**The semantics of a run:**
- **Planned is not happened:** after the check run, `seenIn` counts each outcome from the run report's `trace`, where
  the simulator's record counts every decision's yes and no.
- **"Not checked" is not passed:** see `notCheckedWhy`.
- **A fix never makes a test expect less:** see `frozenProblems`.
- **The learner decides** about tests the model says are right (`program_wrong`) or may expect too much (`doubtful`).

**What the learner sees (the panel):**
- **The review list:**
  - each test's label: "Based on your description" (`learner_description`), "Suggested from your blocks"
    (`inferred_from_program`), "A safety guess" (`applicable_safety`);
  - its assumptions, in a fold-out.
- **The results:** each test's run (passed, failed, not checked, with why).
- **Kept for the analysis, not shown** (since 2026-11-05 the panel shows no coverage and no count of left-out tests: too
  much information for a learner):
  - the coverage: the outcomes the tests plan to try, those the runs took, and those the tests don't try, and why
    (deferred by the model with its reason, unsupported in the analysis, or lost because their test was left out). In
    the telemetry, in `plan` of `ai_tests_generated`, `ai_tests_checked` and `ai_tests_added`: per outcome `planned`,
    `deferred` (why not), `seen`; also `deferredInputs` and `deferredScenarios`;
  - the tests left out (with their problems: `leftOut`) and the duplicates (`duplicates`) of `ai_tests_generated`;
  - the classes and postconditions: in the telemetry and in the tests' provenance.
- **Spoken to the learner:** the model's texts (scenarios, assumptions, reasons, warnings) say "you" and "your
  program", never "the learner" (`system.md`, `tasks.md`). A fix's reason that speaks of "the learner" is sent back for
  a repair (`nepoTest.ai` `SPEAKS_OF_LEARNER`). The panel shows the model's texts in the "you" form anyway (`toYou`),
  for what slips through.

**Deliberate deviations from the specification:**
- **The UX:** the spec's popup becomes a tab of the Tests tab's side, "AI Assistant", that works only when the learner
  asks (since 2026-11-06; before, it was a panel beside the simulator, and a guess and an offer came after every changed
  run). The review and the check happen there.
- **No level:** the model never gets the level.
- **The sentence is kept** with the program, for the study (the spec: not by default).
- **The fix:** learner-initiated, inputs only, at most 2 fixes. This is the bounded correction of an invalid or
  untriggered scenario that TGA §8 allows.
- **Decision ids come from the code:** they aren't made up by the model, so they are real by construction.
- **No hash or agent echo:** the answers don't echo `schema_version`, `agent`, `robot` or `source_hash`. The browser
  binds every answer to its call (the fingerprint, the stale check before choosing), and the server adds `contract`
  to the meta.
- **The test's inputs:** a test's executable fields are its `specific_inputs`. The `realized_by` of each class links
  them.
- **No boundary value analysis** (since 2026-11-06): TGA §G1b and ORCH §6.3 step 2 ask for tests just below, at and
  above each boundary. They didn't work for us: the boundaries the model found were mostly the line's edge and the
  edge of the sensors' range, details a learner doesn't read, which a line follower crosses all the time anyway; they
  made the scenarios and tests many and in-depth, and tests close to where readings change were placed wrong more
  often. Step 2 is equivalence partitioning only, with a typical case of each class. The price: a fault exactly at a
  threshold (`>` for `>=`, 3 claps where 2 should do) is found only if a class's typical case happens to lie there.
- **Not tested:** whether the tests find seeded faults (ORCH phase 5, mutation tests). That is phase 5 of the plan,
  parked until it is discussed.

## The study's telemetry

The assistant's events go into the participant's `.jsonl` file as the level events do (`levels.telemetry` `record`;
the fields of every event there: `docs/ai/nepo-levels.md`, "Telemetry"). **Every event says whether the AI was on**
(`ai`), the level events too, so each measure can be split by condition: each test subject works with the AI both on and
off. The learner's sentences are kept word for word.

| kind | fields |
|---|---|
| `ai_switched` | `on`, `cause` (`menu`: the Edit menu; `account`: the account's switch after a login; `default`: an account never switched), `stored` (kept for the account). The switches in order give each test subject's order of the conditions |
| `ai_panel` | `open`: true when the side's tab "AI Assistant" is shown, false when another of the side's tabs is shown after it |
| `ai_asked` | the learner asked for tests: `sentence` (word for word), `level`, `before` (how many sentences they wrote before) |
| `ai_analyzed` | the analysis before the tests: `sentence`, `edpyError`, `ok`, `error` (`invalid_analysis`: still wrong after the repairs), `message`, `stale`, `decisions` (the program's: [{id, block, short, kind, outcomes}]), `status` (`ok`, `insufficient_evidence`), `analysis` (the answer), `problems` (those left after the repairs), `repairs`, `calls`, `latencyMs`, `tokens` |
| `ai_tests_generated` | `sentence`, `ok`, `error`, `message`, `stale`, `count`, `tests` (the tests offered, as test JSON, with what each is for), `status` (`generation_status`), `plan` (the coverage plan computed from the tests offered: per outcome the tests that plan it and why not; `target`, `planned`, `deferred`, `lost`, `deferredInputs`, `deferredScenarios`, `corrected`), `warnings` (the answer's warnings and consolidation notes), `unresolved` (the answer's problems left after the repairs), `repairs`, `leftOut` (the problems of the tests left out), `duplicates`, `calls` (each call's meta), `latencyMs` (all of it), `tokens` (summed) |
| `ai_tests_checked` | a run of the chosen tests (`fix` 0) or of the tests a fix fixed (`fix` 1, 2): `call` (the generate call), `ok` (false: the runner failed, `error`), `passed`, `failed`, `notChecked`, `latencyMs`, `tests` ([{name, world, outcome, state (passed, failed, notChecked), fixes, failed: the failed checks' texts, why: their verdicts' kinds, notChecked: why not checked, planned, seen: how often the run took each outcome}]), `plan` (with `seen`: all runs of the batch) |
| `ai_failed_answered` | `group` (`failed`: the tests that failed or weren't checked; `flagged`: those the model thinks right or doubtful), `answer` (`fix` or `discard`; `add` or `discard`), `fix` (the fixes before), `tests` ([{name, world}]) |
| `ai_tests_fixed` | `call`, `fix` (1, 2), `failed` (the tests sent: [{name, world, state: failed or not_checked}]), `ok`, `error`, `message`, `stale`, `count`, `tests` (the fixed tests, as test JSON), `programWrong` ([{test, world, reason}]), `doubtful` ([{test, world, reason}]), `repairs`, `leftOut`, `duplicates`, `calls`, `latencyMs`, `tokens` |
| `ai_stale` | `call`, `answer` (`write_again`, `check_anyway`): the program changed between writing and choosing the tests |
| `ai_tests_added` | `call`, `discarded` (none added), `added` ([{id, name, passed (true, false: added anyway, null: added without running), fixes, basis}]), `unticked` ([{name, world}]), `failed` (the failed tests not added: [{name, world, fixes, how: `discarded`, `left_out` or `gave_up`, reason, notChecked}]), `leftOut`, `fixes`, `worlds` ([{name, existing, tests}]), `stale`, `plan` |
| `ai_call` | the server's, see above |

Until 2026-11-06 there were also `ai_inferred` (a guess: its answer `intent`, `confidence`, `ask`, `same_as_declined`,
`not_covered`; what was shown), `ai_offer_shown`, `ai_offer_answered` (`write`, `not_now`, `never_here`, `ignored`, with
the sentence) and `ai_ask_again`; `ai_analyzed` and `ai_tests_generated` then had `intent` and `guessCall`.

**AI tests apart from the learner's own** (`attempt_ended`, `level_beaten`, `test_run`): how many there are, how many the
learner edited, copied or deleted, and how many ran and how. An AI test is a test block with provenance
(`nepoTest.aiFormat` `provenanceOf`). It was **edited** if its signature (name, run length, switch, and its meaning in
its world: start, set-up, checks, the world's things) differs from the one recorded when it was added
(`Provenance.asAdded`, `signatureOf`, `isEdited`); a test added before that was recorded says `null`. It was
**deleted** if its id is among the tests the assistant added to the program (its notes: `added`) and its block is gone.

## The test JSON (`OpenRobertaServer/src/main/resources/ai/tests.md`, `schemas/generate.schema.json`)

```json
{"worlds": [{"name": "A box on the line",
             "world": {"background": "peach", "starts": [{"id": "A", "name": "A", "x": 30, "y": 100, "heading": 0}],
                       "items": [{"id": "t1", "kind": "line", "points": [[20, 100], [260, 100]], "width": 1.48},
                                 {"id": "t2", "name": "Box", "kind": "rect", "role": "obstacle", "x": 150, "y": 95, "w": 10, "h": 10}]},
             "tests": [{"name": "Stops before the box", "scenario": "Given …, when …, then …", "start": "A", "until": null,
                        "max_time_ms": 30000, "world": [], "globals": {},
                        "checks": [{"check": "never_bumps", "item": "t2"}]}]}]}
```

- A world is the Tests tab's world (`nepoTest.sim.ts`), drawn by the model, or `"base": "existing"` (a world of the
  learner's, by its name; its tests are added to it).
- A test is a test of a world (`nepoTest_simcase`): its fields are NepoTest's (`nepo-unit-testing.md` §4.11), flat
  (`start`, `until`, `checks` without `simulation`), plus `scenario`, plus what it is for (TGA §5): `scenario_id`,
  `path_ids`, `planned_branch_ids`, `input_selection`, `expected_results`, `postconditions`, `oracle`,
  `source_block_ids`, `reason` (`nepoTest.aiFormat` `STRATEGY_FIELDS`: kept as the model wrote them, checked by
  `nepoTest.aiStrategy`; the blocks don't have them, they are in the test's provenance).
- The answer around the worlds: `generation_status`, `coverage_plan`, `consolidation_notes`, `deferred_scenarios`,
  `warnings` (`tests.md`, `schemas/generate.schema.json`). The analysis: `schemas/analyze.schema.json`.
- The learner's tests go to the model in the same format, each world with its `world`; a test may have `skip` and
  `origin: "ai"`.

## Both ways (OpenRobertaWeb)

| What | Where |
|---|---|
| the Tests tab's worlds and tests as JSON (`suiteToJson`, `testOfBlock`) | `nepotest/nepoTest.aiFormat.ts` |
| an answer made whole and checked (`checkAnswer`): its structure, every item and start of a drawn world (on the floor, kinds, roles, sizes), names (not taken), ids, roles of the items the checks name, the program's variables; `without` leaves out what has problems | `nepoTest.aiFormat.ts` |
| duplicates (`meaningOf`, `dropDuplicates`): the same floor and things (without ids and names), start pose, set-up, end of the run and checks | `nepoTest.aiFormat.ts` |
| JSON → blocks (`suiteXml`, `worldXml`, `testXml`; `addToWorkspace`: one undo step, new worlds to the right, tests of a learner's world after its tests; every ticked test runs, so no run blocks) | `nepoTest.aiFormat.ts`; `tests.controller` `addAiTests` |
| the calls and the checks of an answer: format, then NepoTest's translator in the worker (a start outside the floor or on an obstacle, …), then the testing strategy, then at most 2 repairs, then duplicates out, then the coverage plan | `nepotest/nepoTest.ai.ts` (`analyze`, `generate`, `fix`, `check`) |
| the testing strategy: the program's decisions and the short ids of its blocks, the checks of an analysis and of the tests, the coverage plan and what the runs took, "not checked", what a fix may not change | `nepotest/nepoTest.aiStrategy.ts` (`indexOf`, `checkAnalysis`, `checkTests`, `planOf`, `seenIn`, `notCheckedWhy`, `frozenProblems`) |
| what an answer is checked against: the learner's tests, the program's variables, the names taken | `tests.controller` `aiContext`, `aiTests`, `aiProgramXml` |

**Provenance:** an AI test's block keeps `{ai: {...}}` in its `data` (`provenanceOf`). The world's data stays the
drawn world, so editing the world keeps the provenance. It holds:
- `call`: the call's id (`callId` of its `ai_call`: generate, or the fix that fixed it);
- `block`: the block's id when it was added (a copy has another id);
- `scenario`;
- `generated`: the test as the model wrote it, with what it is for;
- `added`, `asAdded`;
- `checked: {passed, fixes, notChecked}`: how it ran before it was added;
- `coverage: {planned: [{outcome, block, words}], seen: {outcome: times}}`: the outcomes of the program's decisions its
  run should take, with their blocks' own ids, and how often its check run took each;
- `basis`: where its expectation comes from;
- `stale`: it was checked anyway after the program changed.

## Checked (2026-11-03)

- **Server:** `AiServiceTest` (12, against a fake DeepSeek), `AiPromptsTest` (6), `EnvFileTest`; the whole
  OpenRobertaServer suite (72).
- **Blocks → JSON → blocks:** the line follower's suite (`NepoTest/examples/line_follower_with_tests.xml`) gives the
  same JSON and, through `blocks.py`, the same tests again (headless Chrome).
- **JSON → blocks → JSON:** `NepoTest/tests/test_ai_format.py`: the blocks `suiteXml` made of the context pack's
  examples and of an answer with every check and set-up translate back to the answers' tests. Its fixture
  `NepoTest/tests/data/ai_format.json` was made in the browser: for each answer, `checkAnswer(answer, ctx).worlds` and
  `suiteXml(worlds, 'fx', provenance)`. Make it again when `nepoTest.aiFormat` changes.
- **The context pack's examples** run on the simulator, all six of their tests pass.
- **Live:** a broken answer (8 problems: a start, a role, an item, a condition) came back repaired in one call; infer
  and generate on the line follower without a level, the tests added in one undo step with their provenance, run on
  the simulator (the line tests pass; "stops before the box" fails, as it should: the program has no obstacle stop).

**Phase 3 in headless Chrome (2026-11-03, the line follower and a "drive to the wall" program, level "Drive to the
goal"; with the guess and the offer, gone since 2026-11-06):**
- **The switch:** switched on in the Edit menu, the panel shows, and the scene moves left to make room for it. The
  server stores the switch for the account; after a reload and a new login it is on again. With nobody logged in, the
  switch holds for the page and makes no server call. The panel is hidden while the AI is off and while a level is
  tried from the Level designer.
- **Changed and unchanged runs:** a 1-second run showed "thinking" from Play, and the offer 1.4 s after the stop. An
  unchanged run and a run after moving two blocks made no call.
- **"Not now":** after it, two changed runs (other speeds) got a guess but no offer. The third changed run (a new
  program, driving to the wall) brought the offer back.
- **Writing tests:** with a sentence, 2 tests came in 13 s. One was unticked, so 1 was added, in a new world, with its
  provenance, and no test ran. "Open Tests tab" opened the Tests tab. Without a sentence, 3 tests came in 17 s and
  "Discard" added none.
- **The sentence** was autosaved with the program, came back after the reload, and was sent as `said` with the next
  guess.
- **The other states:** switching off during a guess dropped its answer; a (faked) timeout showed "Try again", which
  worked; "Don't ask on this level" stopped the calls on the level, and "Suggest tests again" brought them back.

**Phase 4 in headless Chrome (2026-11-03, with the guess):** one session of the test account wrote 41 events of 13 kinds. Every one
of them had `ai`: `level_opened` before the login said false; after the account's switch came in, every event said
true; after "AI test assistant" was switched off, `ai_switched` and the run's `attempt_started` and `attempt_ended`
said false. The new kinds were all there:
- `ai_switched` twice: from the account at the login, and from the menu;
- `ai_inferred` five times, with tokens and latency;
- `ai_offer_shown` and `ai_offer_answered`, with all four answers: ignored (replaced by a changed run, with the
  sentence typed but not sent), write, never_here and not_now;
- `ai_tests_generated` (3 tests in 27 s) and `ai_tests_added` (2 ticked, 1 unticked);
- `ai_ask_again`;
- `ai_call` six times, with `ai` true.

Of the two AI tests added, one was edited and one deleted. The next `attempt_ended` counted 1 AI test, 1 edited and 1
deleted. The Test runner's `test_run` said that 1 AI test ran (edited) and passed.

**The check and the fix in headless Chrome (2026-11-03, the line follower without an obstacle stop, level "Test"):**
- **With faked answers** (every way through, no call reached DeepSeek): 1 of 2 passed, the failed one was fixed and
  passed, the model's "the program is wrong" was added anyway or discarded; a test still failing after 2 fixes was
  given up and none added; the runner failing ("Add them without running": `passed: null`); a failed test discarded.
  The provenance of the added tests says how they ran; the Tests tab ran none of them. The telemetry had every new
  event, each with `ai`.
- **Live:** with the sentence "This program should follow a black line and stop if it senses an obstacle", 3 tests came
  in 12 s; 2 passed, "Stops before the box on the line" failed. "Fix it": in 2.9 s the model left it as it is, because
  the program is wrong ("Your program only reads the line tracker, never the obstacle sensor, so it cannot stop at
  obstacles - but you said it should."). "Add anyway" added all 3.
- **Live, tests that are wrong** (faked generate, real fix): of "Quickly along the line" (3 s) and "From B on the line"
  (B 20 cm beside the line), the model gave the first 60 s, which made it the same as a test that had passed (left
  out, with the reason), and moved B; that still failed, and the second fix drew a straight line with B on it, which
  passed. 32 s and 18 s; about 14,000 tokens in, 12,700 of them cached.
- **Live, with example 4 in the pack:** "drive forward" in a loop, the sentence "The robot should drive forward and stop
  in front of a wall": 3 tests in 18 s, 1 passed. In 2 s the fix left both stop tests as they are ("your program only
  drives forward and never reads the obstacle sensor, but you said it should stop in front of a wall"); "Add anyway"
  added all 3, 2 of them with `passed: false`. (Without the loop, the program ends at once and the robot never moves,
  so "stops before the wall" passes: a run ends with the program.)

**The testing strategy (2026-11-04):**
- **Server:** `AiPromptsTest` (8) and `AiServiceTest` (14), which now include analyze, the decisions, the analysis in
  generate, `doubtful`, `no_valid_scenarios`, the start block's data left out and the block ids kept.
- **NepoTest:** 153 tests, with the fixture made again from the new examples.
- **The context pack's examples** were made by scripts from one source and checked in the browser:
  - no problems from `checkAnalysis`, `checkAnswer`, the translator or `checkTests`;
  - all their tests pass on the simulator, and every run takes the outcomes its test plans;
  - example 4's run texts were written by `resultText`, with the planned outcomes.
- **Headless Chrome, faked answers** (strict: a call with no faked answer fails, none reached DeepSeek):
  1. **The happy path:**
     - the review shows the labels, the assumptions and "Plans to try 3 of 3 outcomes";
     - the model got the decisions and the short ids, generate got the analysis;
     - all 7 tests passed and were added, their provenance with the planned outcomes (the blocks' own ids) and those
       seen.
  2. **Repairs:**
     - an analysis missing an outcome and naming `D7.1` was repaired;
     - an answer was repaired too, with these problems: a check index that doesn't exist, a negative-only test, a
       class that isn't the analysis', a class not tested, a boundary with no side tested (boundaries were checked
       until 2026-11-06).
  3. **Not checked:**
     - a test that passed in a world without an obstacle was shown as not checked, with "?", "nothing to decide for …"
       and "[if …] condition 1 holds: never happened", and "Seen in the runs: 2 of 3";
     - the fix that dropped its `whenever` was sent back (it "changed postconditions, checks");
     - the fix that drew a box passed and was added.
  4. **Doubtful:** "This test may expect more than you said: …", then "Add anyway": added with `passed: false`.
  5. **Stale:** the program was changed in the review. "Your program changed", then "Check them anyway" added them
     with `stale`; "Write them again" analysed the changed program anew.
  6. **Insufficient evidence:** "Nothing to test yet" with the analysis' reason.
  7. **Nine tests:** "at most 8" sent back.
- **Live (DeepSeek, effort low; 2026-11-04, with boundary value analysis, left out since 2026-11-06):**
  - **Example 1's line follower, with example 1's sentence:** 7 tests in 26.5 s for analyze and generate, all passed,
    every planned outcome seen. The model copied example 1's answer.
  - **The same program without a sentence:** again example 1's tests, now all labelled "Suggested from your blocks"
    (`inferred_from_program`).
  - **A new program, drive forward and turn right 90° at a wall** ("The robot drives forward and turns right when it
    gets to a wall."): 4 tests in 48 s:
    - the nominal case;
    - the class "nothing in the way";
    - the obstacle sensors' range just inside (8 cm) and just outside (10 cm);
    - all passed, with 2 of 2 outcomes planned and seen.
  - **The clap counter** (`NepoTest/examples/clap_counter.xml`, "After I clap three times, the robot drives
    forward."):
    - The first try was cut off: analyze spent all 16,000 tokens reasoning. Since then analyze, generate and fix get
      32,000 tokens and 180 s, and analyze leaves the checks to generate.
    - Then 4 tests in 145 s:
      - no claps (it waits);
      - the whole-number boundary: 2 claps (it still waits), 3 (it drives to the goal) and 4;
      - 4 of 4 outcomes planned and seen.
    - "After two claps, it still waits" failed. The fix kept it as `program_wrong`: in the simulator one clap is heard
      for a moment and counted more than once, so two claps reach the count of three.
    - The first analysis listed a loop's outcomes once per round and was repaired. `tasks.md` now says each outcome
      once.
    - The next run (107 s, no repair) had only 2 tests: it deferred two claps "because one clap reaches three". That is
      weakening at generation time: two claps can be set up; it is the program that would fail.
      `tests.md` and `tasks.md` now say to defer only what can't be set up or decided, never because the program
      would fail.
    - The run after that (123 s) gave 4 tests:
      - 2, 3 and 4 claps;
      - a timing boundary: three claps 0.2 s apart, while a clap is heard for 0.3 s;
      - "Two claps are not enough" failed, and the fix kept it as `program_wrong`, for the same reason as above.

## Open points

- **Earlier sentences count.** Every call gets the learner's last 5 sentences ("What the learner said before"), so a
  sentence about an earlier version of the program can colour the analysis of a rebuilt one. Seen on 2026-11-03, with
  the guess: after "drive to the wall and stop", the program was rebuilt into a line follower, and the guess stayed
  "drive to the wall".
- **A sentence about one part** ("test that it stops at the wall") still gets the whole program analysed: every
  outcome must lie on a scenario's path, so the scenarios cover the rest too, and generate writes tests for them
  unless the learner's tests test them.

- The model takes the worked examples as models: given the same sentence as example 1, it drew nearly the same
  worlds. Keep the examples varied.
- Whether a start really is on the line a scenario means can't be checked; the review list (phase 3), the check run
  and the learner catch that.
- **A fix can only judge from the learner's words.** Where the sentence says nothing, "the program is wrong" rests on
  the analysis' guess of the intent. (A fix can no longer make a test weaker: since 2026-11-04 it may change only the
  test's inputs.)
- **Coverage counts the decisions the simulator instruments:** if / else if / else, wait until, repeat while / until.
  Not counted: a function's conditional return (`robProcedures_ifreturn`), counting loops (`repeat n times`), and the
  parts of a condition (`and`, `or`: branch, not condition coverage). The coverage seen counts only the runs of the
  tests the learner chose.
- **Writing takes two calls:** analyze (at low), then generate (at none since 2026-11-05). That is about 67 s at
  DeepSeek and 93 s at UCloud (medians); with both at low it was about 2 and 2¾ minutes. At low, an analysis is 6,000
  to 26,000 output tokens, because the model reasons long before it answers; one took 147 s at DeepSeek. The panel
  says "Usually under a minute" (with analyze and generate at none, about 35 s); for a fix (still at low), "Usually under a minute, sometimes up to 3" (fixes took 2
  to 33 s, but one took 177 s at DeepSeek, 28,800 tokens, near both the token cap and the timeout). At UCloud, low
  and high make no measurable difference.
- **No boundary tests:** since 2026-11-06 the tests take a typical case of each input class. A fault right at a
  threshold (an off-by-one in a comparison, a count of 3 that should be 2) can pass them all; the learner can add such
  a test in the Tests tab. (Before, at effort none, the test at exactly the count of 3 claps was missing in 3 of 4
  runs anyway: `docs/ai/nepo-ai-model-evaluation.md`.)
- **A deferral is judged only by its reason:** the code checks that every outcome and class is tested or deferred with
  a reason, but not whether the reason is sound. The rule against deferring what the program would
  fail is in the prompt only.
