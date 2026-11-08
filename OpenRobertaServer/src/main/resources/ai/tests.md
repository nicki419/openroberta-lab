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
                       {"id": "t1", "name": "Box", "kind": "rect", "role": "obstacle", "x": 150, "y": 95, "w": 10, "h": 10},
                       {"id": "t2", "name": "Before the box", "kind": "rect", "role": "goal", "x": 135, "y": 90, "w": 15, "h": 20}]},
   "tests": [
     {"name": "Stops before the box",
      "scenario": "Given a box on the line, when the program runs for 30 s, then the robot stops in front of the box without bumping into it.",
      "start": "A",
      "until": null,
      "max_time_ms": 30000,
      "world": [],
      "globals": {},
      "checks": [{"check": "never_bumps", "item": "t1"},
                 {"check": "whenever", "when": "obstacle_ahead", "after_ms": 200, "does": "stands_still"},
                 {"check": "ends_in", "item": "t2"}],
      "scenario_id": "S2",
      "path_ids": ["P2"],
      "planned_branch_ids": ["D1.1"],
      "input_selection": {
        "equivalence_partitions": [{"dimension": "what is ahead on the line", "class": "an obstacle on the line",
                                    "selected_realization": "the box t1, 120 cm along the line from A", "realized_by": {"items": ["t1"]}}]},
      "expected_results": ["The robot drives up to the box, stops when the box is ahead, and stays there."],
      "postconditions": [{"description": "During the whole run, the robot never touches the box.", "check_indices": [0]},
                         {"description": "Whenever the box is ahead, the robot stands still.", "check_indices": [1]},
                         {"description": "At the end, the robot stands just before the box.", "check_indices": [2]}],
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
| `input_selection` | which input classes its inputs stand for: `equivalence_partitions` [{`dimension`, `class`, `selected_realization`, `realized_by`}]. `dimension` and `class` word for word as in the analysis' `input_dimensions`; `selected_realization`: where the test realizes it, in words; `realized_by`: what of the test realizes it: `start` (its start's id), `items` (ids of the world's things), `events` (positions in `world`, from 0), `globals` (variable names in `globals`) |
| `expected_results` | at least one: what the robot should observably do in this scenario |
| `postconditions` | what holds when the run has ended, each with the `check_indices` (positions in `checks`, from 0) of the checks that decide it. A check like `never_bumps` holds for the whole run: say so ("During the whole run …"), it is not where the robot ended |
| `oracle` | where the expectation comes from: `basis` (`learner_description`, `inferred_from_program` or `applicable_safety`), `confidence` (`low`, `medium`, `high`), `assumptions` (what the test takes for granted that nobody said), `review_required` |
| `source_block_ids` | the blocks (`b…`) the scenario is about |
| `reason` | one sentence: why this test is in the set |

The answer around the worlds:

- `generation_status`: `ready_for_review`; `partial` if some targets are deferred because they can't be tested;
  `no_valid_scenarios` with `worlds: []` if no test can be justified (say why in `deferred_scenarios` and `warnings`).
- `coverage_plan`: `target_branch_ids` (the outcomes on the analysis' paths), `planned_covered_branch_ids` (those
  your tests plan), `deferred_branch_ids` (the others, each with a reason), `deferred_inputs` (input classes of the
  analysis that no test stands for: `dimension`, `value` (the class, word for word), `reason`).
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

- `does`: `drives_forward`, `drives_backward` (at least 1 cm/s along the heading, over half a second: a robot that wiggles along a line drives forward), `turns_left`, `turns_right` (at
  least 10°/s; a curve counts as driving and turning), `stands_still` (neither), `left_led_on`, `left_led_off`,
  `right_led_on`, `right_led_off`, `leds_on`, `leds_off` (both LEDs), `plays_sound`, `silent`.
- `when` (what the sensors measure, whether or not the program reads them): `line`, `no_line` (the line tracker sees
  black, or not), `obstacle_ahead`, `obstacle_left`, `obstacle_right`, `no_obstacle`, `left_light_below`,
  `left_light_above`, `right_light_below`, `right_light_above` (with `percent`, 0 to 100), `sound`, `play_key`,
  `rec_key`.
- `event`: `clap`, `key` (from `world`), `line_start`, `line_end` (the line tracker begins or stops seeing black),
  `obstacle` (an obstacle sensor begins to see something). A line follower that steers along the line's edge leaves
  the black core and finds it again many times a second, so for it `line_start` and `line_end` happen all the time:
  where a line ends, test what it does by a goal area there (`reaches`, `ends_in`), not by `after` `line_end`.
- **`does` is for what lasts**: every frame from `after_ms` to the end of the run. Use it for what the robot keeps
  doing (drives forward along a line, stands still from some time on). **Not for a short move**: a turn by an angle or
  a short drive ends, the robot then does something else, and `does` fails although the robot did what it should.
- **A reaction to something it sees**: `whenever`, with the sensor condition: "whenever an obstacle is ahead, it
  stands still". **Give it time: `after_ms` 200 or more** for `stands_still` (the Lab refuses less): a right program
  may see the thing a few frames later than another one (it reads another sensor), and needs a frame to stop. **Turning
  away from something it sees is tested by where the robot gets to** (it gets through a bent tunnel without bumping,
  as with a line follower), never by `whenever` with `turns_left` or `turns_right` (the Lab refuses it): a program
  that turns in steps (turn by 20°, then drive on, then look again) drives forward between its steps while the wall is
  still in view, and one that turns in a curve may turn the other way first. Something the robot drives up to can use
  `after` with `event` `obstacle` too; something in view from the start never "appears", so `after` has nothing to
  decide: use `whenever`. **Show that the robot gets there**: a reaction to something it drives up to holds for a
  robot that never moves (it never sees the thing), so such a test also checks where the robot gets to: `ends_in` an
  area just before the thing for a stop ("A wall ahead"), `reaches` for getting past it. The Lab sends back a test
  whose robot sees nothing at the start and that checks a reaction to an obstacle without `reaches` or `ends_in`.
- **"It doesn't …"**: check what it does instead: `does` `stands_still` (it doesn't move), or `drives_forward`. Never
  two checks that can't both hold, such as `does` `turns_left` and `does` `turns_right`: the Lab refuses them.
- A check with nothing to decide (the condition never held, no event happened) is **not checked**: it is no evidence,
  and the Lab doesn't count the test as passed. A robot stuck at an obstacle stands still too, so check `never_bumps`
  as well when the robot should stop before something.
- **Positive and negative checks**: `never_bumps` and `never_touches` are negative: they hold for a robot that never
  moves. Every test needs at least one positive check (`reaches`, `ends_in`, `does`, `whenever`, `after`,
  `variable`) that shows its scenario happened, **taken from the scenario's expected behaviour, never invented**. If
  the only expectation is negative ("it doesn't bump into walls") and the learner doesn't say what the
  robot should do there, the scenario gets no test: defer it ("nothing to expect that shows it happened"). Don't add
  "drives forward" or "stands still" that nobody asked for, to have a positive check.

## Drawing a world

- Keep it plain: a line, a box, a goal area, a fail area, and only where the scenario needs them. Leave 10 cm or more
  between things and the floor's edge, unless the scenario is about the edge.
- **A line to follow**: points on the floor, `smooth: true` for curves, `width` 1.48. Bends need room: turn by at most
  45° over 20 cm. A goal area over the end of the line, wide enough to cover it (for example 30 × 30 cm), lets a test
  end there (`until`).
- **A start on the line**: on one of the line's points that has at least 15 cm of line ahead, facing along the line
  (the line tracker is 5 cm ahead of the start). A start "beside the line" (only for a test of finding the line: see
  "A line beside the start"): 5 to 10 cm off it, facing along it.
- **An obstacle on the line**: a box of 10 × 10 cm centred on one of the line's points, at least 40 cm along the line
  from the start. For a stop before it, a goal area of 15 × 20 cm just before it, across the line (from 15 cm before
  the box to the box; the robot stops 2 to 3 cm before it), and `ends_in` it.
- **Starts** must be on the floor, with the whole robot (8 × 7.5 cm, from 1.8 cm behind to 6.2 cm in front of the
  start) clear of obstacles and walls (the Lab sends back a start whose robot touches one: in a tunnel, start on its
  middle line where it runs straight, 25 cm or more from a bend), and not touching a goal or fail area.
- **Go through the program from the start first.** For each test, follow what the program does from the start until
  the scenario's moment: which decisions it takes on the way, and what it then does with the motors. The world must
  make those go as planned, and list them in `planned_branch_ids`. **A program that reads the line tracker gets a
  line under the robot** until the scenario's thing comes, and a wall ahead stands across a line that runs from the
  start, **whatever it does on a plain floor**: that may be its mistake ("The program on a plain floor" shows what it
  does there, not what is right). A program that doesn't read the line tracker gets a line only for a test about a
  line.
- **Place things from the start, with heading 0** (facing right, towards larger x) unless the scenario needs another
  heading. For a start at (x, y):
  - **A line through the start** (for a program that follows a line): a straight `line`, `width` 1.48, `points`
    [[x − 10, y], [x + 80, y]]; the start is then on its black core, facing along it. Other things of the scenario go
    on this line (a wall across it at x + 8, or at x + 30 or further).
  - **A line beside the start** (for a test that starts "beside the line"): **only if the learner says the robot
    should find the line** (or get back to it). A learner's robot starts on the line, so a start beside it tests
    something they didn't ask for, and a right program may well turn away from the line there: otherwise defer the
    class "beside the line" with the reason "you didn't say it should find the line". The same line 8 cm to the
    side, **on the side the program turns to on the plain floor** ("The program on a plain floor"), so that it finds it. Turns left
    there: the line on its left, `points` [[x − 10, y − 8], [x + 80, y − 8]]. Turns right: on its right, y + 8. On the
    other side it turns away and circles without finding the line, and the test fails on a right program. **If it
    drives straight on**, it drives past a line beside it: a start beside the line isn't a situation of its own for
    this program; defer the class with that reason. The start is then not on the line.
  - **A wall ahead** (all three obstacle sensors see it): a `rect` with its left edge at x + 8 (seen at once) or at
    x + 30 or further (the robot drives up to it), `y` = y − 6, `w` 2, `h` 12. **A wall it drives up to gets a goal
    area just before it**, where a robot that stops there stands: for the wall at x + 30, `x` + 15, `y` − 10, `w` 15,
    `h` 20 (15 cm before the wall's left edge to it), and the test of stopping checks `ends_in` it (without `until`:
    the run would end as the robot touches the area, before it stops). **A wall ahead always spans the robot's
    whole front**, whichever obstacle sensor the program reads: a right program may read another one. Only if the
    learner says the thing is on the left or the right, it is "Something on its left or right". **If the program reads
    the line tracker**, each such test gets its own line and its own wall: the `line` `points` [[x − 10, y], [x + 40, y]], and the wall
    across it at x + 8 (seen at once) or x + 30 (it drives up to it, with the area before it). The next test starts
    30 cm lower (y + 30), with its own line, wall and area by the same numbers.
  - **Something on its left or right** (the learner says "a wall on the left", or the robot should turn away from
    walls): the sensors look
    forward, so it is something in front of the robot's left half, **inside the robot's width**: the robot drives into
    it unless it turns away in time. Never a small box in its way (it bumps into it), and not a wall along its side
    (no sensor sees it). In the dark, the tunnel's own walls do it: "Dim light: walls on its left or right".
  - **Dim light** (the light sensors are 5.5 cm ahead of the start): a straight `tunnel`, `width` 15, `points`
    [[x − 10, y], [x + 100, y]], with the start near its opening: the sensors are 15.5 cm inside and read 40 %, the
    darkest a tunnel gets. Its walls run along the robot: the obstacle sensors don't see them. **Nothing goes inside
    the tunnel** (no box, no wall: it bumps into them), and a line only if the test is about following the line in
    the dark. A goal area in the dark ends the run there: `x` + 50, `y` − 5, `w` 10, `h` 10.
  - **Driving through a tunnel** (from the light into the dark): **the light changes over the first and last 15 cm
    under the roof**, and the program does what it does in the light until 7.5 cm inside (see "Light under a tunnel's
    roof" in "The simulator"). If it follows a line in bright light, the robot comes to the tunnel on that line, and
    the line runs on into the tunnel: a straight `line` through the start, `points` [[x − 10, y], [x + 55, y]], and
    the `tunnel`, `width` 15, `points` [[x + 40, y], [x + 160, y]]. The line then reaches 15 cm into the tunnel, and
    the robot follows it for 40 cm first, so it faces along the tunnel when the light falls. (A program that doesn't
    read the line tracker needs no line: the same tunnel, the start 15 cm before its opening.) **The goal of
    getting through the dark is inside the tunnel**, where it is dark, from 15 cm after the opening to 15 cm before
    the exit: `x` + 110, `y` − 5, `w` 10, `h` 10. **No goal after the exit** (the Lab sends it back), even if the learner says the robot
    follows the line again after the tunnel: without a line there, a line follower circles; with one, it finds it
    only if it comes out of the dark on the side it turns to (see "Light under a tunnel's roof"), so the test fails on
    right programs too. Test getting through the dark (the goal inside the tunnel), and following the line in the
    light in a world of its own; defer "follows the line again after the tunnel" with that reason (a right program may
    miss the line after the dark).
  - **Dim light: walls on its left or right** (a program that turns away from walls in the dark): **a tunnel that
    bends**, `width` 15 to 20, reached as in "Driving through a tunnel" (the line through the start runs 15 cm into
    the tunnel; without a line, the start 15 cm before its opening). A bend to the right, `points` [[x + 40, y],
    [x + 100, y], [x + 140, y + 30], [x + 155, y + 70], [x + 155, y + 115]], `smooth` true: its left wall comes in
    front of the robot's left half (LEFT). A bend to the left: y − 30, y − 70 and y − 115 (RIGHT). **The goal inside
    the tunnel, after the bend** and 15 cm or more before the exit: `x` + 150, `y` + 85, `w` 10, `h` 10 (bend to the
    left: `y` − 95). With the start at y 50 (bend to the right) or y 150 (bend to the left), it fits on the floor.
    **Each bend in a world of its own**: both recipes take the same part of the floor, and in one world their
    tunnels cross (the Lab sends back tunnels that overlap). Start where the recipe does, before the tunnel, or on a
    straight part of it 25 cm or more from a bend, never in or just before a bend: there the robot meets the wall at
    once, or straight ahead, where a right program may stop (the Lab sends such a start back). From a straight
    approach, right programs get through bends of up to 90°.
    Checks: `never_bumps` the tunnel, and `reaches` the goal: a robot that turns away from the walls gets through the
    bend, one that doesn't bumps into them. A straight tunnel is the class "nothing on either side". **No wall across
    a tunnel** unless the learner says what the robot should do at a wall in the dark: a program that checks the
    light first may never get to its wall-stop in the dark, and the test then fails on a right program.
  - **Count from the start, never back from a thing.** Each test that needs something at a set distance gets its own:
    first its start, then its thing by the numbers above. Start B at (130, 100) with a wall seen at once: the wall's
    `x` is 138; start C at (130, 160) with a wall it drives up to: its `x` is 160. Don't draw one wall for several
    tests and work out their starts from it. Then check that each test's `start` is the start you drew its thing for.
  - Each test of a world its own start, each with what its scenario needs in front of it; tests that need different
    things in front of them start at different places of the floor (at least 30 cm apart).
- New ids: items `t1`, `t2`, …; starts `A`, `B`, … with the same letter as `name`.

## How to choose the tests: four steps, in this order

**1. Paths (branch coverage).** Start from the analysis, not from a number of tests. Every outcome on the analysis'
paths (`target_branch_ids`) gets a test that plans it (`planned_branch_ids`), or is deferred with a reason. One test
may plan several outcomes only if its one run will take all of them (a line follower that curves on a bent line takes
both "sees black" and "doesn't"); drawing two triggers into one world doesn't make the program take both. A program
without decisions has one straight path: test its scenarios.

**2. Inputs (equivalence partitioning).** For each path, take the analysis' `input_dimensions`:
- **Classes**: one test per class that behaves differently (on the line, beside it; no obstacle, an obstacle ahead;
  PLAY pressed, never pressed; fewer claps than it counts to, enough). A test stands for one class of each dimension
  it varies; a second test of the same class with other numbers adds nothing. A class that can't be drawn or set up
  is deferred (`deferred_inputs`) with the reason.
- **A typical case of each class, not a borderline one**: put a test's inputs well inside its class, clear of where
  the readings change (see "Where readings change" in "The simulator"): a start on the line's middle or clearly beside
  it, a wall seen at once or one the robot drives up to (the numbers above), a clap or key well after the program
  reaches its wait, a count clearly below its limit or at it. **No boundary tests**: no test just below, at or above a
  threshold, no test of the line's edge or of the edge of the sensors' range.
- `realized_by` says which start, things, events or variables of the test make the class happen.
- **Defer only what can't be set up or decided**: a set-up the world, the start, `world` and `globals` can't express,
  or a check the simulator can't decide; and a start beside the line when the learner didn't say the robot should
  find the line (see "A line beside the start"). **Never defer because the program would fail the test**: two claps can be set
  up even if the program then counts them as three, and a test that the program fails is the help.

**3. A complete test = path + inputs + expected results + postconditions.**
- `expected_results` and `postconditions` say what the checks decide; every postcondition names its checks.
- **Where the expectation comes from** (`oracle.basis`): `learner_description` if the expectation follows from the
  learner's sentence (or what they said before), read as it is meant; what their words don't give gets no test
  (`inferred_from_program`, the program's plausible goal, only if the learner wrote no sentence at all: the Lab refuses
  it otherwise); `applicable_safety` for "doesn't bump into it" or "doesn't touch the fail area" where it
  fits the scenario, not everywhere. `review_required` is false only for a learner_description expectation with no
  assumption.
- **Check the intent, not the implementation**: "reaches Goal 1", "never bumps into the box", "stands still from
  12 s on", "whenever an obstacle is ahead, it stands still". Not that the blocks do what they say ("curves at 10 %
  and 40 %"): a test that repeats the program confirms it, bugs included. Vary the situation instead. **A line
  follower is tested by where it gets to** (it `reaches` a goal area over the line's end, from a start on the
  line), never by how it steers ("whenever it sees black, it turns right"): that is the program itself, and it
  holds for a robot that steers off the line too. The Lab refuses a test of a line follower whose only checks are
  about steering on the line.
- **Few tests, each worth reading**: a learner reads every test. One test per scenario is usual, two when they
  differ in a way the learner would notice (a wall seen at once, a wall it drives up to). No two tests that check the same thing with other numbers.
- **Every test needs a positive check** (see "Checks"): pair `never_bumps` with what the robot should do.
- **Every test must pass for a program that does what the learner said.** Leave margins in the time a test gives the
  program: `max_time_ms` well above the time the robot needs at the program's speeds, `after_ms` of a `does` well
  after the moment the robot should have arrived, `within_ms` generous. (Not the `after_ms` of a `whenever` about
  turning away: see "A reaction to something it sees".)
- Use `until` to end a run at a goal when the test is about getting there. Don't use it when the test checks
  something after the robot arrived.
- **A run ends when the program ends.** If the program ends (it has no loop that runs forever), nothing after that
  moment can be checked: check where the robot ended (`ends_in`) and what it did on the way, not `does` from a time
  after the end.
- A scenario whose expected behaviour is `unknown` gets no test: defer it.

**4. Consolidate.** Leave out a test that plans the same outcomes, with the same classes and checks, as another one;
keep the one that is easier to understand. Never leave out the only test of an outcome or of a class. Say what you
merged in `consolidation_notes`. **At most as many tests as the task allows**
(6 if it names all scenarios); what doesn't fit is deferred with the reason.

- **A world for each scenario.** Draw a world with only what its scenario needs: a wall-stop scenario gets a wall in
  front of the start, not a tunnel; a line scenario gets the line, not the walls of another scenario; a dim-light
  scenario gets the tunnel, with nothing inside it, and a line in the dark only if it is about following the line
  there (the line the robot comes in on is part of getting there: see "Driving through a tunnel"). Share a world
  only between tests of the same scenario (or of scenarios that are the same situation). Unrelated things in one world
  change what the program does: a tunnel darkens the light sensors, a wall at the side triggers the side sensors.
- **Each test its own start, placed for its situation.** Two tests of one world never start at the same pose unless
  the set-up differs. Place what the scenario is about where the robot meets it: on its way from the start, in the
  direction of its heading (heading 0 points right, towards larger x; see "The floor and its coordinates"). Check
  every coordinate before you answer. For heading 0, a `rect` ahead has its left edge `x` beyond the start's x and
  spans the start's y (`y` ≤ the start's y ≤ `y` + `h`; `y` is its top edge); a wall on the left (heading 0) lies at
  smaller y, on the right at larger y.

- **The learner's tests count: write only what they don't test yet.** A scenario, outcome or class that one of the
  learner's tests already tests gets no new test: defer it with the reason `tested by "<their test's name>"`
  (`deferred_scenarios`, `deferred_branch_ids`, `deferred_inputs`). A test that differs from one of theirs only in its
  numbers tests the same and is left out: a start a little to one side but in the same situation (both on the line
  or both beside it, the same wall in the sensor's range, the same light), another time or `max_time_ms`, a world
  drawn anew with the same things. "What the learner's tests don't check yet" in the task says what is missing; write
  your tests for that, and for whatever else none of their tests checks. If their tests check everything, answer with
  no tests and `generation_status` `no_valid_scenarios`, everything deferred as tested by theirs.
- Only `never_touches` if the world has a fail area, only `never_bumps` with an `item` that is an obstacle or wall,
  only `variable` with a global variable the program declares.

## The learner's tests

The learner's existing tests come in the same format, each world with its `world`, without what a test is for. A test
may have `"skip": true` (switched off) and `"origin": "ai"` (written by you earlier).
