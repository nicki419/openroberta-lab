# Phase 5 on the five levels (2026-11-08)

The pilot study took L1 and L5 out of the study (`corpus.REMOVED_LEVELS`). This counts rounds 1 to 4 again (`recount.py`), from their stored tests: nothing was generated again, and the runs a round didn't have were added (`evaluate.py --missing`). Each set is held to the corpus as it is now (`corpus/versions.json`), with the rule of the source of truth:

- **Equivalent versions must pass** (the user, 2026-11-08: they stay part of the technique, even if it costs correctness): `followLine/A-swapped`, `followLine/A-too-slow`, `followLine/B-swapped`, `followLine/B-too-slow`, `followLine/C-swapped`, `followLine/C-too-slow`. Broken by a fault, they still beat their levels, so a test that fails one is a false alarm. Until now phase 5 left them out.
- **No longer broken:** `followLine/A-too-slow`, `followLine/C-too-slow` lost only L1 (its time limit); on L2 they win. The requests that start from one of them drop out.
- **Broken now:** `followInTheDark/A-swapped`, `B-swapped`, `C-swapped`. The rounds were evaluated on the corpus of rounds 1 and 2, where they were equivalent; since L8 belongs to `followInTheDark` (2026-11-07), they lose a level of theirs.
- **Not study code:** `driveInTheDark`. L6 brings it as it is, correct (`corpus.GIVEN`): its requests are counted apart.

## round 1, full

| | requests | broken versions caught | good sets | sets with a false alarm | the seen fault caught |
|---|---|---|---|---|---|
| 7 levels (as reported) | 80 | 66 % | 14 % | 40 % | 55 % |
| 5 levels, equivalent versions left out (first count) | 60 | 73 % | 23 % | 32 % | 65 % |
| ... equivalent versions must pass, the swapped followInTheDark left out | 60 | 72 % | 23 % | 32 % | 65 % |
| 5 levels, equivalent versions must pass | 60 | 72 % | 22 % | 32 % | 65 % |
| driveInTheDark (not study code now) | 16 | 55 % | 0 % | 81 % | 31 % |

4 requests dropped as no longer broken; 4 sets fail an equivalent version; the `followInTheDark` sets that catch every swapped version: 10 of 16.

| function (5 levels, equivalent versions must pass) | requests | broken versions caught | good sets | sets with a false alarm | the seen fault caught |
|---|---|---|---|---|---|
| `followLine` | 12 | 78 % | 25 % | 33 % | 83 % |
| `stopAtWall` | 16 | 86 % | 44 % | 0 % | 81 % |
| `avoidWalls` | 16 | 54 % | 6 % | 62 % | 44 % |
| `followInTheDark` | 16 | 72 % | 12 % | 31 % | 56 % |

## round 1, plain

| | requests | broken versions caught | good sets | sets with a false alarm | the seen fault caught |
|---|---|---|---|---|---|
| 7 levels (as reported) | 80 | 60 % | 9 % | 48 % | 40 % |
| 5 levels, equivalent versions left out (first count) | 60 | 66 % | 27 % | 43 % | 47 % |
| ... equivalent versions must pass, the swapped followInTheDark left out | 60 | 63 % | 12 % | 58 % | 40 % |
| 5 levels, equivalent versions must pass | 60 | 63 % | 10 % | 58 % | 40 % |
| driveInTheDark (not study code now) | 16 | 42 % | 0 % | 75 % | 25 % |

4 requests dropped as no longer broken; 9 sets fail an equivalent version; the `followInTheDark` sets that catch every swapped version: 10 of 16.

| function (5 levels, equivalent versions must pass) | requests | broken versions caught | good sets | sets with a false alarm | the seen fault caught |
|---|---|---|---|---|---|
| `followLine` | 12 | 78 % | 25 % | 75 % | 67 % |
| `stopAtWall` | 16 | 81 % | 19 % | 56 % | 69 % |
| `avoidWalls` | 16 | 35 % | 0 % | 81 % | 0 % |
| `followInTheDark` | 16 | 65 % | 0 % | 25 % | 31 % |

## round 2, full

| | requests | broken versions caught | good sets | sets with a false alarm | the seen fault caught |
|---|---|---|---|---|---|
| 7 levels (as reported) | 80 | 82 % | 48 % | 14 % | 72 % |
| 5 levels, equivalent versions left out (first count) | 60 | 83 % | 55 % | 13 % | 75 % |
| ... equivalent versions must pass, the swapped followInTheDark left out | 60 | 82 % | 55 % | 13 % | 75 % |
| 5 levels, equivalent versions must pass | 60 | 76 % | 37 % | 13 % | 75 % |
| driveInTheDark (not study code now) | 16 | 88 % | 75 % | 19 % | 81 % |

