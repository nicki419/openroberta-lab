### results-r2 against results-r3

| pipeline | versions | round | requests | sets with a false alarm | broken versions caught | the one it got, caught | good sets |
|---|---|---|---|---|---|---|---|
| full | tuned on | results-r2 | 60 | 13 % | 85 % | 72 % | 50 % |
| full | tuned on | results-r3 | 60 | 3 % | 78 % | 70 % | 43 % |
| full | kept out | results-r2 | 20 | 15 % | 73 % | 75 % | 40 % |
| full | kept out | results-r3 | 20 | 5 % | 69 % | 75 % | 35 % |
| full | all | results-r2 | 80 | 14 % | 82 % | 72 % | 48 % |
| full | all | results-r3 | 80 | 4 % | 76 % | 71 % | 41 % |
| plain | tuned on | results-r2 | 60 | 18 % | 82 % | 70 % | 43 % |
| plain | kept out | results-r2 | 20 | 25 % | 81 % | 70 % | 45 % |
| plain | all | results-r2 | 80 | 20 % | 82 % | 70 % | 44 % |

### Paired requests (the same version, sentence and repeat)

- full, results-r3 against results-r2 (80 pairs): fewer false alarms in 10, more in 2 (sign test p = 0.039); more broken versions caught in 10, fewer in 24 (p = 0.024).
- plain, results-r3 against results-r2 (0 pairs): fewer false alarms in 0, more in 0 (sign test p = 1.000); more broken versions caught in 0, fewer in 0 (p = 1.000).
- results-r2, full against plain (80 pairs): fewer false alarms in 10, more in 5 (p = 0.302); more broken versions caught in 14, fewer in 21 (p = 0.311).
- results-r3, full against plain (0 pairs): fewer false alarms in 0, more in 0 (p = 1.000); more broken versions caught in 0, fewer in 0 (p = 1.000).

### By function, full pipeline

| function | round | requests | sets with a false alarm | broken versions caught | the one it got, caught | good sets |
|---|---|---|---|---|---|---|
| followLine | results-r2 | 16 | 12 % | 77 % | 69 % | 0 % |
| followLine | results-r3 | 16 | 0 % | 74 % | 75 % | 0 % |
| stopAtWall | results-r2 | 16 | 31 % | 80 % | 62 % | 38 % |
| stopAtWall | results-r3 | 16 | 0 % | 68 % | 75 % | 12 % |
| driveInTheDark | results-r2 | 16 | 19 % | 88 % | 81 % | 75 % |
| driveInTheDark | results-r3 | 16 | 6 % | 82 % | 75 % | 75 % |
| avoidWalls | results-r2 | 16 | 6 % | 77 % | 75 % | 56 % |
| avoidWalls | results-r3 | 16 | 12 % | 74 % | 69 % | 69 % |
| followInTheDark | results-r2 | 16 | 0 % | 88 % | 75 % | 69 % |
| followInTheDark | results-r3 | 16 | 0 % | 79 % | 62 % | 50 % |
