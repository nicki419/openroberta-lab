# The AI test assistant: tests written by DeepSeek

When a learner runs a changed program on a level, the assistant guesses what the program is meant to do and offers
to write **scenario-based simulation tests** for it. The learner can say in one sentence what the program should do.
The tests the learner keeps run on the simulator first; the model fixes those that fail, or says the program is wrong.
Then they become ordinary blocks in the Tests tab. This document covers what is built so far: the calls through the
Lab server (phase 1), the test JSON both ways (phase 2), the assistant beside the simulator with its switch
(phase 3), its events in the study's telemetry (phase 4), and the check and fix of the chosen tests (2026-11-03).

## What the model gets, and what it doesn't

- **It gets** the learner's program (its NEPO XML and its EdPy), the learner's tests (as test JSON), the learner's
  earlier sentences about the program, and the task (infer, generate or fix, with the guess and the learner's sentence;
  a fix also gets its own failed tests and how they ran on the simulator, in the tests' own worlds).
- **It never gets the level** the learner plays: no title, instructions, time limit or world (lines, areas, obstacles,
  starts). Tests made from the level would give its solution away and test the level instead of the learner's idea.
  The model draws the world of each test itself, or adds tests to one of the learner's worlds. The level's id goes
  along only to be logged (`levelId`); `AiPrompts` reads nothing else of the data. `AiServiceTest
  theModelGetsNothingOfTheLevel` sends a level and checks that none of it reaches DeepSeek, and `AiPromptsTest`
  checks that the context pack never mentions levels.

## The calls (OpenRobertaServer)

| What | Where |
|---|---|
| REST: `POST /rest/ai/infer`, `POST /rest/ai/generate`, `POST /rest/ai/fix` (the usual request envelope; the response has `answer`, `meta`, or `aiError` and `aiMessage`) | `javaServer/restServices/all/controller/AiController`, `AiResponse` |
| the calls: limits per session (one of each kind at a time; 60 infers, 30 generates, 30 fixes per hour), the context pack first, the answer checked for its shape, the `ai_call` event; a fix as generate (its effort, 90 s, repairs) | `ai/AiService` |
| the per-call message (`## The program`, `## The learner's tests`, `## What the learner said before`, `## Task: …`), the trimming of NEPO XML and EdPy, the answer checks (`checkFix`: `worlds` and `program_wrong`, not both empty) | `ai/AiPrompts` |
| DeepSeek's chat API: JSON mode, reasoning effort, timeouts (infer 20 s, generate 90 s), one more try after 429, 5xx or no connection | `ai/DeepSeekClient` |
| the context pack: the system prompt, its `promptVersion` (hash) | `ai/ContextPack`, `src/main/resources/ai/` (`pack.txt` lists the files) |
| `.env`: `DEEPSEEK_URL`, `DEEPSEEK_MODEL` (`deepseek-flash`), `AI_TESTS_DEFAULT`, `AI_PACK_DIR` (read at every call: change the prompt without a rebuild), `AI_EFFORT_INFER`, `AI_EFFORT_GENERATE` (default low) | `main/EnvFile`, `ai/AiSettings`, `openRoberta.properties` |
| the API key `DEEPSEEK_API_KEY`: read on its own (`EnvFile.secret`), never a server property (those are logged), never logged, never sent to the browser | `ai/AiSettings`; `AiServiceTest theKeyIsNeverLoggedAndNeverLeavesTheServer` |
| the browser learns `server.ai = {available, default}` | `ClientInit` |

Every call, failed or not, is a line `kind: "ai_call"` in the participant's telemetry file (`LevelsController.writeTelemetry`):
`callId`, `call`, `ai` (always true: the browser calls only while the AI is on), `level` (the id; logged only), `fingerprint`, `model`, `effort`, `promptVersion`, `status`, `error`,
`httpStatus`, `attempts`, `latencyMs`, `tokens` (`in`, `cached`, `out`, `reasoning`), `finishReason`, `prompt` (the
per-call message), `repair` (the problems sent back, if any), `answer` (the raw answer) and `reasoning` (the model's,
at most 20,000 characters).

Measured on 2026-11-03 (`deepseek-flash`, a prompt of about 12,700 tokens, 12,400 of them cached from the second call
on): infer 3 to 5 s; generate 7 to 18 s at effort low, 71 s at high; a repair 4 s.

## The assistant beside the simulator (`OpenRobertaWeb/src/app/levels/levels.aiAssistant.ts`)

| What | Where |
|---|---|
| **The switch:** "AI test assistant" in the Edit menu (`#menuAiTestsItem`, Edison only), with a tick; greyed out if the server has no API key (`server.ai.available`) | `index.html`, `levels.aiAssistant` `switchTo`, `renderMenu` |
| kept per test subject on the server: `POST /rest/ai/switch` (`{on}` switches, `{}` asks; the answer `{on: true, false or null, stored}`), in `ai-switch.json` beside the telemetry, keyed as the telemetry files (`user-<id>-<account>`). A POST, as every call that knows the session. An account never switched gets the default (`AI_TESTS_DEFAULT`), or the page's switch if it was switched before logging in. Nobody logged in: the open page only | `AiController.aiSwitch`, `ai/AiSwitches`; `AiSwitchesTest` |
| **The panel** (`#aiAssistant`, class `levelSidePanel`): to the right of the scene while the AI is on and a level of the sets is played (not "Try in simulator"); the scene is centred in the rest, the level bar and its messages move over | `levels.aiAssistant` `renderVisibility`; `levels.player` `insetRight`; `roberta.css` (`#simDiv.nepoAi`) |
| **The trigger:** `attempt_started` of a level (Play). A changed program starts a guess: the fingerprint is the program's XML without ids, positions, description and tags, its top blocks sorted (moving a block doesn't count). An unchanged run makes no call. While tests are written or reviewed, a run doesn't interrupt | `levels.aiAssistant` `attemptStarted`, `fingerprint` |
| one EdPy request per attempt, shared with the telemetry | `levels.telemetry` `attemptSource` |
| **The check and the fix** of the tests the learner keeps: see below | `levels.aiAssistant` `chooseTests`, `check`, `decide`, `fix`, `finish`; `nepoTest.ai` `runTests`, `resultText`, `fix` |
| **The states:** idle, thinking (from Play, with the seconds since), the offer (the guess, an optional sentence of at most 200 characters, "Write tests", "Not now", "Don't ask on this level"), the guess alone, nothing new to test (`ask` false), writing, the review list (all ticked; untick any), checking (test i of n runs), the results (each test: passed, failed with its failed checks and why, the program's blocks as chips; the questions), fixing, done ("Open Tests tab"; the tests don't run there by themselves), no new tests, discarded, no suggestions on this level ("Suggest tests again"), an error ("Try again"). Answers that come after the AI was switched off, or after a newer run began, are dropped | `levels.aiAssistant` `render` |
| **After "Not now":** every changed run still gets a guess (with the declined one); the offer comes back only when the model says it means something new (`same_as_declined` false) and at least 3 changed runs have passed | `DECLINED_RUNS` |
| **The notes**, saved with the program as one more instance (`nepoAi_notes`, as the level progress): the learner's sentences word for word (`{text, time, level, answer: write, not_now or never_here}`, sent as `said` with later calls), the guess declined and the changed runs since, the levels it doesn't ask on, the ids of the tests it added | `nepoTest.suite` `setAiNotes`, `loadExtras`; `NepoTestSuitePersistenceTest`, `NepoTest/tests/test_blocks.py` |
| the added tests: `tests.controller` `addAiTests` (one undo step), with their provenance (the call that wrote them, and how they ran: `checked`) | `levels.aiAssistant` `finish` |

