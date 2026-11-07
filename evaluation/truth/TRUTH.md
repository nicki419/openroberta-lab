# The study's source of truth

Made 2026-11-07 by `build.py` from the phase 5 corpus and the reference tests (`reference_tests.py`), checked by `verify.py`. **The rule:** Every correct version (and every equivalent one: broken by a fault, but the level still passes it) passes every reference test of its function; every broken version fails at least one.

A level's program is its function and the functions of the levels before; the main loop calls the newest, and each function handles its situation or calls the one before:

```
main:
  forever:
    <the newest function>()
```

| level | title | function | new code | the main loop calls |
|---|---|---|---|---|
| L1 | L1 - Straight Line | `followLine` | yes | `followLine()` |
| L2 | L2 - Curves | `followLine` | no (the function of L1) | `followLine()` |
| L4 | L4 - Beware the Wall | `stopAtWall` | yes | `stopAtWall()` |
| L5 | L5 - Tunnel Vision | `driveInTheDark` | yes | `driveInTheDark()` |
| L6 | L6 - Tunnel Vision Reloaded | `avoidWalls` | yes | `avoidWalls()` |
| L7 | L7 - Well I'll Be Forked | `followInTheDark` | yes | `followInTheDark()` |
| L8 | L8 - Climax | - | Not used: the program of the reference versions does not beat it (it circles where the first line ends; phase 5, 2026-11-07). | - |

Which broken version a learner gets per level (`starter` in `truth.json`) is not chosen yet.

## Summary

| function | correct | broken | equivalent | tests | false alarms | broken versions caught |
|---|---|---|---|---|---|---|
| `followLine` | 3 | 11 | 4 | 3 | 0 | 11 of 11 |
| `stopAtWall` | 3 | 12 | 0 | 2 | 0 | 12 of 12 |
| `driveInTheDark` | 3 | 15 | 0 | 3 | 0 | 15 of 15 |
| `avoidWalls` | 3 | 12 | 0 | 3 | 0 | 12 of 12 |
| `followInTheDark` | 3 | 9 | 3 | 3 | 0 | 9 of 9 |

## followLine (L1, L2)

The first function: it hands over to nothing.

### Reference tests

- **`followLine:straight-in-time`**: Given the robot on a straight line of 115 cm, when the program runs, then it reaches the goal at the line's end within 20 s (the time limit of L1). (world "A straight line, in time", start A, until it touches t2, at most 20 s; checks: reaches t2, never_bumps anything; there for: light-above, one-turn, too-slow, straight-off)
- **`followLine:bend-left`**: Given the robot on a line that bends to the left, when the program runs, then it follows the line round the bend to the goal at its end. (world "A bend to the left", start A, until it touches t2, at most 40 s; checks: reaches t2, never_bumps anything; there for: light-above, one-turn, straight-off)
- **`followLine:bend-right`**: Given the robot on a line that bends to the right, when the program runs, then it follows the line round the bend to the goal at its end. (world "A bend to the right", start A, until it touches t2, at most 40 s; checks: reaches t2, never_bumps anything; there for: light-above, one-turn, straight-off)

### Versions and results

| version | kind | fault | levels | `straight-in-time` | `bend-left` | `bend-right` | verdict |
|---|---|---|---|---|---|---|---|
| `followLine/A` | correct |  | L1 win, L2 win | pass | pass | pass | ok |
| `followLine/B` | correct |  | L1 win, L2 win; later: L5 fail_hit | pass | pass | pass | ok |
| `followLine/C` | correct |  | L1 win, L2 win | pass | pass | pass | ok |
| `followLine/A-swapped` | equivalent | swapped | L1 win, L2 win | pass | pass | pass | ok |
| `followLine/B-swapped` | equivalent | swapped | L1 win, L2 win | pass | pass | pass | ok |
| `followLine/B-too-slow` | equivalent | too-slow | L1 win, L2 win | pass | pass | pass | ok |
| `followLine/C-swapped` | equivalent | swapped | L1 win, L2 win | pass | pass | pass | ok |
| `followLine/A-light-above` | broken | light-above | L1 time_limit, L2 fail_area | **fail** | **fail** | **fail** | caught |
| `followLine/A-one-turn` | broken | one-turn | L1 time_limit, L2 fail_hit | **fail** | **fail** | **fail** | caught |
| `followLine/A-straight-off` | broken | straight-off | L1 fail_hit, L2 fail_hit | **fail** | **fail** | **fail** | caught |
| `followLine/A-too-slow` | broken | too-slow | L1 time_limit, L2 win | **fail** | **fail** | **fail** | caught |
| `followLine/B-light-above` | broken | light-above | L1 fail_hit, L2 fail_area | **fail** | **fail** | **fail** | caught |
| `followLine/B-one-turn` | broken | one-turn | L1 fail_hit, L2 fail_hit | **fail** | **fail** | **fail** | caught |
| `followLine/B-straight-off` | broken | straight-off | L1 fail_hit, L2 fail_hit | **fail** | **fail** | **fail** | caught |
| `followLine/C-light-above` | broken | light-above | L1 win, L2 fail_area | pass | **fail** | **fail** | caught |
| `followLine/C-one-turn` | broken | one-turn | L1 time_limit, L2 fail_hit | **fail** | **fail** | **fail** | caught |
| `followLine/C-straight-off` | broken | straight-off | L1 win, L2 fail_hit | pass | **fail** | **fail** | caught |
| `followLine/C-too-slow` | broken | too-slow | L1 time_limit, L2 win | **fail** | pass | pass | caught |

