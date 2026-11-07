### By pipeline

| | requests | no tests | tests (mean) | sets with a false alarm | false alarms / tests | faults caught (valid tests) | faults failing any test | the seen fault caught | good sets (the rule) | seconds (median) | seconds (max) | output tokens (median) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| full | 80 | 6 | 3.0 | 39 % | 17 % | 63 % | 79 % | 50 % | 12 % | 131 | 429 | 34970 |
| plain | 80 | 0 | 3 | 48 % | 25 % | 60 % | 82 % | 40 % | 9 % | 90 | 396 | 13470 |

### By function, full

| | requests | no tests | tests (mean) | sets with a false alarm | false alarms / tests | faults caught (valid tests) | faults failing any test | the seen fault caught | good sets (the rule) | seconds (median) | seconds (max) | output tokens (median) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| followLine | 16 | 1 | 1.9 | 25 % | 13 % | 67 % | 72 % | 62 % | 0 % | 65 | 127 | 11117 |
| stopAtWall | 16 | 0 | 2.4 | 0 % | 0 % | 86 % | 86 % | 81 % | 44 % | 72 | 167 | 12598 |
| driveInTheDark | 16 | 0 | 3.4 | 81 % | 35 % | 55 % | 85 % | 31 % | 0 % | 150 | 240 | 37146 |
| avoidWalls | 16 | 5 | 3.2 | 56 % | 27 % | 38 % | 68 % | 19 % | 0 % | 204 | 429 | 47252 |
| followInTheDark | 16 | 0 | 4.2 | 31 % | 7 % | 74 % | 85 % | 56 % | 19 % | 201 | 325 | 48085 |

### By sentence, full

| | requests | no tests | tests (mean) | sets with a false alarm | false alarms / tests | faults caught (valid tests) | faults failing any test | the seen fault caught | good sets (the rule) | seconds (median) | seconds (max) | output tokens (median) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| precise | 40 | 3 | 3.1 | 42 % | 17 % | 69 % | 86 % | 58 % | 20 % | 131 | 325 | 36152 |
| vague | 40 | 3 | 2.9 | 35 % | 18 % | 58 % | 72 % | 42 % | 5 % | 133 | 429 | 32478 |

### By function, plain

| | requests | no tests | tests (mean) | sets with a false alarm | false alarms / tests | faults caught (valid tests) | faults failing any test | the seen fault caught | good sets (the rule) | seconds (median) | seconds (max) | output tokens (median) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| followLine | 16 | 0 | 3.4 | 0 % | 0 % | 87 % | 87 % | 75 % | 19 % | 48 | 149 | 7684 |
| stopAtWall | 16 | 0 | 2.9 | 56 % | 26 % | 81 % | 90 % | 69 % | 19 % | 75 | 204 | 10534 |
| driveInTheDark | 16 | 0 | 3.1 | 75 % | 35 % | 42 % | 71 % | 25 % | 0 % | 83 | 287 | 12703 |
| avoidWalls | 16 | 0 | 2.6 | 81 % | 63 % | 35 % | 90 % | 0 % | 0 % | 125 | 342 | 20062 |
| followInTheDark | 16 | 0 | 3.1 | 25 % | 10 % | 63 % | 75 % | 31 % | 6 % | 171 | 396 | 24600 |

### By sentence, plain

| | requests | no tests | tests (mean) | sets with a false alarm | false alarms / tests | faults caught (valid tests) | faults failing any test | the seen fault caught | good sets (the rule) | seconds (median) | seconds (max) | output tokens (median) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| precise | 40 | 0 | 3.2 | 55 % | 26 % | 63 % | 92 % | 42 % | 10 % | 87 | 371 | 13132 |
| vague | 40 | 0 | 2.8 | 40 % | 24 % | 57 % | 72 % | 38 % | 8 % | 99 | 396 | 15060 |

### Paired (the same broken version, sentence and repeat)

80 pairs: the full pipeline caught more faults in 27, fewer in 21, as many in 32; it had fewer false alarms in 28, more in 16.

### Faults caught, by kind

| fault | full | plain |
|---|---|---|
| avoidWalls front-sensor | 21 % | 31 % |
| avoidWalls never-dark | 31 % | 38 % |
| avoidWalls no-handover | 69 % | 33 % |
| avoidWalls swapped | 31 % | 38 % |
| driveInTheDark curves | 56 % | 50 % |
| driveInTheDark floor-sensor | 62 % | 29 % |
| driveInTheDark negated | 65 % | 31 % |
| driveInTheDark never-dark | 0 % | 0 % |
| driveInTheDark no-handover | 94 % | 100 % |
| followInTheDark light-above | 100 % | 81 % |
| followInTheDark no-handover | 100 % | 94 % |
| followInTheDark peach-is-black | 23 % | 15 % |
| followLine light-above | 88 % | 100 % |
| followLine one-turn | 94 % | 100 % |
| followLine straight-off | 62 % | 94 % |
| followLine too-slow | 3 % | 38 % |
| stopAtWall negated | 94 % | 94 % |
| stopAtWall no-handover | 69 % | 44 % |
| stopAtWall slows | 100 % | 94 % |
| stopAtWall turns | 81 % | 94 % |

### The techniques, full pipeline (80 requests)

- analyses sent back for a repair: 4 of 80; requests whose generate answers were sent back: 24 of 80
- tests kept: 250; problems of the tests left out after the repairs: none
- problems of whole answers still there after the repairs (they leave no test out): none

