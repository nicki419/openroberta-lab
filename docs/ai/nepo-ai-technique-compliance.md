# Does the AI follow our testing techniques?

This document answers two questions about the AI test assistant (`docs/ai/nepo-ai-tests.md`) and is **updated
throughout phase 5** of the plan (measuring the quality of the generated tests). Each section says when it was last
measured. The numbers come from the telemetry and the scripts named under "How it was measured".

The two questions (2026-11-06):

1. *Check the constraints that we give the AI on the testing techniques: make sure that it follows our guidance
   (harnesses?).*
2. *How can we know for certain that DeepSeek is using the testing techniques that we tell it to use?*

Status: **phase 5: tuned once and measured again** (round 2, see "Phase 5" at the end); the false alarms left come mostly from
the broken program (see "Next (open)").
Last updated: 2026-11-07.

## The short answer

**We can't know how DeepSeek arrives at an answer, only whether the answer has the properties each technique
requires.** From contract 1.2 to 2026-11-06, every analyze and generate call ran at reasoning effort `none` (`.env`
`DEEPSEEK_EFFORT_ANALYZE` and `DEEPSEEK_EFFORT_GENERATE`), with no reasoning text; since then they run at `low`, and the
reasoning is logged, but it isn't evidence either: a model's written reasoning can differ from what actually decided its answer (Turpin et al.,
2023, "Language Models Don't Always Say What They Think"). "It uses branch coverage" can therefore only mean "its
answer has the properties branch coverage requires", and those the Lab can know for certain, because code computes
them.

The harness for this exists, in three layers:

1. **Every answer is checked by code** (`nepoTest.aiStrategy` `checkAnalysis` and `checkTests`, `nepoTest.aiFormat`
   `checkAnswer`). The problems go back to the model, at most twice (`nepoTest.ai` `REPAIRS`). A test still wrong after
   that is left out; problems of the whole answer (coverage) leave no test out, but the coverage plan is recomputed
   from the tests that are left (`planOf`) and shown. **Every test a learner sees has the per-test properties below,
   by construction.**
2. **The simulator measures what happened.** Each run counts which outcomes of the program's decisions it took
   (`seenIn`). A test that passed but never took an outcome it planned is "not checked", not passed (`notCheckedWhy`).
3. **Everything is logged**: every prompt, answer, problem sent back and run (`ai_call`, `ai_analyzed`,
   `ai_tests_generated`, `ai_tests_checked`), so compliance can be measured afterwards (this document).

What the harness can't decide is listed under "What nothing checks yet".

**After phase 5 (2026-11-07)**, on 80 requests for broken programs of the study's kind, at effort low, before and after the tuning of
the context pack (rounds 1 and 2):

1. *Does it follow our guidance?* In the answers the learner gets, yes, for everything the code checks: the Lab sent back 4 of 82
   first analyses and 27 of 188 first test answers in round 1, 6 of 82 and 29 of 186 in round 2 (mostly for how the world was drawn),
   and after the repairs every answer passed the checks. A rule only the prompt asks for broke once: an analysis saw that the program
   can't do what the learner said, and then wrote no test.
2. *Does it use the techniques?* That can't be known from the inside. Phase 5 measured whether they pay off: the same model without
   the strategy, in one plain call, did about as well in both rounds (round 2: 82 % of the broken versions caught by both, false
   alarms in 14 % against 20 % of the sets; no difference is significant). **What made the tests better was the knowledge of the
   world, not the strategy**: the tuning of the facts and recipes (where a tunnel's light changes, where the goal goes, no start
   beside the line) cut the sets with a false alarm from 40 % to 14 % and raised the good sets from 14 % to 48 %, in both pipelines.
   The quality of the tests is decided by the expected behaviour and the world drawn for it, which no technique checks.

## What the Lab enforces, measures, or only asks for