### The code

**`followLine/A`** (correct)

```
def followLine():
  if LINETRACKER.line:
    curve(10, 40)
  else:
    curve(40, 10)
```

**`followLine/B`** (correct)

```
def followLine():
  if (LINETRACKER.light < 50):
    curve(20, 50)
  else:
    curve(50, 20)
```

**`followLine/C`** (correct)

```
def followLine():
  if (LINETRACKER.light < 30):
    curve(15, 45)
  elif (LINETRACKER.light > 70):
    curve(45, 15)
  else:
    drive(40)
```

**`followLine/A-swapped`** (equivalent): the two turns swapped

```
def followLine():
  if LINETRACKER.line:
    curve(40, 10)
  else:
    curve(10, 40)
```

**`followLine/B-swapped`** (equivalent): the two turns swapped

```
def followLine():
  if (LINETRACKER.light < 50):
    curve(50, 20)
  else:
    curve(20, 50)
```

**`followLine/B-too-slow`** (equivalent): half the speed

```
def followLine():
  if (LINETRACKER.light < 50):
    curve(10, 25)
  else:
    curve(25, 10)
```

**`followLine/C-swapped`** (equivalent): the two turns swapped

```
def followLine():
  if (LINETRACKER.light < 30):
    curve(45, 15)
  elif (LINETRACKER.light > 70):
    curve(15, 45)
  else:
    drive(40)
```

**`followLine/A-light-above`** (broken): reads the light from above (LLIGHT) instead of the floor

```
def followLine():
  if (LLIGHT.light < 50):
    curve(10, 40)
  else:
    curve(40, 10)
```

**`followLine/A-one-turn`** (broken): turns the same way on and off the line

```
def followLine():
  if LINETRACKER.line:
    curve(10, 40)
  else:
    curve(10, 40)
```

**`followLine/A-straight-off`** (broken): drives straight when off the line

```
def followLine():
  if LINETRACKER.line:
    curve(10, 40)
  else:
    drive(40)
```

**`followLine/A-too-slow`** (broken): half the speed

```
def followLine():
  if LINETRACKER.line:
    curve(5, 20)
  else:
    curve(20, 5)
```

**`followLine/B-light-above`** (broken): reads the light from above (LLIGHT) instead of the floor

```
def followLine():
  if (LLIGHT.light < 50):
    curve(20, 50)
  else:
    curve(50, 20)
```

**`followLine/B-one-turn`** (broken): turns the same way on and off the line

```
def followLine():
  if (LINETRACKER.light < 50):
    curve(20, 50)
  else:
    curve(20, 50)
```

**`followLine/B-straight-off`** (broken): drives straight when off the line

```
def followLine():
  if (LINETRACKER.light < 50):
    curve(20, 50)
  else:
    drive(40)
```

**`followLine/C-light-above`** (broken): reads the light from above (LLIGHT) instead of the floor

```
def followLine():
  if (LLIGHT.light < 50):
    curve(15, 45)
  elif (LINETRACKER.light > 70):
    curve(45, 15)
  else:
    drive(40)
```

**`followLine/C-one-turn`** (broken): turns the same way on and off the line

```
def followLine():
  if (LINETRACKER.light < 30):
    curve(15, 45)
  elif (LINETRACKER.light > 70):
    curve(15, 45)
  else:
    drive(40)
```

**`followLine/C-straight-off`** (broken): drives straight when off the line

```
def followLine():
  if (LINETRACKER.light < 30):
    curve(15, 45)
  elif (LINETRACKER.light > 70):
    drive(40)
  else:
    drive(40)
```

**`followLine/C-too-slow`** (broken): half the speed

```
def followLine():
  if (LINETRACKER.light < 30):
    curve(7, 22)
  elif (LINETRACKER.light > 70):
    curve(22, 7)
  else:
    drive(20)
```

## stopAtWall (L4)

Hands over to `followLine`.

### Reference tests

- **`stopAtWall:wall-ahead`**: Given the robot on a line that runs into a wall, when the program runs for 30 s, then it stops in front of the wall (it ends in the area before it), never bumps into it, and stands still from 15 s on (it gets there in about 9 s; L4 wants it to stand still in front of the wall). (world "A wall across the line", start A, 30 s; checks: ends_in t3, never_bumps t2, does stands_still from 15000 ms; there for: negated, no-handover, turns, slows)
- **`stopAtWall:no-wall`**: Given the robot on a line with nothing ahead, when the program runs, then it follows the line to the goal at its end. (world "A line without a wall", start A, until it touches t2, at most 40 s; checks: reaches t2, never_bumps anything; there for: negated, no-handover)

