# The phase 5 corpus

Made by `corpus.py`, decided on the levels by `verify.py` (`versions.json`); the programs as Lab exports are in `programs/`. A level's program is its function and the functions of the levels before, each handing over to the one before; the main loop calls the newest:

```
main:
  forever:
    <the newest function>()
```

A **correct** version beats its levels and every level before (the other functions in their reference version A). A **broken** version loses one of its levels; a fault that still beats its levels is **equivalent** and isn't used. "Later levels" plays a correct version with the later functions in their reference version.

## followLine (L1, L2)

### followLine/A: correct

L1 win, L2 win

```
def followLine():
  if LINETRACKER.line:
    curve(10, 40)
  else:
    curve(40, 10)
```

### followLine/A-swapped: equivalent (still wins)

The two turns swapped. L1 win, L2 win

```
def followLine():
  if LINETRACKER.line:
    curve(40, 10)
  else:
    curve(10, 40)
```

### followLine/A-light-above: broken

Reads the light from above (LLIGHT) instead of the floor. L1 time_limit, L2 fail_area

```
def followLine():
  if (LLIGHT.light < 50):
    curve(10, 40)
  else:
    curve(40, 10)
```

### followLine/A-one-turn: broken

Turns the same way on and off the line. L1 time_limit, L2 fail_hit

```
def followLine():
  if LINETRACKER.line:
    curve(10, 40)
  else:
    curve(10, 40)
```

### followLine/A-too-slow: broken

Half the speed. L1 time_limit, L2 win

```
def followLine():
  if LINETRACKER.line:
    curve(5, 20)
  else:
    curve(20, 5)
```

### followLine/A-straight-off: broken

Drives straight when off the line. L1 fail_hit, L2 fail_hit

```
def followLine():
  if LINETRACKER.line:
    curve(10, 40)
  else:
    drive(40)
```

### followLine/B: correct; later levels lost: L5 fail_hit

L1 win, L2 win

```
def followLine():
  if (LINETRACKER.light < 50):
    curve(20, 50)
  else:
    curve(50, 20)
```

### followLine/B-swapped: equivalent (still wins)

The two turns swapped. L1 win, L2 win

```
def followLine():
  if (LINETRACKER.light < 50):
    curve(50, 20)
  else:
    curve(20, 50)
```

### followLine/B-light-above: broken

Reads the light from above (LLIGHT) instead of the floor. L1 fail_hit, L2 fail_area

```
def followLine():
  if (LLIGHT.light < 50):
    curve(20, 50)
  else:
    curve(50, 20)
```

### followLine/B-one-turn: broken

Turns the same way on and off the line. L1 fail_hit, L2 fail_hit

```
def followLine():
  if (LINETRACKER.light < 50):
    curve(20, 50)
  else:
    curve(20, 50)
```

### followLine/B-too-slow: equivalent (still wins)

Half the speed. L1 win, L2 win

```
def followLine():
  if (LINETRACKER.light < 50):
    curve(10, 25)
  else:
    curve(25, 10)
```

### followLine/B-straight-off: broken

Drives straight when off the line. L1 fail_hit, L2 fail_hit

```
def followLine():
  if (LINETRACKER.light < 50):
    curve(20, 50)
  else:
    drive(40)
```

### followLine/C: correct

L1 win, L2 win

```
def followLine():
  if (LINETRACKER.light < 30):
    curve(15, 45)
  elif (LINETRACKER.light > 70):
    curve(45, 15)
  else:
    drive(40)
```

### followLine/C-swapped: equivalent (still wins)

The two turns swapped. L1 win, L2 win

```
def followLine():
  if (LINETRACKER.light < 30):
    curve(45, 15)
  elif (LINETRACKER.light > 70):
    curve(15, 45)
  else:
    drive(40)
```

### followLine/C-light-above: broken

Reads the light from above (LLIGHT) instead of the floor. L1 win, L2 fail_area

```
def followLine():
  if (LLIGHT.light < 50):
    curve(15, 45)
  elif (LINETRACKER.light > 70):
    curve(45, 15)
  else:
    drive(40)
```

### followLine/C-one-turn: broken

Turns the same way on and off the line. L1 time_limit, L2 fail_hit

```
def followLine():
  if (LINETRACKER.light < 30):
    curve(15, 45)
  elif (LINETRACKER.light > 70):
    curve(15, 45)
  else:
    drive(40)
```

