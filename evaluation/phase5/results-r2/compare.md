### results against results-r2

| pipeline | versions | round | requests | sets with a false alarm | broken versions caught | the one it got, caught | good sets |
|---|---|---|---|---|---|---|---|
| full | tuned on | results | 60 | 47 % | 66 % | 52 % | 15 % |
| full | tuned on | results-r2 | 60 | 13 % | 85 % | 72 % | 50 % |
| full | kept out | results | 20 | 20 % | 67 % | 65 % | 10 % |
| full | kept out | results-r2 | 20 | 15 % | 73 % | 75 % | 40 % |
| full | all | results | 80 | 40 % | 66 % | 55 % | 14 % |
| full | all | results-r2 | 80 | 14 % | 82 % | 72 % | 48 % |
| plain | tuned on | results | 60 | 47 % | 57 % | 37 % | 10 % |
| plain | tuned on | results-r2 | 60 | 18 % | 82 % | 70 % | 43 % |
| plain | kept out | results | 20 | 50 % | 71 % | 50 % | 5 % |
| plain | kept out | results-r2 | 20 | 25 % | 81 % | 70 % | 45 % |
| plain | all | results | 80 | 48 % | 60 % | 40 % | 9 % |
| plain | all | results-r2 | 80 | 20 % | 82 % | 70 % | 44 % |

### Paired requests (the same version, sentence and repeat)

- full, results-r2 against results (80 pairs): fewer false alarms in 31, more in 9 (sign test p = 0.001); more broken versions caught in 40, fewer in 15 (p = 0.001).
- plain, results-r2 against results (80 pairs): fewer false alarms in 29, more in 6 (sign test p = 0.000); more broken versions caught in 38, fewer in 8 (p = 0.000).
- results, full against plain (80 pairs): fewer false alarms in 27, more in 16 (p = 0.126); more broken versions caught in 29, fewer in 19 (p = 0.193).
- results-r2, full against plain (80 pairs): fewer false alarms in 10, more in 5 (p = 0.302); more broken versions caught in 14, fewer in 21 (p = 0.311).

### By function, full pipeline

| function | round | requests | sets with a false alarm | broken versions caught | the one it got, caught | good sets |
|---|---|---|---|---|---|---|
| followLine | results | 16 | 25 % | 67 % | 62 % | 0 % |
| followLine | results-r2 | 16 | 12 % | 77 % | 69 % | 0 % |
| stopAtWall | results | 16 | 0 % | 86 % | 81 % | 44 % |
| stopAtWall | results-r2 | 16 | 31 % | 80 % | 62 % | 38 % |
| driveInTheDark | results | 16 | 81 % | 55 % | 31 % | 0 % |
| driveInTheDark | results-r2 | 16 | 19 % | 88 % | 81 % | 75 % |
| avoidWalls | results | 16 | 62 % | 54 % | 44 % | 6 % |
| avoidWalls | results-r2 | 16 | 6 % | 77 % | 75 % | 56 % |
| followInTheDark | results | 16 | 31 % | 74 % | 56 % | 19 % |
| followInTheDark | results-r2 | 16 | 0 % | 88 % | 75 % | 69 % |