### Versions and results

| version | kind | fault | levels | `wall-ahead` | `no-wall` | verdict |
|---|---|---|---|---|---|---|
| `stopAtWall/A` | correct |  | L1 win, L2 win, L4 win_soft | pass | pass | ok |
| `stopAtWall/B` | correct |  | L1 win, L2 win, L4 win_soft | pass | pass | ok |
| `stopAtWall/C` | correct |  | L1 win, L2 win, L4 win_soft | pass | pass | ok |
| `stopAtWall/A-negated` | broken | negated | L4 no_result | **fail** | **fail** | caught |
| `stopAtWall/A-no-handover` | broken | no-handover | L4 no_result | **fail** | **fail** | caught |
| `stopAtWall/A-slows` | broken | slows | L4 fail_hit | **fail** | pass | caught |
| `stopAtWall/A-turns` | broken | turns | L4 no_result | **fail** | pass | caught |
| `stopAtWall/B-negated` | broken | negated | L4 no_result | **fail** | **fail** | caught |
| `stopAtWall/B-no-handover` | broken | no-handover | L4 no_result | **fail** | **fail** | caught |
| `stopAtWall/B-slows` | broken | slows | L4 fail_hit | **fail** | pass | caught |
| `stopAtWall/B-turns` | broken | turns | L4 no_result | **fail** | pass | caught |
| `stopAtWall/C-negated` | broken | negated | L4 no_result | **fail** | **fail** | caught |
| `stopAtWall/C-no-handover` | broken | no-handover | L4 no_result | **fail** | **fail** | caught |
| `stopAtWall/C-slows` | broken | slows | L4 fail_hit | **fail** | pass | caught |
| `stopAtWall/C-turns` | broken | turns | L4 no_result | **fail** | pass | caught |

### The code

**`stopAtWall/A`** (correct)

```
def stopAtWall():
  if obstacle(FRONT):
    stop()
  else:
    followLine()
```

**`stopAtWall/B`** (correct)

```
def stopAtWall():
  if obstacle(FRONT):
    drive(0)
  else:
    followLine()
```

**`stopAtWall/C`** (correct)

```
def stopAtWall():
  if obstacle(RIGHT):
    stop()
  else:
    followLine()
```

**`stopAtWall/A-negated`** (broken): the condition negated: stops when nothing is ahead

```
def stopAtWall():
  if not obstacle(FRONT):
    stop()
  else:
    followLine()
```

**`stopAtWall/A-no-handover`** (broken): nothing happens when no wall is ahead (the call of followLine is missing)

```
def stopAtWall():
  if obstacle(FRONT):
    stop()
```

**`stopAtWall/A-slows`** (broken): slows down instead of stopping

```
def stopAtWall():
  if obstacle(FRONT):
    drive(10)
  else:
    followLine()
```

**`stopAtWall/A-turns`** (broken): turns away instead of stopping

```
def stopAtWall():
  if obstacle(FRONT):
    turn_right(30, 90 deg)
  else:
    followLine()
```

**`stopAtWall/B-negated`** (broken): the condition negated: stops when nothing is ahead

```
def stopAtWall():
  if not obstacle(FRONT):
    drive(0)
  else:
    followLine()
```

**`stopAtWall/B-no-handover`** (broken): nothing happens when no wall is ahead (the call of followLine is missing)

```
def stopAtWall():
  if obstacle(FRONT):
    drive(0)
```

**`stopAtWall/B-slows`** (broken): slows down instead of stopping

```
def stopAtWall():
  if obstacle(FRONT):
    drive(10)
  else:
    followLine()
```

**`stopAtWall/B-turns`** (broken): turns away instead of stopping

```
def stopAtWall():
  if obstacle(FRONT):
    turn_right(30, 90 deg)
  else:
    followLine()
```

**`stopAtWall/C-negated`** (broken): the condition negated: stops when nothing is ahead

```
def stopAtWall():
  if not obstacle(RIGHT):
    stop()
  else:
    followLine()
```

**`stopAtWall/C-no-handover`** (broken): nothing happens when no wall is ahead (the call of followLine is missing)

```
def stopAtWall():
  if obstacle(RIGHT):
    stop()
```

**`stopAtWall/C-slows`** (broken): slows down instead of stopping

```
def stopAtWall():
  if obstacle(RIGHT):
    drive(10)
  else:
    followLine()
```

**`stopAtWall/C-turns`** (broken): turns away instead of stopping

```
def stopAtWall():
  if obstacle(RIGHT):
    turn_right(30, 90 deg)
  else:
    followLine()
```

## driveInTheDark (L5)

Hands over to `stopAtWall`.

### Reference tests

