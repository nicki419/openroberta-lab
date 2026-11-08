# Levels

The Program tab's simulator (Edison) plays the levels in this folder. Learners choose a **set** and play its levels in
order. Beating a level unlocks the next one. They can go back to a level they have beaten, but they can't skip ahead.

- **A set** is a folder. **A level** is a `.json` file in it. Both are ordered by name, so number them:
  `01-first-steps/01-drive-to-the-goal.json`, `01-first-steps/02-around-the-red-area.json`, `02-mazes/...`.
- The simulator shows a set's name without the number, with `-` and `_` as spaces: "first steps".
- A level's id is `<folder>/<file name without .json>`. The learners' progress refers to it, so **don't rename a level**
  once a study has started.
- The server reads the folder each time the page loads, so reload the page after adding or changing a level. The
  folder is `levels` in the working directory, or `LEVELS_DIR` in `.env` (see `.env.example`).
- **A warm-up set** is a folder whose name begins with `00-` (`00-familiarisation`: L0, a wall on an empty floor, before the
  study). A program plays it only if its progress is in it: the familiarisation program every new account gets
  (`study-programs/Familiarisation.xml`) opens it. Every other program begins with the first set that isn't a warm-up set,
  and the bar offers only the sets of the program's kind, so the study's programs never see L0.

## Making a level

Set `LEVEL_DESIGNER=true` in `.env` (copy `.env.example`), restart the server (`./ora.sh start-from-git`) and open the
**Level designer** tab:

- Draw the level: the robot's **start** (a level has one), **goal areas**, **soft goal areas**, **fail areas**, lines to
  follow, obstacles and walls.
- Select a thing to see its properties:
  - a soft goal area: how long the robot must stand still on it;
  - an obstacle, a wall or a tunnel: whether bumping into it loses the level.
  - a tunnel: its width inside (5 to 60 cm). The robot drives through it; inside it is darker: the light sensors see
    100 % at an opening and 40 % from 15 cm inside on.
- Give the level a title, instructions (optional) and a time limit (optional).
- **Floor size:** width × height in cm, 50 to 600 (usually 300 × 200). What is drawn keeps its place, measured from the
  top left corner, so shrinking the floor cuts off the right and the bottom; the list of things to check says when
  something then lies outside the floor.
- **Download** it and put the file into a set's folder here.
- **Open file…** or "Open a level of the levels folder…" loads a level again to change it.

## How a level is played

The learner runs their program; the robot starts at the level's start each time.

- **Beaten:** the robot touches a goal area, or it touches a soft goal area and stands still on it for its seconds (a
  program that ends on a soft goal area also counts as standing still).
- **Lost:** the robot touches a fail area, bumps into an obstacle or wall marked "bumping into it loses the level", or
  the time limit is up (the simulator's time).

The floor sensors don't see the areas, only the lines. The robot and the things can't be moved, and "Restart level"
puts the robot back on its start.

## The file

```json
{
 "format": "nepo-level",
 "version": 1,
 "title": "Park in the box",
 "instructions": "Stop in the light green box and stand still there for 2 seconds.",
 "timeLimit": 15,
 "world": {"background": "peach",
  "starts": [{"id": "A", "name": "A", "x": 40, "y": 100, "heading": 0}],
  "items": [
    {"id": "g1", "kind": "rect", "role": "goal", "name": "Goal 1", "x": 140, "y": 85, "w": 30, "h": 30, "soft": {"still": 2}},
    {"id": "o1", "kind": "rect", "role": "obstacle", "name": "Obstacle 1", "x": 185, "y": 80, "w": 8, "h": 40, "failOnHit": true}
  ]},
 "view": {"x": 150, "y": 100, "scale": 3}
}
```

- **Units:** cm from the floor's top left corner. x points right, y down, and angles are degrees counterclockwise.
- **`size`:** the floor's size in whole cm, optional: `"world": {"background": "peach", "size": {"w": 150, "h": 100}, …}`
  (50 to 600 each). Without it, the floor is 300 × 200 cm.
- **`world`:** a simulation world as in the Tests tab (`OpenRobertaWeb/src/app/nepotest/nepoTest.sim.ts`).
- **`timeLimit`:** in seconds, optional.
- **`soft`:** the conditions of a soft goal area. For now there is one, `still` (seconds).
- **`code`** (the study's levels): the broken function the learner gets at this level, in two versions; the Lab adds it to the learner's
  program when the level is played (`docs/ai/nepo-levels.md`, "The study's code per level"). It is written by
  `evaluation/truth/write_level_code.py`; the Level designer keeps it when it saves the level again.
- **After changing a level of the study's set** (`01-first-steps`), run `evaluation/truth/check_levels.py` (every combination of correct
  fixes must still beat it) and `evaluation/phase5/verify.py` (every broken version must still lose it); see `evaluation/truth/README.md`.
