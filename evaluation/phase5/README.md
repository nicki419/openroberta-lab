# Phase 5: how good are the AI test assistant's tests?

The measurement of phase 5 of the AI test assistant (decisions and results: `docs/ai/nepo-ai-technique-compliance.md`, "Phase 5"). The
assistant writes tests for a **broken** program, as a learner of the study gets one per level; the tests are then run on **every** correct and
broken version of that level's function. A good set of tests passes on every correct version and fails on every broken one.

## What is here

| File | What it does |
|---|---|
| `nepo.py` | a small builder of Edison NEPO programs (block_set XML) |
| `corpus.py` | the level functions (a priority chain: each handles its situation or hands over to the one before), their correct versions, and the faults that break them |
| `browser.py`, `browser/` | the headless Chromes (`chrome.sh <port>`, `boot.sh`, the CDP driver `cdp.mjs`) and the page scripts |
| `judge.py`, `browser/judge.js` | plays a program on a level, headless, and decides it as the level player does (win, soft win, fail area, bump, time) |
| `verify.py` | decides the corpus on the levels: `corpus/versions.json`, the programs as Lab exports in `corpus/programs/` |
| `corpus_doc.py` | `corpus/CORPUS.md`: every version as pseudocode, with what the levels said |
| `sentences.py` | the learner's sentence per function, precise and vague |
| `generate.py`, `browser/gen.js` | the full pipeline: the assistant's analyze and generate through the running Lab, as `levels.aiAssistant` `write()` (`results/generated/`) |
| `baseline.py`, `browser/check_plain.js` | the plain pipeline: one call, the same model, effort, facts, knowledge and format checks, no testing strategy (`results/plain/`) |
| `evaluate.py`, `browser/eval.js` | every request's tests on every version of its function (`results/evaluated/`) |
| `report.py` | the measures (`results/report.json`, tables) |
| `compare.py` | two rounds compared, per pipeline, for the versions the tuning looked at and the kept-out ones, with sign tests (`results-r2/compare.md`) |
| `check_recipes.py` | the tunnel recipes of the context pack (`tests.md`), drawn by their numbers, on every version of the tunnel functions (`results-recipes.json`): every correct version must pass them |
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
   `results/`. Round 1 (`results/`) is the context pack before the tuning of 2026-11-07, round 2 (`results-r2/`) after it.

Python 3 with the standard library, Node (the CDP driver), Chrome. On Windows, the scripts call Git Bash explicitly
(`subprocess` would find WSL's `bash.exe` first). The API key is read from `.env` by `baseline.py` and never printed. The full pipeline's calls go
into the Lab's telemetry as anonymous sessions (`session-N.jsonl`).

## Facts found on the way (2026-11-07)

- **The simulator runs one motor block per frame.** Functions that each set the motors, called one after the other in the main loop, take turns:
  a robot that should stop at a wall creeps into it. So the level functions form a priority chain.
- **L5 is beaten only with a dark threshold of about 70 to 75** (light from above, in percent): lower or higher, the robot loses the line at the
  tunnel's exit.
- **A correct fix can break a later level**: `followLine` B loses L5 with the later functions, `avoidWalls` B and C lose L7.
- **L8 isn't beaten by the reference program** (it circles where the first line ends), and wasn't in the telemetry either: it is left out.
- **Some faults don't break a level**: a line follower with its turns swapped follows the other edge of the line and still wins.
