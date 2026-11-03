# Levels: the Level designer, levels in the simulator, progress and study telemetry

For a study with participants, the Program tab's simulator (Edison robot group `edison`, so V2 and V3) plays **levels**
instead of its built-in backgrounds. A level is a drawn world: a start, goal areas, soft goal areas, fail areas, lines,
obstacles and walls. Sets of levels are played in order. The **Level designer** tab, switched on in `.env`, draws levels
and downloads them as files. The learner's progress is saved with the program, autosaved once the program has been
saved by hand. What learners do is sent to the server as **telemetry**: one `.jsonl` file per participant.

Designers' guide: `levels/README.md`. Configuration: `.env.example`.

## Files

| What | Where |
|---|---|
| Level sets (a folder per set, a `.json` file per level, both ordered by name) | `levels/` (`LEVELS_DIR`) |
| `.env`: `LEVEL_DESIGNER`, `LEVELS_DIR`, `LEVEL_TELEMETRY_DIR` → server properties `levels.designer`, `levels.dir`, `levels.telemetry.dir` | `OpenRobertaServer/.../main/EnvFile.java`, read in `ServerStarter.main` (`-d` overrides it); defaults in `openRoberta.properties` |
| REST `GET /levels` (the sets with their levels), `POST /levels/telemetry` | `OpenRobertaServer/.../restServices/all/controller/LevelsController.java` |
| The designer flag sent to the browser | `ClientInit` (`server.levels.designer`), `guiState.controller.js` `isLevelDesignerOn()` |
| Level format, parsing, checks, file names, `fetchSets()` | `OpenRobertaWeb/src/app/levels/level.model.ts` |
| Playing levels in the simulator: scene, referee, bar, messages, progress | `OpenRobertaWeb/src/app/levels/levels.player.ts` |
| Autosave | `OpenRobertaWeb/src/app/levels/levels.autosave.ts` |
| Telemetry | `OpenRobertaWeb/src/app/levels/levels.telemetry.ts` |
| The Level designer tab | `OpenRobertaWeb/src/app/roberta/controller/levels.controller.ts`; markup `#tabLevels`, `#levels` in `index.html` |
| The world editor (level mode) | `OpenRobertaWeb/src/app/nepotest/nepoTest.simEditor.ts` (`mode: 'level'`) |
| Hooks in the simulator | `simulation.scene.ts` (`ILevelHost`, `showFullyLoadedSim`, `update`, `handleKeyEvent`), `simulation.roberta.ts` (`levelHost`, `level()`, `stopProgram`, `callbackOnTermination`, `resetPose`) |
| Progress in the program XML | `nepoTest.suite.ts` (`setLevelProgress`, `split`/`merge`); NepoTest's `blocks.py` `split_program` leaves it out |
| Tests | `LevelsControllerTest`, `EnvFileTest`, `NepoTestSuitePersistenceTest` (progress survives import and load), `NepoTest/tests/test_blocks.py` |

## A level

```json
{"format": "nepo-level", "version": 1, "title": "...", "instructions": "...", "timeLimit": 15,
 "world": {"background": "peach", "size": {"w": 150, "h": 100}, "starts": [one start], "items": [...]}, "view": {...}}
```

- **`world`:** the Tests tab's simulation world (`nepoTest.sim.ts`, data version 3): cm from the top left of the
  peach floor, angles counterclockwise.
- **The floor's size** (`world.size`, optional; none: 300 × 200 cm, the Tests tab's floor):
  - whole cm, `SIM.FLOOR_MIN_CM` to `SIM.FLOOR_MAX_CM` (50 to 600); `SIM.floorSizeOf` rounds and clamps, and leaves
    300 × 200 out;
  - `SIM.backgroundSize` gives it, so the editor, the floor sensors, the player's floor image and scene, and the Tests
    tab's runs all follow it; `simulation.py background_size` and `validate_world` are its Python copy;
  - the designer sets it in its panel (`SimEditor.setFloorSize`, undoable). Drawn things keep their coordinates, so a
    smaller floor cuts off the right and the bottom.
- **Two item fields the Tests tab doesn't make:**
  - a goal area with `soft: {still: s}` (drawn at 50 % opacity);
  - an obstacle or wall with `failOnHit: true` (drawn red, `SIM.FAIL_OBSTACLE_COLOR`).
- **`parseLevel`** reads a level: peach floor (with its size), one start, a positive time limit or none.
- **`levelProblems`** (shown by the designer) reports: no goal area; a start that is outside the floor, on a goal, on
  a fail area or on an obstacle; and something drawn that lies (partly) outside the floor.
- **Ids:**
  - A level's id is `<set folder>/<file name without .json>`, and progress refers to it, so don't rename levels during
    a study.
  - A set's name is its folder's name without the number in front.

## Playing (levels.player)

`SimulationRoberta.Instance.levelHost` is set at startup. `level()` returns it only for robot type `edison`; for other
robots every hook does nothing.

- **Scene:**
  - The floor image is drawn into a canvas (peach plus the lines, `SIM.drawLines`) and turned into an `Image`, because
    the scene reads `backgroundImg.src`.
  - Obstacles come from `nepoTest.simRun` `obstaclesOf(item, listener, scene, colour)`, walls included.
  - Goal, soft-goal and fail areas are one object in the scene's `rcjList`, drawn only on the visible `#rcjLayer`.
    The floor sensors (`uCtx`) never see the areas, as in the Tests tab.
  - The robot is placed at the start.
- **Locked:**
  - Objects get no mouse handlers (`showFullyLoadedSim`), the robot's handlers are removed, and the scene ignores
    paste and delete keys.
  - CSS (`#simDiv.nepoLevels`) hides `#simEditButtons`.
  - The reset button (`SimulationRoberta.resetPose`) restarts the level.
