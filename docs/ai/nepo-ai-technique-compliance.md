# Does the AI follow our testing techniques?

This document answers two questions about the AI test assistant (`docs/ai/nepo-ai-tests.md`) and is **updated
throughout phase 5** of the plan (measuring the quality of the generated tests). Each section says when it was last
measured. The numbers come from the telemetry and the scripts named under "How it was measured".

The two questions (2026-11-06):

1. *Check the constraints that we give the AI on the testing techniques: make sure that it follows our guidance
   (harnesses?).*
2. *How can we know for certain that DeepSeek is using the testing techniques that we tell it to use?*

Status: **phase 5: tuned, then the oracle rules changed, then the worlds, measured each time** (rounds 1 to 4, see "Phase 5" at the
end): since round 3 the expected behaviour comes only from the learner's words; since round 4 a stop test shows that the robot got there,
and the Lab sends back worlds that right programs can't get through. False alarms are rare, and vague sentences get fewer tests.
Last updated: 2026-11-08.

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

**After round 3 (2026-11-07)**, the oracle rules changed (the expected behaviour only from the learner's words, see "The oracle rules"):
the model followed them from the prompt alone (in 229 calls no expectation taken from the program; the new checks of the Lab never had to
send anything back), and the same 80 requests got false alarms in 4 % of the sets instead of 14 % (significant), at a price: 76 % of the
broken versions caught instead of 82 % (significant), mostly with vague sentences, which now get fewer tests.

**After round 4 (2026-11-08)**, a stop test shows that the robot got there, and the Lab sends back four kinds of worlds (see "Round 4"):
the model again followed the new rules from the prompt alone (none of the four checks had to send an answer back), and the same 80
requests caught 81 % of the broken versions (round 3: 76 %), with 48 % good sets (41 %) and false alarms in 6 % of the sets (4 %); none
of these changes is significant on its own. The stop tests gained most: `stopAtWall` good sets 12 % → 44 %.

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
  code must tolerate them. (Since 2026-11-07 the levels are loosened so that every combination of correct versions beats them, L8 included:
  `evaluation/truth/README.md`. Phase 5's two rounds were measured on the levels before.)
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

### The oracle rules (round 3, 2026-11-07)

Most false alarms of round 2 came from the broken program: the model took from it what the sentence didn't say, and drew the world for
it. The user approved four changes (context pack, `nepoTest.aiStrategy`, `AiPrompts`):

1. **The expected behaviour only from the learner's words** (`system.md`, `tasks.md`, `tests.md`): read as they are meant ("when I press
   play" means it waits until then), plus safety; the program shows the situations and names, never what is right. What the sentence
   doesn't say gets no test (the scenario's behaviour is `unknown`, deferred). With a sentence, the Lab sends back an analysis with a
   scenario `inferred` and a test with `inferred_from_program` (`checkAnalysis`, `checkTests`); without one they are still allowed.
   Example 3's "waits without PLAY" is now read from "when I press play".
2. **A line wherever the robot follows one**: a program that reads the line tracker gets a line under every start in the light, whatever
   it does on a plain floor (the task message, `simulator.md`, `tests.md`, and `lineProblems`; a start in the dark needs none).
3. **A wall ahead spans the robot's whole front**, whichever sensor the program reads, unless the learner says left or right (`tests.md`).
4. **Margins on the checks of a reaction**: `whenever` … `stands_still` needs `after_ms` of 200 or more (measured: `stopAtWall` C, which
   reads RIGHT, fails at 0 ms and passes from 100 ms; the broken "slows" fails at every margin), and turning away from something the robot
   sees is tested by where it gets to, never by `whenever` `obstacle_*` → `turns_*` (the Lab sends both back).

Measured on the same 80 requests as rounds 1 and 2 (the corpus as decided for them, `versions-rounds-1-2.json`, so they pair), the full
pipeline only (`evaluation/phase5/results-r3/`: `report.md`, `compare.md`, `audit/`):

| full pipeline | round 2 | round 3 |
|---|---|---|
| requests without a test | 1 | 2 |
| tests per request (mean) | 2.6 | 1.9 |
| **sets with a false alarm** | 14 % | **4 %** |
| false alarms among the tests | 6 % | 3 % |
| **broken versions caught** | 82 % | **76 %** |
| the broken version the assistant got, caught | 72 % | 71 % |
| **good sets** (the user's rule) | 48 % | 41 % |
| precise sentence: false alarms / caught / good sets | 10 % / 88 % / 65 % | 5 % / 86 % / 58 % |
| vague sentence: false alarms / caught / good sets | 18 % / 76 % / 30 % | 2 % / 65 % / 25 % |
| time per request: median (max) | 134 s (321 s) | 113 s (395 s) |

- **Fewer false alarms, and fewer catches, both significant.** Paired by version, sentence and repeat: fewer false alarms in 10 pairs, more
  in 2 (sign test p = 0.04); more broken versions caught in 10, fewer in 24 (p = 0.02). The good sets fell from 48 % to 41 %.
- **The model followed the new rules from the prompt alone**: in 229 calls, no scenario or test took its expectation from the program, and
  none of the new checks had to send an answer back. 3 of 82 first analyses (4 %) and 15 of 126 first generate answers (12 %: the world
  11, equivalence classes 7, ids 1) were sent back, fewer than in round 2.
- **Where the catches went: vague sentences** ("Stop at the wall."), which now get fewer tests (1.6 instead of 2.4). Round 2 also tested
  "follows the line" for that sentence, taken from the program, and so caught the faults that keep the robot from moving; round 3 rightly
  leaves it out, but its test of stopping checks only "whenever a wall is ahead, it stands still", which has nothing to decide for a robot
  that never gets to the wall. `stopAtWall`: 80 % → 68 % caught, good sets 38 % → 12 %.
- **The false alarms left** (5 tests in 3 sets) all come from how the world was drawn, none from the broken program: 2 tests of one
  `avoidWalls` request put the recipes' bend to the right and bend to the left into one world, where the two tunnels cross; 2 of another
  drew bends of their own (90° within 20 cm, the start inside the tunnel just before the bend) instead of the recipe, which every right
  program bumps into; and 1 test has a goal after a tunnel's exit (vague sentence), as in round 2.

### Round 4: where the robot gets to, and the world drawn for it (2026-11-07/08)

Round 3's losses came from stop tests that hold for a robot that never moves, and its false alarms from worlds that right programs can't
get through. Each rule was measured before it was built (`evaluation/phase5/check_round4.py`, `results-round4.json`), and replayed on the
tests of rounds 2 and 3 (`check_rules.py`, `results-r2/rules.json`, `results-r3/rules.json`):

1. **A stop at something the robot drives up to shows that it got there** (`tests.md`, examples 1 and 4, `nepoTest.aiStrategy`
   `arrivalProblems`): a test with `whenever` `obstacle_*` or `after` `obstacle`, whose robot sees nothing at the start, needs `reaches` or
   `ends_in`; the recipe is a goal area of 15 × 20 cm just before the wall, which the robot ends in. Measured: every correct version of
   `stopAtWall` and of every later function passes it, all 12 broken versions of `stopAtWall` fail it; round 3's form caught 3 of them
   (those that slow down). Checking that the robot stays there as well caught nothing more.
2. **Tunnels that overlap** go back (`nepoTest.aiFormat` `tunnelProblems`); the recipes of the bends each get a world of their own.
3. **A start whose robot touches something, or that is inside a tunnel within 25 cm of a bend of more than 15°**, goes back
   (`startProblems`). A limit on bends was measured and dropped: from a straight approach, every correct version of `avoidWalls` and
   `followInTheDark` got through every bend up to a corner of 90°, to the right and to the left; what failed in round 3 was the start in
   the bend.
4. **A goal after a tunnel's exit** goes back (`exitProblems`): the rule of "Driving through a tunnel" since round 2, which the model
   still broke.

Replayed: the four checks flag all 5 false alarms of round 3 (and 5 of round 2's); among the valid tests they flag 11 of round 3, 10 of
them stop tests without arrival, which the repair makes stronger. The context pack's examples pass them.

Measured on the same 80 requests (`versions-rounds-1-2.json`), the full pipeline only (`evaluation/phase5/results-r4/`: `report.md`,
`compare.md`, `audit/`):

| full pipeline | round 3 | round 4 |
|---|---|---|
| requests without a test | 2 | 3 |
| tests per request (mean) | 1.9 | 1.9 |
| **sets with a false alarm** | 4 % | **6 %** |
| false alarms among the tests | 3 % | 4 % |
| **broken versions caught** | 76 % | **81 %** |
| the broken version the assistant got, caught | 71 % | 76 % |
| **good sets** (the user's rule) | 41 % | **48 %** |
| precise sentence: false alarms / caught / good sets | 5 % / 86 % / 58 % | 10 % / 90 % / 62 % |
| vague sentence: false alarms / caught / good sets | 2 % / 65 % / 25 % | 2 % / 72 % / 32 % |
| `stopAtWall`: caught / good sets | 68 % / 12 % | 84 % / 44 % |
| time per request: median (max) | 113 s (395 s) | 108 s (293 s) |

- **More catches, not significant on their own.** Paired by version, sentence and repeat: more broken versions caught in 19 pairs, fewer
  in 9 (sign test p = 0.09); fewer false alarms in 2, more in 4 (p = 0.69). Round 4 is level with round 2 on catches (82 %) and good sets
  (48 %), with round 3's low false alarms kept close (6 % against 14 % in round 2).
- **The stop tests gained most**, as measured beforehand: 9 of 17 tests of a reaction to an obstacle now end in an area before it (round
  3: 1 of 22), the other 8 see the obstacle at the start. `stopAtWall`'s broken versions: `turns` 33 % → 69 % caught, `negated` 81 % →
  100 %, `no-handover` 56 % → 69 %.
- **The model followed the new rules from the prompt alone**: in 148 generate calls none of the four checks sent an answer back, and
  replayed on round 4's tests they flag none. 3 of 80 first analyses (4 %) and 17 of 124 first generate answers (14 %: equivalence classes
  11, the world 10) were sent back, as in round 3.
- **The false alarms left** (6 tests in 5 sets) are none of round 4's kinds. Each was run again with one thing changed, on the correct
  versions (a probe, not kept):
  - 2 run on past their goal inside a tunnel (no `until`, up to 45 s): the robot leaves the tunnel and, searching for a line in the light,
    bumps into it from outside. With `until` the goal, every correct version passes.
  - 1 starts inside a straight tunnel facing across it (heading 90° in a tunnel along x); two right programs bump. Facing along the
    tunnel, all pass.
  - 1 "Stop at the wall." (vague) draws no line: the broken program it got (`no-handover`) never follows one, so the Lab's rule of a line
    wherever the robot follows one didn't apply, but every right program does, and circles on the plain floor. With a line up to the
    wall, all pass.
  - 2 read the sentence beyond its words: "inside a dark tunnel, where there is no line, drive straight" tested as "where the line ends in
    the light, drive straight on", and "without touching its walls" as "stop before a wall across the dark tunnel" (right programs drive
    straight in the dark, as the sentence says, and bump wherever the wall is).

### The pilot study's changes (2026-11-08)

The pilot study asked for changes, three of which touch phase 5:

- **No set-up blocks:** the Tests tab no longer offers a clap, a key press or a variable's value before a test (`SET_UP_BLOCKS` in
  `nepoTest.blocks.ts`). The context pack lost the set-up (a test's `world` events and `globals`, the checks of a clap, a key or a sound),
  its example 3 (wait for PLAY, then park), and a few sentences about them; the fix example is now example 3. A test that has a set-up
  goes back to the model as a problem.
  - **The set-up itself changes no result:** in rounds 2 to 4 (3 × 80 answers), no test had a set-up and no check was about a clap, a
    key or a sound. None of the five functions reads them.
  - **The prompt did change:** rounds 1 to 4 measured the pack before. The model takes the worked examples as models
    (`nepo-ai-tests.md`), and example 3 was the only one with a wait, and with `ends_in` after the program ends. Whether its loss moves
    the numbers is not measured. Running round 4's 80 requests again with the new pack (about 1.5 h with 3 Chromes) would measure it;
    a round 5 would too.
- **L5 taken out, L1 new:** L5, the straight tunnel, went because L6 has a bent one. L6 now brings L5's `driveInTheDark` as it is,
  correct, and the learner fixes only `avoidWalls` there. L1 was taken out too (the same code as L2) and came back the same day as a new
  level, "Straight Ahead": a straight line between walls, no time limit, mirrored so that it needs right turns (`docs/ai/nepo-levels.md`).
  The six levels: L1, L2, L4, L6, L7, L8. For phase 5:
  - **Two versions are no longer broken:** the old L1 judged `followLine` by its time limit (20 s), and `followLine/A-too-slow` and
    `C-too-slow` lost only it. They beat the new L1 and L2, so they are equivalent (`rejudge.py`; the new L1's runs replaced the old ones,
    and no other verdict changed), and the 4 requests per round that start from `C-too-slow` drop out.
  - **`driveInTheDark` is no longer study code:** the learner never fixes it, so its 16 requests per round are counted apart.
- **Equivalent versions must pass** (the user, 2026-11-08: they stay part of the technique, even if it costs correctness). A version broken by
  a fault that still beats its levels counts as correct: a test that fails it is a false alarm, as in the source of truth. Until now phase 5
  left them out (`evaluate.py` didn't run them); since now it runs them, and `report.py` counts them as correct. The six equivalent versions
  are all `followLine`'s: `A-swapped`, `B-swapped`, `C-swapped` (they follow the other edge of the line), `A-too-slow`, `B-too-slow`,
  `C-too-slow`.
- **Counted again on the study's levels** (`evaluation/phase5/recount-study-levels.md`), from the stored tests: nothing generated again; the runs a
  round lacked were added (`evaluate.py --missing`: 665 runs; 18 stored runs run again came out the same). Each set is held to the corpus as
  it is now, and that brings in a second change: the rounds were evaluated on the corpus of rounds 1 and 2, where the swapped `followInTheDark`
  versions were equivalent; since L8 belongs to `followInTheDark` (2026-11-07) they lose a level of theirs, so they are broken. Full pipeline,
  step by step:

  | round | as reported (7 levels) | study levels, equivalents left out | + equivalents must pass | + swapped `followInTheDark` broken |
  |---|---|---|---|---|
  | 1 | 66 % / 14 % / 40 % | 73 % / 23 % / 32 % | 72 % / 23 % / 32 % | 72 % / 22 % / 32 % |
  | 2 | 82 % / 48 % / 14 % | 83 % / 55 % / 13 % | 82 % / 55 % / 13 % | 76 % / 37 % / 13 % |
  | 3 | 76 % / 41 % / 4 % | 76 % / 45 % / 3 % | 76 % / 45 % / 3 % | 71 % / 32 % / 3 % |
  | 4 | 81 % / 48 % / 6 % | 83 % / 58 % / 5 % | 82 % / 55 % / 8 % | 76 % / 42 % / 8 % |

  (broken versions caught / good sets / sets with a false alarm; 80 requests as reported, 60 on the study's levels)

  - **Equivalent versions cost the full pipeline little:** 4, 2, 0 and 2 sets fail one (rounds 1 to 4); in round 4 two `followLine` sets
    fail a too-slow version (good sets 58 → 55 %, sets with a false alarm 5 → 8 %). The plain pipeline loses more: good sets 27 → 12 %
    (round 1) and 62 → 50 % (round 2), 9 and 7 sets fail an equivalent version.
  - **The swapped `followInTheDark` versions cost the most:** from round 2 on, no `followInTheDark` set catches all three (round 1: 10 of
    16), so none of them is good. They fail only where a line runs out of a dark tunnel into the light and the line follower of the light
    takes over (L8, the reference test "out of the dark"); from round 2 on, no AI test catches it. This is the open problem of L8 (the
    swapped followers lose it): whether a test that nobody's sentence asks for should be expected is a question for the study, not for the
    rule.
  - **The source of truth** follows (`evaluation/truth/README.md`): six levels, `followLine` with 2 reference tests (L1's time limit gone,
    the bends allow 60 s), checked again: 9 of 9 broken versions caught, the 3 correct and 6 equivalent versions pass. Every combination of
    correct fixes still beats the six levels; only the swapped line followers lose L8, as before.

### Next (open)

- **Round 5, if wanted** (about 1.5 h, from round 4's false alarms): a test of a tunnel with its goal inside runs `until` the goal (the
  Lab could send back a `never_bumps` of a tunnel without it); a start inside a tunnel faces along it; the recipe "A wall ahead" always
  draws a line up to the wall (a program that doesn't read the line tracker ignores it). The two misreadings of the sentence are not a
  matter of the world, and no check of the Lab decides them.
- The user's review of the corpus as the study's starter code (`evaluation/phase5/corpus/CORPUS.md`).
- **The source of truth for later comparisons** (2026-11-07, at the user's request): `evaluation/truth/` fixes the corpus per level: the
  function, its correct and broken versions as NEPO XML (alone, to inject, and as the level's whole program), and **reference tests written
  by hand** that meet the user's rule on every version:
  - 15 correct and 4 equivalent versions pass all 15 tests;
  - 62 of 62 broken versions fail at least one (the swapped `followInTheDark` versions count as broken since L8 belongs to that function).
  - On the study's six levels (2026-11-08): 15 correct and 6 equivalent versions pass all 14 tests, 60 of 60 broken versions fail at least one.

  So the test language can tell every level's correct code from its broken code. A test set of the AI or of a learner can be measured
  against the same versions. Also there, since 2026-11-07: the starter code per level in two versions (one per run), added to the learner's
  program by the Lab (`levels.code.ts`, the version chosen per program in the Edit menu), and the levels loosened (L5, L7, L8) so that every
  combination of correct fixes beats them. Open: a line follower with its turns swapped can't finish L8.

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
- 2026-11-07: the levels loosened (every combination of correct fixes beats them), L8 in the source of truth, the starter code and its
  injection.
- 2026-11-07: phase 5, round 3: the oracle rules (expected behaviour only from the learner's words, lines, walls, margins) and their
  measurement.
- 2026-11-08: phase 5, round 4: stop tests show arrival, the Lab's checks of the world (overlapping tunnels, starts, goals after the
  exit), the measurements behind them, their replay on rounds 2 and 3, and round 4's results and false alarms.
- 2026-11-08: the pilot study's changes: no set-up (the context pack without it and without example 3), L1 and L5 taken out (L6 brings
  `driveInTheDark` correct), the source of truth on the five levels, and phase 5 counted again on them.
- 2026-11-08: equivalent versions must pass in phase 5 too (the user); rounds 1 to 4 counted again against today's corpus, step by step.
- 2026-11-08: L1 back as a new level ("Straight Ahead", mirrored); six levels; the source of truth and the recount on them (no verdict changed).