### followLine/C-too-slow: broken

Half the speed. L1 time_limit, L2 win

```
def followLine():
  if (LINETRACKER.light < 30):
    curve(7, 22)
  elif (LINETRACKER.light > 70):
    curve(22, 7)
  else:
    drive(20)
```

### followLine/C-straight-off: broken

Drives straight when off the line. L1 win, L2 fail_hit

```
def followLine():
  if (LINETRACKER.light < 30):
    curve(15, 45)
  elif (LINETRACKER.light > 70):
    drive(40)
  else:
    drive(40)
```

## stopAtWall (L4)

### stopAtWall/A: correct

L1 win, L2 win, L4 win_soft

```
def stopAtWall():
  if obstacle(FRONT):
    stop()
  else:
    followLine()
```

### stopAtWall/A-negated: broken

The condition negated: stops when nothing is ahead. L4 no_result

```
def stopAtWall():
  if not obstacle(FRONT):
    stop()
  else:
    followLine()
```

### stopAtWall/A-no-handover: broken

Nothing happens when no wall is ahead (the call of followLine is missing). L4 no_result

```
def stopAtWall():
  if obstacle(FRONT):
    stop()
```

### stopAtWall/A-turns: broken

Turns away instead of stopping. L4 no_result

```
def stopAtWall():
  if obstacle(FRONT):
    turn_right(30, 90 deg)
  else:
    followLine()
```

### stopAtWall/A-slows: broken

Slows down instead of stopping. L4 fail_hit

```
def stopAtWall():
  if obstacle(FRONT):
    drive(10)
  else:
    followLine()
```

### stopAtWall/B: correct

L1 win, L2 win, L4 win_soft

```
def stopAtWall():
  if obstacle(FRONT):
    drive(0)
  else:
    followLine()
```

### stopAtWall/B-negated: broken

The condition negated: stops when nothing is ahead. L4 no_result

```
def stopAtWall():
  if not obstacle(FRONT):
    drive(0)
  else:
    followLine()
```

### stopAtWall/B-no-handover: broken

Nothing happens when no wall is ahead (the call of followLine is missing). L4 no_result

```
def stopAtWall():
  if obstacle(FRONT):
    drive(0)
```

### stopAtWall/B-turns: broken

Turns away instead of stopping. L4 no_result

```
def stopAtWall():
  if obstacle(FRONT):
    turn_right(30, 90 deg)
  else:
    followLine()
```

### stopAtWall/B-slows: broken

Slows down instead of stopping. L4 fail_hit

```
def stopAtWall():
  if obstacle(FRONT):
    drive(10)
  else:
    followLine()
```

### stopAtWall/C: correct

L1 win, L2 win, L4 win_soft

```
def stopAtWall():
  if obstacle(RIGHT):
    stop()
  else:
    followLine()
```

### stopAtWall/C-negated: broken

The condition negated: stops when nothing is ahead. L4 no_result

```
def stopAtWall():
  if not obstacle(RIGHT):
    stop()
  else:
    followLine()
```

### stopAtWall/C-no-handover: broken

Nothing happens when no wall is ahead (the call of followLine is missing). L4 no_result

```
def stopAtWall():
  if obstacle(RIGHT):
    stop()
```

### stopAtWall/C-turns: broken

Turns away instead of stopping. L4 no_result

```
def stopAtWall():
  if obstacle(RIGHT):
    turn_right(30, 90 deg)
  else:
    followLine()
```

### stopAtWall/C-slows: broken

Slows down instead of stopping. L4 fail_hit

```
def stopAtWall():
  if obstacle(RIGHT):
    drive(10)
  else:
    followLine()
```

## driveInTheDark (L5)

### driveInTheDark/A: correct

L1 win, L2 win, L4 win_soft, L5 win

```
def driveInTheDark():
  if (LLIGHT.light < 70):
    drive(30)
  else:
    stopAtWall()
```

### driveInTheDark/A-never-dark: broken

The threshold below what the light sensor ever reads (40 in a tunnel). L5 fail_hit

```
def driveInTheDark():
  if (LLIGHT.light < 30):
    drive(30)
  else:
    stopAtWall()
```

### driveInTheDark/A-floor-sensor: broken

Reads the floor (LINETRACKER) instead of the light from above. L5 fail_hit

