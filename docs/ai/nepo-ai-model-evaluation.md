# Evaluation of the AI test assistant's model APIs and reasoning efforts (2026-11-05)

The AI test assistant (`docs/ai/nepo-ai-tests.md`) can call the same model, DeepSeek-V4.1-Flash, at two APIs:
- **DeepSeek's own API** (`https://api.deepseek.com`, model `deepseek-flash`);
- **SDU's UCloud** (`https://ai.cloud.sdu.dk/v1`, model `deepseek-ai/DeepSeek-V4.1-Flash-1017`), which the university provides.

This document records the tests we ran on 2026-11-05, to decide two things:
1. which API to ask first;
2. which reasoning effort to use for each call.

The four calls are:
- **infer:** guess what the program is meant to do;
- **analyze:** the program's decisions, paths and input classes (and boundaries, until E14);
- **generate:** write the tests from the analysis;
- **fix:** repair tests that failed.

It gives the method, the results and a discussion, including why one model behaves differently at the two APIs. The
raw data and scripts are listed at the end.

**Decision** (see "Decisions"):
- DeepSeek's own API is asked first, and UCloud is the backup.
- The efforts for both: infer `low`, analyze `low`, generate `none`, fix `low`.

## Method

**What was sent.** Every call was a replay of a real call of the Lab, from the study's telemetry. The test accounts'
logged per-call prompts were sent unchanged:
- the program, its decisions, the learner's tests and sentences;
- for generate, the analysis;
- for fix, how the tests ran.

They came after the current system prompt, the context pack, version `bf36cb82ed98`, about 32,000 tokens, which is
the version the live Lab used that day. The request body was the Lab's own:
- JSON mode (`response_format: json_object`), not streamed;
- `max_tokens` 4,000 for infer and 32,000 for the other calls;
- `reasoning_effort` as stated in each experiment;
- no temperature, so each API's default.

**Two programs:**

| | Program A: clap counter | Program B: line follower |
|---|---|---|
| From | test account `leveltester` | test account `nick` |
| What it does | waits for 3 claps, blinks, drives forward | follows a black line and stops at an obstacle |
| Decisions | a `repeat while` and a `wait until`: 4 outcomes | 4 ifs: 8 outcomes, 6 targeted by the analysis |
| The learner's sentence | "After I clap three times, the robot drives forward." | none |
| Logged calls (telemetry lines) | infer 472, analyze 476, generate 478, fix 483 | infer 73, analyze 78, generate 83 |

**How accuracy was measured:**
- **infer:** whether the guessed intent names the program's behaviour, and whether the model offers to write tests.
  The expected behaviour: for A, three claps then driving; for B, following the line and stopping at an obstacle.
- **analyze and generate:** whether the first answer passes **the Lab's own checks**. These are `checkAnalysis` and
  `checkTests` in `nepoTest.aiStrategy.ts`, ported to Python. They check:
  - every decision of the program with exactly its outcomes, and every supported outcome on a path;
  - paths and scenarios that name each other;
  - each test's scenario, paths, planned outcomes, input classes and boundaries taken from the analysis;
  - expected results, postconditions and the oracle;
  - a positive check, and at most 8 tests;
  - every outcome, class, boundary side and scenario tested or deferred.

  Not ported: whether the items a test's inputs name exist in its world, and the test JSON's format check.

  The port was validated on the logged answer of line 83. It found the same per-test problems as the Lab (`planned
  D1.else not on its paths`, `dimension not of its paths`) and the same answer-wide gaps (`validity-check/`).

  A test with a problem is left out by the Lab unless a repair fixes it. Repairs (up to two) were not evaluated: all
  numbers are for the first answer.
- **fix:** which verdict the model gives for each failed test. In program A, the test "Two claps are not enough"
  failed because the simulator hears one clap several times, so the expected verdict is `program_wrong`.

**Load:** the calls ran several at a time, as during a study. The column "at once" gives how many ran together per
API. Times are the wall time of one call, the same as `latencyMs` in the telemetry.

## Experiments and results

### E1: Does the Lab's code work with UCloud at all?

A probe sent the Lab's request shape to UCloud.

**Findings:**
- **Configuration:** the API is OpenAI-compatible at `https://ai.cloud.sdu.dk/v1` (the code adds `/chat/completions`).
  Without `/v1` it answers `404 page not found`, and the default model `deepseek-flash` gets `404 Model not found`.
- **Supported:** JSON mode, `max_tokens` 32,000 and `reasoning_effort` are accepted.
- **Different fields:**
  - the reasoning comes as `reasoning`, not `reasoning_content` as at DeepSeek, so the code reads both now;
  - the cached prompt tokens come in `prompt_tokens_details.cached_tokens`;
  - there are no reasoning tokens in the usage, which the telemetry now records as `null`.
- **The first token** was rejected with `403 Invalid key`, the same answer as for no key at all. The second token worked.

### E2: UCloud with real-size prompts

Replays of program A, compared with DeepSeek's logged calls of 2026-11-04.