- **An attempt:** each run (`showFullyLoadedSim(…, run = true)` → `sceneReady(scene, true)`) puts the robot on the start
  and counts an attempt.
- **Referee:** `frame(robot, dt, running)` is called after the sensors in `scene.update`. It checks, in this order:
  1. touching a fail area → `fail_area`;
  2. a bump (the chassis condition of `nepoTest.simRun`) into a `failOnHit` obstacle within 3 units → `fail_hit`;
  3. touching a goal area → `win`;
  4. touching a soft goal area while moving < 0.3 cm and < 1° from where the robot began standing still, for `still`
     seconds → `win_soft`;
  5. `robot.time ≥ timeLimit` → `time_limit`.

  At the program's end (`ended`), a robot on a soft goal area wins; otherwise the outcome is `program_ended`. The
  learner stopping the program gives `stopped`; the reset button gives `restarted`; choosing another level gives
  `switched`. A decision stops the program (`stopProgram`, whose termination resets the play button) and shows a
  message.
- **Unlocking:** the levels that can be chosen are the beaten ones and the first one not beaten. Winning unlocks the
  next.
- **Trying a level:** "Try in simulator" (`tryLevel`) plays a level from the designer, with no progress and no
  telemetry.
- **Events:** `onEvent(kind, data)`: `level_opened`, `set_selected`, `attempt_started`, `attempt_ended`.

## Progress and autosave

- **The progress:** `{version, set, sets: {<set>: {current, beaten: [ids]}}, levels: {<id>: {attempts, activeMs, firstOpened, testsAtStart, testRuns}}}`.
- **How it's stored:** as one more instance of the saved program XML:
  `<instance><block type="nepoLevel_progress" id="nepoLevelProgress"><data>{json}</data></block></instance>`. It's
  added only once a level has stats, and split off and restored when a program is loaded. A program without it starts
  at level 1. A change of the progress (an attempt, a win, a chosen level) marks the program unsaved.
- **Autosave** (`levels.autosave`):
  - **On** for the Edison when the user is logged in and the program is theirs to write, not the standard one, and has a
    server timestamp, i.e. it has been saved once.
  - **When:** an unsaved program is saved about 3 s later, through `program.controller` `saveToServer(true, done)`
    (quiet: no toast, no closed dialogs).
  - **A change during a save** marks the program unsaved again.
  - **A refused save** shows the error once, and autosave then waits until the timestamp changes (a manual save).
- **Saved state across re-renders:** `programToBlocklyWorkspace` keeps the saved/unsaved state on a re-render (a run,
  show source). Before 2026-11-01 it set the program to saved, so an edit made just before Play was never autosaved.

## Telemetry

**Where it's written:** `POST /levels/telemetry` with `{events: [...]}` appends one JSON line per event to
`levels.telemetry.dir`:
- `user-<id>-<account>.jsonl` for a logged-in user;
- `session-<number>.jsonl` otherwise.

The server adds `serverTime`, `userId`, `account` and `session`.

**Fields on every event:**
- `id`: the page's id and a number. An event can be sent twice (on a timeout, or when the page is left), so deduplicate
  by `id`.
- `time` (the client's), `program` (its name), `robot`, `clientAccount`, `kind`, plus the fields per kind below.

| kind | fields |
|---|---|
| `level_opened` | `level`, `set`, `index`, `attempts`, `activeMs` |
| `set_selected` | `set` |
| `attempt_started` | `level`, `set`, `attempt`, `tests` (how many), `nepo` (the program XML with its tests and the progress), `edpy` (from `/projectWorkflow/source`; `edpyError` if none) |
| `attempt_ended` | `level`, `set`, `attempt`, `outcome`, `simTime` (s), `item` (the obstacle hit), `activeMs`, `tests`, `testsAdded` (how many) |
| `level_beaten` | `level`, `set`, `attempts`, `winningAttempt`, `activeMs`, `wallMs` (since first opened), `testsAtStart`, `tests`, `testsAdded` ([{id, name}]), `testRuns` |
| `test_run` | `level`, `set`, `from` (runner or simulation), `passed`, `failed`, `error`, `skipped`, `tests` |

**How the numbers are counted:**
- **Active time** counts while the level is current, the page is visible and the robot is the Edison. A gap of more
  than 5 s (a sleeping computer) counts as 5 s.
- **Tests** are the Tests tab's test blocks and simulation tests (`tests.controller` `testInventory()`). The tests
  "added" are those whose block ids weren't there when the level was first opened. Runs are reported by
  `tests.controller` `onRunFinished`.

**When events are sent:** the queue goes every 5 s, and an attempt at once (it is big). When the page is hidden or left,
the queue goes with `navigator.sendBeacon`, carrying the init token from `COMM.getInitToken()`.

## Checking it

- **Server:** `mvn -o -pl OpenRobertaServer test -Dtest=LevelsControllerTest,EnvFileTest,NepoTestSuitePersistenceTest`.
- **NepoTest:** `python -m unittest discover -s tests -t .`.
- **In the browser** (verified 2026-11-01, headless Chrome):
  - **Designer:** drawing, properties, download and reopen, the checks, German.
  - **Referee:** every outcome above; plain obstacles don't lose; the floor under the areas is peach.
  - **Locking:** dragging and arrow keys move nothing.
  - **Sets and trying:** switching sets, trying a level and going back.
  - **Saving:** progress saved and restored; autosave after an attempt, a win, an edit and an edit just before Play; a
    refused save.
  - **Telemetry:** every event kind in the participant's file, with real EdPy; `sendBeacon` on `pagehide`.
- **What the browser test needs:** a logged-in test account in the local database.
