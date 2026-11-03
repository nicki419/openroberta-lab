# Tests

A **simulation world** is a floor with things on it and starts. It holds tests. A **test** starts the robot at one of
the world's starts, sets up what happened before (key presses, claps, variables), runs the whole program on the
simulator for at most a time (or until the robot touches an area), and checks what the robot did. A test passes only
if every one of its checks holds. A run never stops at a failed check.

## The test JSON

You write worlds, each with the things on its floor and its tests:

```json
{"worlds": [
  {"name": "A box on the line",
   "world": {"background": "peach",
             "starts": [{"id": "A", "name": "A", "x": 30, "y": 100, "heading": 0}],
             "items": [{"id": "l1", "kind": "line", "points": [[20, 100], [260, 100]], "width": 1.48},
                       {"id": "t1", "name": "Box", "kind": "rect", "role": "obstacle", "x": 150, "y": 95, "w": 10, "h": 10}]},
   "tests": [
     {"name": "Stops before the box",
      "scenario": "Given a box on the line, when the program runs for 30 s, then the robot stops in front of the box without bumping into it.",
      "start": "A",
      "until": null,
      "max_time_ms": 30000,
      "world": [],
      "globals": {},
      "checks": [{"check": "never_bumps", "item": "t1"},
                 {"check": "whenever", "when": "obstacle_ahead", "after_ms": 200, "does": "stands_still"}]}]}]}
```

A world:

- `name`: shown in the Tests tab; unique among the worlds and tests, and different from the learner's. Say what is
  special about it ("A box on the line", "A gap in the line").
- `world`: the floor and what is on it, see "The simulator": `background` (always `"peach"`), `size` (optional),
  `starts` (at least one), `items`. Draw only what the scenarios of this world need.
- Or, instead of `world`: `"base": "existing"`, to add tests to the learner's world with this `name` (its starts and
  items are as the learner drew them; you can't change them).

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
  test, but it doesn't help either. A robot stuck at an obstacle stands still too, so check `never_bumps` as well when
  the robot should stop before something.

## Drawing a world

- Keep it plain: a line, a box, a goal area, a fail area, and only where the scenario needs them. Leave 10 cm or more
  between things and the floor's edge, unless the edge is the point of the test.
- **A line to follow**: points on the floor, `smooth: true` for curves, `width` 1.48. Bends need room: turn by at most
  45° over 20 cm. A goal area over the end of the line, wide enough to cover it (for example 30 × 30 cm), lets a test
  end there (`until`).
- **A start on the line**: on one of the line's points that has at least 15 cm of line ahead, facing along the line
  (the line tracker is 5 cm ahead of the start). A start "beside the line": 5 to 10 cm off it, facing along it.
- **An obstacle on the line**: a box of 10 × 10 cm centred on one of the line's points, at least 40 cm along the line
  from the start.
- **Starts** must be on the floor, with the whole robot (8 × 7.5 cm, from 1.8 cm behind to 6.2 cm in front of the
  start) clear of obstacles and walls, and not touching a goal or fail area.
- New ids: items `t1`, `t2`, …; starts `A`, `B`, … with the same letter as `name`.

## What makes a good set of tests

- **One scenario per test**: one situation and the behaviour expected in it. Vary what matters to the intent: another
  start (beside the line instead of on it, facing another way), an obstacle on the way, a key pressed later, a clap at
  another moment, a variable's start value.
- **Every test must pass for a program that does what the learner said.** Leave margins: a `max_time_ms` well above
  the time the robot needs at the program's speeds, and `after_ms` well after the moment the robot should have
  arrived.
- **Check the intent, not the implementation**: "reaches Goal 1", "never bumps into the box", "stands still from
  12 s on", "whenever an obstacle is ahead, it stands still". Not which wheel turns at which power, unless the learner
  said so.
- Use `until` to end a run at a goal when the test is about getting there. Don't use it when the test checks
  something after the robot arrived.
- **A run ends when the program ends.** If the program ends (it has no loop that runs forever), nothing after that
  moment can be checked: check where the robot ended (`ends_in`) and what it did on the way, not `does` from a time
  after the end.
- 2 to 5 tests in total, in 1 or 2 worlds. Fewer good tests are better than many weak ones.
- **No duplicates**: don't write a test that checks the same as one the learner already has (the same world, start,
  set-up and checks).
- Only `never_touches` if the world has a fail area, only `never_bumps` with an `item` that is an obstacle or wall,
  only `variable` with a global variable the program declares.

## The learner's tests

The learner's existing tests come in the same format, each world with its `world`. A test may have `"skip": true`
(switched off) and `"origin": "ai"` (written by you earlier).
