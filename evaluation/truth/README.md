# The study's source of truth

For every level of the study (`levels/01-first-steps`), this folder fixes:

- the function the learner fixes at that level;
- its **correct versions** (3 per function: A, B, C);
- its **broken versions**, made by fixed faults;
- **reference tests** that tell the two apart;
- the **starter code**: per level, the broken version a learner gets, in two versions of the study's code (one per run);
- that **every combination of correct fixes beats every level** (`check_levels.py`).

Your rule (2026-11-06): *every correct version passes every test, and every broken version fails at least one.* Later analyses use it to
compare test sets against it, whether the learners wrote them, the AI assistant did, or the plain call of phase 5. The files are committed and
used as they are. Don't build them again unless you mean to change the truth (see "Changing it").

**Six levels since the pilot study (2026-11-08):** L5 (a straight tunnel; L6 has a bent one) was taken out: L6 brings `driveInTheDark` as it
is, its correct reference version, before its own `avoidWalls` (`corpus.GIVEN`; the level file's `code.given`), so the learner never fixes
`driveInTheDark`: its versions are not study code and keep their judgement on L5. L1 is a new level, "Straight Ahead" (`l1-straight-ahead.json`, 2026-11-08): a straight line between two walls that lose the level, the goal at its end, no time limit. The line falls to the robot's right: the file as drawn (rising to the robot's left) was mirrored top to bottom, because a line that needs only left turns let version 2's starter (`followLine/B-straight-off`, which can't turn right) win it. Its runs replaced those of the old L1
(phase 5's `rejudge.py --play l1`). Without the old L1's time limit, `followLine/A-too-slow` and `C-too-slow` beat L1 and L2: they are
equivalent now, and the test of that time limit is gone.

Checked on 2026-11-08 (`verify.py`; `followLine` run again, the other functions as on 2026-11-07):

| function | levels | correct | broken | equivalent | reference tests | false alarms | broken versions caught |
|---|---|---|---|---|---|---|---|
| `followLine` | L1, L2 | 3 | 9 | 6 | 2 | 0 | 9 of 9 |
| `stopAtWall` | L4 | 3 | 12 | 0 | 2 | 0 | 12 of 12 |
| `driveInTheDark` | (L5, no longer played; given at L6) | 3 | 15 | 0 | 3 | 0 | 15 of 15 |
| `avoidWalls` | L6 | 3 | 12 | 0 | 3 | 0 | 12 of 12 |
| `followInTheDark` | L7, L8 | 3 | 12 | 0 | 4 | 0 | 12 of 12 |

Every level was beaten by every combination of the correct versions of its program's functions (`check_levels.py`: 3 programs at L1 and
L2, 9 at L4, 27 at L6 (`driveInTheDark` in its reference version), 81 at L7 and L8), and by each equivalent version, except the swapped line followers
at L8 (see "Open"). (Until 2026-11-08: 3 programs at L1 and L2, 9 at L4, 27 at L5, 81 at L6, 243 at L7 and L8.)

- **The results repeat exactly.** Two full runs of the then 14 tests gave the same result on all 228 runs (each version × each test of its
  function), including the failure texts. The simulator runs in virtual time.
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
| `check_levels.py` | plays every level with every combination of the correct versions of its program's functions, and with each equivalent version (exit code 1 if one loses) |
| `levels.json` | the last run of `check_levels.py`: every program on every level, its outcome |
| `build.py` | writes `truth.json`, `functions/`, `programs/`, `tests/` and `TRUTH.md`; `STARTERS` there is the choice of the starter code |
| `write_level_code.py` | writes the starter code from `truth.json` into the level files (`code`), where the Lab takes it from |

### `truth.json`

- `levels[]`: `level` (`l2` …), `file`, `title`, `time_limit_s` (null: no limit), and `function` (the function whose levels these are).
  Also:
  - `new_function`: the function that is new at this level; null at L8, which has the function of L7;
  - `functions`: the program's functions, newest first;
  - `main_calls`;
  - `inject`: what changes from the level before: the new function's definition is added, and the main loop's call changes from
    `main_call_before` to `main_call_after`; `given`: the functions added before it as they are, `[{function, version}]` (L6:
    `driveInTheDark/A`);
  - `starter`: the broken version the learner gets, per version of the study's code: `{"1": <version id>, "2": <version id>}`.
