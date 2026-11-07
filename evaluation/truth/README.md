# The study's source of truth

For every level of the study (`levels/01-first-steps`), this folder fixes:

- the function the learner fixes at that level;
- its **correct versions** (3 per function: A, B, C);
- its **broken versions**, made by fixed faults;
- **reference tests** that tell the two apart.

Your rule (2026-11-06): *every correct version passes every test, and every broken version fails at least one.* Later analyses use it to
compare test sets against it, whether the learners wrote them, the AI assistant did, or the plain call of phase 5. The files are committed and
used as they are. Don't build them again unless you mean to change the truth (see "Changing it").

Checked on 2026-11-07 (`verify.py`, on the committed programs):

| function | levels | correct | broken | equivalent | reference tests | false alarms | broken versions caught |
|---|---|---|---|---|---|---|---|
| `followLine` | L1, L2 | 3 | 11 | 4 | 3 | 0 | 11 of 11 |
| `stopAtWall` | L4 | 3 | 12 | 0 | 2 | 0 | 12 of 12 |
| `driveInTheDark` | L5 | 3 | 15 | 0 | 3 | 0 | 15 of 15 |
| `avoidWalls` | L6 | 3 | 12 | 0 | 3 | 0 | 12 of 12 |
| `followInTheDark` | L7 | 3 | 9 | 3 | 3 | 0 | 9 of 9 |

- **The results repeat exactly.** Two full runs gave the same result on all 228 runs (each version × each test of its function), including
  the failure texts. The simulator runs in virtual time.
- **The exports open in the Lab.** One version per function was loaded through the Lab's own import: its functions were in the Program tab,
  and its reference tests in the Tests tab.

## What a version is

A level's program is its function plus the functions of the levels before it. The main loop calls the newest function. Each function handles
its own situation, or calls the function of the level before (a priority chain: the simulator runs one motor block per frame):

```
main:                      def driveInTheDark():          def stopAtWall():
  forever:                   if LLIGHT.light < 70:          if obstacle(FRONT):
    driveInTheDark()           drive(30)                      stop()
                             else:                          else:
                               stopAtWall()                   followLine()
```

- **correct**: the program beats the function's levels and every level before. The other functions are in their reference version A.
- **broken**: a fault (one changed parameter, e.g. "the condition negated") makes the program lose one of the function's levels.
- **equivalent**: broken by a fault, but the level still passes it (e.g. a line follower with its turns swapped follows the other edge). The
  level can't tell it from a correct version, so the tests must pass it too. It can't serve as starter code.

The versions come from the phase 5 corpus (`evaluation/phase5/corpus.py`, decided on the levels by `evaluation/phase5/verify.py`). The faults:
`evaluation/phase5/corpus.py` `FAULTS`.

## The files

| File | What it is |
|---|---|
| `truth.json` | everything, for analysis (below) |
| `TRUTH.md` | the same to read: per function, the reference tests, the result of every version on every test, every version as pseudocode |
| `functions/<function>/<version>.xml` | the function alone: a `block_set` with one instance, its definition. The study injects this into a learner's program |
| `programs/<function>/<version>.xml` | the level's whole program with this version, as a Lab export (Import in the Lab), with the reference tests in its Tests tab |
| `tests/<function>.json` | the reference tests: simulation worlds in the AI assistant's test format, after resolving |
| `reference_tests.py` | the reference tests, written by hand: what each test is for (`targets`: the faults it is there to catch) |
| `results.json` | the last run of `verify.py`: every version, every test, passed or failed, and why |
| `verify.py` | runs the reference tests on every version and checks the rule (exit code 1 if it is broken) |
| `build.py` | writes `truth.json`, `functions/`, `programs/`, `tests/` and `TRUTH.md` |

### `truth.json`

- `levels[]`: `level` (`l1` …), `file`, `title`, `time_limit_s` (null: no limit), and `function` (the function whose levels these are).
  Also:
  - `new_function`: the function that is new at this level; null at L2, which has the function of L1;
  - `functions`: the program's functions, newest first;
  - `main_calls`;
  - `inject`: what changes from the level before: the new function's definition is added, and the main loop's call changes from
    `main_call_before` to `main_call_after`;
  - `starter`: the broken version the learner gets. Not chosen yet.

  L8 is listed without a function (see "Open").