```
def driveInTheDark():
  if (LINETRACKER.light < 70):
    drive(30)
  else:
    stopAtWall()
```

### driveInTheDark/A-negated: broken

The comparison the wrong way round: drives straight in the light. L5 fail_hit

```
def driveInTheDark():
  if (LLIGHT.light > 70):
    drive(30)
  else:
    stopAtWall()
```

### driveInTheDark/A-curves: broken

Curves in the dark instead of driving straight. L5 fail_hit

```
def driveInTheDark():
  if (LLIGHT.light < 70):
    curve(40, 20)
  else:
    stopAtWall()
```

### driveInTheDark/A-no-handover: broken

Nothing happens in the light (the call of stopAtWall is missing). L5 no_result

```
def driveInTheDark():
  if (LLIGHT.light < 70):
    drive(30)
```

### driveInTheDark/B: correct

L1 win, L2 win, L4 win_soft, L5 win

```
def driveInTheDark():
  if (RLIGHT.light < 70):
    drive(40)
  else:
    stopAtWall()
```

### driveInTheDark/B-never-dark: broken

The threshold below what the light sensor ever reads (40 in a tunnel). L5 fail_hit

```
def driveInTheDark():
  if (RLIGHT.light < 30):
    drive(40)
  else:
    stopAtWall()
```

### driveInTheDark/B-floor-sensor: broken

Reads the floor (LINETRACKER) instead of the light from above. L5 fail_hit

```
def driveInTheDark():
  if (LINETRACKER.light < 70):
    drive(40)
  else:
    stopAtWall()
```

### driveInTheDark/B-negated: broken

The comparison the wrong way round: drives straight in the light. L5 fail_hit

```
def driveInTheDark():
  if (RLIGHT.light > 70):
    drive(40)
  else:
    stopAtWall()
```

### driveInTheDark/B-curves: broken

Curves in the dark instead of driving straight. L5 fail_hit

```
def driveInTheDark():
  if (RLIGHT.light < 70):
    curve(40, 20)
  else:
    stopAtWall()
```

### driveInTheDark/B-no-handover: broken

Nothing happens in the light (the call of stopAtWall is missing). L5 no_result

```
def driveInTheDark():
  if (RLIGHT.light < 70):
    drive(40)
```

### driveInTheDark/C: correct

L1 win, L2 win, L4 win_soft, L5 win

```
def driveInTheDark():
  if (RLIGHT.light < 75):
    drive(30)
  else:
    stopAtWall()
```

### driveInTheDark/C-never-dark: broken

The threshold below what the light sensor ever reads (40 in a tunnel). L5 fail_hit

```
def driveInTheDark():
  if (RLIGHT.light < 30):
    drive(30)
  else:
    stopAtWall()
```

### driveInTheDark/C-floor-sensor: broken

Reads the floor (LINETRACKER) instead of the light from above. L5 fail_hit

```
def driveInTheDark():
  if (LINETRACKER.light < 75):
    drive(30)
  else:
    stopAtWall()
```

### driveInTheDark/C-negated: broken

The comparison the wrong way round: drives straight in the light. L5 fail_hit

```
def driveInTheDark():
  if (RLIGHT.light > 75):
    drive(30)
  else:
    stopAtWall()
```

### driveInTheDark/C-curves: broken

Curves in the dark instead of driving straight. L5 fail_hit

```
def driveInTheDark():
  if (RLIGHT.light < 75):
    curve(40, 20)
  else:
    stopAtWall()
```

### driveInTheDark/C-no-handover: broken

Nothing happens in the light (the call of stopAtWall is missing). L5 no_result

```
def driveInTheDark():
  if (RLIGHT.light < 75):
    drive(30)
```

## avoidWalls (L6)

### avoidWalls/A: correct

L1 win, L2 win, L4 win_soft, L5 win, L6 win

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

### avoidWalls/A-swapped: broken

Turns towards the wall: the turns swapped. L6 fail_hit

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

### avoidWalls/A-front-sensor: broken

Reads FRONT instead of the first side sensor. L6 fail_hit

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

### avoidWalls/A-never-dark: broken

The threshold below what the light sensor ever reads. L6 fail_hit

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

### avoidWalls/A-no-handover: broken

Nothing happens without a wall (the calls of driveInTheDark are missing). L6 no_result