| Call (UCloud, low) | Time | Output tokens | DeepSeek's logged call |
|---|---|---|---|
| infer, alone | 1.7 s (×2) | about 200 | 6.3 s |
| analyze, alone, streamed | 75.3 s, first token after 0.5 s | 15,087 | 22.6 s, 4,666 |
| analyze, alone | 81.8 s | 15,557 | |
| generate, alone, streamed | 91.8 s | 18,943 | 90.4 s, 19,503 |
| fix, 4 at once | 13.5 s | 1,665 | 20.9 s, 3,446 |

All answers were valid JSON, and the analysis had the same decisions, outcomes and paths as DeepSeek's.

UCloud produced about 200 output tokens per second, as DeepSeek did. A first run of four calls at once lost three
connections at 330 s, all at the same moment. The laptop running the test had gone to sleep, and the rerun below had
no failures.

### E3: UCloud against DeepSeek at effort low

Program A, three rounds of infer, analyze, generate and fix on both APIs at once (4–5 calls per API at once), plus one
analyze at high per API.

| Call | DeepSeek: times (output tokens) | UCloud: times (output tokens) |
|---|---|---|
| infer | 3.0, 2.3, 2.3 s | 2.1, 2.0, 2.3 s |
| analyze | 38.7, 46.5, 56.4 s (6,897; 8,849; 9,780) | 81.4, 66.8, 75.7 s (15,465; 12,741; 14,295) |
| analyze, high | 81.2 s (14,678) | 56.0 s (9,980) |
| generate | 62.0, 73.5, 61.6 s (12,225; 14,491; 11,477) | 52.1, 77.8, 68.3 s (9,221; 15,119; 12,675) |
| fix | 29.1, 13.6, 24.0 s | 32.9, 7.2, 24.2 s |

Quality was the same on both:
- every analysis had exactly the program's decisions and every outcome on a path;
- every generate answer planned all 4 outcomes, with tests of 2, 3 and 4 claps (below, at and above the program's
  count of 3);
- every fix said `program_wrong`, with a reason that speaks to the learner ("you said …");
- only DeepSeek's analyze at high once wrote "the learner".

