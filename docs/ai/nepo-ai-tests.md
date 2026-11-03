# The AI test assistant: tests written by DeepSeek

When a learner runs a changed program on a level, the assistant guesses what the program is meant to do and offers
to write **scenario-based simulation tests** for it. The learner can say in one sentence what the program should do.
The tests become ordinary blocks in the Tests tab. This document covers what is built so far: the calls through the
Lab server (phase 1) and the test JSON both ways (phase 2). The assistant's panel (phase 3) and its telemetry events
(phase 4) come later.

## What the model gets, and what it doesn't

- **It gets** the learner's program (its NEPO XML and its EdPy), the learner's tests (as test JSON), the learner's
  earlier sentences about the program, and the task (infer or generate, with the guess and the learner's sentence).
- **It never gets the level** the learner plays: no title, instructions, time limit or world (lines, areas, obstacles,
  starts). Tests made from the level would give its solution away and test the level instead of the learner's idea.
  The model draws the world of each test itself, or adds tests to one of the learner's worlds. The level's id goes
  along only to be logged (`levelId`); `AiPrompts` reads nothing else of the data. `AiServiceTest
  theModelGetsNothingOfTheLevel` sends a level and checks that none of it reaches DeepSeek, and `AiPromptsTest`
  checks that the context pack never mentions levels.

## The calls (OpenRobertaServer)

| What | Where |
|---|---|
| REST: `POST /rest/ai/infer`, `POST /rest/ai/generate` (the usual request envelope; the response has `answer`, `meta`, or `aiError` and `aiMessage`) | `javaServer/restServices/all/controller/AiController`, `AiResponse` |
| the calls: limits per session (one of each kind at a time; 60 infers, 30 generates per hour), the context pack first, the answer checked for its shape, the `ai_call` event | `ai/AiService` |
| the per-call message (`## The program`, `## The learner's tests`, `## What the learner said before`, `## Task: …`), the trimming of NEPO XML and EdPy, the answer checks | `ai/AiPrompts` |
| DeepSeek's chat API: JSON mode, reasoning effort, timeouts (infer 20 s, generate 90 s), one more try after 429, 5xx or no connection | `ai/DeepSeekClient` |
| the context pack: the system prompt, its `promptVersion` (hash) | `ai/ContextPack`, `src/main/resources/ai/` (`pack.txt` lists the files) |
| `.env`: `DEEPSEEK_URL`, `DEEPSEEK_MODEL` (`deepseek-flash`), `AI_TESTS_DEFAULT`, `AI_PACK_DIR` (read at every call: change the prompt without a rebuild), `AI_EFFORT_INFER`, `AI_EFFORT_GENERATE` (default low) | `main/EnvFile`, `ai/AiSettings`, `openRoberta.properties` |
| the API key `DEEPSEEK_API_KEY`: read on its own (`EnvFile.secret`), never a server property (those are logged), never logged, never sent to the browser | `ai/AiSettings`; `AiServiceTest theKeyIsNeverLoggedAndNeverLeavesTheServer` |
| the browser learns `server.ai = {available, default}` | `ClientInit` |

Every call, failed or not, is a line `kind: "ai_call"` in the participant's telemetry file (`LevelsController.writeTelemetry`):
`callId`, `call`, `level` (the id; logged only), `fingerprint`, `model`, `effort`, `promptVersion`, `status`, `error`,
`httpStatus`, `attempts`, `latencyMs`, `tokens` (`in`, `cached`, `out`, `reasoning`), `finishReason`, `prompt` (the
per-call message), `repair` (the problems sent back, if any), `answer` (the raw answer) and `reasoning` (the model's,
at most 20,000 characters).

Measured on 2026-11-03 (`deepseek-flash`, a prompt of about 12,700 tokens, 12,400 of them cached from the second call
on): infer 3 to 5 s; generate 7 to 18 s at effort low, 71 s at high; a repair 4 s.

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
| JSON → blocks (`suiteXml`, `worldXml`, `testXml`; `addToWorkspace`: one undo step, new worlds to the right, run blocks under the start block, tests of a learner's world after its tests) | `nepoTest.aiFormat.ts`; `tests.controller` `addAiTests` |
| the calls and the checks of an answer: format, then NepoTest's translator in the worker (a start outside the floor or on an obstacle, …), then at most 2 repairs, then duplicates out | `nepotest/nepoTest.ai.ts` (`infer`, `generate`, `check`) |
| what an answer is checked against: the learner's tests, the program's variables, the names taken | `tests.controller` `aiContext`, `aiTests`, `aiProgramXml` |

**Provenance:** an AI test's block keeps `{ai: {call, block, scenario, generated, added}}` in its `data` (`provenanceOf`):
the call's id (`callId` of its `ai_call`), the block's id when it was added (a copy has another id), the scenario and
the test as the model wrote it. The world's data stays the drawn world, so editing the world keeps the provenance.

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

## Open points

- The model takes the worked examples as models: given the same sentence as example 1, it drew nearly the same
  worlds. Keep the examples varied.
- Whether a start really is on the line a scenario means can't be checked; the review list (phase 3) and the learner
  catch that.