- `functions[]`: `name`, `levels`, `hands_over_to` (the function it calls when its situation isn't there), `reference_version`, `faults`
  (`fault`, `why`), and `tests` (the ids of its reference tests).
- `tests`: per function, the worlds with their tests. Each test has its id in `ref` (`<function>:<id>`, e.g. `stopAtWall:wall-ahead`).
- `versions[]`:
  - `id` (`<function>/<variant>`, e.g. `driveInTheDark/B-negated`), `function`, `variant`;
  - `kind` (`correct`, `broken`, `equivalent`), `of` (the correct version it breaks), `fault`, `why`;
  - `pseudocode`: the function's own code;
  - `levels`: the outcome on each of the function's levels (`win`, `win_soft`, `time_limit`, `fail_hit`, `fail_area`, `no_result`);
  - `later_levels`, `later_levels_ok`: correct versions only, the later levels played with the later functions in their reference version;
  - `tests_passed`: `{test id: true/false}`;
  - `tests_failed_why`: the checks that failed, in the Lab's words;
  - `verdict`: `ok` / `false alarm` for a correct or equivalent version, `caught` / `missed` for a broken one;
  - `function_xml`: the same as `functions/…`;
  - `program`: the level's whole program, as a `block_set`.

### Measuring another test set against it

A test set for a function (the learner's, the AI's) is held to the same rule. Run it on every version of that function, the way
`verify.py` runs the reference tests. Two cases count as failures:

- **false alarm**: a test fails on a correct or equivalent version;
- **missed**: a broken version passes every test.

`evaluation/phase5/evaluate.py` does this for the AI's tests, through the same page script (`browser/eval.js`, `nepoTest.ai`
`runTests`). The reference tests show that the test language can do it for every level, so a set that misses a broken version could have
caught it.

## The reference tests

There are 14 tests, one world each, written the way the context pack's recipes write them (`OpenRobertaServer/src/main/resources/ai/tests.md`).
Each test runs the level's whole program:

- `followLine`:
  - a straight line within 20 s (L1's line, goal and time limit; this catches "too slow");
  - a bend to the left;
  - a bend to the right.
- `stopAtWall`:
  - a wall across the line: the robot ends in the area before the wall, never bumps into it, and **stands still from 15 s on** (L4 wants it
    to stand still; a robot that turns away at the wall keeps coming back and ends in the area anyway);
  - a line without a wall, followed to its end.
- `driveInTheDark`:
  - through a tunnel (the line runs 15 cm into it, the goal is inside it);
  - a start in the dark;
  - a bend of the line in the light.
- `avoidWalls`:
  - a tunnel that bends right;
  - a tunnel that bends left (the goal is inside, after the bend);
  - straight through a tunnel.
- `followInTheDark`:
  - a line in a wide dark tunnel (45 cm, as in L7) that bends right;
  - the same, bending left;
  - a start in the dark with no line.

**Found on the way (2026-11-07):** at the edge of a line, the floor sensor sometimes reads above 90. So a broken `followInTheDark` whose black
threshold lies above the plain floor ("peach-is-black"), or one that does nothing between black and white ("no-handover"), still follows a line
in the dark. Only where there is no line does it fail: it circles, or it doesn't move. L7 starts that way. The test without a line catches
these faults; the line tests catch "light-above".

## Injecting a level's code

At the level where a function is new (`levels[].inject`):

1. add `functions/<function>/<starter>.xml` (its definition) to the learner's program;
2. change the main loop's call from `main_call_before` to `main_call_after`.

The learner's functions from earlier levels stay as they fixed them. Each function calls the one before, so the new function calls the
learner's own fix. The ids in the XML are those of the corpus. If an id is already in the workspace, Blockly gives the block a new one.

## Open

- **Some correct versions break a later level.** `followLine/B` loses L5. `avoidWalls/B` and `avoidWalls/C` lose L7. In both cases the later
  functions are in their reference version A. A learner whose fix works like one of these can't beat the later level with the injected
  code, even if they fix that level's function correctly. Possible answers:
  - the later starter code tolerates them;
  - the later level is made more forgiving;
  - their kind of fix counts as wrong in the study.
- **Which broken version each learner gets** (`starter`). The equivalent ones can't be used: the level passes them.
- **L8** isn't covered: the reference program doesn't beat it (it circles where the first line ends). There is no L3 in the set.
- **L2 has no code of its own**: it plays L1's `followLine`. Two broken versions beat L1 and lose only L2 (`followLine/C-light-above` and
  `C-straight-off`).

## Changing it

1. Change the corpus (`evaluation/phase5/corpus.py`, then `python verify.py` there, which plays the levels) or the tests
   (`reference_tests.py`).
2. Run `python build.py` (it reads the corpus).
3. Run `python verify.py` (it checks the programs in `truth.json`).
4. Run `python build.py` again, which takes the results in.

These steps need the Lab (`./ora.sh start-from-git`) and phase 5's headless Chromes (`evaluation/phase5/README.md`), e.g.
`PHASE5_PORTS=9333,9334`. Use one process per Chrome.
