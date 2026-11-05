# Tests

A **simulation world** is a floor with things on it and starts. It holds tests. A **test** starts the robot at one of
the world's starts, sets up what happened before (key presses, claps, variables), runs the whole program on the
simulator for at most a time (or until the robot touches an area), and checks what the robot did. A test passes only
if every one of its checks holds. A run never stops at a failed check.

## The test JSON

You write worlds, each with the things on its floor and its tests. Every test also says what it is for: the scenario
and path of the analysis it tests, its inputs, what it expects and where that expectation comes from.

```json
{"generation_status": "ready_for_review",
 "worlds": [
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
                 {"check": "whenever", "when": "obstacle_ahead", "after_ms": 200, "does": "stands_still"}],
      "scenario_id": "S2",
      "path_ids": ["P2"],
      "planned_branch_ids": ["D1.1"],
      "input_selection": {
        "equivalence_partitions": [{"dimension": "what is ahead on the line", "class": "an obstacle on the line",
                                    "selected_realization": "the box t1, 120 cm along the line from A", "realized_by": {"items": ["t1"]}}],
        "boundary_values": []},
      "expected_results": ["The robot stops when the box is ahead, and stays there."],
      "postconditions": [{"description": "During the whole run, the robot never touches the box.", "check_indices": [0]},
                         {"description": "Whenever the box is ahead, the robot stands still.", "check_indices": [1]}],
      "oracle": {"basis": "learner_description", "confidence": "high", "assumptions": [], "review_required": false},
      "source_block_ids": ["b4", "b6"],
      "reason": "The learner said the robot should stop at obstacles."}]}],
 "coverage_plan": {"target_branch_ids": ["D1.1", "D1.2", "D1.else"], "planned_covered_branch_ids": ["D1.1"],
                   "deferred_branch_ids": [{"branch_id": "D1.2", "reason": "…"}, {"branch_id": "D1.else", "reason": "…"}],
                   "deferred_inputs": []},
 "consolidation_notes": [],
 "deferred_scenarios": [],
 "warnings": []}
```

A world:

- `name`: shown in the Tests tab; unique among the worlds and tests, and different from the learner's. Say what is
  special about it ("A box on the line", "A gap in the line").
- `world`: the floor and what is on it, see "The simulator": `background` (always `"peach"`), `size` (optional),
  `starts` (at least one), `items`. Draw only what the scenarios of this world need.
- Or, instead of `world`: `"base": "existing"`, to add tests to the learner's world with this `name` (its starts and
  items are as the learner drew them; you can't change them).

A test, what it runs:

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

A test, what it is for (the learner sees none of it as JSON; the Lab checks it against the analysis):