| Technique (spec) | Checked by code, every answer | Measured in the runs | Only asked for in the prompt |
|---|---|---|---|
| **Branch coverage** (ORCH §6.3 step 1) | The decisions and their outcome ids come from code, not from the model (`indexOf`). The analysis lists every decision with exactly its outcomes; every outcome it calls feasible lies on a path; every outcome on a path is planned by a test or deferred with a reason. The model's coverage plan is not trusted: it is recomputed. | Whether each planned outcome happened in its test's run | Whether a feasibility verdict or a deferral's reason is true |
| **Equivalence partitioning** (step 2) | A test names classes of the analysis' dimensions; every class has a test or is deferred; what realizes a class (`realized_by`) names a start, thing, event or variable the test has | – | Whether the classes partition the input meaningfully; whether the world really puts the robot in that class (checked only for "beside the line": `lineProblems`) |
| **Boundary values** | Left out since 2026-11-06 (contract 1.3) | – | – |
| **A complete test** (step 3) | `expected_results`; `postconditions` naming checks that exist | – | – |
| **Where the expectation comes from** (oracle provenance) | `learner_description` only with a sentence; a scenario without an expected behaviour is `unknown` and gets no test | – | Whether an expectation labelled `learner_description` really follows from the sentence |
| **Not trivial, not the implementation** | A positive check (`reaches`, `ends_in`, `does`, `whenever`, `after`, `variable`); no two checks that can't both hold; no line-follower test that only checks steering | – | Other tests that restate the program |
| **A typical case, not a borderline one** | The line distance at the start; nothing inside a narrow tunnel | – | Everything else |
| **Consolidation** (step 4) | At most 6 tests and 4 scenarios; scenarios that take the same outcomes merged; identical tests dropped (`dropDuplicates`) | – | "The same test with other numbers" |
| **A fix never weakens a test** | A fixed test keeps its checks, expected results and oracle (`frozenProblems`); the fix is switched off (`FIX_TESTS`) | – | – |

## How often DeepSeek breaks the rules (measured 2026-11-06)

First answers that the Lab sent back for a repair, sorted by the technique of the problems (an answer counts once per
technique):

