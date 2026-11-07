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
| Telemetry | `OpenRobertaWeb/src/app/levels/levels.telemetry.ts` (an attempt's EdPy is asked for once: `attemptSource`, also used by the AI test assistant when the learner asks for tests) |
| The Level designer tab | `OpenRobertaWeb/src/app/roberta/controller/levels.controller.ts`; markup `#tabLevels`, `#levels` in `index.html` |
| The world editor (level mode) | `OpenRobertaWeb/src/app/nepotest/nepoTest.simEditor.ts` (`mode: 'level'`) |
| The study's code per level: added to the program when a level is played, the version chosen in the Edit menu | `OpenRobertaWeb/src/app/levels/levels.code.ts`; the code in the level files (`code`), written by `evaluation/truth/write_level_code.py` |
| Hooks in the simulator | `simulation.scene.ts` (`ILevelHost`, `showFullyLoadedSim`, `update`, `handleKeyEvent`, `centerBackground` with `insetRight`), `simulation.roberta.ts` (`levelHost`, `level()`, `stopProgram`, `callbackOnTermination`, `resetPose`) |
| A panel beside the scene (none at present; the AI test assistant's until 2026-11-06, now a tab of the Tests tab: `docs/ai/nepo-ai-tests.md`) | an element of `#simDiv` with the class `levelSidePanel`: the scene is centred in the rest (`levels.player` `insetRight`, `sidePanelChanged`) |
| Progress in the program XML | `nepoTest.suite.ts` (`setLevelProgress`, `split`/`merge`, `loadExtras`); NepoTest's `blocks.py` `split_program` leaves it out |
| Tests | `LevelsControllerTest`, `EnvFileTest`, `NepoTestSuitePersistenceTest` (progress survives import and load), `NepoTest/tests/test_blocks.py` |

## A level

```json
{"format": "nepo-level", "version": 1, "title": "...", "instructions": "...", "timeLimit": 15,
 "world": {"background": "peach", "size": {"w": 150, "h": 100}, "starts": [one start], "items": [...]}, "view": {...},
 "code": {"function": "stopAtWall", "calls": "followLine", "versions": {"1": "<block_set ...>", "2": "<block_set ...>"}}}
```

- **`code`** (optional, since 2026-11-07): the study's code of the level (see "The study's code per level"): the function the learner
  fixes here, the function the main loop called before (`null` at the first level with code), and per version of the study's code the
  function's definition (a `block_set` with one instance). `parseLevel` keeps it and `serialize` writes it, so the Level designer keeps it
  when it saves a level again. It is written by `evaluation/truth/write_level_code.py`, not by hand.

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
  - an obstacle, wall or tunnel with `failOnHit: true` (drawn red, `SIM.FAIL_OBSTACLE_COLOR`).
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
  - Obstacles come from `nepoTest.simRun` `obstaclesOf(item, listener, scene, colour)`, walls and tunnels included.
  - Tunnels: their roofs are one SVG picture (`SIM.roofImage`, the same drawing as the editor's `roofSvg`), drawn
    above the robot by the hook `ILevelHost.drawAbove` (called by `SimulationScene.draw` after the robots). The
    robot's `ambientLight` (set in `sceneReady` and `applyLevel`) gives its light sensors the light under them
    (`SIM.lightAt`).
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
- `ai`: whether the AI test assistant was on when it happened (`docs/ai/nepo-ai-tests.md`; for `attempt_started`, at
  Play). Any measure can be split by condition without reconstructing it from the switches.

| kind | fields |
|---|---|
| `level_opened` | `level`, `set`, `index`, `attempts`, `activeMs` |
| `set_selected` | `set` |
| `attempt_started` | `level`, `set`, `attempt`, `tests` (how many), `nepo` (the program XML with its tests and the progress), `edpy` (from `/projectWorkflow/source`; `edpyError` if none) |
| `attempt_ended` | `level`, `set`, `attempt`, `outcome`, `simTime` (s), `item` (the obstacle hit), `activeMs`, `tests`, `testsAdded` (how many), `aiTestsAdded`, and the AI tests' counts |
| `level_beaten` | `level`, `set`, `attempts`, `winningAttempt`, `activeMs`, `wallMs` (since first opened), `testsAtStart`, `tests`, `testsAdded` ([{id, name, ai, copy, edited}]), `testRuns`, `aiTestRuns` (runs with AI tests), and the AI tests' counts |
| `code_version_chosen` | `version` (the study's code: chosen in the Edit menu for this program) |
| `code_added` | `level`, `version`, `function`, `definition` (`added`; `existing`: the program had a function of that name; `missing`: the level has no code in this version), `main` (`replaced`: the call of the function before; `created`: a main loop with the call; `appended`; `kept`: it called the function already) |
| `test_run` | `level`, `set`, `from` (runner or simulation), `passed`, `failed`, `error`, `skipped`, `tests`, `outcomes` ([{id, outcome, ai}]), `aiTestsRun`, `aiTestsEditedRun`, `aiPassed`, `aiFailed`, `aiError`, `aiSkipped`, and the AI tests' counts |
| the AI test assistant's events | `ai_switched`, `ai_panel`, `ai_asked`, `ai_analyzed`, `ai_tests_generated`, `ai_tests_checked`, `ai_failed_answered`, `ai_tests_fixed`, `ai_stale`, `ai_tests_added`, and the server's `ai_call` (until 2026-11-06 also `ai_inferred`, `ai_offer_shown`, `ai_offer_answered`, `ai_ask_again`): `docs/ai/nepo-ai-tests.md` |

**The AI tests' counts** (tests the AI test assistant wrote, told apart from the learner's own): `aiTests` (how many there
are now, copies included), `aiTestsEdited` (changed since they were added: name, run length, switch, start, set-up,
checks or their world), `aiTestsCopied`, `aiTestsDeleted` (added to this program and gone).

**How the numbers are counted:**
- **Active time** counts while the level is current, the page is visible and the robot is the Edison. A gap of more
  than 5 s (a sleeping computer) counts as 5 s.
- **Tests** are the Tests tab's test blocks and simulation tests (`tests.controller` `testInventory()`, which also says
  which the AI wrote: `ai`, `copy`, `edited`). The tests "added" are those whose block ids weren't there when the level
  was first opened. Runs are reported by `tests.controller` `onRunFinished`, with each test's outcome.

**When events are sent:** the queue goes every 5 s, and an attempt at once (it is big). When the page is hidden or left,
the queue goes with `navigator.sendBeacon`, carrying the init token from `COMM.getInitToken()`.

## The study's code per level

In the study, the learner gets broken code per level, fixes it and writes tests for it. Each learner plays the levels twice, once with the AI
test assistant and once without (half of them in each order), in two programs of their account. Each level's code is its own function, and
the main loop calls the newest one; each function handles its situation or calls the function of the level before.

**The source of truth** (`evaluation/truth/`, `README.md` there; made 2026-11-07):
- per level the function;
- its correct versions (3 per function) and its broken ones (made by fixed faults), each as NEPO XML of the function alone and as the level's
  whole program (a Lab export with the reference tests in its Tests tab);
- the reference tests: every correct version passes them, every broken one fails at least one (`verify.py`);
- the starter code: per function, the broken version a learner gets, in two versions of the study's code (`STARTERS` in `build.py`);
- every level is beaten by every combination of the correct versions of its program's functions (`check_levels.py`): whatever correct fix a
  learner made earlier, the later levels can be beaten with it.

**Adding the code** (`levels.code.ts`):
- **The version** of the study's code is chosen per program in the Edit menu ("Level code: version 1", "… version 2"; the items are there
  for the Edison when the set's levels have code), by the study's staff when they open a participant's program. It is saved with the
  program's progress (`progress.code`). Once code was added, the other versions can't be chosen (their items are disabled): another version
  needs another program.
- **When a level with code is played** (opened for the first time, or the version is chosen while it is played), its function in the
  program's version is added to the program, to the right of its blocks, and the main loop calls it instead of the function before. The
  functions the learner fixed stay as they are; the new function calls the last of them. The code of earlier levels that wasn't added yet is
  added first. Each level's code is added once per program (`progress.code.added`); a notice over the scene says so ("New code"). A loaded
  program's progress comes before its blocks, so the code is added a moment later.
- **The main loop:** the call of the function before is replaced by a call of the new one; a program without a main loop gets one; a main
  loop that calls neither gets the call at its end; one that calls the new function already is kept. A function of the same name that is
  already there is kept, and only the main loop changes.
- **Telemetry:** `code_version_chosen`, `code_added` (see "Telemetry").
- **The AI switch is per account, not per program** (`docs/ai/nepo-ai-tests.md`): when the staff switch between a participant's two
  programs, they switch the AI too.

**The levels were loosened on 2026-11-07** so that every combination of correct fixes beats them (`check_levels.py`); before, a correct
`followLine` could make L5 unbeatable, a correct `avoidWalls` L7, and L8 was beaten by none:
- **L5:** the tunnel 60 cm shorter (102 cm), the line after it 4.5 cm wide. Driving straight in the dark, the robot drifts by the angle it
  had when the light fell; a line follower steers along one edge of the line and finds a thin line again only if it comes out of the dark on
  that side.
- **L7:** the line in the wide tunnel begins at x 60, on the robot's straight path, so the robot meets it head on and follows it into the
  lower fork. Before, it met the line's end 1 cm beside its path, was turned away by its white border, and drove on diagonally in the dark.
- **L8:** its lines drawn anew as straights and arcs (radius 17 to 18 cm) instead of a U-turn, five turns of 110° to 150°, a tight corner and a
  hairpin. The line after the first tunnel runs through the tunnel's bend (the robot follows it in the dark) and on down the middle of the
  dark corridor of the wide tunnel into the last line, which runs up to the wall at the goal. The tunnels, walls, fail areas and the goal
  are as before. L8 now belongs to `followInTheDark`, as L2 to `followLine`: it has no new code.
- **Still open:** a line follower with its turns swapped (it follows the other edge of the line) beats L1 to L7 but can't finish L8: where
  the robot comes out of the wide tunnel into the light, the line follower of the light takes over from the one of the dark, and if they
  follow different edges, it turns away into the wall. The starter code avoids starters whose obvious fix is such a follower.

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
