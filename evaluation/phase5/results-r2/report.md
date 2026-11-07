### By pipeline

| | requests | no tests | tests (mean) | sets with a false alarm | false alarms / tests | faults caught (valid tests) | faults failing any test | the seen fault caught | good sets (the rule) | seconds (median) | seconds (max) | output tokens (median) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| full | 80 | 1 | 2.6 | 14 % | 6 % | 82 % | 86 % | 72 % | 48 % | 134 | 321 | 27854 |
| plain | 80 | 0 | 2.9 | 20 % | 8 % | 82 % | 86 % | 70 % | 44 % | 91 | 383 | 13648 |

### By function, full

| | requests | no tests | tests (mean) | sets with a false alarm | false alarms / tests | faults caught (valid tests) | faults failing any test | the seen fault caught | good sets (the rule) | seconds (median) | seconds (max) | output tokens (median) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| followLine | 16 | 0 | 1.2 | 12 % | 11 % | 77 % | 80 % | 69 % | 0 % | 59 | 133 | 8466 |
| stopAtWall | 16 | 0 | 2.1 | 31 % | 18 % | 80 % | 91 % | 62 % | 38 % | 86 | 174 | 14768 |
| driveInTheDark | 16 | 0 | 2.8 | 19 % | 7 % | 88 % | 90 % | 81 % | 75 % | 166 | 283 | 29938 |
| avoidWalls | 16 | 1 | 3.3 | 6 % | 4 % | 77 % | 82 % | 75 % | 56 % | 188 | 302 | 37572 |
| followInTheDark | 16 | 0 | 3.6 | 0 % | 0 % | 88 % | 88 % | 75 % | 69 % | 189 | 321 | 45534 |

### By sentence, full

| | requests | no tests | tests (mean) | sets with a false alarm | false alarms / tests | faults caught (valid tests) | faults failing any test | the seen fault caught | good sets (the rule) | seconds (median) | seconds (max) | output tokens (median) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| precise | 40 | 1 | 2.8 | 10 % | 4 % | 88 % | 91 % | 82 % | 65 % | 130 | 321 | 25668 |
| vague | 40 | 0 | 2.4 | 18 % | 9 % | 76 % | 81 % | 62 % | 30 % | 139 | 302 | 28324 |

### By function, plain

| | requests | no tests | tests (mean) | sets with a false alarm | false alarms / tests | faults caught (valid tests) | faults failing any test | the seen fault caught | good sets (the rule) | seconds (median) | seconds (max) | output tokens (median) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| followLine | 16 | 0 | 3.5 | 0 % | 0 % | 83 % | 83 % | 69 % | 12 % | 42 | 232 | 6728 |
| stopAtWall | 16 | 0 | 2.8 | 44 % | 18 % | 94 % | 94 % | 88 % | 44 % | 59 | 115 | 9827 |
| driveInTheDark | 16 | 0 | 2.6 | 50 % | 21 % | 66 % | 78 % | 56 % | 38 % | 99 | 343 | 14586 |
| avoidWalls | 16 | 0 | 2.4 | 6 % | 5 % | 90 % | 96 % | 75 % | 75 % | 114 | 383 | 16478 |
| followInTheDark | 16 | 0 | 3.1 | 0 % | 0 % | 80 % | 80 % | 62 % | 50 % | 118 | 315 | 17302 |

### By sentence, plain

| | requests | no tests | tests (mean) | sets with a false alarm | false alarms / tests | faults caught (valid tests) | faults failing any test | the seen fault caught | good sets (the rule) | seconds (median) | seconds (max) | output tokens (median) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| precise | 40 | 0 | 3.2 | 22 % | 8 % | 92 % | 97 % | 90 % | 58 % | 91 | 320 | 13584 |
| vague | 40 | 0 | 2.5 | 18 % | 9 % | 72 % | 75 % | 50 % | 30 % | 94 | 383 | 14089 |

### Paired (the same broken version, sentence and repeat)

80 pairs: the full pipeline caught more faults in 14, fewer in 21, as many in 45; it had fewer false alarms in 10, more in 5.

### Faults caught, by kind

| fault | full | plain |
|---|---|---|
| avoidWalls front-sensor | 69 % | 92 % |
| avoidWalls never-dark | 75 % | 94 % |
| avoidWalls no-handover | 88 % | 81 % |
| avoidWalls swapped | 75 % | 94 % |
| driveInTheDark curves | 94 % | 81 % |
| driveInTheDark floor-sensor | 81 % | 56 % |
| driveInTheDark negated | 88 % | 56 % |
| driveInTheDark never-dark | 75 % | 44 % |
| driveInTheDark no-handover | 100 % | 94 % |
| followInTheDark light-above | 100 % | 100 % |
| followInTheDark no-handover | 94 % | 88 % |
| followInTheDark peach-is-black | 69 % | 52 % |
| followLine light-above | 90 % | 98 % |
| followLine one-turn | 100 % | 100 % |
| followLine straight-off | 94 % | 88 % |
| followLine too-slow | 0 % | 28 % |
| stopAtWall negated | 100 % | 100 % |
| stopAtWall no-handover | 81 % | 75 % |
| stopAtWall slows | 81 % | 100 % |
| stopAtWall turns | 58 % | 100 % |

### The techniques, full pipeline (80 requests)

- analyses sent back for a repair: 6 of 80; requests whose generate answers were sent back: 21 of 80
- tests kept: 206; problems of the tests left out after the repairs: none
- problems of whole answers still there after the repairs (they leave no test out): none

