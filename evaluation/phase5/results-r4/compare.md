### results-r3 against results-r4

| pipeline | versions | round | requests | sets with a false alarm | broken versions caught | the one it got, caught | good sets |
|---|---|---|---|---|---|---|---|
| full | tuned on | results-r3 | 60 | 3 % | 78 % | 70 % | 43 % |
| full | tuned on | results-r4 | 60 | 7 % | 83 % | 77 % | 47 % |
| full | kept out | results-r3 | 20 | 5 % | 69 % | 75 % | 35 % |
| full | kept out | results-r4 | 20 | 5 % | 75 % | 75 % | 50 % |
| full | all | results-r3 | 80 | 4 % | 76 % | 71 % | 41 % |
| full | all | results-r4 | 80 | 6 % | 81 % | 76 % | 48 % |

### Paired requests (the same version, sentence and repeat)

- full, results-r4 against results-r3 (80 pairs): fewer false alarms in 2, more in 4 (sign test p = 0.688); more broken versions caught in 19, fewer in 9 (p = 0.087).
- plain, results-r4 against results-r3 (0 pairs): fewer false alarms in 0, more in 0 (sign test p = 1.000); more broken versions caught in 0, fewer in 0 (p = 1.000).
- results-r3, full against plain (0 pairs): fewer false alarms in 0, more in 0 (p = 1.000); more broken versions caught in 0, fewer in 0 (p = 1.000).
- results-r4, full against plain (0 pairs): fewer false alarms in 0, more in 0 (p = 1.000); more broken versions caught in 0, fewer in 0 (p = 1.000).

### By function, full pipeline

| function | round | requests | sets with a false alarm | broken versions caught | the one it got, caught | good sets |
|---|---|---|---|---|---|---|
| followLine | results-r3 | 16 | 0 % | 74 % | 75 % | 0 % |
| followLine | results-r4 | 16 | 0 % | 76 % | 75 % | 6 % |
| stopAtWall | results-r3 | 16 | 0 % | 68 % | 75 % | 12 % |
| stopAtWall | results-r4 | 16 | 6 % | 84 % | 81 % | 44 % |
| driveInTheDark | results-r3 | 16 | 6 % | 82 % | 75 % | 75 % |
| driveInTheDark | results-r4 | 16 | 12 % | 82 % | 75 % | 62 % |
| avoidWalls | results-r3 | 16 | 12 % | 74 % | 69 % | 69 % |
| avoidWalls | results-r4 | 16 | 6 % | 81 % | 81 % | 75 % |
| followInTheDark | results-r3 | 16 | 0 % | 79 % | 62 % | 50 % |
| followInTheDark | results-r4 | 16 | 6 % | 79 % | 69 % | 50 % |