## Checking the chosen tests, and fixing those that fail

"Add n tests" in the review list doesn't add them at once: the ticked tests **run on the simulator first**, for the
program as it is in the Program tab, each in its own world (`nepoTest.ai` `runTests`: NepoTest's translator, then
`nepoTest.simRun`, as the Tests tab runs them, offscreen). The panel says which test runs. Then:

- **All pass:** they are added ("They passed on your program").
- **Some fail:** the results list each test (passed; failed, with its failed checks and why, as in the Tests tab, the
  program's blocks as chips that select them) and asks: *Should I try to fix the failed tests, or discard them?*
  ("The tests that passed are added either way").
  - **Fix:** the model gets the failed tests as it wrote them, how each ran, and the names of the tests that passed
    (the task fix, `/rest/ai/fix`). For each failed test it decides whether **the test is wrong** (its world, start,
    set-up or timing don't make its scenario happen, or it checks more than the intent) and fixes it, keeping its name
    and scenario; or whether **the program is wrong** (the test makes its scenario happen, and the program doesn't do
    what the learner said): then it leaves the test as it is and says why, for the learner (`program_wrong`), because
    a test changed until a wrong program passes it would hide the mistake. The answer is checked and repaired as a
    generate answer; also: `program_wrong` names failed tests, each once, none also fixed; a fixed test is one of the
    failed tests. The fixed tests run again.
  - **Discard:** they aren't added.
- **The program is wrong** (a test the model left as it is): the results show its reason and ask *Add it anyway? A
  test that fails shows what your program doesn't do yet.* "Add anyway" or "Discard".
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

**What the model reads of a run** (`resultText`, one item per failed test): why the run ended and when, where the
robot started and ended and how far it drove, where it was over time (at most 12 times; one entry while it stays at
the same place), how often it bumped, each check (passed, failed, not checked) with what happened, and for a failed
check of what the robot does: why (the verdict) and the facts of the second before it (sensed, ran, remembered,
did; `nepoTest.simProgram` `factLines`). The program's blocks are written as their labels in brackets
("[steer forwards speed % left 40 speed % right 10]"). The facts aren't shown to learners (GitHub issue #9), but the
model gets them. The context pack teaches the task in `tasks.md` ("Task: fix"), `schemas/fix.schema.json` and
`examples/4-fix-failed-tests.md` (one test wrong: too little time; one finding a mistake: no obstacle stop), whose
run texts were written by the browser.

## The study's telemetry

The assistant's events go into the participant's `.jsonl` file as the level events do (`levels.telemetry` `record`;
the fields of every event there: `docs/ai/nepo-levels.md`, "Telemetry"). **Every event says whether the AI was on**
(`ai`), the level events too, so each measure can be split by condition: each test subject works with the AI both on and
off. The learner's sentences are kept word for word.

| kind | fields |
|---|---|
| `ai_switched` | `on`, `cause` (`menu`: the Edit menu; `account`: the account's switch after a login; `default`: an account never switched), `stored` (kept for the account). The switches in order give each test subject's order of the conditions |
| `ai_inferred` | `level`, `fingerprint`, `ok`, `error`, the answer (`intent`, `confidence`, `ask`, `same_as_declined`, `not_covered`), `declined` (the declined guess sent) and `declinedRuns`, `shown` (`offer`, `guess`, `nothing`, `error`), `stale` (the answer came after a newer run or the switch-off: dropped), `edpyError`, the call (`callId`, `model`, `promptVersion`, `latencyMs`, `attempts`, `tokens`: `in`, `cached`, `out`, `reasoning`) |
| `ai_offer_shown` | `level`, `intent`, `guessCall` (the `callId` of the guess) |
| `ai_offer_answered` | `answer` (`write`, `not_now`, `never_here`, `ignored`), `reason` (what replaced an ignored offer: `new_run`, `switched_off`, `level_changed`, `program_loaded`), `sentence` (word for word, or null; for an ignored offer what was typed), `intent` (the guess answered), `guessCall`, `msToAnswer` |
| `ai_tests_generated` | `intent`, `sentence`, `guessCall`, `ok`, `error`, `message`, `stale`, `count`, `tests` (the tests offered, as test JSON), `repairs`, `leftOut` (the problems of the tests left out), `duplicates`, `calls` (each call's meta), `latencyMs` (all of it), `tokens` (summed) |
| `ai_tests_checked` | a run of the chosen tests (`fix` 0) or of the tests a fix fixed (`fix` 1, 2): `call` (the generate call), `ok` (false: the runner failed, `error`), `passed`, `failed`, `latencyMs`, `tests` ([{name, world, outcome, fixes, failed: the failed checks' texts, why: their verdicts' kinds}]) |
| `ai_failed_answered` | `group` (`failed`: the tests that failed; `flagged`: those the model thinks right), `answer` (`fix` or `discard`; `add` or `discard`), `fix` (the fixes before), `tests` ([{name, world}]) |
| `ai_tests_fixed` | `call`, `fix` (1, 2), `failed` (the tests sent), `ok`, `error`, `message`, `stale`, `count`, `tests` (the fixed tests, as test JSON), `programWrong` ([{test, world, reason}]), `repairs`, `leftOut`, `duplicates`, `calls`, `latencyMs`, `tokens` |
| `ai_tests_added` | `call`, `discarded` (none added), `added` ([{id, name, passed (true, false: added anyway, null: added without running), fixes}]), `unticked` ([{name, world}]), `failed` (the failed tests not added: [{name, world, fixes, how: `discarded`, `left_out` or `gave_up`, reason}]), `leftOut`, `fixes`, `worlds` ([{name, existing, tests}]) |
| `ai_ask_again` | `level`: "Suggest tests again" |
| `ai_call` | the server's, see above |

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
  (`start`, `until`, `checks` without `simulation`), plus `scenario`.
- The learner's tests go to the model in the same format, each world with its `world`; a test may have `skip` and
  `origin: "ai"`.

## Both ways (OpenRobertaWeb)

| What | Where |
|---|---|
| the Tests tab's worlds and tests as JSON (`suiteToJson`, `testOfBlock`) | `nepotest/nepoTest.aiFormat.ts` |
| an answer made whole and checked (`checkAnswer`): its structure, every item and start of a drawn world (on the floor, kinds, roles, sizes), names (not taken), ids, roles of the items the checks name, the program's variables; `without` leaves out what has problems | `nepoTest.aiFormat.ts` |
| duplicates (`meaningOf`, `dropDuplicates`): the same floor and things (without ids and names), start pose, set-up, end of the run and checks | `nepoTest.aiFormat.ts` |
| JSON → blocks (`suiteXml`, `worldXml`, `testXml`; `addToWorkspace`: one undo step, new worlds to the right, tests of a learner's world after its tests; every ticked test runs, so no run blocks) | `nepoTest.aiFormat.ts`; `tests.controller` `addAiTests` |
| the calls and the checks of an answer: format, then NepoTest's translator in the worker (a start outside the floor or on an obstacle, …), then at most 2 repairs, then duplicates out | `nepotest/nepoTest.ai.ts` (`infer`, `generate`, `check`) |
| what an answer is checked against: the learner's tests, the program's variables, the names taken | `tests.controller` `aiContext`, `aiTests`, `aiProgramXml` |

**Provenance:** an AI test's block keeps `{ai: {call, block, scenario, generated, added, asAdded, checked}}` in its
`data` (`provenanceOf`): the call's id (`callId` of its `ai_call`: generate, or the fix that fixed it), the block's id
when it was added (a copy has another id), the scenario, the test as the model wrote it, and how it ran before it was
added (`checked: {passed, fixes}`). The world's data stays the drawn world, so editing the world keeps the provenance.

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
goal"):**
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

**Phase 4 in headless Chrome (2026-11-03):** one session of the test account wrote 41 events of 13 kinds. Every one
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

## Open points

- **Earlier sentences pin the guess.** The model takes the intent from the learner's words first, so a sentence about
  an earlier version of the program decides later guesses too. Seen on 2026-11-03: after "drive to the wall and stop",
  the program was rebuilt into a line follower, and the guess stayed "drive to the wall" with "nothing new to test".

- The model takes the worked examples as models: given the same sentence as example 1, it drew nearly the same
  worlds. Keep the examples varied.
- Whether a start really is on the line a scenario means can't be checked; the review list (phase 3), the check run
  and the learner catch that.
- **A fix can only judge from the learner's words.** Without a sentence, "the program is wrong" rests on the guess. A
  fix may also make a test weaker than its scenario; the learner sees the fixed test only by its name.
