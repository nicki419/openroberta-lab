# The simulator

## The floor and its coordinates

- The floor (`background: "peach"`) is plain light peach, 300 × 200 cm unless the world gives `size: {w, h}` (cm,
  50 to 600). Its edge is like a wall: the robot bumps into it, and the obstacle sensors see it.
- **Coordinates are cm from the floor's top left corner: x to the right, y down** (as on a screen). Angles are degrees,
  **counterclockwise as seen from above, 0 pointing right**: 90 points up (towards y = 0), -90 or 270 down, 180 left.
- A start (`starts`: `{id, name, x, y, heading}`) is the robot's pose: the centre of its wheel axle and where it
  faces.

## The things on the floor (`items`)

| kind | fields | |
|---|---|---|
| `rect` | `x`, `y` (top left corner), `w`, `h` | not rotated |
| `circle` | `x`, `y` (centre), `r` | |
| `triangle` | `points`: three `[x, y]` | |
| `line` | `points`: `[x, y]`, …; `smooth` (a smooth curve through the points), `closed`, `width` (cm) | |
| `tunnel` | `points`: `[x, y]`, … (its middle); `smooth`; `width`: its width inside (cm, 5 to 60, default 15) | role `obstacle` |

Their `role`:

- **a line without a role**: a black line on the floor, drawn as a black core (`width`, usually 1.48 cm) on a white
  band about 5.3 cm wide. The line tracker sees black on the core: it reads 0 % on black, 100 % on white.
- `obstacle`: a block the robot bumps into and its obstacle sensors see. A `line` with role `obstacle` is a **wall**
  of that shape, `width` cm thick (default 1.5), not drawn on the floor. A `tunnel` is two walls 1.5 cm thick along
  its line, `width` cm apart, with a roof: the robot drives through it (and bumps into its walls). **Under the roof it
  is darker**: the light sensors see 100 % at an opening, less the further in, and 40 % from 15 cm inside on (measured
  along the tunnel from the nearer opening; linear in between). Make it at least 12 cm wide for the robot to drive
  through; a line on the floor can run through it. **Nothing else goes inside a tunnel**: the robot is 7.5 cm wide,
  so a box inside a 15 cm tunnel leaves it no way around, and it bumps into the box (only a wall across the whole
  tunnel, for a stop in the dark, belongs inside). **Its own walls are the walls the robot meets in the dark: in a
  bend, the outer wall comes in front of the robot.** In a bend to the right (with heading 0: towards larger y), the
  left wall comes in front of its left half, and LEFT sees it; in a bend to the left, the right wall and RIGHT.
- **Dim light exists only inside a tunnel, and a tunnel always has its two walls.** There is no dim floor without
  walls. They run along the robot: its obstacle sensors, which look forward, don't see them while it stands in the
  middle facing along the tunnel (in a 15 cm tunnel each wall is 7.5 cm from the middle), but they see them, and it
  bumps into them, when it turns or drifts towards one. Say "in dim light, nothing in front of it", never "in dim
  light, no walls".
- `goal`, `fail`: **areas** that only the tests see. The robot's sensors don't see them, and the robot drives over
  them. Goal areas have names ("Goal 1"); fail areas usually don't.
- `color`: a coloured patch on the floor the sensors see (older worlds only).
- `name`: what the Lab shows ("Goal 1", "Obstacle 1"); `id`: what tests refer to.

## The robot

- Its outline is 8 cm long and 7.5 cm wide: from 1.83 cm behind the axle to 6.17 cm in front of it, 3.75 cm to each
  side.
- **Speed: a wheel at p % moves at about 0.35 × p cm/s** (10 % ≈ 3.5 cm/s, 50 % ≈ 17.5 cm/s, 100 % ≈ 35 cm/s). The
  wheels are 7 cm apart, so turning on the spot at p % turns about 5.7 × p degrees per second (50 %: about 285°/s).
  A curve with wheels at l % and r % moves forward at about 0.35 × (l + r) / 2 cm/s and turns by about
  2.9 × (r - l) degrees per second (left if r > l).
- Speeds change at once; there is no slipping. Distances and angles are measured exactly.
- **Sensors**, in front of the axle:
  - the line tracker: 5 cm ahead, in the middle, looking down at the floor under it (see "The line tracker" below);
  - the light sensors LLIGHT and RLIGHT: 5.5 cm ahead, 1.5 cm to the left and right, **on top of the robot, looking
    up**: they read the light that falls on the robot, not the floor: 100 % in the open, less inside a tunnel;
  - three obstacle sensors, LEFT, FRONT and RIGHT: 6 cm ahead, 2.7 cm left, in the middle and 2.7 cm right, **all
    looking forward**, each seeing an obstacle, a wall or the floor's edge less than 3 cm ahead (a fan of ±22°).
    So a robot that stops when it sees an obstacle stops about 2 to 3 cm before it, without touching it.
  - the sound sensor hears a clap for about 0.3 s; the keys PLAY and REC.