- **`driveInTheDark:through-tunnel`**: Given the robot on a line that runs into a tunnel, when the program runs, then it drives on in the dark to the goal inside the tunnel without bumping into the tunnel's walls. (world "Through the tunnel", start A, until it touches t3, at most 60 s; checks: reaches t3, never_bumps t2; there for: never-dark, floor-sensor, negated, curves, no-handover)
- **`driveInTheDark:start-in-dark`**: Given the robot inside a dark tunnel with no line, when the program runs, then it drives straight on to the goal without bumping into the tunnel's walls. (world "Starts in the dark", start A, until it touches t2, at most 60 s; checks: reaches t2, never_bumps t1; there for: never-dark, floor-sensor, negated, curves)
- **`driveInTheDark:bend-in-light`**: Given the robot on a line in the light that bends to the left, when the program runs, then it follows the line round the bend to the goal (it drives straight only in the dark). (world "In the light, a bend to the left", start A, until it touches t2, at most 40 s; checks: reaches t2, never_bumps anything; there for: negated, no-handover)

### Versions and results

| version | kind | fault | levels | `through-tunnel` | `start-in-dark` | `bend-in-light` | verdict |
|---|---|---|---|---|---|---|---|
| `driveInTheDark/A` | correct |  | L1 win, L2 win, L4 win_soft, L5 win | pass | pass | pass | ok |
| `driveInTheDark/B` | correct |  | L1 win, L2 win, L4 win_soft, L5 win | pass | pass | pass | ok |
| `driveInTheDark/C` | correct |  | L1 win, L2 win, L4 win_soft, L5 win | pass | pass | pass | ok |
| `driveInTheDark/A-curves` | broken | curves | L5 fail_hit | **fail** | **fail** | pass | caught |
| `driveInTheDark/A-floor-sensor` | broken | floor-sensor | L5 fail_hit | **fail** | **fail** | **fail** | caught |
| `driveInTheDark/A-negated` | broken | negated | L5 fail_hit | **fail** | **fail** | **fail** | caught |
| `driveInTheDark/A-never-dark` | broken | never-dark | L5 fail_hit | **fail** | **fail** | pass | caught |
| `driveInTheDark/A-no-handover` | broken | no-handover | L5 no_result | **fail** | pass | **fail** | caught |
| `driveInTheDark/B-curves` | broken | curves | L5 fail_hit | **fail** | **fail** | pass | caught |
| `driveInTheDark/B-floor-sensor` | broken | floor-sensor | L5 fail_hit | **fail** | **fail** | **fail** | caught |
| `driveInTheDark/B-negated` | broken | negated | L5 fail_hit | **fail** | **fail** | **fail** | caught |
| `driveInTheDark/B-never-dark` | broken | never-dark | L5 fail_hit | **fail** | **fail** | pass | caught |
| `driveInTheDark/B-no-handover` | broken | no-handover | L5 no_result | **fail** | pass | **fail** | caught |
| `driveInTheDark/C-curves` | broken | curves | L5 fail_hit | **fail** | **fail** | pass | caught |
| `driveInTheDark/C-floor-sensor` | broken | floor-sensor | L5 fail_hit | **fail** | **fail** | **fail** | caught |
| `driveInTheDark/C-negated` | broken | negated | L5 fail_hit | **fail** | **fail** | **fail** | caught |
| `driveInTheDark/C-never-dark` | broken | never-dark | L5 fail_hit | **fail** | **fail** | pass | caught |
| `driveInTheDark/C-no-handover` | broken | no-handover | L5 no_result | **fail** | pass | **fail** | caught |

### The code

**`driveInTheDark/A`** (correct)

```
def driveInTheDark():
  if (LLIGHT.light < 70):
    drive(30)
  else:
    stopAtWall()
```

**`driveInTheDark/B`** (correct)

```
def driveInTheDark():
  if (RLIGHT.light < 70):
    drive(40)
  else:
    stopAtWall()
```

**`driveInTheDark/C`** (correct)

```
def driveInTheDark():
  if (RLIGHT.light < 75):
    drive(30)
  else:
    stopAtWall()
```

**`driveInTheDark/A-curves`** (broken): curves in the dark instead of driving straight

```
def driveInTheDark():
  if (LLIGHT.light < 70):
    curve(40, 20)
  else:
    stopAtWall()
```

**`driveInTheDark/A-floor-sensor`** (broken): reads the floor (LINETRACKER) instead of the light from above

```
def driveInTheDark():
  if (LINETRACKER.light < 70):
    drive(30)
  else:
    stopAtWall()
```

**`driveInTheDark/A-negated`** (broken): the comparison the wrong way round: drives straight in the light

```
def driveInTheDark():
  if (LLIGHT.light > 70):
    drive(30)
  else:
    stopAtWall()
```

**`driveInTheDark/A-never-dark`** (broken): the threshold below what the light sensor ever reads (40 in a tunnel)

```
def driveInTheDark():
  if (LLIGHT.light < 30):
    drive(30)
  else:
    stopAtWall()
```