A single extra fix at UCloud (in E2's rerun) said `doubtful` instead, so verdicts vary between runs.

### E4: What `reasoning_effort` does at UCloud

**Accepted values.** UCloud accepts `none`, `low`, `high` and `max`. It refuses `minimal`, `medium`, `xhigh`, `off`,
`LOW` and an empty value with `400 Unsupported reasoning effort`, so it reads the field. Unknown fields, such as
`thinking`, `chat_template_kwargs` or a made-up field, are accepted and silently ignored.

**On a small puzzle** (three runs per variant; the answer, 800, was right in every run):

| Variant | UCloud output tokens (median) | DeepSeek output tokens (median) |
|---|---|---|
| no effort | 392 | |
| `low` | 328 | 252 |
| `high` | 325 | 343 |
| `none` | 7, no reasoning | |
| `thinking: disabled` / `chat_template_kwargs: {thinking: false}` | 308 / 401: no effect | |
| a made-up field | 317: ignored | 240: ignored |

A one-line prompt rises step by step at UCloud: none 9, low 37, high 71, max 94 tokens.

**On the real analyze** (program A, UCloud):
- low, 7 runs: 9,176 to 22,034 output tokens, median 15,087 (55–116 s);
- high, 5 runs: 6,644 to 26,843, median 10,081 (37–142 s).

The difference between low and high is lost in the variation between runs. At DeepSeek, low gave 6,897 to 26,503
(median 9,780, 5 runs) and high 14,678 (1 run).

### E5: Effort low against none on both APIs

Programs A and B, each call twice per API and effort: 48 calls.
- infer: all 16 calls at once;
- per program: analyze and generate together, 8 calls per API at once.

Generate got the analysis logged in its prompt (DeepSeek's, of 2026-11-04 and 11-05), so it is judged on the same
analysis everywhere. Every call answered.

**infer** (A: two runs; B: two runs)

| | DeepSeek low | DeepSeek none | UCloud low | UCloud none |
|---|---|---|---|---|
| Time | 6.7, 8.2; 6.4, 6.3 s | 5.5, 6.1; 6.3, 5.1 s | 8.4, 7.9; 9.4, 3.3 s | 7.1, 7.1; 2.2, 2.3 s |
| Output tokens | 190–387 | 59–74 | 255–552 | 68–76 |
| Right intent and offer | 4/4 | 4/4 | 4/4 | 4/4 |

At `none` the guesses were a little looser. Two UCloud guesses added what the program doesn't do: "without bumping
into obstacles" and "to the goal".

**analyze**

| | DeepSeek low | DeepSeek none | UCloud low | UCloud none |
|---|---|---|---|---|
| Time, A | 146.6, 81.7 s | 14.6, 14.0 s | 85.4, 50.5 s | 15.0, 8.6 s |
| Time, B | 50.0, 33.5 s | 12.0, 13.0 s | 55.5, 70.8 s | 16.6, 15.2 s |
| Output tokens | 5,664–26,503 | 1,112–1,940 | 7,866–14,329 | 991–2,233 |
| Valid without a repair | 3/4 | 4/4 | 4/4 | 1/4 |
| Decisions exactly right | 4/4 | 4/4 | 4/4 | 4/4 |
| Paths (A; B) | 3, 4; 3, 2 | 2, 2; 4, 4 | 3, 3; 2, 2 | 1, 1; 5, 2 |

The problems UCloud's `none` analyses had were:
- a path naming the same outcome twice;
- a scenario naming another scenario's path;
- a path's testability missing.

**generate**

| | DeepSeek low | DeepSeek none | UCloud low | UCloud none |
|---|---|---|---|---|
| Time, A | 53.7, 90.6 s | 16.5, 17.1 s | 151.4, 108.4 s | 15.9, 19.1 s |
| Time, B | 92.2, 132.0 s | 8.3, 19.8 s | 118.0, 118.3 s | 20.0, 16.6 s |
| Output tokens | 9,198–24,601 | 580–3,722 | 17,835–26,590 | 1,657–2,416 |
| Valid tests, A | 8/8 | 6/6 | 6/7 | 5/6 |
| Valid tests, B | 2/9 | 5/7, and one run with no tests | 2/8 | 4/6 |
| Answer-wide problems per run (A; B) | 0, 0; 2, 0 | 0, 0; 18 (no tests), 3 | 0, 0; 1, 7 | 0, 1; 6, 3 |
| A: tests the count of 3 claps exactly ("at") | 2/2 runs | 0/2 | 2/2 | 1/2 |

In program B, most tests at every effort and on both APIs broke the same two rules:
- a test plans an outcome that isn't on its paths (`D1.else` for the obstacle tests);
- a test uses an input dimension that isn't one of its paths'.

### E6: The live Lab (2026-11-05, 18:49–18:58 UTC)

A session with the Lab itself (test account `nick`, program B) showed three problems the replays couldn't show:
1. **Java didn't trust UCloud's certificate.** Every call to UCloud failed in about 1.1 s with `PKIX path building
   failed`, and DeepSeek answered instead. The Lab ran on JDK 13.0.2, which doesn't trust HARICA, the authority that
   signs UCloud's certificate (via GÉANT TLS RSA 1). Python and curl use Windows' certificates, so they never saw this.
   **Fixed:** the AI's calls also trust the HARICA root, which ships with the server.
2. **A repair was refused,** so tests were lost.
   - The generate answer (90.9 s) had 3 tests; the Lab found problems in 2 of them, the same two rules as in E5.
   - Its repair was refused by the server at once (`too_large`): one problem text was 336 characters, and the limit was
     300.
   - So both tests were dropped, and 1 test was left, planning 1 of 8 outcomes.

   **Fixed:** long or many problems are now shortened, not refused.
3. **The fix took 177 s** at low (28,783 output tokens), close to both the 180 s timeout and the 32,000-token cap.

### E7: Tests that repeat the learner's

In a later session (program B, extended with dim light and side walls), two of the four new tests repeated the
learner's own line-following tests:
- the same world and checks;
- starts only 0.1 to 2 cm from theirs.

Infer had correctly named what was missing (`not_covered`: turning away from walls in dim light). That sentence was
never passed on, though, so generate wrote tests for the whole intent again. The existing duplicate check only catches
exact copies.

**The change:**
- `not_covered` goes to analyze and generate.
- A rule in `tests.md`: what one of the learner's tests already tests is deferred as `tested by "<their test>"`, and a
  test that differs from one of theirs only in its numbers counts as the same.

**The check:** the generate call that repeated the tests (telemetry line 129) was replayed three times each on
DeepSeek at `none`:
- with the old context pack (from git) and the old prompt;
- with the new pack and the new prompt line.

| | Tests of the line following (the learner has 2) | Deferrals "tested by" |
|---|---|---|
| Old rules | 4, 2, 1 (two named exactly as the learner's) | 0, 0, 0 |
| New rules | 0, 0 (the third answer was broken JSON) | 10 of 17, 8 of 14 |

With the new rules, the tests went to what was missing: the obstacle stop and the walls in dim light. The broken
answer led to one more change: an answer that can't be read is now asked for once more by itself (`callReadable`),
since it can't be repaired.

### E8: One generate call per scenario

**The problem.** In a session with program B, extended with dim light and walls on both sides, the single call for
all scenarios failed both ways:
- **At low:** it ran into the 32,000-token cap (analyze 173 s, generate 185 s, both `cut_off`).
- **At none, the tests were poor:**
  - they repeated the learner's tests;
  - unrelated scenarios were crammed into one world (a tunnel in a world about stopping at a wall);
  - walls were placed 20–30 cm beside the robot's way, not in front of it;
  - two tests started at the same point.

**The change:**
- Analyze (at `none`) also says which of the learner's tests already test each scenario (`tested_by`).
- Generate makes one call per remaining scenario, in parallel, at `low`. Each call is checked and repaired against
  its scenario's part of the analysis.

**The check:** the generate call that was cut off (telemetry line 208) was replayed as the Lab now makes it:
- S1 (line following) set as tested by the learner's two tests;
- one call each for S2 (stop at a wall ahead) and S3 (turn away from walls in dim light), at most 4 tests;
- two runs on DeepSeek and one on UCloud, all at once.

Analyze (line 204) was also replayed twice at `none`.

| Call | Time | Output tokens | Valid tests | Answer-wide gaps | World |
|---|---|---|---|---|---|
| analyze, DeepSeek, none | 12, 14 s | 2,741; 3,693 | `tested_by` right in both: S1 by the learner's two tests, the others none | | |
| S2, DeepSeek | 54, 63 s | 9,707; 11,785 | 2/2; 1/2 | 0; 1 | only a wall, in front of the start |
| S2, UCloud | 72 s | 12,647 | 3/3 | 0 | only a box, in front of the start |
| S3, DeepSeek | 116, 142 s | 21,162; 26,560 | 4/4; 4/4 | 0; 0 | a tunnel, walls on the correct sides |
| S3, UCloud | 187 s | 35,745 | 4/4 | 2 | a tunnel, walls on the correct sides |

Across all five calls:
- no call wrote tests for another scenario, and none repeated the learner's line-following tests;
- every test had its own start.

**Time.** The calls run in parallel, so writing takes as long as the slowest scenario. Here that is about 2 to 2½
minutes at DeepSeek. The hard scenario at UCloud (187 s) would exceed the 180 s timeout, and then be asked again at
DeepSeek.

### E9: One call per scenario at effort none, with placement recipes

Generate at `low` (E8) takes too long for the study, so generate runs at `none`. The same replay as E8 at `none`
(`e9-none-with-recipes/`):
- **Time:** every call took 13–23 s, so with the calls in parallel and analyze at `none`, writing takes about 35 s.
- **What one call per scenario fixed on its own:** no call wrote tests for another scenario, none repeated the
  learner's tests, and the wall-ahead worlds held only a wall.
- **What was still wrong:** the side walls of the dim-light scenario (walls 32 cm ahead instead of beside, a start
  that doesn't exist, four tests at one start).
- **Two over-strict checks** left out most of the tests: "planned outcome not on its paths" (a wall test plans
  "nothing ahead" while it drives up to the wall) and "dimension not of its paths" (an input of another path). They
  had left out most tests of program B in E5 too, at every effort and on both APIs.

**The changes:**
1. **The checks relaxed:** a planned outcome must be an outcome of the program, and an input class or boundary must
   be one of the analysis, not necessarily of the test's own paths. This deviates from TGA §8, which ties both to the
   test's paths. "Not checked" still shows a planned outcome that never happens.
2. **Placement recipes:**
   - **Facts in `simulator.md`:** the three obstacle sensors all look forward, and the analysis' "a wall on the
     left" is something in front of the robot's left half. The zones of LEFT, FRONT and RIGHT for heading 0 (taken
     from the simulator's geometry, `nepoTest.sim.ts`).
   - **Recipes in `tests.md`, counted from the start:** a wall ahead (x + 8 seen at once, x + 10 just not), a box
     only LEFT or RIGHT sees, dim light by a tunnel around the start.
   - **"Count from the start, never back from a thing"**, after the model drew one wall and worked the starts out
     wrongly from it.

**The check** (a script tells, per test, which sensor sees something at its start, and whether the start is in the
dark):

| Scenario, at none | Runs | Right placement |
|---|---|---|
| S3: a wall on the left / right in dim light | 3 DeepSeek (1 broken JSON), 1 UCloud | 6/6 tests: only LEFT for "left", only RIGHT for "right", all at 40 % light |
| S2: drives up to a wall | 6 | 6/6: nothing seen at the start |
| S2: right in front of the wall (after "count from the start") | 5 | 4/5 seen at once (before: 2/4) |
| S2: just out of sight | 4 | 2/4 not seen (one answer swapped near and far, one put it in reach) |

The far side of the sensors' range (x + 10 against x + 8) is the one placement the model still gets wrong at
`none`. A test placed wrong there still passes on a right program, but it doesn't test the boundary it claims.

### E10: Worlds for a line follower

In the Lab, the test "The wall already in sight, it stands still" failed. Its start stood on a plain floor, the
program's line following read 83 % there, and the robot circled on the start. The model also gave the test the start
of the other test (whose wall was 16 cm away).

The wall scenario of that run (its logged generate call) was replayed at `none`, 2 to 4 tests per run. "Line" means a
line under the start's line tracker; "seen" means the front sensors see the wall at the start.

| Change | Runs | Tests on a line | Near wall seen at once | Far / drive-up wall not seen |
|---|---|---|---|---|
| How the line tracker works (`simulator.md`), and "go through the program first" (`tests.md`) | 3 | 0/6 | | |
| The analysis' `initial_condition` and paths to include what the program needs on the way (`tasks.md`): analyze + generate | 3 | 0/6 | the analysis still said "a wall ahead" | |
| The wall recipe: "if the program reads the line tracker, a line first" | 4 | 1/9 | | |
| The server says it: "The program follows a line (it reads the line tracker): every test starts on a line …" | 4 | 6/7 | 1/3 | 4/4 |
| … and the wall recipe as a template: each test its own line and wall, the next test 30 cm lower | 4 | **8/8** | **4/4** | **4/4** |

**What worked:** at `none`, the model doesn't draw a conclusion from facts about the program ("it follows a line, so
it needs a line"), not even when the conclusion is spelled out as a rule. It does follow a sentence in its task and a
recipe with numbers.

**So the Lab now:**
- **decides itself** whether the program follows a line: a block that runs reads the line tracker, not in a
  switched-off block, not in a function that is never called (`readsLineTracker`);
- **tells each scenario call** so (`followsLine`);
- **checks every test's start:** a start whose line tracker is more than 10 cm from a line goes back for a repair
  (`lineProblems`).

### E11: "In dim light, no walls"

**The problem.** The assistant offered "In dim light, no walls, it drives on". The simulator can't make that: dim
light exists only inside a tunnel, and a tunnel always has walls. The test drew a tunnel, whose walls run beside the
robot where its forward-looking sensors don't see them. Its "drives on" was invented: the analysis' expectation was
only "doesn't bump", and the program gives no motion command there. The rule "every test needs a positive check" had
pushed the model to make one up.

**The changes** (context pack):
- `simulator.md`: dim light only inside a tunnel, which always has walls; say "nothing in front of it", never "no
  walls".
- `tasks.md` (analyze): describe situations by what the sensors see.
- `tests.md`: a positive check comes from the scenario's expected behaviour, never invented; a scenario whose only
  expectation is negative is deferred.

**The check** (analyze line 338 and generate line 341, 3 runs each at `none`):
- **Analyze:** all 3 describe it as "inside a tunnel, nothing in front". 2 of 3 mark its expectation `unknown`, so
  the Lab writes no test for it. 1 still invents "it keeps going".
- **Generate,** given the old scenario ("doesn't bump"): none of the 3 defers it. Each writes "it stays still" or
  "doesn't turn". These pass, because the program does nothing there, but they are taken from the code, not from what
  the learner wanted.

At `none` the model follows the description rule, and the analysis mostly marks the expectation unknown. It does not
reliably follow "don't invent an expectation".

### E12: Fewer scenarios, fewer tests (2026-11-06)

**The problem.** A plain line follower got 8 tests in 5 worlds, and 7 of them were about its steering ("on the black
line, it turns right", "just on / just off the white band, it turns left"), several near-copies of each other. The
analysis had made 5 scenarios: following the line, one per steering outcome, and one per boundary of the line
tracker's thresholds. One generate call per scenario then wrote each of them a world, and the calls couldn't merge
across scenarios.

**The changes:**
- **Analysis (`tasks.md`):** a scenario is a situation the learner would name, not one per decision outcome or per
  boundary; at most 4.
- **Lab checks on the analysis (`checkAnalysis`):** more than 4 scenarios, or two scenarios with the same outcomes,
  go back for a repair.
- **Generate (`tests.md`):**
  - boundary tests only where the learner would see the difference, not the line's edge or the line tracker's
    thresholds;
  - a line follower is tested by where it gets to, not by how it steers, and the Lab refuses a test whose only checks
    are about steering (`checkTests`);
  - one test per scenario is usual.
- **At most 6 tests** (was 8), at least one per scenario.

**The check:** the analysis of that run, then one generate call per scenario, replayed 3 times at `none`. DeepSeek
couldn't be reached at the time (the TLS handshake failed), so the replay used UCloud, which is also what the Lab
falls back to.

| Chain | Scenarios | Tests |
|---|---|---|
| 1 | "Follows the line", "Turns right on black" | 6: three from on, beside and far from the line, three around the dark threshold; all check that it reaches a goal |
| 2 | "Follows the line" | 2: from on the line to the goal, from beside the line |
| 3 | "Follows the line" (and one with an unknown expectation, no test) | 2: the same |

No test checked only steering (before: 7 of 8). In two of three runs the tests were exactly the two that matter.
One run still made a steering scenario, with tests around the line tracker's threshold that the new rule asks to
leave out.

### E13: The sensors a program reads (2026-11-06)

**The problem.** A line follower that reads only the line tracker got a test "In dim light, it drives straight", in
a tunnel, and one "On the dim line". The request had nothing of another program in it: no learner tests, no earlier
sentences.

The analysis had made a scenario "In between: drive straight": the line tracker reads between the program's two
thresholds. The model took that "light %" for the dim light of a tunnel, which only the light sensors on top
see. The context pack's many recipes for dim light and tunnels, written for another program, made that easy.

**The changes:**
- **The browser** finds the sensors the program's blocks that run read (`sensorsRead`).
- **Every analyze and generate call is told them** (`AiPrompts.appendSensors`), and what the program therefore can't
  notice: "It reads no light sensor: dim light, which is only inside a tunnel, changes nothing it reads … no obstacle
  sensor: it doesn't see walls or boxes … Make no scenario, world or check about what it doesn't sense."
- **`simulator.md`:** the line tracker is not a light sensor of the room; a floor of medium brightness doesn't exist.

**The check:** the chain of that run, 3 times at `none` on UCloud (DeepSeek couldn't be reached):
- no scenario about dim light, and no tunnel in any world (0 of 7 tests);
- the tests were "On the line, it follows it to the goal" and "Started beside the line, it finds it", plus one "Past
  the line's end, it drives straight".

### E14: No boundary value analysis (2026-11-06)

**The problem.** Boundary value analysis didn't work for us. The boundaries the model found were mostly the line's
edge and the edge of the obstacle sensors' range: details a learner doesn't read, and a line follower crosses the
line's edge all the time anyway. In the last real session of the tunnel level (telemetry line 420), the analysis had
6 boundary candidates, the guess offered to test "what happens right around the light level where it changes", and 2
of the 5 tests were boundary tests ("With the line just left, it turns right towards it", "Just below 45, it turns
left").

**The changes** (contract 1.3):
- **Analyze:** classes only. `boundary_candidates` and the scenario category `boundary` are gone from the schema and
  `tasks.md`.
- **Generate:** a typical case of each class, clear of where the readings change (`tests.md` step 2, `simulator.md`
  "Where readings change"). No `boundary_values`, and no recipes for "just not seen" or "just below p %". Example 1
  lost its four boundary tests (just on and just off the line's edge, the box just in and just out of range).
- **The Lab:** `checkTests` no longer asks for both sides of a boundary. An older answer's boundary fields are ignored.

**The check:** two real sessions, replayed as the Lab runs them now: infer, analyze, then one generate call per
scenario, 3 times each. On DeepSeek (UCloud didn't answer that morning), with the presets: infer `low`, analyze and
generate `none`.

| Session | Before (the session itself, old context pack) | After (3 runs) |
|---|---|---|
| Tunnel level (line 420) | 7 scenarios, 6 boundary candidates; 5 tests, 2 at a boundary | 3 or 4 scenarios, no boundary fields; 2, 0 and 0 new tests (the learner's tests already test the rest); the 2: a wall seen at once (x + 8) and one it drives up to (x + 30), each with its own line |
| Curves, a line follower (line 680) | 2 scenarios, 1 boundary candidate; 2 tests | 1 to 3 scenarios, no boundary fields; 2 tests in each run: from on the line and from beside it |

- 0 of 6 analyses had a boundary field, and no test sat at a threshold.
- The new guesses asked for situations, not thresholds: "what it does in dim light when there is no wall on its left
  or right", "a wall straight ahead while it is in dim light".
- Time at DeepSeek: infer 3 to 13 s, analyze 5 to 11 s, each generate call 4 to 6 s.

**What it found besides: a start beside the line.**
- **The finding:**
  - In 2 of 3 runs, the test "Started beside the line, it finds it" had a line drawn through its start (the recipe
    "A line through the start").
  - Where the line was beside the start, it was mostly on the wrong side: the program spins left on the plain floor,
    but the line lay on its right, copied from example 1. A right program never finds it there.
  - The user's real session with the old context pack had the same: the test failed after 90 s of spinning (line 684,
    the "turns left" outcome taken 1,800 times) and was added anyway.
- **The changes:**
  - a recipe "A line beside the start" (`tests.md`): 8 cm to the side, on the side the program turns to on the plain
    floor, read from the program;
  - example 1 says why its line is on the right;
  - a Lab check (`lineProblems`): a test of a class "beside the line" whose line tracker is on a line goes back for a
    repair.
- **The check:**
  - **The new check** flagged exactly the 3 tests with a line through their start, and none of the 3 right ones.
  - **One repair round** moved the line beside the start in all 3 (5 to 6 s each), but on the right in 2 of them.
  - **Before the side rule,** 5 of 6 lines beside a start were on the side the robot turns away from.
  - **With it** (3 more runs): one test had the line on its left, as the program needs, and the reason in its
    realization. Its start B was missing from the world, which the format check sends back. One run deferred the
    class, and one wrote no such test.
- 3 runs per session are few: these are signs, not rates.

## Summary

| | DeepSeek | UCloud |
|---|---|---|
| infer (low) | 2–8 s | 2–9 s |
| analyze (low) | median 50 s (34–147, 7 runs), 8,849 tokens | median 75 s (51–116, 11 runs), 14,295 tokens |
| generate (low) | median 74 s (54–132, 7 runs) | median 92 s (52–151, 9 runs) |
| generate (none) | median 17 s (8–20, 4 runs) | median 18 s (16–20, 4 runs) |
| **Write tests, analyze low and generate none (medians)** | **about 67 s** | **about 93 s** |
| Write tests, both low (medians) | about 2 min | about 2¾ min |

- **Speed:** generating at `none` is 4 to 5 times faster than at `low` (by the medians), on both APIs. Together with
  analyze at `low`, writing tests takes a little over a minute at DeepSeek and about 25 s more at UCloud. The
  difference is the analysis: UCloud reasons about 1.6 times as long at `low` (median 14,295 against 8,849 tokens).
- **Validity of the first answers:**
  - On the simple program A, every variant was almost always valid.
  - On program B, `low` did no better than `none`: the losses come from two rules that the model breaks at every
    effort.
  - `none` lost depth: the exact boundary of the clap count was missing in 3 of 4 runs, the analyses at `none` found
    fewer paths at UCloud, and one generate answer at DeepSeek was empty.
- **Effort semantics differ:** DeepSeek's `low` and `high` differ clearly. UCloud's don't measurably, but `none` turns
  reasoning off on both.
- **Load:** at 8 calls per API at once, UCloud's generate at low took up to 151 s and one DeepSeek analyze at low took
  147 s, both close to the 180 s timeout.

## Discussion: why does the same model behave differently at the two APIs?

Both APIs serve DeepSeek-V4.1-Flash, yet UCloud reasoned about 1.5 times as long at `low`. Its `low` and `high` made
no measurable difference, its `none` analyses broke more rules, and its answers come in other fields. Several layers
between the weights and the answer differ, and any of them changes what the model does.

1. **What `reasoning_effort` means is decided by the server, not by the model.** The model has no effort setting; it
   only sees text. Each server turns the field into something the model reads, such as an instruction in the prompt
   template or a budget for the reasoning. DeepSeek implements its own mapping. UCloud's server (the field names
   suggest vLLM) maps the field through its chat template, which accepts `none`, `low`, `high` and `max`. The
   measurements fit this:
   - `none` behaves the same on both: no reasoning, and similar token counts (analyze 1,000–2,200, generate
     600–3,700). That is what one would expect from the same weights.
   - At `low` and `high` the two differ, and only there. UCloud's `low` reasons about as long as DeepSeek's `high`.

   This is the one systematic difference we measured, and it explains most of the extra time at UCloud.
2. **The model may not be the very same snapshot.** UCloud names a dated version (`…-Flash-1017`). DeepSeek's
   `deepseek-flash` is an alias that DeepSeek can point at a newer revision without notice, and the API doesn't say
   which one answered. Identical weights can't be checked from outside.
3. **Numerics and hardware.** Providers serve large models with different precision (for example FP8 against BF16, or
   quantized weights to fit their GPUs), different inference engines and kernels, and different GPUs. Small differences
   in the probabilities change which token is sampled. Over a reasoning of 10,000 to 25,000 tokens, an early different
   token leads to a different line of thought, a different length and a different answer.
4. **Sampling defaults.** The Lab sends no temperature or top-p, so each server uses its own default. A different
   temperature changes how long and how varied the reasoning is.
5. **JSON mode is implemented differently.** vLLM usually enforces JSON with constrained decoding, which forbids
   tokens that would break the JSON. DeepSeek's JSON mode may only ask the model for JSON. Constraining what the model
   may write can change what it writes.
6. **Hidden prompt handling.** A provider may add its own system text, its own chat template or its own handling of
   the reasoning before the user's messages. We can't see either provider's.
7. **Batching makes even one server nondeterministic.** Servers batch many requests together. The order and size of
   a batch change the floating-point sums slightly, so the same prompt gives different answers even on one API. Our
   data shows this clearly. On the same prompt and API, DeepSeek's analyze at low ranged from 6,897 to 26,503 tokens,
   and UCloud's from 7,866 to 22,034. The fix verdict was once `doubtful` instead of `program_wrong`.
8. **Load and hardware explain the times, not the quality.** Both APIs produced about 200 tokens per second, so a
   longer time almost always meant more tokens, not a slower server. Under heavier load (8 calls per API at once), both
   got slower.

**What this means for the comparison:**
- Most differences in validity between the APIs are within the variation between runs of one API, because of 7. With
  two runs per variant, they shouldn't be read as "one API writes better tests".
- The differences that are systematic (reasoning length at `low`, `low` against `high`, where the reasoning appears in
  the response) come from the serving layer (1, 4, 5), not from the model.

## Threats to validity

- **Small samples:** two programs, two or three runs per variant, so medians and ranges, no statistics. The
  variation between runs is large (point 7 above).
- **Validity is not correctness.** The checks are the Lab's rules for a well-formed, complete test set. Whether the
  tests pass on a right program and fail on a wrong one was not measured; that needs the simulator in the browser.
- **First answers only.** The Lab repairs an answer up to twice. Since the fix of E6, the repairs actually happen,
  and their success was not measured.
- **Generate was judged on one analysis,** the one in the logged prompt (made by DeepSeek). That keeps generate
  comparable, but the whole pipeline at `none` was not tested.
- **Load varied** between experiments (1 to 16 calls at once), and times depend on it.
- **Test accounts' programs,** written by the developers, not by study participants.
- **The fix was tested only at `low`,** and only on program A's failed test. The fix stays at `low`.

## Decisions

Configuration (`.env`; presets in `openRoberta.properties`):
- `AI_PROVIDERS=deepseek,ucloud`: DeepSeek is asked first. UCloud is asked when DeepSeek gives no answer (no
  connection, timeout or HTTP error), and then first for 5 minutes. Reasons:
  - DeepSeek's analysis at `low` is about 25 s faster (median);
  - DeepSeek's `low` and `high` behave as documented.
- **Efforts for both APIs** (first decided after E5; changed after E8, the second list is the current one):
  - after E5: infer `low`, analyze `low`, generate `none` (4 to 5 times faster, first answers as valid as at `low`),
    fix `low`;
  - after E8, with one generate call per scenario: infer `low`; analyze `none` (12 to 17 s and good enough, while at
    `low` a hard program reasoned into the token cap); generate `low`; fix `low` (only tested there, and switched off
    in the panel);
  - after E9 (the current one): generate `none` as well. At `low`, one scenario's call took 2 to 3 minutes, too long
    for the study; at `none`, with one call per scenario and the placement recipes, the tests are placed right but
    for the far side of the sensors' range.

  The settings are `<NAME>_EFFORT_INFER`, `_ANALYZE`, `_GENERATE`, `_FIX`.
- The panel says "Usually under a minute" for writing tests, and "Usually under a minute, sometimes up to 3" for a fix.
- **No boundary value analysis** (after E14): the tests take a typical case of each input class. Contract 1.3.

Fixes from these tests: the HARICA root for UCloud (E6.1); repairs that are shortened, not refused (E6.2); the reasoning
read from `reasoning` too (E1); and the full telemetry of every call (prompts, answers, reasoning, tries, times; see
`nepo-ai-tests.md`).

## Data and scripts

Everything is in `admin/ai-evaluation-2026-11-05/`. `admin/` is not in git, so copy it with the report's material.
Each folder has the scripts and their raw outputs:

| Folder | What |
|---|---|
| `e1-compatibility/` | `sdu_probe.py` (request shape, fields), `env_as_is.py` (the wrong URL and model) |
| `e2-ucloud-real-prompts/` | `replay.py`, `replay_stream.py`, `replay_*.json`, `stream_*.json`, the logs of both parallel runs |
| `e3-ucloud-vs-deepseek-low/` | `replay2.py`, `run_all.sh`, `summarize.py`, `summary.txt`, `out/` (26 calls) |
| `e4-effort-parameter/` | `knobs.py` (the puzzle), `effort_values.py` (accepted values), `real-analyze/` (the extra analyses at low, medium, high) |
| `e5-low-vs-none/` | `replay3.py`, `run.sh`, `evaluate.py` (the port of the Lab's checks), `evaluation.txt`, `run.log`, `out/` (48 calls) |
| `validity-check/` | `sanity.py`, `sanity.txt`: the port against the Lab's verdict on a logged answer |
| `e6-live-session/` | `today.py`, `today.txt`: the live session's events; `fix_times.py` |
| `e7-learners-tests-count/` | `dup_check.py` (old against new rules), `dup_summary.py`, `summary.txt`, `out_*.json` |
| `e8-one-call-per-scenario/` | `per_scenario.py` (the replay and its evaluation), `results.json` |
| `e14-no-boundaries/` | `no_bva_chain.py` (the replay: `results.json` both sessions, `results_l2-curves_beside1.json` with the beside recipe, `results_l2-curves.json` with the side rule), `beside_repair.py`, `results_beside_repair.json` |
| `e13-sensors-it-reads/` | `sensors_chain.py`, `results.json` |
| `e12-fewer-scenarios/` | `chain.py` (DeepSeek), `chain_ucloud.py` (the run), `results_ucloud.json` |
| `e11-dim-light-no-walls/` | `dim_check.py`, `results.json` |
| `e10-line-follower-worlds/` | `line_check.py` (the rules only), `chain_check.py` (analyze + generate), `recipe_check.py` (the conditional recipe), `follows_line_check.py` (the server's sentence; `follows_line_results.json` before, `follows_line_results2.json` after the template) |
| `e9-none-with-recipes/` | `per_scenario_effort.py`, `results_none.json` (before the recipes), `per_scenario_none.py` (with them, and the sensors' zones), `results.json`, `per_scenario_s2.py`, `results_s2_count.json` (after "count from the start") |

Each raw output holds the prompt that was sent, the answer, the time and the tokens. The prompts are read from the
telemetry (`admin/levelTelemetry/`, lines as above), and the system prompt of version `bf36cb82ed98` is
`admin/levelTelemetry/ai-prompts/bf36cb82ed98.md`. The scripts read the keys from `.env` (`DEEPSEEK_API_KEY`,
`UCLOUD_API_KEY`) and never print them. No key is in any saved file (checked).
