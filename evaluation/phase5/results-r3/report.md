### By pipeline

| | requests | no tests | tests (mean) | sets with a false alarm | false alarms / tests | faults caught (valid tests) | faults failing any test | the seen fault caught | good sets (the rule) | seconds (median) | seconds (max) | output tokens (median) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| full | 80 | 2 | 1.9 | 4 % | 3 % | 76 % | 79 % | 71 % | 41 % | 113 | 395 | 20888 |

### By function, full

| | requests | no tests | tests (mean) | sets with a false alarm | false alarms / tests | faults caught (valid tests) | faults failing any test | the seen fault caught | good sets (the rule) | seconds (median) | seconds (max) | output tokens (median) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| followLine | 16 | 0 | 1.2 | 0 % | 0 % | 74 % | 74 % | 75 % | 0 % | 47 | 96 | 7241 |
| stopAtWall | 16 | 0 | 1.8 | 0 % | 0 % | 68 % | 68 % | 75 % | 12 % | 71 | 139 | 13882 |
| driveInTheDark | 16 | 0 | 1.7 | 6 % | 4 % | 82 % | 85 % | 75 % | 75 % | 122 | 185 | 22832 |
| avoidWalls | 16 | 2 | 2.1 | 12 % | 12 % | 74 % | 87 % | 69 % | 69 % | 131 | 240 | 26570 |
| followInTheDark | 16 | 0 | 2.6 | 0 % | 0 % | 79 % | 79 % | 62 % | 50 % | 173 | 395 | 32950 |

### By sentence, full

| | requests | no tests | tests (mean) | sets with a false alarm | false alarms / tests | faults caught (valid tests) | faults failing any test | the seen fault caught | good sets (the rule) | seconds (median) | seconds (max) | output tokens (median) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| precise | 40 | 0 | 2.2 | 5 % | 4 % | 86 % | 91 % | 88 % | 58 % | 110 | 363 | 20886 |
| vague | 40 | 2 | 1.6 | 2 % | 2 % | 65 % | 67 % | 55 % | 25 % | 124 | 395 | 20888 |

### Faults caught, by kind

| fault | full |
|---|---|
| avoidWalls front-sensor | 73 % |
| avoidWalls never-dark | 75 % |
| avoidWalls no-handover | 75 % |
| avoidWalls swapped | 75 % |
| driveInTheDark curves | 94 % |
| driveInTheDark floor-sensor | 75 % |
| driveInTheDark negated | 75 % |
| driveInTheDark never-dark | 75 % |
| driveInTheDark no-handover | 94 % |
| followInTheDark light-above | 94 % |
| followInTheDark no-handover | 94 % |
| followInTheDark peach-is-black | 50 % |
| followLine light-above | 92 % |
| followLine one-turn | 100 % |
| followLine straight-off | 81 % |
| followLine too-slow | 0 % |
| stopAtWall negated | 81 % |
| stopAtWall no-handover | 56 % |
| stopAtWall slows | 100 % |
| stopAtWall turns | 33 % |

### The techniques, full pipeline (80 requests)

- analyses sent back for a repair: 3 of 80; requests whose generate answers were sent back: 13 of 80
- tests kept: 151; problems of the tests left out after the repairs: none
- problems of whole answers still there after the repairs (they leave no test out): none