**`driveInTheDark/A-no-handover`** (broken): nothing happens in the light (the call of stopAtWall is missing)

```
def driveInTheDark():
  if (LLIGHT.light < 70):
    drive(30)
```

**`driveInTheDark/B-curves`** (broken): curves in the dark instead of driving straight

```
def driveInTheDark():
  if (RLIGHT.light < 70):
    curve(40, 20)
  else:
    stopAtWall()
```

**`driveInTheDark/B-floor-sensor`** (broken): reads the floor (LINETRACKER) instead of the light from above

```
def driveInTheDark():
  if (LINETRACKER.light < 70):
    drive(40)
  else:
    stopAtWall()
```

**`driveInTheDark/B-negated`** (broken): the comparison the wrong way round: drives straight in the light

```
def driveInTheDark():
  if (RLIGHT.light > 70):
    drive(40)
  else:
    stopAtWall()
```

**`driveInTheDark/B-never-dark`** (broken): the threshold below what the light sensor ever reads (40 in a tunnel)

```
def driveInTheDark():
  if (RLIGHT.light < 30):
    drive(40)
  else:
    stopAtWall()
```

**`driveInTheDark/B-no-handover`** (broken): nothing happens in the light (the call of stopAtWall is missing)

```
def driveInTheDark():
  if (RLIGHT.light < 70):
    drive(40)
```

**`driveInTheDark/C-curves`** (broken): curves in the dark instead of driving straight

```
def driveInTheDark():
  if (RLIGHT.light < 75):
    curve(40, 20)
  else:
    stopAtWall()
```

**`driveInTheDark/C-floor-sensor`** (broken): reads the floor (LINETRACKER) instead of the light from above

```
def driveInTheDark():
  if (LINETRACKER.light < 75):
    drive(30)
  else:
    stopAtWall()
```

**`driveInTheDark/C-negated`** (broken): the comparison the wrong way round: drives straight in the light

```
def driveInTheDark():
  if (RLIGHT.light > 75):
    drive(30)
  else:
    stopAtWall()
```

**`driveInTheDark/C-never-dark`** (broken): the threshold below what the light sensor ever reads (40 in a tunnel)

```
def driveInTheDark():
  if (RLIGHT.light < 30):
    drive(30)
  else:
    stopAtWall()
```

**`driveInTheDark/C-no-handover`** (broken): nothing happens in the light (the call of stopAtWall is missing)

```
def driveInTheDark():
  if (RLIGHT.light < 75):
    drive(30)
```

## avoidWalls (L6)

Hands over to `driveInTheDark`.

### Reference tests

- **`avoidWalls:tunnel-bends-right`**: Given the robot on a line into a tunnel that bends to the right, when the program runs, then in the dark it turns away from the tunnel's wall on its left and gets round the bend to the goal inside the tunnel without bumping into it. (world "A tunnel that bends to the right", start A, until it touches t3, at most 60 s; checks: reaches t3, never_bumps t2; there for: swapped, front-sensor, never-dark, no-handover)
- **`avoidWalls:tunnel-bends-left`**: Given the robot on a line into a tunnel that bends to the left, when the program runs, then in the dark it turns away from the tunnel's wall on its right and gets round the bend to the goal inside the tunnel without bumping into it. (world "A tunnel that bends to the left", start A, until it touches t3, at most 60 s; checks: reaches t3, never_bumps t2; there for: swapped, front-sensor, never-dark, no-handover)
- **`avoidWalls:through-tunnel`**: Given the robot on a line that runs into a tunnel, when the program runs, then it drives on in the dark to the goal inside the tunnel without bumping into the tunnel's walls. (world "Through the tunnel", start A, until it touches t3, at most 60 s; checks: reaches t3, never_bumps t2; there for: no-handover)

### Versions and results

| version | kind | fault | levels | `tunnel-bends-right` | `tunnel-bends-left` | `through-tunnel` | verdict |
|---|---|---|---|---|---|---|---|
| `avoidWalls/A` | correct |  | L1 win, L2 win, L4 win_soft, L5 win, L6 win | pass | pass | pass | ok |
| `avoidWalls/B` | correct |  | L1 win, L2 win, L4 win_soft, L5 win, L6 win; later: L7 fail_hit | pass | pass | pass | ok |
| `avoidWalls/C` | correct |  | L1 win, L2 win, L4 win_soft, L5 win, L6 win; later: L7 fail_hit | pass | pass | pass | ok |
| `avoidWalls/A-front-sensor` | broken | front-sensor | L6 fail_hit | **fail** | pass | pass | caught |
| `avoidWalls/A-never-dark` | broken | never-dark | L6 fail_hit | **fail** | **fail** | pass | caught |
| `avoidWalls/A-no-handover` | broken | no-handover | L6 no_result | **fail** | **fail** | **fail** | caught |
| `avoidWalls/A-swapped` | broken | swapped | L6 fail_hit | **fail** | **fail** | pass | caught |
| `avoidWalls/B-front-sensor` | broken | front-sensor | L6 fail_hit | pass | **fail** | pass | caught |
| `avoidWalls/B-never-dark` | broken | never-dark | L6 fail_hit | **fail** | **fail** | pass | caught |
| `avoidWalls/B-no-handover` | broken | no-handover | L6 no_result | **fail** | **fail** | **fail** | caught |
| `avoidWalls/B-swapped` | broken | swapped | L6 fail_hit | **fail** | **fail** | pass | caught |
| `avoidWalls/C-front-sensor` | broken | front-sensor | L6 fail_hit | **fail** | pass | pass | caught |
| `avoidWalls/C-never-dark` | broken | never-dark | L6 fail_hit | **fail** | **fail** | pass | caught |
| `avoidWalls/C-no-handover` | broken | no-handover | L6 no_result | **fail** | **fail** | **fail** | caught |
| `avoidWalls/C-swapped` | broken | swapped | L6 fail_hit | **fail** | **fail** | pass | caught |