4 requests dropped as no longer broken; 2 sets fail an equivalent version; the `followInTheDark` sets that catch every swapped version: 0 of 16.

| function (5 levels, equivalent versions must pass) | requests | broken versions caught | good sets | sets with a false alarm | the seen fault caught |
|---|---|---|---|---|---|
| `followLine` | 12 | 87 % | 58 % | 17 % | 92 % |
| `stopAtWall` | 16 | 80 % | 38 % | 31 % | 62 % |
| `avoidWalls` | 16 | 77 % | 56 % | 6 % | 75 % |
| `followInTheDark` | 16 | 66 % | 0 % | 0 % | 75 % |

## round 2, plain

| | requests | broken versions caught | good sets | sets with a false alarm | the seen fault caught |
|---|---|---|---|---|---|
| 7 levels (as reported) | 80 | 82 % | 44 % | 20 % | 70 % |
| 5 levels, equivalent versions left out (first count) | 60 | 89 % | 62 % | 13 % | 78 % |
| ... equivalent versions must pass, the swapped followInTheDark left out | 60 | 85 % | 50 % | 25 % | 73 % |
| 5 levels, equivalent versions must pass | 60 | 79 % | 37 % | 25 % | 73 % |
| driveInTheDark (not study code now) | 16 | 66 % | 38 % | 50 % | 56 % |

4 requests dropped as no longer broken; 7 sets fail an equivalent version; the `followInTheDark` sets that catch every swapped version: 0 of 16.

| function (5 levels, equivalent versions must pass) | requests | broken versions caught | good sets | sets with a false alarm | the seen fault caught |
|---|---|---|---|---|---|
| `followLine` | 12 | 66 % | 25 % | 58 % | 67 % |
| `stopAtWall` | 16 | 94 % | 44 % | 44 % | 88 % |
| `avoidWalls` | 16 | 90 % | 75 % | 6 % | 75 % |
| `followInTheDark` | 16 | 60 % | 0 % | 0 % | 62 % |

## round 3, full

| | requests | broken versions caught | good sets | sets with a false alarm | the seen fault caught |
|---|---|---|---|---|---|
| 7 levels (as reported) | 80 | 76 % | 41 % | 4 % | 71 % |
| 5 levels, equivalent versions left out (first count) | 60 | 76 % | 45 % | 3 % | 75 % |
| ... equivalent versions must pass, the swapped followInTheDark left out | 60 | 76 % | 45 % | 3 % | 75 % |
| 5 levels, equivalent versions must pass | 60 | 71 % | 32 % | 3 % | 75 % |
| driveInTheDark (not study code now) | 16 | 82 % | 75 % | 6 % | 75 % |

4 requests dropped as no longer broken; 0 sets fail an equivalent version; the `followInTheDark` sets that catch every swapped version: 0 of 16.

| function (5 levels, equivalent versions must pass) | requests | broken versions caught | good sets | sets with a false alarm | the seen fault caught |
|---|---|---|---|---|---|
| `followLine` | 12 | 91 % | 50 % | 0 % | 100 % |
| `stopAtWall` | 16 | 68 % | 12 % | 0 % | 75 % |
| `avoidWalls` | 16 | 74 % | 69 % | 12 % | 69 % |
| `followInTheDark` | 16 | 59 % | 0 % | 0 % | 62 % |

## round 4, full

| | requests | broken versions caught | good sets | sets with a false alarm | the seen fault caught |
|---|---|---|---|---|---|
| 7 levels (as reported) | 80 | 81 % | 48 % | 6 % | 76 % |
| 5 levels, equivalent versions left out (first count) | 60 | 83 % | 58 % | 5 % | 82 % |
| ... equivalent versions must pass, the swapped followInTheDark left out | 60 | 82 % | 55 % | 8 % | 78 % |
| 5 levels, equivalent versions must pass | 60 | 76 % | 42 % | 8 % | 78 % |
| driveInTheDark (not study code now) | 16 | 82 % | 62 % | 12 % | 75 % |

4 requests dropped as no longer broken; 2 sets fail an equivalent version; the `followInTheDark` sets that catch every swapped version: 0 of 15.

| function (5 levels, equivalent versions must pass) | requests | broken versions caught | good sets | sets with a false alarm | the seen fault caught |
|---|---|---|---|---|---|
| `followLine` | 12 | 81 % | 50 % | 17 % | 83 % |
| `stopAtWall` | 16 | 84 % | 44 % | 6 % | 81 % |
| `avoidWalls` | 16 | 81 % | 75 % | 6 % | 81 % |
| `followInTheDark` | 16 | 59 % | 0 % | 6 % | 69 % |

