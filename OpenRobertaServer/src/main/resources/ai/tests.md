# Tests

A **simulation world** is a floor with things on it and starts. It holds tests. A **test** starts the robot at one of
the world's starts, sets up what happened before (key presses, claps, variables), runs the whole program on the
simulator for at most a time (or until the robot touches an area), and checks what the robot did. A test passes only
if every one of its checks holds. A run never stops at a failed check.

## The test JSON

You write worlds, each with its tests:

```json
{"worlds": [
  {"name": "Drive to the goal: a box on the way",
   "base": "level",
   "add": [{"id": "t1", "name": "Box", "kind": "rect", "role": "obstacle", "x": 120, "y": 90, "w": 10, "h": 20}],
   "remove": [],
   "starts": [],
   "tests": [
     {"name": "Stops before the box",
      "scenario": "Given a box between the start and Goal 1, when the program runs for 15 s, then the robot stops before the box without bumping into it.",
      "start": "A",
      "until": null,
      "max_time_ms": 15000,
      "world": [],
      "globals": {},
      "checks": [{"check": "never_bumps", "item": "t1"},
                 {"check": "after", "event": "obstacle", "within_ms": 500, "does": "stands_still"}]}]}]}
```

A world:

- `name`: shown in the Tests tab; unique among the worlds and tests, and different from the learner's.
- `base`: `"level"`: a copy of the level's world (its floor, its start A, its items with their ids). The copy is
  exact, so write only what changes: `add` (new items), `remove` (ids of level items to leave out) and `starts` (new
  starts; start A stays). `"existing"`: the learner's world with this `name`, unchanged (`add`, `remove` and `starts`
  must then be empty): your tests are added to it.
- New ids: items `t1`, `t2`, …; starts `B`, `C`, … with the same letter as `name`.

A test:

| field | meaning |
|---|---|
| `name` | what the test shows, short ("Stops before the box"); unique among all tests and worlds |
| `scenario` | the scenario in plain words: "Given …, when …, then …" |
| `start` | the id of a start of the world |
| `until` | optional, null if not used: the id of a goal area; the run ends when the robot touches it |
| `max_time_ms` | the run ends then at the latest: whole tenths of a second, 100 to 120000 |
| `world` | events of the set-up: `{"event": "clap", "at": ms}`, `{"event": "key", "port": "PLAY" or "REC", "at": ms}` (a key is held for 0.2 s); ms after the program starts |
| `globals` | the start values of the program's global variables, by their NEPO name: a whole number, true/false, or a list of whole numbers |
| `checks` | at least one check, below |

The run also ends when the program ends.

## Checks

| check | fields | holds if |
|---|---|---|
| `reaches` | `item`: a goal area's id, or none: any goal | the robot's outline touches the area at some time |
| `never_touches` | none | the robot never touches any fail area of the world |
| `ends_in` | `item`: a goal area's id | when the run ends, the robot's whole outline is in the area |
| `never_bumps` | `item`: an obstacle's or wall's id, or none: anything, the floor's edge too | the robot never bumps into it |
| `does` | `does`; `after_ms` (default 100) | from `after_ms` on to the end, in every frame, the robot does `does` |
| `whenever` | `when` (with `percent` for the light conditions); `does`; `after_ms` (default 0) | in every frame in which `when` has held for `after_ms`, the robot does `does` |
| `after` | `event`; `within_ms` (at least 1); `does` | after each such event, within `within_ms`, the robot does `does` at least once |
| `variable` | `variable` (its NEPO name), `op` (`EQ`, `NEQ`, `LT`, `LTE`, `GT`, `GTE`), `value` | when the run ends, the global variable compares so with `value` |

- `does`: `drives_forward`, `drives_backward` (at least 1 cm/s along the heading), `turns_left`, `turns_right` (at
  least 10°/s; a curve counts as driving and turning), `stands_still` (neither), `left_led_on`, `left_led_off`,
  `right_led_on`, `right_led_off`, `leds_on`, `leds_off` (both LEDs), `plays_sound`, `silent`.
- `when` (what the sensors measure, whether or not the program reads them): `line`, `no_line` (the line tracker sees
  black, or not), `obstacle_ahead`, `obstacle_left`, `obstacle_right`, `no_obstacle`, `left_light_below`,
  `left_light_above`, `right_light_below`, `right_light_above` (with `percent`, 0 to 100), `sound`, `play_key`,
  `rec_key`.
- `event`: `clap`, `key` (from `world`), `line_start`, `line_end` (the line tracker begins or stops seeing black),
  `obstacle` (an obstacle sensor begins to see something).
- A check with nothing to decide (the condition never held, no event happened) is "not checked": it doesn't fail the
  test, but it doesn't help either.

## What makes a good set of tests

- **One scenario per test**: one situation and the behaviour expected in it. Vary what matters to the intent: another
  start (beside the line instead of on it, facing another way), an obstacle added on the way, a key pressed later, a
  clap at another moment, a variable's start value.
- **Every test must pass for a program that does what the learner said** and the level asks. Leave margins: a
  `max_time_ms` well above the time the robot needs at the program's speeds (or the level's time limit), and
  `after_ms` well after the moment the robot should have arrived.
- **Check the intent, not the implementation**: "reaches Goal 1", "never bumps into the box", "stands still from
  12 s on", "within 500 ms after the obstacle appears, it stands still". Not which wheel turns at which power, unless
  the learner said so.
- Use `until` to end a run at the goal when the test is about getting there. Don't use it when the test checks
  something after the robot arrived.
- **A run ends when the program ends.** If the program ends (it has no loop that runs forever), nothing after that
  moment can be checked: check where the robot ended (`ends_in`) and what it did on the way, not `does` from a time
  after the end.
- Starts must be on the floor, with the whole robot (8 × 7.5 cm, from 1.8 cm behind to 6.2 cm in front of the start)
  clear of obstacles and walls, and not touching a goal or fail area. A start "on the line" puts the point 5 cm ahead
  of it on the line, facing along the line.
- An added obstacle must not cover the start or a goal the test expects the robot to reach. To place it on a line,
  centre it on one of the line's points.
- 2 to 5 tests in total, in 1 or 2 worlds. Fewer good tests are better than many weak ones.
- **No duplicates**: don't write a test that checks the same as one the learner already has (the same world, start,
  set-up and checks).
- Only `never_touches` if the world has a fail area, only `never_bumps` with an `item` that is an obstacle or wall,
  only `variable` with a global variable the program declares.

## The learner's tests

The learner's existing tests come in the same format, except that each world is given in full, as `world` (`background`,
`size`, `starts`, `items`) instead of `base`, `add`, `remove` and `starts`. A test may have `"skip": true` (switched off)
and `"origin": "ai"` (written by you earlier).