### The code

**`avoidWalls/A`** (correct)

```
def avoidWalls():
  if (LLIGHT.light < 70):
    if obstacle(LEFT):
      turn_right(30, 20 deg)
    elif obstacle(RIGHT):
      turn_left(30, 20 deg)
    else:
      driveInTheDark()
  else:
    driveInTheDark()
```

**`avoidWalls/B`** (correct)

```
def avoidWalls():
  if (RLIGHT.light < 60):
    if obstacle(RIGHT):
      turn_left(40, 15 deg)
    elif obstacle(LEFT):
      turn_right(40, 15 deg)
    else:
      driveInTheDark()
  else:
    driveInTheDark()
```

**`avoidWalls/C`** (correct)

```
def avoidWalls():
  if (LLIGHT.light < 70):
    if obstacle(LEFT):
      curve(30, 0)
    elif obstacle(RIGHT):
      curve(0, 30)
    else:
      driveInTheDark()
  else:
    driveInTheDark()
```

**`avoidWalls/A-front-sensor`** (broken): reads FRONT instead of the first side sensor

```
def avoidWalls():
  if (LLIGHT.light < 70):
    if obstacle(FRONT):
      turn_right(30, 20 deg)
    elif obstacle(RIGHT):
      turn_left(30, 20 deg)
    else:
      driveInTheDark()
  else:
    driveInTheDark()
```

**`avoidWalls/A-never-dark`** (broken): the threshold below what the light sensor ever reads

```
def avoidWalls():
  if (LLIGHT.light < 30):
    if obstacle(LEFT):
      turn_right(30, 20 deg)
    elif obstacle(RIGHT):
      turn_left(30, 20 deg)
    else:
      driveInTheDark()
  else:
    driveInTheDark()
```

**`avoidWalls/A-no-handover`** (broken): nothing happens without a wall (the calls of driveInTheDark are missing)

```
def avoidWalls():
  if (LLIGHT.light < 70):
    if obstacle(LEFT):
      turn_right(30, 20 deg)
    elif obstacle(RIGHT):
      turn_left(30, 20 deg)
```

**`avoidWalls/A-swapped`** (broken): turns towards the wall: the turns swapped

```
def avoidWalls():
  if (LLIGHT.light < 70):
    if obstacle(LEFT):
      turn_left(30, 20 deg)
    elif obstacle(RIGHT):
      turn_right(30, 20 deg)
    else:
      driveInTheDark()
  else:
    driveInTheDark()
```

**`avoidWalls/B-front-sensor`** (broken): reads FRONT instead of the first side sensor

```
def avoidWalls():
  if (RLIGHT.light < 60):
    if obstacle(FRONT):
      turn_left(40, 15 deg)
    elif obstacle(LEFT):
      turn_right(40, 15 deg)
    else:
      driveInTheDark()
  else:
    driveInTheDark()
```

**`avoidWalls/B-never-dark`** (broken): the threshold below what the light sensor ever reads

```
def avoidWalls():
  if (RLIGHT.light < 30):
    if obstacle(RIGHT):
      turn_left(40, 15 deg)
    elif obstacle(LEFT):
      turn_right(40, 15 deg)
    else:
      driveInTheDark()
  else:
    driveInTheDark()
```

**`avoidWalls/B-no-handover`** (broken): nothing happens without a wall (the calls of driveInTheDark are missing)

```
def avoidWalls():
  if (RLIGHT.light < 60):
    if obstacle(RIGHT):
      turn_left(40, 15 deg)
    elif obstacle(LEFT):
      turn_right(40, 15 deg)
```

**`avoidWalls/B-swapped`** (broken): turns towards the wall: the turns swapped

```
def avoidWalls():
  if (RLIGHT.light < 60):
    if obstacle(RIGHT):
      turn_right(40, 15 deg)
    elif obstacle(LEFT):
      turn_left(40, 15 deg)
    else:
      driveInTheDark()
  else:
    driveInTheDark()
```