- `level_check`: per level, how many programs `check_levels.py` played and how many won.
- `functions[]`: `name`, `levels`, `given_in` (the level that brings it as it is, or null), `hands_over_to` (the function it calls when its situation isn't there), `reference_version`, `faults`
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

There are 14 tests (15 until 2026-11-08), one world each, written the way the context pack's recipes write them (`OpenRobertaServer/src/main/resources/ai/tests.md`).
Each test runs the level's whole program:

- `followLine`:
  - a bend to the left, at most 60 s;
  - a bend to the right, at most 60 s (40 s until 2026-11-08: the slowest equivalent line follower takes about 40 s);
  - (until 2026-11-08 also a straight line within 20 s, L1's line, goal and time limit, for "too slow": without L1, too slow is no fault.)
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
  - a start in the dark with no line;
  - a line out of a dark tunnel into the light, the goal at its end (since L8 belongs to `followInTheDark`: the swapped versions, which follow
    the other edge of the line in the dark than `followLine` in the light, lose it there and here).

**Found on the way (2026-11-07):** at the edge of a line, the floor sensor sometimes reads above 90. So a broken `followInTheDark` whose black
threshold lies above the plain floor ("peach-is-black"), or one that does nothing between black and white ("no-handover"), still follows a line
in the dark. Only where there is no line does it fail: it circles, or it doesn't move. L7 starts that way. The test without a line catches
these faults; the line tests catch "light-above".

## The starter code

| level | function | version 1 | version 2 |
|---|---|---|---|
| L1 | `followLine` | `A-light-above`: reads the light from above instead of the floor | `B-straight-off`: drives straight when off the line |
| L4 | `stopAtWall` | `A-turns`: turns away instead of stopping | `C-slows`: slows down instead of stopping |
| L6 | `avoidWalls` (with `driveInTheDark/A`, correct, in both) | `A-swapped`: turns towards the wall | `B-front-sensor`: reads FRONT instead of the side |
| L7 | `followInTheDark` | `A-light-above`: reads the light from above instead of the floor | `B-peach-is-black`: the black threshold above the floor |

Each loses the level where its function is new. The two of a level are faults of a similar kind, so neither run is harder by design; each
version is built on other correct versions, so the second run doesn't show the same code. **Not `followLine/A-one-turn`:** its two turns are
the same, and fixing the other one gives `followLine/A-swapped`, which beats L1 to L7 but can't finish L8 (see "Open"). (Until
2026-11-08, L5 had `driveInTheDark`'s: `A-negated` and `B-never-dark`.)

**Injecting a level's code** is built into the Lab (`OpenRobertaWeb/src/app/levels/levels.code.ts`, `docs/ai/nepo-levels.md`, "The study's
code per level"): the version is chosen per program in the Edit menu, and when a level with code is played, its starter is added to the
learner's program and the main loop calls it instead of the function before (`levels[].inject`); the functions it brings as they are
(`inject.given`, L6's `driveInTheDark`) are added before it. The learner's functions from earlier levels
stay as they fixed them; each function calls the one before, so the new function calls the learner's own fix. `write_level_code.py` puts the
starters into the level files. The ids in the XML are those of the corpus; if an id is already in the workspace, Blockly gives the block a new
one.

## The levels, loosened (2026-11-07)

Before, a correct fix of an earlier level could make a later level unbeatable (`followLine/B` lost L5, `avoidWalls/B` and `C` lost L7), and
L8 was beaten by none of the corpus's line followers. The levels were changed until every combination of correct versions beat them
(`check_levels.py`), and the corpus was decided again on them (`evaluation/phase5/verify.py`):

- **L5:** the tunnel 60 cm shorter, the line after it 4.5 cm wide (a landing strip).
- **L7:** the line in the wide tunnel begins at x 60, on the robot's straight path.
- **L8:** the lines drawn anew as straights and arcs (radius 17 to 18 cm): no U-turn, zigzag, tight corner or hairpin. The line after the
  first tunnel runs through the tunnel's bend and on down the middle of the dark corridor of the wide tunnel into the last line; the last line
  runs up to the wall at the goal. L8 belongs to `followInTheDark` now, as L2 to `followLine`.

**Why:** the line followers steer along one edge of the line. One that comes to a thin line from the other side (out of the dark, or past
the end of a line) is turned away by the line's white border; and one that drives blind keeps the small angle it had when it lost sight.
Where a level asked for that, whether a correct program won was luck.

## Open

- **The swapped line followers can't finish L8.** `followLine/*-swapped` and `followInTheDark/*-swapped` (the two turns swapped: they
  follow the other edge of the line) beat their own levels and every level up to L7, but lose L8: where the robot comes out of the wide
  tunnel into the light, the line follower of the light takes over from the one of the dark, and if the two follow different edges, the new
  one is on the wrong side and turns away into the tunnel's wall. A wider line didn't help. A learner can write such a follower; if one gets
  stuck at L8, the staff can let them stop there. A level that avoids it needs no handover from a line follower in the dark to one in the
  light (as in L5, where the robot drives straight in the dark).
- There are no L3 and L5 in the set (L5 was taken out on 2026-11-08; its file is in git before that). The old L1 (`l1-straight-line.json`)
  is in git before 2026-11-08 too.
- `driveInTheDark` can't be judged again (phase 5's `verify.py`) without L5's file.

## Changing it

1. Change the corpus (`evaluation/phase5/corpus.py`, then `python verify.py` there, which plays the levels), the tests
   (`reference_tests.py`), the starters (`STARTERS` in `build.py`) or a level (then `python check_levels.py` and phase 5's `verify.py`).
2. Run `python build.py` (it reads the corpus).
3. Run `python verify.py` (it checks the programs in `truth.json`).
4. Run `python build.py` again, which takes the results in.
5. Run `python write_level_code.py`, which puts the starters into the level files.

These steps need the Lab (`./ora.sh start-from-git`) and phase 5's headless Chromes (`evaluation/phase5/README.md`), e.g.
`PHASE5_PORTS=9333,9334`. Use one process per Chrome.
