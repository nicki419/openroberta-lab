# Phase 5: how good are the AI test assistant's tests?

The measurement of phase 5 of the AI test assistant (decisions and results: `docs/ai/nepo-ai-technique-compliance.md`, "Phase 5"). The
assistant writes tests for a **broken** program, as a learner of the study gets one per level; the tests are then run on **every** correct and
broken version of that level's function. A good set of tests passes on every correct version and fails on every broken one.

**The corpus fixed for the study** (2026-11-07): `evaluation/truth/` holds the versions of `corpus/versions.json` as committed files, with reference tests that meet the rule on every version. Later analyses use that folder.

## What is here

| File | What it does |
|---|---|
| `nepo.py` | a small builder of Edison NEPO programs (block_set XML) |
| `corpus.py` | the level functions (a priority chain: each handles its situation or hands over to the one before), their correct versions, and the faults that break them |
| `browser.py`, `browser/` | the headless Chromes (`chrome.sh <port>`, `boot.sh`, the CDP driver `cdp.mjs`) and the page scripts |
| `judge.py`, `browser/judge.js` | plays a program on a level, headless, and decides it as the level player does (win, soft win, fail area, bump, time) |
| `verify.py` | decides the corpus on the levels: `corpus/versions.json`, the programs as Lab exports in `corpus/programs/`. Decided again on 2026-11-07 on the loosened levels (L8 added to `followInTheDark`: its swapped versions are broken now); rounds 1 and 2 used the corpus as it was, `corpus/versions-rounds-1-2.json` (`compare.py` reads that one) |
| `rejudge.py` | decides the corpus again from the runs `verify.py` stored, on the levels in `corpus.py` (2026-11-08: the pilot study took L1 and L5 out; `followLine/A-too-slow` and `C-too-slow` lost only L1 and are equivalent now; `driveInTheDark` keeps its judgement on L5, as L6 brings it correct: `corpus.GIVEN`) |
| `recount.py` | rounds 1 to 4 counted again on the five levels from their stored tests (`recount-5-levels.md`), held to the corpus as it is now: equivalent versions must pass, the requests from a version no longer broken left out, `driveInTheDark` counted apart |
| `corpus_doc.py` | `corpus/CORPUS.md`: every version as pseudocode, with what the levels said |
| `sentences.py` | the learner's sentence per function, precise and vague |
| `generate.py`, `browser/gen.js` | the full pipeline: the assistant's analyze and generate through the running Lab, as `levels.aiAssistant` `write()` (`results/generated/`) |
| `baseline.py`, `browser/check_plain.js` | the plain pipeline: one call, the same model, effort, facts, knowledge and format checks, no testing strategy (`results/plain/`) |
| `evaluate.py`, `browser/eval.js` | every request's tests on every version of its function (`results/evaluated/`): the correct, broken and (since 2026-11-08) equivalent ones; `--missing` adds the runs an existing file lacks |
| `report.py` | the measures (`results/report.json`, tables); an equivalent version counts as correct (every test should pass it), as in the source of truth, since 2026-11-08 |
| `compare.py` | two rounds compared, per pipeline, for the versions the tuning looked at and the kept-out ones, with sign tests (`results-r2/compare.md`) |
| `check_recipes.py` | the tunnel recipes of the context pack (`tests.md`), drawn by their numbers, on every version of the tunnel functions (`results-recipes.json`): every correct version must pass them |
| `check_round4.py` | round 4's measurements (`results-round4.json`): a stop at a wall the robot drives up to, with and without an area before the wall it ends in, on every version; tunnels that bend by 30° to 90° in steps 20 to 60 cm apart, on the functions that turn away from walls in the dark |
| `check_rules.py`, `browser/check_rules.js` | the Lab's checks of round 4 (tunnels that overlap, a start that touches a wall or is in a tunnel's bend, a goal after a tunnel's exit, a reaction to an obstacle without arrival) on an earlier round's tests, the context pack's examples and the measured worlds: which tests they send back, false alarms or valid (`<results>/rules.json`) |
| `try_follow.py`, `try_levels.py`, `pseudo.py` | first tries of the functions; NEPO as pseudocode |

## Running it

1. The Lab runs (`./ora.sh start-from-git`), with the AI's API in `.env` and the effort to measure (`DEEPSEEK_EFFORT_ANALYZE`,
   `DEEPSEEK_EFFORT_GENERATE`).
2. The Chromes: `python -c "import browser; browser.start()"` starts the Chromes of `browser.PORTS` (9333 to 9336; another set with
   `PHASE5_PORTS=9337,9338`), each with the Lab open and the Edison chosen. Their profiles are in `.chrome/` (git-ignored).
3. `python verify.py`, then `python generate.py`, `python baseline.py`, `python evaluate.py`, `python report.py`. Each step keeps what it has
   already made, so a step can be run again after an interruption. **One process per Chrome**: two scripts on the same port share its page
   (on 2026-11-07 that gave 4 requests the runs of others; `evaluate.py` now refuses runs that aren't its request's).
4. **Another round** (after a change of the context pack): `PHASE5_RESULTS=results-r2` for every step writes and reads that folder instead of
   `results/`. Round 1 (`results/`) is the context pack before the tuning of 2026-11-07, round 2 (`results-r2/`) after it, round 3
   (`results-r3/`, full pipeline only) after the change of the oracle rules (expectations only from the learner's words, a line wherever
   the robot follows one, a wall ahead across the robot's whole front, margins on stop checks), round 4 (`results-r4/`, full pipeline
   only) after the checks of where the robot gets to and of the world (an area before a wall it should stop at, tunnels that don't
   overlap, no start in a tunnel's bend, no goal after a tunnel's exit). `PHASE5_VERSIONS=versions-rounds-1-2.json`
   makes `generate.py`, `baseline.py` and `evaluate.py` use the corpus as it was decided for rounds 1 and 2 (rounds 3 and 4 did, so their requests
   pair with theirs); without it they use `versions.json`, decided on the levels loosened on 2026-11-07.

Python 3 with the standard library, Node (the CDP driver), Chrome. On Windows, the scripts call Git Bash explicitly
(`subprocess` would find WSL's `bash.exe` first). The API key is read from `.env` by `baseline.py` and never printed. The full pipeline's calls go
into the Lab's telemetry as anonymous sessions (`session-N.jsonl`).

## Facts found on the way (2026-11-07)

- **The simulator runs one motor block per frame.** Functions that each set the motors, called one after the other in the main loop, take turns:
  a robot that should stop at a wall creeps into it. So the level functions form a priority chain.
- **L5 is beaten only with a dark threshold of about 70 to 75** (light from above, in percent): lower or higher, the robot loses the line at the
  tunnel's exit.
- **A correct fix can break a later level**: `followLine` B loses L5 with the later functions, `avoidWalls` B and C lose L7 (on the levels of
  round 1 and 2; since 2026-11-07 the levels are loosened, `evaluation/truth/README.md`).
- **L8 wasn't beaten by the reference program** (it circled where the first line ends), and wasn't in the telemetry either: it is left out of
  rounds 1 and 2. Since 2026-11-07 its lines are softened, and it belongs to `followInTheDark` (`corpus.py`).
- **Some faults don't break a level**: a line follower with its turns swapped follows the other edge of the line and still wins.