**`avoidWalls/C-front-sensor`** (broken): reads FRONT instead of the first side sensor

```
def avoidWalls():
  if (LLIGHT.light < 70):
    if obstacle(FRONT):
      curve(30, 0)
    elif obstacle(RIGHT):
      curve(0, 30)
    else:
      driveInTheDark()
  else:
    driveInTheDark()
```

**`avoidWalls/C-never-dark`** (broken): the threshold below what the light sensor ever reads

```
def avoidWalls():
  if (LLIGHT.light < 30):
    if obstacle(LEFT):
      curve(30, 0)
    elif obstacle(RIGHT):
      curve(0, 30)
    else:
      driveInTheDark()
  else:
    driveInTheDark()
```

**`avoidWalls/C-no-handover`** (broken): nothing happens without a wall (the calls of driveInTheDark are missing)

```
def avoidWalls():
  if (LLIGHT.light < 70):
    if obstacle(LEFT):
      curve(30, 0)
    elif obstacle(RIGHT):
      curve(0, 30)
```

**`avoidWalls/C-swapped`** (broken): turns towards the wall: the turns swapped

```
def avoidWalls():
  if (LLIGHT.light < 70):
    if obstacle(LEFT):
      curve(0, 30)
    elif obstacle(RIGHT):
      curve(30, 0)
    else:
      driveInTheDark()
  else:
    driveInTheDark()
```

## followInTheDark (L7)

Hands over to `avoidWalls`.

### Reference tests

- **`followInTheDark:dark-line-bends-right`**: Given the robot on a line inside a dark tunnel, when the line bends to the right, then the robot follows it to the goal at its end without bumping into the tunnel. (world "A line in the dark that bends to the right", start A, until it touches t3, at most 60 s; checks: reaches t3, never_bumps t1; there for: peach-is-black, light-above, no-handover)
- **`followInTheDark:dark-line-bends-left`**: Given the robot on a line inside a dark tunnel, when the line bends to the left, then the robot follows it to the goal at its end without bumping into the tunnel. (world "A line in the dark that bends to the left", start A, until it touches t3, at most 60 s; checks: reaches t3, never_bumps t1; there for: peach-is-black, light-above, no-handover)
- **`followInTheDark:start-in-dark`**: Given the robot inside a dark tunnel with no line, when the program runs, then it drives straight on to the goal without bumping into the tunnel's walls. (world "Starts in the dark", start A, until it touches t2, at most 60 s; checks: reaches t2, never_bumps t1; there for: peach-is-black, light-above, no-handover)

### Versions and results

| version | kind | fault | levels | `dark-line-bends-right` | `dark-line-bends-left` | `start-in-dark` | verdict |
|---|---|---|---|---|---|---|---|
| `followInTheDark/A` | correct |  | L1 win, L2 win, L4 win_soft, L5 win, L6 win, L7 win | pass | pass | pass | ok |
| `followInTheDark/B` | correct |  | L1 win, L2 win, L4 win_soft, L5 win, L6 win, L7 win | pass | pass | pass | ok |
| `followInTheDark/C` | correct |  | L1 win, L2 win, L4 win_soft, L5 win, L6 win, L7 win | pass | pass | pass | ok |
| `followInTheDark/A-swapped` | equivalent | swapped | L7 win | pass | pass | pass | ok |
| `followInTheDark/B-swapped` | equivalent | swapped | L7 win | pass | pass | pass | ok |
| `followInTheDark/C-swapped` | equivalent | swapped | L7 win | pass | pass | pass | ok |
| `followInTheDark/A-light-above` | broken | light-above | L7 fail_hit | **fail** | **fail** | **fail** | caught |
| `followInTheDark/A-no-handover` | broken | no-handover | L7 no_result | pass | pass | **fail** | caught |
| `followInTheDark/A-peach-is-black` | broken | peach-is-black | L7 fail_hit | pass | pass | **fail** | caught |
| `followInTheDark/B-light-above` | broken | light-above | L7 fail_hit | **fail** | **fail** | **fail** | caught |
| `followInTheDark/B-no-handover` | broken | no-handover | L7 no_result | pass | pass | **fail** | caught |
| `followInTheDark/B-peach-is-black` | broken | peach-is-black | L7 fail_hit | pass | pass | **fail** | caught |
| `followInTheDark/C-light-above` | broken | light-above | L7 fail_hit | **fail** | **fail** | **fail** | caught |
| `followInTheDark/C-no-handover` | broken | no-handover | L7 no_result | pass | pass | **fail** | caught |
| `followInTheDark/C-peach-is-black` | broken | peach-is-black | L7 fail_hit | pass | pass | **fail** | caught |

### The code

**`followInTheDark/A`** (correct)

```
def followInTheDark():
  if (LLIGHT.light < 70):
    if (LINETRACKER.light < 45):
      curve(10, 30)
    elif (LINETRACKER.light > 90):
      curve(30, 10)
    else:
      avoidWalls()
  else:
    avoidWalls()
```

