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

Their `role`:

- **a line without a role**: a black line on the floor, drawn as a black core (`width`, usually 1.48 cm) on a white
  band about 5.3 cm wide. The line tracker sees black on the core; the light sensors read 0 % on black, 100 % on
  white.
- `obstacle`: a block the robot bumps into and its obstacle sensors see. A `line` with role `obstacle` is a **wall**
  of that shape, `width` cm thick (default 1.5), not drawn on the floor.
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
  - the line tracker: 5 cm ahead, in the middle;
  - the light sensors LLIGHT and RLIGHT: 5.5 cm ahead, 1.5 cm to the left and right;
  - three obstacle sensors, LEFT, FRONT and RIGHT: 6 cm ahead, 2.7 cm left, in the middle and 2.7 cm right, **all
    looking forward**, each seeing an obstacle, a wall or the floor's edge less than 3 cm ahead (a fan of ±22°).
    So a robot that stops when it sees an obstacle stops about 2 to 3 cm before it, without touching it.
  - the sound sensor hears a clap for about 0.3 s; the keys PLAY and REC.
- **Bumping**: the robot can't drive into an obstacle, a wall or the floor's edge; it stays in front of it while its
  wheels keep turning.
- LEDs: left and right, on or off.

## Time

- A run starts with the program; the simulator moves the robot about 60 times a second.
- Blocks that take time (a drive for a distance, a turn for an angle, a wait, a tone) make the program wait; all
  other blocks take no time. A program that only sets the motors (drive, curve, turn without a distance) keeps the
  robot moving while it goes on.
- When the program ends, the robot stops.