| field | meaning |
|---|---|
| `scenario_id` | the analysis' scenario it tests (`S1`, …) |
| `path_ids` | the paths of that scenario it follows (`P1`, …) |
| `planned_branch_ids` | the outcomes of the program's decisions its run should take (`D1.1`, `D2.else`, …), all on those paths. Planned, not proven: the run shows what was taken |
| `input_selection` | which input class and which boundary its inputs stand for: `equivalence_partitions` [{`dimension`, `class`, `selected_realization`, `realized_by`}] and `boundary_values` [{`dimension`, `boundary`, `side`, `selected_realization`, `realized_by`, `rationale`}]. `dimension`, `class` and `boundary` word for word as in the path's `input_dimensions`; `side`: `below`, `at`, `above`, `inside` or `outside`; `selected_realization`: where the test realizes it, in words; `realized_by`: what of the test realizes it: `start` (its start's id), `items` (ids of the world's things), `events` (positions in `world`, from 0), `globals` (variable names in `globals`) |
| `expected_results` | at least one: what the robot should observably do in this scenario |
| `postconditions` | what holds when the run has ended, each with the `check_indices` (positions in `checks`, from 0) of the checks that decide it. A check like `never_bumps` holds for the whole run: say so ("During the whole run …"), it is not where the robot ended |
| `oracle` | where the expectation comes from: `basis` (`learner_description`, `inferred_from_program` or `applicable_safety`), `confidence` (`low`, `medium`, `high`), `assumptions` (what the test takes for granted that nobody said), `review_required` |
| `source_block_ids` | the blocks (`b…`) the scenario is about |
| `reason` | one sentence: why this test is in the set |

The answer around the worlds:

- `generation_status`: `ready_for_review`; `partial` if some targets are deferred because they can't be tested;
  `no_valid_scenarios` with `worlds: []` if no test can be justified (say why in `deferred_scenarios` and `warnings`).
- `coverage_plan`: `target_branch_ids` (the outcomes on the analysis' paths), `planned_covered_branch_ids` (those
  your tests plan), `deferred_branch_ids` (the others, each with a reason), `deferred_inputs` (input classes and
  boundary sides of the analysis that no test stands for: `dimension`, `value` (the class or boundary, word for word,
  with the side if one is tested and the other isn't: "the line's edge: outside"), `reason`).
- `consolidation_notes`: what you merged or left out because another test covers the same, in short.
- `deferred_scenarios`: scenarios of the analysis you write no test for (`scenario_id`, `reason`).
- `warnings`: limitations the learner should know, in plain words, written to them ("You didn't say where …").

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
- **`does` is for what lasts**: every frame from `after_ms` to the end of the run. Use it for what the robot keeps
  doing (drives forward along a line, stands still from some time on). **Not for a short move**: a turn by an angle or
  a short drive ends, the robot then does something else, and `does` fails although the robot did what it should.
- **A reaction to something it sees**: `whenever`, with the sensor condition. "When there is something on its left,
  it turns right": `{"check": "whenever", "when": "obstacle_left", "does": "turns_right"}`. It holds while the
  condition holds, so a turn that ends once the thing is out of view passes. **Leave its `after_ms` out (0)**: the
  program reacts in the next frame, and a turn away ends what the robot sees within a fraction of a second, so a
  `whenever` that waits 200 ms has nothing to decide (the Lab refuses a turn with more than 50 ms). Something the robot drives up to can use
  `after` with `event` `obstacle` too; something in view from the start never "appears", so `after` has nothing to
  decide: use `whenever`.
- **"It doesn't …"**: check what it does instead: `does` `stands_still` (it doesn't move), or `drives_forward`. Never
  two checks that can't both hold, such as `does` `turns_left` and `does` `turns_right`: the Lab refuses them.
- A check with nothing to decide (the condition never held, no event happened) is **not checked**: it is no evidence,
  and the Lab doesn't count the test as passed. A robot stuck at an obstacle stands still too, so check `never_bumps`
  as well when the robot should stop before something.
- **Positive and negative checks**: `never_bumps` and `never_touches` are negative: they hold for a robot that never
  moves. Every test needs at least one positive check (`reaches`, `ends_in`, `does`, `whenever`, `after`,
  `variable`) that shows its scenario happened, **taken from the scenario's expected behaviour, never invented**. If
  the only expectation is negative ("it doesn't bump into walls") and neither the learner nor the intent says what the
  robot should do there, the scenario gets no test: defer it ("nothing to expect that shows it happened"). Don't add
  "drives forward" or "stands still" that nobody asked for, to have a positive check.

## Drawing a world

- Keep it plain: a line, a box, a goal area, a fail area, and only where the scenario needs them. Leave 10 cm or more
  between things and the floor's edge, unless the edge or the distance is the point of the test (a boundary).
- **A line to follow**: points on the floor, `smooth: true` for curves, `width` 1.48. Bends need room: turn by at most
  45° over 20 cm. A goal area over the end of the line, wide enough to cover it (for example 30 × 30 cm), lets a test
  end there (`until`).
- **A start on the line**: on one of the line's points that has at least 15 cm of line ahead, facing along the line
  (the line tracker is 5 cm ahead of the start). A start "beside the line": 5 to 10 cm off it, facing along it.
- **An obstacle on the line**: a box of 10 × 10 cm centred on one of the line's points, at least 40 cm along the line
  from the start.
- **Starts** must be on the floor, with the whole robot (8 × 7.5 cm, from 1.8 cm behind to 6.2 cm in front of the
  start) clear of obstacles and walls, and not touching a goal or fail area.
- **Go through the program from the start first.** For each test, follow what the program does from the start until
  the scenario's moment: which decisions it takes on the way, and what it then does with the motors. The world must
  make those go as planned, and list them in `planned_branch_ids`. A program that follows a line in bright light
  needs a line under the robot until the scenario's thing comes (see "The line tracker" in "The simulator"): without
  it, it circles on the start. So a wall ahead for a line follower stands across a line that runs from the start.
- **Place things from the start, with heading 0** (facing right, towards larger x) unless the scenario needs another
  heading. For a start at (x, y):
  - **A line through the start** (for a program that follows a line): a straight `line`, `width` 1.48, `points`
    [[x − 10, y], [x + 80, y]]; the start is then on its black core, facing along it. Other things of the scenario go
    on this line (a wall across it at x + 8, x + 10 or further).
  - **A wall ahead** (all three obstacle sensors see it): a `rect` with its left edge at x + 8 (seen at once; x + 10:
    just not seen; further: the robot drives up to it), `y` = y − 6, `w` 2, `h` 12. **If the program follows a line**,
    each such test gets its own line and its own wall: the `line` `points` [[x − 10, y], [x + 40, y]], and the wall
    across it at x + 8 (seen at once), x + 10 (just not seen) or x + 30 (it drives up to it). The next test starts
    30 cm lower (y + 30), with its own line and wall by the same numbers.
  - **Something only the LEFT sensor sees** ("a wall on the left"): a `rect` at x + 7, y − 4.5, `w` 2, `h` 2.5; just
    out of reach: at x + 9.5. **Only RIGHT**: the same at y + 2. **Both, not FRONT**: both boxes. Not a wall beside
    the robot: the sensors look forward, and they don't see a wall along the robot's side.
  - **Dim light** (the light sensors are 5.5 cm ahead of the start): a straight `tunnel`, `width` 15, `points`
    [[x − d, y], [x + 40, y]], with the start in its middle: the sensors are d + 5.5 cm inside. d = 10 gives 40 %;
    for "just below / above p %" make d + 5.5 one cm more or less than (100 − p) / 4. Its walls run along the robot:
    the obstacle sensors don't see them. Boxes for LEFT or RIGHT fit inside it.
  - **Count from the start, never back from a thing.** Each test that needs something at a set distance gets its own:
    first its start, then its thing by the numbers above. Start B at (130, 100) with a wall seen at once: the wall's
    `x` is 138; start C at (130, 160) with a wall just not seen: its `x` is 140. Don't draw one wall for several tests
    and work out their starts from it. Then check that each test's `start` is the start you drew its thing for.
  - Each test of a world its own start, each with what its scenario needs in front of it; tests that need different
    things in front of them start at different places of the floor (at least 30 cm apart).
- New ids: items `t1`, `t2`, …; starts `A`, `B`, … with the same letter as `name`.

## How to choose the tests: four steps, in this order

**1. Paths (branch coverage).** Start from the analysis, not from a number of tests. Every outcome on the analysis'
paths (`target_branch_ids`) gets a test that plans it (`planned_branch_ids`), or is deferred with a reason. One test
may plan several outcomes only if its one run will take all of them (a line follower that curves on a bent line takes
both "sees black" and "doesn't"); drawing two triggers into one world doesn't make the program take both. A program
without decisions has one straight path: test its scenarios.

**2. Inputs (equivalence partitioning and boundary value analysis).** For each path, take the analysis'
`input_dimensions`:
- **Classes**: one test per class that behaves differently (on the line, beside it; no obstacle, an obstacle ahead;
  PLAY pressed, never pressed; a count below its limit, at it). A test stands for one class of each dimension it
  varies; a second test of the same class with other numbers adds nothing. A class that can't be drawn or set up is
  deferred (`deferred_inputs`) with the reason.
- **Boundaries**: where the program's behaviour changes with an input, test both sides close to it: a number the
  program compares with (a count, a variable, a light %, a repeat count), the time of a key or clap around a wait or a
  movement that blocks the program, the edge of the line under the line tracker, the range of the obstacle sensors.
  Geometry: about 1 cm to each side; timing: about 0.2 s to each side of the moment; "at" only for whole numbers the
  program compares with (2, 3 and 4 claps for "3 claps"). Take boundaries from the numbers in the program and from
  "Where readings change" in "The simulator"; never invent a threshold. A boundary whose side can't be realized
  reliably is deferred (`deferred_inputs`, with the side) with the reason. Each boundary candidate needs tests on two
  sides, or the missing side deferred.
- `realized_by` says which start, things, events or variables of the test make the class or boundary happen.
- **Defer only what can't be set up or decided**: a set-up the world, the start, `world` and `globals` can't express,
  or a check the simulator can't decide. **Never defer because the program would fail the test**: two claps can be set
  up even if the program then counts them as three, and a test that the program fails is the help.

**3. A complete test = path + inputs + expected results + postconditions.**
- `expected_results` and `postconditions` say what the checks decide; every postcondition names its checks.
- **Where the expectation comes from** (`oracle.basis`): `learner_description` only if the learner wrote a sentence and
  the expectation follows from it; `inferred_from_program` for an expectation taken from your guess of the intent
  (say what you assumed); `applicable_safety` for "doesn't bump into it" or "doesn't touch the fail area" where it
  fits the scenario, not everywhere. `review_required` is false only for a learner_description expectation with no
  assumption.
- **Check the intent, not the implementation**: "reaches Goal 1", "never bumps into the box", "stands still from
  12 s on", "whenever an obstacle is ahead, it stands still". Not that the blocks do what they say ("curves at 10 %
  and 40 %"): a test that repeats the program confirms it, bugs included. Vary the situation instead.
- **Every test needs a positive check** (see "Checks"): pair `never_bumps` with what the robot should do.
- **Every test must pass for a program that does what the learner said.** Leave margins in the time a test gives the
  program: `max_time_ms` well above the time the robot needs at the program's speeds, `after_ms` of a `does` well
  after the moment the robot should have arrived, `within_ms` generous. (Not the `after_ms` of a `whenever` about
  turning away: see "A reaction to something it sees".) The inputs of a boundary test sit close to the
  boundary; its checks still leave margins.
- Use `until` to end a run at a goal when the test is about getting there. Don't use it when the test checks
  something after the robot arrived.
- **A run ends when the program ends.** If the program ends (it has no loop that runs forever), nothing after that
  moment can be checked: check where the robot ended (`ends_in`) and what it did on the way, not `does` from a time
  after the end.
- A scenario whose expected behaviour is `unknown` gets no test: defer it.

**4. Consolidate.** Leave out a test that plans the same outcomes, with the same classes, boundary sides and checks,
as another one; keep the one that is easier to understand. Never leave out the only test of an outcome, of a class or
of a side of a boundary. Say what you merged in `consolidation_notes`. **At most as many tests as the task allows**
(8 if it names all scenarios); what doesn't fit is deferred with the reason.

- **A world for each scenario.** Draw a world with only what its scenario needs: a wall-stop scenario gets a wall in
  front of the start, not a tunnel; a line scenario gets the line, not the walls of another scenario. Share a world
  only between tests of the same scenario (or of scenarios that are the same situation). Unrelated things in one world
  change what the program does: a tunnel darkens the light sensors, a wall at the side triggers the side sensors.
- **Each test its own start, placed for its situation.** Two tests of one world never start at the same pose unless
  the set-up differs. Place what the scenario is about where the robot meets it: on its way from the start, in the
  direction of its heading (heading 0 points right, towards larger x; see "The floor and its coordinates"), within the
  sensor's range for a boundary test. Check every coordinate before you answer. For heading 0, a `rect` ahead has its
  left edge `x` beyond the start's x and spans the start's y (`y` ≤ the start's y ≤ `y` + `h`; `y` is its top edge); a
  wall on the left (heading 0) lies at smaller y, on the right at larger y.

- **The learner's tests count: write only what they don't test yet.** A scenario, outcome, class or boundary side that
  one of the learner's tests already tests gets no new test: defer it with the reason `tested by "<their test's
  name>"` (`deferred_scenarios`, `deferred_branch_ids`, `deferred_inputs`). A test that differs from one of theirs only
  in its numbers tests the same and is left out: a start a little to one side but in the same situation (on the same
  side of the line's edge, the same wall in the sensor's range, the same light), another time or `max_time_ms`, a world
  drawn anew with the same things. "What the learner's tests don't check yet" in the task says what is missing; write
  your tests for that, and for whatever else none of their tests checks. If their tests check everything, answer with
  no tests and `generation_status` `no_valid_scenarios`, everything deferred as tested by theirs.
- Only `never_touches` if the world has a fail area, only `never_bumps` with an `item` that is an obstacle or wall,
  only `variable` with a global variable the program declares.

## The learner's tests

The learner's existing tests come in the same format, each world with its `world`, without what a test is for. A test
may have `"skip": true` (switched off) and `"origin": "ai"` (written by you earlier).
