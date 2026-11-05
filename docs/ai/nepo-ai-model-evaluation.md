# Evaluation of the AI test assistant's model APIs and reasoning efforts (2026-11-05)

The AI test assistant (`docs/ai/nepo-ai-tests.md`) can call the same model, DeepSeek-V4.1-Flash, at two APIs:
- **DeepSeek's own API** (`https://api.deepseek.com`, model `deepseek-flash`);
- **SDU's UCloud** (`https://ai.cloud.sdu.dk/v1`, model `deepseek-ai/DeepSeek-V4.1-Flash-1017`), which the university provides.

This document records the tests we ran on 2026-11-05, to decide two things:
1. which API to ask first;
2. which reasoning effort to use for each call.

The four calls are:
- **infer:** guess what the program is meant to do;
- **analyze:** the program's decisions, paths, input classes and boundaries;
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
- **Efforts for both APIs:**
  - infer `low`: correct every time, and `none` saves only seconds;
  - analyze `low`: at `none` the analyses were thinner, and at UCloud often invalid;
  - generate `none`: 4 to 5 times faster, with first answers as valid as at `low`;
  - fix `low`: only tested there.

  The settings are `<NAME>_EFFORT_INFER`, `_ANALYZE`, `_GENERATE`, `_FIX`.
- The panel says "Usually 1 to 2 minutes" for writing tests, and "Usually under a minute, sometimes up to 3" for a fix.

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

Each raw output holds the prompt that was sent, the answer, the time and the tokens. The prompts are read from the
telemetry (`admin/levelTelemetry/`, lines as above), and the system prompt of version `bf36cb82ed98` is
`admin/levelTelemetry/ai-prompts/bf36cb82ed98.md`. The scripts read the keys from `.env` (`DEEPSEEK_API_KEY`,
`UCLOUD_API_KEY`) and never print them. No key is in any saved file (checked).