```
def avoidWalls():
  if (LLIGHT.light < 70):
    if obstacle(LEFT):
      turn_right(30, 20 deg)
    elif obstacle(RIGHT):
      turn_left(30, 20 deg)
```

### avoidWalls/B: correct; later levels lost: L7 fail_hit

L1 win, L2 win, L4 win_soft, L5 win, L6 win

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

### avoidWalls/B-swapped: broken

Turns towards the wall: the turns swapped. L6 fail_hit

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

### avoidWalls/B-front-sensor: broken

Reads FRONT instead of the first side sensor. L6 fail_hit

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

### avoidWalls/B-never-dark: broken

The threshold below what the light sensor ever reads. L6 fail_hit

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

### avoidWalls/B-no-handover: broken

Nothing happens without a wall (the calls of driveInTheDark are missing). L6 no_result

```
def avoidWalls():
  if (RLIGHT.light < 60):
    if obstacle(RIGHT):
      turn_left(40, 15 deg)
    elif obstacle(LEFT):
      turn_right(40, 15 deg)
```

### avoidWalls/C: correct; later levels lost: L7 fail_hit

L1 win, L2 win, L4 win_soft, L5 win, L6 win

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

### avoidWalls/C-swapped: broken

Turns towards the wall: the turns swapped. L6 fail_hit

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

### avoidWalls/C-front-sensor: broken

Reads FRONT instead of the first side sensor. L6 fail_hit

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

### avoidWalls/C-never-dark: broken

The threshold below what the light sensor ever reads. L6 fail_hit

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

### avoidWalls/C-no-handover: broken

Nothing happens without a wall (the calls of driveInTheDark are missing). L6 no_result

```
def avoidWalls():
  if (LLIGHT.light < 70):
    if obstacle(LEFT):
      curve(30, 0)
    elif obstacle(RIGHT):
      curve(0, 30)
```

## followInTheDark (L7)

### followInTheDark/A: correct

L1 win, L2 win, L4 win_soft, L5 win, L6 win, L7 win

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

### followInTheDark/A-swapped: equivalent (still wins)

The two turns swapped. L7 win

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

### followInTheDark/A-peach-is-black: broken

The black threshold above the floor (83): it steers everywhere. L7 fail_hit

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

### followInTheDark/A-light-above: broken

Reads the light from above instead of the floor. L7 fail_hit

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

### followInTheDark/A-no-handover: broken

Nothing happens off the line in the dark and in the light (the calls of avoidWalls are missing). L7 no_result

```
def followInTheDark():
  if (LLIGHT.light < 70):
    if (LINETRACKER.light < 45):
      curve(10, 30)
    elif (LINETRACKER.light > 90):
      curve(30, 10)
```

### followInTheDark/B: correct

L1 win, L2 win, L4 win_soft, L5 win, L6 win, L7 win

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

### followInTheDark/B-swapped: equivalent (still wins)

The two turns swapped. L7 win

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

### followInTheDark/B-peach-is-black: broken

The black threshold above the floor (83): it steers everywhere. L7 fail_hit

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

### followInTheDark/B-light-above: broken

Reads the light from above instead of the floor. L7 fail_hit

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

### followInTheDark/B-no-handover: broken

Nothing happens off the line in the dark and in the light (the calls of avoidWalls are missing). L7 no_result

```
def followInTheDark():
  if (RLIGHT.light < 60):
    if (LINETRACKER.light < 30):
      curve(15, 35)
    elif (LINETRACKER.light > 95):
      curve(35, 15)
```

### followInTheDark/C: correct

L1 win, L2 win, L4 win_soft, L5 win, L6 win, L7 win

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

### followInTheDark/C-swapped: equivalent (still wins)

The two turns swapped. L7 win

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

### followInTheDark/C-peach-is-black: broken

The black threshold above the floor (83): it steers everywhere. L7 fail_hit

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

### followInTheDark/C-light-above: broken

Reads the light from above instead of the floor. L7 fail_hit

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

### followInTheDark/C-no-handover: broken

Nothing happens off the line in the dark and in the light (the calls of avoidWalls are missing). L7 no_result

```
def followInTheDark():
  if (LLIGHT.light < 70):
    if (LINETRACKER.light < 40):
      curve(0, 30)
    elif (LINETRACKER.light > 88):
      curve(30, 0)
```