- **Bumping**: the robot can't drive into an obstacle, a wall or the floor's edge; it stays in front of it while its
  wheels keep turning.
- LEDs: left and right, on or off.

## The line tracker

- It reads the brightness of the floor right under it, one point 5 cm ahead of the axle in the middle: **0 % on a
  line's black core, about 100 % on the white band beside it, about 83 % on the plain peach floor**. The blocks give
  it as a light value (0 to 100 %) or as "sees black" (true only on the core).
- **The line tracker is not a light sensor of the room.** Its "light %" is the floor's brightness; a tunnel's dim
  light doesn't change it (only the light sensors LLIGHT and RLIGHT on top see that). "Dark" for the line tracker is a
  black line, never a tunnel. A floor of medium brightness doesn't exist: readings between black (0 %) and the peach
  floor (83 %) happen only right at the edge of a line's black core, for a moment. A program's "in between" (neither
  dark nor bright) is tested by following the line, not by a world of its own.
- **There is no line on a plain floor.** A program that steers by the line tracker sees 83 % there, all the time.
  What it then does depends on the program, and **the message says it: "The program on a plain floor"** (the Lab ran
  it there). A line follower that turns one way above a threshold ("turn right while it reads more than 55 %") turns
  that way without end: it circles, and doesn't get anywhere without a line. One that steers only over black or white
  (below 45 %, above 90 %) drives straight on.
- So if it turns or circles on a plain floor, a world needs the line wherever the robot should drive the way it
  usually does (to a wall, to a goal, into a tunnel), with the start on the line, facing along it. **If it drives
  straight on, a world needs a line only where following the line is what the test is about**: a test of a wall or of
  a tunnel gets no line, and the robot drives up to it straight.
- A line drawn straight through a start puts the line tracker on the black core (heading along the line). A start
  1.5 to 2 cm beside the line's middle puts it on the white band (about 100 %); 5 cm or more beside, on the peach
  floor (83 %).

## Time

- A run starts with the program; the simulator moves the robot about 60 times a second.
- Blocks that take time (a drive for a distance, a turn for an angle, a wait, a tone) make the program wait; all
  other blocks take no time. A program that only sets the motors (drive, curve, turn without a distance) keeps the
  robot moving while it goes on.
- When the program ends, the robot stops.

## Where readings change

Place a test's things clear of these places, so that each test is a typical case of its situation.

- **The line's edge**: the line tracker sees black while it is over the line's black core, which is 1.48 cm wide:
  up to about 0.7 cm from the line's middle. A start on the line: on its middle; beside it: 1.5 to 2 cm off the
  middle, on the white band (about 100 %), or 5 cm or more, on the peach floor (about 83 %). A start facing along a
  straight line puts the line tracker as far off the line as the start is.
- **The obstacle sensors' range**: an obstacle is seen while it is less than 3 cm ahead of the sensors, which are 6 cm
  ahead of the axle: an obstacle 8 cm ahead of a start is seen at once; one 30 cm ahead isn't, until the robot drives
  up to it. The robot's front is 6.2 cm ahead of the axle.
- **Which obstacle sensor sees it**: all three look forward. For a start at (x, y) with heading 0 (facing right), each
  sees from about x + 6 to x + 9, in a fan about 2.3 cm wide: LEFT from y − 3.8 to y − 1.5, FRONT from y − 1.2 to
  y + 1.2, RIGHT from y + 1.5 to y + 3.8. A wall beside the robot, running along it, is seen by none of them; "a wall
  on the left" for a program that reads LEFT is something in front of the robot's left half.
- **Light under a tunnel's roof**: the light sensors read 100 % at an opening and 40 % from 15 cm inside on, linear in
  between (measured from the nearer opening, at the sensors, 5.5 cm ahead of the axle): a reading of p % is at
  (100 − p) / 4 cm inside. A program that compares the light with 70 % changes at 7.5 cm inside; from 15 cm inside
  on, the light is 40 %, below any such threshold.
- **Claps and keys over time**: a clap is heard from its `at` for about 0.3 s, a key is held from its `at` for
  0.2 s. A "wait until" that begins later than that misses it: let a clap or key come at least 0.5 s after the moment
  the program reaches the wait. That moment follows from the blocks before it: a drive of d cm at p % takes about
  d / (0.35 × p) s, a wait t ms.