| Call, contract | Sent back | For |
|---|---|---|
| analyze 1.1 | 7 of 17 | oracle provenance 6, branch coverage 3 |
| analyze 1.2 | 10 of 14 | oracle provenance 8 ("your description" without a sentence, in the time of the guess), ids 3, branch coverage 1 |
| analyze 1.4 (now) | 1 of 4 | branch coverage 1 |
| generate 1.1 | 7 of 15 | equivalence classes 7, boundaries 5, ids 3, world 3, branch coverage 2, limits 2 |
| generate 1.2 | 26 of 35 | equivalence classes 23, boundaries 17, world 12, branch coverage 2, ids 2 |
| generate 1.4 (now) | 5 of 14 | world 5 (a tunnel given the role obstacle, a thing outside the floor), equivalence classes 4 (`realized_by` naming a thing the world doesn't have) |

- **After the repairs:** 58 tests were left out and 228 kept (60 requests of generate). No analysis stayed wrong.
- **In the runs** (`ai_tests_checked`, 180 tests): 105 passed, 51 failed, 24 not checked. Of the 453 outcomes the tests
  planned, 416 (92 %) happened; 27 tests (15 %) planned an outcome their run never took.
- **Deferrals:** 323 (200 input classes, 70 outcomes, 53 scenarios). By their reasons: about 160 "already tested" (by
  the learner's tests or another new one), about 50 "can't be set up or can't happen", about 25 "you didn't say what it
  should do", and the rest other reasons.

The sample of contract 1.4 is small (14 first answers of generate, 4 of analyze). The data is the developers' and the
level tester's, not the participants'.

## What nothing checks yet

1. **Deferral reasons are free text.** Any reason passes, so a deferral satisfies "planned or deferred" without a test.
   A case: on L5 (2026-11-05 21:28, telemetry line 277) the model deferred `D6.1` and `D7.else` because "the line
   tracker never reads above 55"; the runs of the same request took both outcomes 1,413 times. Nothing flagged it.
2. **The equivalence classes are the model's own words.** The code checks that the tests and the analysis agree and
   that every class is tested or deferred, not that a class means anything or that the world realizes it (except
   "beside the line").
3. **The provenance labels are the model's word.** Whether an expectation follows from the learner's sentence is a
   judgement.
4. **"Typical, not borderline"** and **"not the implementation"** are checked only for the cases named above.
5. **Whether the tests are good**, that is, whether they fail on wrong programs and pass on right ones, is not measured
   at all. That is phase 5.

## What would close the gaps (proposed, not built)

1. **Deferral reasons from a fixed list, checked**: `tested_by` (with test names that exist), `cannot_happen` (flagged
   when a run takes the outcome), `no_expected_behaviour` (only where the scenario has none), `no_room`.
2. **A replay benchmark**: a fixed set of programs and sentences, replayed headlessly through analyze, generate, all
   checks and the runs, reporting the rates above per prompt version, so a prompt change can't lower compliance
   unnoticed. The replays so far (E13 to E15 in `nepo-ai-model-evaluation.md`) checked the format and the world rules
   only, not `checkTests`: their "no problems" says nothing about the techniques.
3. **Human rating of a sample** for the judgements (provenance, the meaning of the classes, intent rather than
   implementation): two raters, a short rubric, their agreement reported.
4. **Fault detection** (phase 5): the only evidence that the tests are good.

## How it was measured

`admin/ai-evaluation-2026-11-05/e16-compliance/audit.py` (git-ignored; read only; it never reads the API keys) reads
every `admin/levelTelemetry/*.jsonl`:
- **The problems:** a repair call (`ai_call` with `repair`) carries the problems the Lab found in the answer before it.
  The calls are grouped into chains (a first call, then its repairs) by session, account, call, program fingerprint and
  scenario, in order of time; the first repair of a chain gives the first answer's problems. Each problem text is
  sorted to a technique by its wording (`RULES` in the script). Two repair calls belong to no chain.
- **After the repairs:** `ai_analyzed` and `ai_tests_generated` (`ok`, `repairs`, `problems`, `leftOut`,
  `scenarioCalls[].dropped`).
- **The runs:** `ai_tests_checked` `tests[].planned` and `tests[].seen`.
- **The deferrals:** `ai_tests_generated` `plan` (`deferred`, `deferredInputs`, `deferredScenarios`); the reasons were
  sorted by keywords.
- Its output is `audit.json` beside it. Run it again with `python -I audit.py`.

## Phase 5

**Not built yet.** It was discussed first (decided 2026-11-03); the first decisions were made on 2026-11-06. This
section records the decisions and, later, the results.

### The study changes (2026-11-06)

Learners no longer write their programs from scratch. Each level gives them **faulty code** that they fix and write
tests for, once with the AI and once without. Each level's code is **its own function**; at the next level that
function is called in the main loop, so the learner fixes one function at a time, and the code added later must stay
compatible with the code they already fixed. Some functions may serve two levels. Phase 5 measures the AI in exactly
this situation.

### Decisions (2026-11-06)

- **What for:** the study hasn't started, so the prompt may still change, and phase 5's results may be used to tune
  it. Part of the programs is then kept out of the tuning, so the measurement isn't fitted to them.
- **The programs:** written for phase 5, not taken from the telemetry (it is all in-development testing). Per level:
  several **correct variants** (each beats the level) and **broken variants** of each (each loses it).
- **Tests written from the broken program** (design B): the AI gets a broken variant, as a learner would see it, and a
  sentence, and its tests are evaluated on every variant.
- **A good set of tests** (the user's rule): every correct variant passes every test; every broken variant fails the
  set; no broken variant passes it. The learner only ever sees one broken variant; the evaluation uses all of them.
  Reported per test too.
- **The sentences:** two per level, a precise one and a vague one, written before measuring.
- **Compared:** the full pipeline (analysis, techniques, checks, repairs) against a plain one-call prompt; the precise
  against the vague sentence.
- **Effort low** for analyze and generate (`.env` set on 2026-11-06; it applies from the next start of the Lab), and the
  time each request takes is measured.

### Cost and time

**The benchmark** (a one-time cost, not the learners'): about 220 requests (7 levels, 4 broken variants, 2 sentences,
2 pipelines, 2 repeats), estimated at under $10 (from the prices below, with effort low's longer output).

**A learner's request** ("Write tests": the analysis, then one generate call per scenario, and the repairs), measured in
the telemetry at effort none:

| Contract | Requests | Calls | Input tokens (cached) | Output tokens | Time, median (max) | Tests |
|---|---|---|---|---|---|---|
| 1.2 | 14 | 7.5 | 300k (276k) | 12k | 47 s (83 s) | 5 |
| 1.4 | 6 | 5.5 | 205k (196k) | 10k | 35 s (137 s) | 4 |

**The billed prices** (DeepSeek's usage export, 2026-11-03 to 2026-11-06, `deepseek-flash`), per million tokens:
input $0.15 on a cache miss and $0.003 on a cache hit, output $0.60; part of 2026-11-06 was billed at twice that
($0.30, $0.006, $1.20). All of the development's use in those four days, 412 API calls including the replays of the
evaluation, cost **$1.26**.

A learner's request at effort none therefore costs about **$0.01** (about $0.016 at the doubled prices): the output
costs most, the cached context pack almost nothing. Effort low adds reasoning to the output, and time; phase 5
measures both. Even at four times the output it stays at a few cents per request.

### Taken as defaults (2026-11-07; the user may change them)

- **The functions per level:** `followLine` (L1, L2), `stopAtWall` (L4), `driveInTheDark` (L5), `avoidWalls` (L6), `followInTheDark` (L7).
  L8 is left out: the reference program doesn't beat it (it circles where its first line ends), and no attempt in the telemetry did.
- **How the main loop calls them: a priority chain.** Each function handles its situation or hands over to the function of the level before
  ("if it is dark: drive straight, else: `stopAtWall()`"); the main loop calls the newest. Calling every function one after the other doesn't
  work in the Lab's simulator (see "Found on the way").
- **"No broken version passes a test"** is read for the set: every broken version fails at least one test. Taken literally, each test would have
  to catch every fault, which a test of one behaviour can't (a test of stopping at a wall doesn't see a fault in the steering on the line). The
  measures per test are reported too.
- **Kept out of any tuning:** the last broken version chosen per function (`generate.py` `chosen`).
- The study's faulty code: the corpus is written in the structure above, so it can serve as the starter code, for the user to review
  (`evaluation/phase5/corpus/CORPUS.md`).

### How it is measured

Everything is in `evaluation/phase5/` (its `README.md` says how to run it):

1. **The corpus** (`corpus.py`, `verify.py`): per function, 3 correct versions (different sensors, thresholds, speeds and ways of turning), and
   broken versions of each, made by fixed faults a learner makes: turns swapped, the wrong sensor (the light from above instead of the floor,
   FRONT instead of LEFT), a threshold the sensor never reaches, a negated condition, the hand-over to the function before missing, too slow,
   turning or slowing instead of stopping. **Each is decided on the levels**, headless, as the level player decides (win, soft win, fail area,
   bump, time limit): a correct version must beat its levels and every level before; a broken one must lose one of its levels. 81 versions:
   15 correct, 59 broken, 7 faults that still beat the level (left out).
2. **The full pipeline** (`generate.py`): for 4 broken versions per function, each with a precise and a vague sentence, twice: the assistant's
   analyze and generate through the running Lab, exactly as the learner's "Write tests" (effort low; the time of each request measured).
3. **The plain pipeline** (`baseline.py`): the same requests in one call, with the same model, effort, facts (the program, its EdPy, the run on a
   plain floor, the sentence), knowledge (the context pack's NEPO, simulator, test format, checks and drawing) and checks of the format with
   repairs, but no analysis, no testing strategy, no worked examples and none of the strategy's checks.
4. **The evaluation** (`evaluate.py`, `report.py`): every request's tests run on every version of its function. A test that fails on a correct
   version is a false alarm; a broken version is caught if a test that passes on every correct version fails on it; a set is good if it has no
   false alarm and catches every broken version.

### Found on the way (2026-11-07)

- **The simulator runs one motor block per frame.** Functions that each set the motors, called one after the other ("`followLine()`,
  `stopAtWall()`"), take turns frame by frame: the robot that should stop at the wall creeps into it. The study's code needs the priority chain
  (or a main loop that decides which function runs).
- **A correct fix can break a later level**: `followLine` B (it steers by a threshold of 50 %) beats L1 and L2 but loses L5 once the later
  functions call it; `avoidWalls` B and C beat L6 but lose L7. Learners' fixes need checking against the later levels, or the later levels'
  code must tolerate them.
- **L5 is beaten only with a dark threshold of about 70 to 75** (the light from above, in percent; 100 outside, 40 inside a tunnel): lower or
  higher, the robot loses the line at the tunnel's exit.
- **Some faults don't break a level**: a line follower with its turns swapped follows the other edge of the line and still wins; so does one at
  half its speed, if it was fast enough. Such versions aren't faults for the levels, and are left out.
- **The Lab's code generation fails on simultaneous requests**: two EdPy requests of different sessions in the same millisecond, and one
  failed (`ORA_SERVER_ERROR`; the server log: "invalid YAML file classpath:/helperMethodsEdison.yml" and a `NullPointerException` in
  `HelperMethodGenerator.extractFunctionName`). The assistant then gets the program without its EdPy. With several participants at once, the
  study may meet it. The two requests it hit were made again.

### Results (2026-11-07, contract 1.4, DeepSeek at effort low)

80 requests per pipeline: 5 functions, 4 broken versions each, the precise and the vague sentence, 2 repeats. Each request's tests ran on
every version of its function (3 correct, 9 to 15 broken). All numbers: `evaluation/phase5/results/report.md`.

| | full pipeline | plain pipeline |
|---|---|---|
| requests without a test | 2 | 0 |
| tests per request (mean) | 3.1 | 3.0 |
| **sets with a false alarm** (a test fails on a correct version) | 40 % | 48 % |
| false alarms among the tests | 17 % | 25 % |
| **broken versions caught** (by a test that passes on every correct version) | 66 % | 60 % |
| broken versions failing any test | 82 % | 82 % |
| **the broken version the assistant got, caught** | 55 % | 40 % |
| **good sets** (no false alarm, every broken version caught) | 14 % | 9 % |
| time per request: median (max) | 131 s (429 s) | 90 s (396 s) |
| output tokens per request (median) | 35,000 | 13,500 |

- **The testing strategy helps a little, not clearly.** Paired by version, sentence and repeat, the full pipeline caught more broken versions
  in 29 of 80 pairs and fewer in 19 (sign test p = 0.19); it had fewer false alarms in 27 and more in 16 (p = 0.13). It costs 2.6 times the
  output tokens and half again the time.
- **By function** (full): `stopAtWall` is good (no false alarm, 86 % caught, 44 % good sets); `followLine` 67 % caught, but tests miss faults
  only curves or time show; the tunnel functions are poor: `driveInTheDark` has a false alarm in 81 % of its sets, `avoidWalls` in 62 % (1 of its
  16 requests gave no test: both its answers were cut off as too long), and the broken version the assistant got is caught in 31 % and 44 %.
- **Why the false alarms**: of the full pipeline's 43 false alarms, 39 are in the tunnel functions, where a correct program "did not reach" the
  goal (29 tests) or "bumped into" a wall or the tunnel (28; a test can fail both ways): the goal is drawn where a correct program never gets (after a tunnel without a line, a line follower that circles on a plain floor
  circles), or the tunnel is one the robot can't pass. The facts the model gets (the run on a plain floor) don't prevent it.
- **A precise sentence helps**: full pipeline, precise against vague: 72 % against 61 % of the broken versions caught, the one it got 62 %
  against 48 %, good sets 20 % against 8 %.
- **Faults hard to catch**: `driveInTheDark` "never dark" (0 % in both pipelines), `followLine` "too slow" (3 %: the tests leave the robot
  ample time, as the context pack asks), `followInTheDark` "peach is black" (23 %), `avoidWalls` faults other than the missing hand-over (33 to 44 %).
- **No test though the learner said what they want**: with the vague sentence "Follow the line." and a program that reads the light from above,
  the analysis saw it ("you said to follow the line, but the program reads only the left light sensor from above … it can't follow a line"),
  but built its one scenario from what the program does, with no expected behaviour, and wrote no test. The context pack asks the opposite:
  "If the program clearly can't do what the learner said, still write the tests for what they said."
- **The techniques on the corpus** (the Lab's telemetry of these calls, `evaluation/phase5/results/audit/`): 4 of 82 first analyses sent back
  (5 %: branch coverage 3, consolidation 1), 27 of 188 first generate answers (14 %: drawing the world 21, equivalence classes 11, branch
  coverage 1). Every call ran at effort low, with reasoning.
- **Time at effort low**: median 131 s per "Write tests", 75 % within 196 s, 90 % within 240 s, the longest 429 s; the tunnel functions take
  longest (medians 150 to 204 s), `followLine` and `stopAtWall` about 70 s. At effort none (the telemetry of contract 1.4) the median was
  35 s.

**What it means for the study**: a learner who gets the assistant's tests for their broken code finds their own fault in a little over half the
requests, and in about 4 of 10 requests, one of the tests fails although the code would be right, which the learner can't tell from a real
fault. On the tunnel levels it is worse. The limits of this measurement: the faults are made by fixed kinds, not by learners; 16 requests per
function; one model; the plain pipeline also lacks the worked examples; L8 isn't part of it.

**Effort low stays** (the user, 2026-11-07): no measurement at effort none. It is set in the local `.env`; the defaults in
`openRoberta.properties` still say `none`.

### The tuning (2026-11-07)

The user asked to tune against the false alarms; they had seen that the model puts the goal after the tunnel, where on the levels a line
takes over, and that it belongs inside the tunnel. The false alarms of the full pipeline, without the requests of the kept-out versions
(39 tests), have four causes, three of them written into the context pack itself:

| Cause | False alarms | Where it came from |
|---|---|---|
| **The tunnel's openings**: the line ends at the opening, so the robot loses it in the first 7.5 cm under the roof (the light falls over 15 cm, and a program with 70 % switches 7.5 cm inside) and turns into a wall; or the goal is after the exit, where a line follower circles | 20 | `tests.md`'s recipe: a tunnel without a line, the goal just after the exit; the same for the bend |
| **A wall inside the dark tunnel**, with a stop or a turn expected: the right programs check the light first and never get to their wall-stop in the dark; the expectation came from the broken program (a negated light check stops there) | 9 | `simulator.md` and `tests.md`: "a wall across the whole tunnel, for a stop in the dark", "the class 'a wall ahead in the dark'" |
| **A start beside the line**, on the side the right programs turn away from | 8 | `tests.md`: the line on the side the program turns to on the plain floor, which is the broken program's side (a broken "one turn" follower turns the other way) |
| a bent tunnel for a program that drives straight in the dark (vague sentence); `after` `line_end` with a line follower | 2 | |

What was changed (`OpenRobertaServer/src/main/resources/ai/`; the prompt's version is the hash of the pack, the answers' contract stays 1.4):

1. **`simulator.md`**: the program switches inside the tunnel, 7.5 cm from each end, and does what it does in the light there; a line the
   robot follows runs 15 cm or more into the tunnel; after the dark the robot comes out a little to one side, and a line follower finds the
   line again only from one side.
2. **`tests.md`**: the recipes "Dim light", **"Driving through a tunnel"** (the line through the start runs 15 cm into the tunnel, 40 cm of
   straight line before it, **the goal inside the tunnel**, no goal after the exit) and the bent tunnel (the goal inside, after the bend);
   no wall across a tunnel unless the learner says what the robot should do at a wall in the dark; a start beside the line only if the
   learner says the robot should find the line, else the class is deferred; `line_start` and `line_end` aren't for line followers.
3. **`tasks.md`**: a line follower gets into the dark on a line that runs into the tunnel; the goal of getting through is inside it.
4. **Examples 1 and 4**: no start beside the line (example 1 defers the class: "You didn't say the robot should find the line").
5. **The recipes were run on the simulator** (`evaluation/phase5/check_recipes.py`, every version of the tunnel functions): every right
   version passes the goal inside the tunnel, the start in the dark and the bends (driveInTheDark aside, which has no wall avoidance). A
   first draft with a second line after the tunnel and the goal over its end failed on 5 of the 9 right versions (they came out of the
   dark on the side away from the line), so the pack has no goal after the exit.

Not changed: the measures, the corpus, the sentences, the plain pipeline's prompt (it takes `simulator.md` and `tests.md` without "How to
choose the tests", so it gets the new facts and recipes too).

### Results after the tuning (round 2, 2026-11-07)

The same 80 requests per pipeline with the tuned pack, the kept-out versions included (`evaluation/phase5/results-r2/`: `report.md`, and
`compare.md` by `compare.py`). All 160 evaluations checked against their own requests.

| | full, round 1 | full, round 2 | plain, round 1 | plain, round 2 |
|---|---|---|---|---|
| requests without a test | 2 | 1 | 0 | 0 |
| tests per request (mean) | 3.1 | 2.6 | 3.0 | 2.9 |
| **sets with a false alarm** | 40 % | **14 %** | 48 % | 20 % |
| false alarms among the tests | 17 % | 6 % | 25 % | 8 % |
| **broken versions caught** | 66 % | **82 %** | 60 % | 82 % |
| **the broken version the assistant got, caught** | 55 % | **72 %** | 40 % | 70 % |
| **good sets** (the user's rule) | 14 % | **48 %** | 9 % | 44 % |
| time per request: median (90 %, max) | 131 s (239 s, 429 s) | 134 s (261 s, 321 s) | 90 s | 91 s |

- **The tuning works, and not only on what it looked at.** Paired by version, sentence and repeat, round 2 of the full pipeline had fewer
  false alarms in 31 of 80 pairs and more in 9 (sign test p = 0.001), and caught more broken versions in 40 and fewer in 15 (p = 0.001).
  On the kept-out versions (20 requests), the good sets rose from 10 % to 40 %, the false alarms fell from 20 % to 15 % of the sets.
- **The strategy still doesn't beat the plain call** (round 2, paired: fewer false alarms in 10, more in 5, p = 0.30; more caught in 14,
  fewer in 21, p = 0.31). The plain call gets the same facts and recipes, and improved as much.
- **By function** (full): `driveInTheDark` from 81 % to 19 % of the sets with a false alarm and from 0 % to 75 % good sets; `avoidWalls`
  62 % to 6 % (good sets 6 % to 56 %); `followInTheDark` 31 % to 0 % (good sets 19 % to 69 %). **`stopAtWall` got worse**: no false alarm
  in round 1, 31 % of its sets in round 2 (6 tests).
- **The false alarms left** (13 tests, full pipeline): 9 come from the broken program, mostly with the vague sentence: the model expects
  what the broken program does ("with nothing ahead, it stands still" for a negated check; "in dim light it curves left" for a line
  follower that reads the light from above; "stops at the wall in the dark"), or draws the world for it (no line, because the broken
  program drives straight on the plain floor while every right one circles there; a wall only in front of the right sensor, which the
  broken program reads and two of the right ones don't). 1 still puts the goal after the tunnel's exit. 3 use a check too strictly for a
  right program: `whenever` an obstacle is ahead, stand still, from 0 ms (a right version that reads RIGHT sees the wall a few frames
  after FRONT does), and `whenever` a wall is on the right, turn left (a right program turns in steps of 20°).
- **The techniques** (the telemetry since round 2 began, `results-r2/audit/`): 6 of 82 first analyses sent back (7 %: consolidation 3,
  branch coverage 3), 29 of 186 first generate answers (16 %: drawing the world 27, equivalence classes 12); every call at effort low.
- **Time**: unchanged (median 134 s per "Write tests"; 90 % within 261 s; the longest 321 s).

### Next (open)

- **The false alarms from the broken program** (9 of 13): in the study, the program the model reads is broken, and the context pack still
  lets it take from the program what the sentence doesn't say (`inferred_from_program`), and the world from what the program does on a
  plain floor. Possible: expectations only from the sentence (what it doesn't say gets no test); a line wherever the learner's robot
  follows one, whatever the program does on a plain floor; "a wall ahead" across the robot's whole front unless the learner says left
  or right; `whenever` … `stands_still` with a margin. A change of the oracle rules: the user's decision.
- The user's review of the corpus as the study's starter code (`evaluation/phase5/corpus/CORPUS.md`).
- **The source of truth for later comparisons** (2026-11-07, at the user's request): `evaluation/truth/` fixes the corpus per level: the
  function, its correct and broken versions as NEPO XML (alone, to inject, and as the level's whole program), and **reference tests written
  by hand** that meet the user's rule on every version:
  - 15 correct and 7 equivalent versions pass all 14 tests;
  - 59 of 59 broken versions fail at least one.

  So the test language can tell every level's correct code from its broken code. A test set of the AI or of a learner can be measured
  against the same versions. Open:
  - which broken version a learner gets;
  - 3 correct versions lose a later level with the later reference code (`followLine/B`: L5; `avoidWalls/B`, `C`: L7);
  - L8.

## Changes

- 2026-11-06: first version: the two questions, the audit of the telemetry (E16), the gaps.
- 2026-11-06: phase 5: the study's change, the first decisions, the cost and time per request.
- 2026-11-07: phase 5: the defaults taken, the method, the corpus, the findings on the way.
- 2026-11-07: phase 5: the first results (full against plain pipeline, by function and sentence, the faults, the techniques, the time).
- 2026-11-07: phase 5: effort low stays; the measurement at effort none is dropped.
- 2026-11-07: phase 5: 4 evaluations of `avoidWalls` corrected (two processes on one Chrome had given them the runs of other
  requests; `evaluate.py` now refuses such runs); the full pipeline's numbers updated; the answer after phase 5 added.
- 2026-11-07: phase 5: the tuning (the causes of the false alarms, what was changed in the context pack, the recipes checked).
- 2026-11-07: phase 5: round 2 after the tuning (results, the false alarms left, the answer after phase 5 with both rounds).
- 2026-11-07: phase 5: the study's source of truth (`evaluation/truth/`): versions per level and reference tests that meet the rule.
