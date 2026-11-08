### By pipeline

| | requests | no tests | tests (mean) | sets with a false alarm | false alarms / tests | faults caught (valid tests) | faults failing any test | the seen fault caught | good sets (the rule) | seconds (median) | seconds (max) | output tokens (median) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| full | 80 | 3 | 1.9 | 6 % | 4 % | 81 % | 83 % | 76 % | 48 % | 108 | 293 | 20422 |

### By function, full

| | requests | no tests | tests (mean) | sets with a false alarm | false alarms / tests | faults caught (valid tests) | faults failing any test | the seen fault caught | good sets (the rule) | seconds (median) | seconds (max) | output tokens (median) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| followLine | 16 | 0 | 1.2 | 0 % | 0 % | 76 % | 76 % | 75 % | 6 % | 51 | 118 | 7142 |
| stopAtWall | 16 | 0 | 1.8 | 6 % | 4 % | 84 % | 86 % | 81 % | 44 % | 73 | 144 | 13373 |
| driveInTheDark | 16 | 0 | 1.7 | 12 % | 7 % | 82 % | 85 % | 75 % | 62 % | 122 | 293 | 25181 |
| avoidWalls | 16 | 2 | 2.2 | 6 % | 6 % | 81 % | 87 % | 81 % | 75 % | 131 | 241 | 26032 |
| followInTheDark | 16 | 1 | 2.6 | 6 % | 2 % | 79 % | 79 % | 69 % | 50 % | 160 | 272 | 36178 |

### By sentence, full

| | requests | no tests | tests (mean) | sets with a false alarm | false alarms / tests | faults caught (valid tests) | faults failing any test | the seen fault caught | good sets (the rule) | seconds (median) | seconds (max) | output tokens (median) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| precise | 40 | 0 | 2.3 | 10 % | 5 % | 90 % | 94 % | 90 % | 62 % | 119 | 293 | 24157 |
| vague | 40 | 3 | 1.5 | 2 % | 2 % | 72 % | 72 % | 62 % | 32 % | 97 | 272 | 17335 |

### Faults caught, by kind

| fault | full |
|---|---|
| avoidWalls front-sensor | 79 % |
| avoidWalls never-dark | 81 % |
| avoidWalls no-handover | 81 % |
| avoidWalls swapped | 81 % |
| driveInTheDark curves | 94 % |
| driveInTheDark floor-sensor | 75 % |
| driveInTheDark negated | 75 % |
| driveInTheDark never-dark | 69 % |
| driveInTheDark no-handover | 100 % |
| followInTheDark light-above | 94 % |
| followInTheDark no-handover | 88 % |
| followInTheDark peach-is-black | 56 % |
| followLine light-above | 88 % |
| followLine one-turn | 98 % |
| followLine straight-off | 88 % |
| followLine too-slow | 9 % |
| stopAtWall negated | 100 % |
| stopAtWall no-handover | 69 % |
| stopAtWall slows | 100 % |
| stopAtWall turns | 69 % |

### The techniques, full pipeline (80 requests)

- analyses sent back for a repair: 3 of 80; requests whose generate answers were sent back: 14 of 80
- tests kept: 151; problems of the tests left out after the repairs: none
- problems of whole answers still there after the repairs (they leave no test out): none