**`followInTheDark/B`** (correct)

```
def followInTheDark():
  if (RLIGHT.light < 60):
    if (LINETRACKER.light < 30):
      curve(15, 35)
    elif (LINETRACKER.light > 95):
      curve(35, 15)
    else:
      avoidWalls()
  else:
    avoidWalls()
```

**`followInTheDark/C`** (correct)

```
def followInTheDark():
  if (LLIGHT.light < 70):
    if (LINETRACKER.light < 40):
      curve(0, 30)
    elif (LINETRACKER.light > 88):
      curve(30, 0)
    else:
      avoidWalls()
  else:
    avoidWalls()
```

**`followInTheDark/A-swapped`** (equivalent): the two turns swapped

```
def followInTheDark():
  if (LLIGHT.light < 70):
    if (LINETRACKER.light < 45):
      curve(30, 10)
    elif (LINETRACKER.light > 90):
      curve(10, 30)
    else:
      avoidWalls()
  else:
    avoidWalls()
```

**`followInTheDark/B-swapped`** (equivalent): the two turns swapped

```
def followInTheDark():
  if (RLIGHT.light < 60):
    if (LINETRACKER.light < 30):
      curve(35, 15)
    elif (LINETRACKER.light > 95):
      curve(15, 35)
    else:
      avoidWalls()
  else:
    avoidWalls()
```

**`followInTheDark/C-swapped`** (equivalent): the two turns swapped

```
def followInTheDark():
  if (LLIGHT.light < 70):
    if (LINETRACKER.light < 40):
      curve(30, 0)
    elif (LINETRACKER.light > 88):
      curve(0, 30)
    else:
      avoidWalls()
  else:
    avoidWalls()
```

**`followInTheDark/A-light-above`** (broken): reads the light from above instead of the floor

```
def followInTheDark():
  if (LLIGHT.light < 70):
    if (LLIGHT.light < 45):
      curve(10, 30)
    elif (LINETRACKER.light > 90):
      curve(30, 10)
    else:
      avoidWalls()
  else:
    avoidWalls()
```

**`followInTheDark/A-no-handover`** (broken): nothing happens off the line in the dark and in the light (the calls of avoidWalls are missing)

```
def followInTheDark():
  if (LLIGHT.light < 70):
    if (LINETRACKER.light < 45):
      curve(10, 30)
    elif (LINETRACKER.light > 90):
      curve(30, 10)
```

**`followInTheDark/A-peach-is-black`** (broken): the black threshold above the floor (83): it steers everywhere

```
def followInTheDark():
  if (LLIGHT.light < 70):
    if (LINETRACKER.light < 90):
      curve(10, 30)
    elif (LINETRACKER.light > 90):
      curve(30, 10)
    else:
      avoidWalls()
  else:
    avoidWalls()
```

**`followInTheDark/B-light-above`** (broken): reads the light from above instead of the floor

```
def followInTheDark():
  if (RLIGHT.light < 60):
    if (LLIGHT.light < 45):
      curve(15, 35)
    elif (LINETRACKER.light > 95):
      curve(35, 15)
    else:
      avoidWalls()
  else:
    avoidWalls()
```

**`followInTheDark/B-no-handover`** (broken): nothing happens off the line in the dark and in the light (the calls of avoidWalls are missing)

```
def followInTheDark():
  if (RLIGHT.light < 60):
    if (LINETRACKER.light < 30):
      curve(15, 35)
    elif (LINETRACKER.light > 95):
      curve(35, 15)
```

**`followInTheDark/B-peach-is-black`** (broken): the black threshold above the floor (83): it steers everywhere

```
def followInTheDark():
  if (RLIGHT.light < 60):
    if (LINETRACKER.light < 90):
      curve(15, 35)
    elif (LINETRACKER.light > 95):
      curve(35, 15)
    else:
      avoidWalls()
  else:
    avoidWalls()
```

**`followInTheDark/C-light-above`** (broken): reads the light from above instead of the floor

```
def followInTheDark():
  if (LLIGHT.light < 70):
    if (LLIGHT.light < 45):
      curve(0, 30)
    elif (LINETRACKER.light > 88):
      curve(30, 0)
    else:
      avoidWalls()
  else:
    avoidWalls()
```

**`followInTheDark/C-no-handover`** (broken): nothing happens off the line in the dark and in the light (the calls of avoidWalls are missing)

```
def followInTheDark():
  if (LLIGHT.light < 70):
    if (LINETRACKER.light < 40):
      curve(0, 30)
    elif (LINETRACKER.light > 88):
      curve(30, 0)
```

**`followInTheDark/C-peach-is-black`** (broken): the black threshold above the floor (83): it steers everywhere

```
def followInTheDark():
  if (LLIGHT.light < 70):
    if (LINETRACKER.light < 90):
      curve(0, 30)
    elif (LINETRACKER.light > 88):
      curve(30, 0)
    else:
      avoidWalls()
  else:
    avoidWalls()
```

