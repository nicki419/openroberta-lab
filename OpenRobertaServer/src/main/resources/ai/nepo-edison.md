# NEPO for the Edison, as the simulator runs it

## How you get the program

Each call gives the learner's program twice:

- **NEPO**: the Blockly XML of the program, without block ids and positions. The first `<instance>` starts with
  `robControls_start` (the start block: its statements run first, top to bottom; with `<mutation declare="true">` it
  declares global variables, `robGlobalVariables_declare`). More `<instance>`s are functions
  (`robProcedures_defnoreturn`, `robProcedures_defreturn`). Blocks that follow each other run one after the other;
  `<statement name="DO">` holds the blocks inside a loop or a branch, `<value>` an input.
- **EdPy**: the same program translated into the Edison's Python dialect, for reading. Helper functions and the fixed
  start-up are left out. Global variables are `___name`, functions `____name`. `Ed.ReadClapSensor()` after a
  movement or sound only discards the robot's own noise; ignore it.

The simulator runs the NEPO blocks, not the EdPy, so where they differ, the NEPO meaning below counts.

## Blocks and what they do in the simulator

Powers are percent, from -100 to 100 (negative: the other direction). Distances are cm, angles degrees. Only whole
numbers exist: there are no decimals and no text.

| NEPO block (XML type) | EdPy | In the simulator |
|---|---|---|
| drive forward/backward at power (`robActions_motorDiff_on`, DIRECTION `FOREWARD`/`BACKWARD`) | `_diffDrive(Ed.FORWARD, p, Ed.DISTANCE_UNLIMITED)` | both wheels at p %, until another movement block or stop; the program goes on at once |
| drive … for d cm (`robActions_motorDiff_on_for`) | `_diffDrive(Ed.FORWARD, p, d)` | drives d cm, then stops; the program waits until then |
| turn left/right at power (`robActions_motorDiff_turn`) | `_diffTurn(Ed.SPIN_LEFT, p, Ed.DISTANCE_UNLIMITED)` | turns on the spot, wheels in opposite directions, until the next movement |
| turn … for a degrees (`robActions_motorDiff_turn_for`) | `_diffTurn(Ed.SPIN_RIGHT, p, a)` | turns a degrees on the spot, then stops; the program waits |
| curve: left wheel l %, right wheel r % (`robActions_motorDiff_curve`) | `_diffCurve(Ed.FORWARD, l, r, Ed.DISTANCE_UNLIMITED)` | drives a curve until the next movement: l < r curves left, l > r curves right |
| curve … for d cm (`robActions_motorDiff_curve_for`) | `_diffCurve(dir, l, r, d)` | the curve until the robot's centre has driven d cm, then stops; the program waits |
| stop (`robActions_motorDiff_stop`) | `Ed.Drive(Ed.STOP, …)` | both wheels stop |
| motor LMOTOR/RMOTOR on at power (`robActions_motor_on`) | `_motorOn(0 or 1, p, …)` | one wheel at p %, the other keeps what it did |
| motor stop (`robActions_motor_stop`) | `Ed.DriveLeftMotor(Ed.STOP, …)` | one wheel stops |
| LED LLED/RLED on/off (`actions_led_edison`) | `Ed.LeftLed(Ed.ON)` | the left or right LED |
| play tone f Hz for t ms (`robActions_play_tone`), play note (`mbedActions_play_note`) | `Ed.PlayTone(…)` + `Ed.TimeWait(t, …)` | a sound for t ms; the program waits until it ends |
| play sound file (`robActions_play_file`) | `Ed.PlayTune(…)` | does nothing in the simulator |
| wait t ms (`robControls_wait_time`) | `Ed.TimeWait(t, Ed.TIME_MILLISECONDS)` | waits; the wheels keep doing what they did |
| wait until (`robControls_wait_for`) | `while True: if c: break` | waits until the condition holds; the wheels keep doing what they did |
| repeat forever (`robControls_loopForever`), repeat n times (`controls_repeat_ext`), repeat while/until (`controls_whileUntil`) | `while True:`, `for … in range(n):`, `while c:` / `while not c:` | loops |
| if / else if / else (`robControls_if`, `robControls_ifElse`) | `if c: … elif … else:` | decisions |
| set / get / change variable (`variables_set`, `variables_get`, `robMath_change`) | `___v = …`, `___v += d` | Number (whole numbers), Boolean, List of numbers |
| functions (`robProcedures_*`) | `def ____f(): …`, `____f()` | as usual |
| math and logic (`math_*`, `logic_*`, `robLists_*`) | `+ - * / %`, `&` for and, `\|` for or | `/` divides whole numbers |
| comment (`text_comment`) | `# text` | nothing; a learner's comment can tell you what they meant |

Sensors (values the program reads):

| NEPO block (XML type, fields) | EdPy | In the simulator |
|---|---|---|
| line tracker sees black (`robSensors_light_getSample`, MODE `LINE`, port `LINETRACKER`) | `Ed.ReadLineState() == Ed.LINE_ON_BLACK` | true while the floor under the line tracker is dark (light below 50 %): a black line |
| light LLIGHT / RLIGHT / LINETRACKER in % (`robSensors_light_getSample`, MODE `LIGHT`) | `Ed.ReadLeftLightLevel() / 10`, … | LLIGHT, RLIGHT: the light from above (they look up), 100 % in the open, down to 40 % inside a tunnel. LINETRACKER: the brightness of the floor under it, 0 (black) to 100 (white); the peach floor reads about 83 |
| obstacle FRONT / LEFT / RIGHT (`robSensors_infrared_getSample`, MODE `OBSTACLE`; also `robSensors_getSample` `INFRARED_OBSTACLE`) | `_obstacleDetection(Ed.OBSTACLE_AHEAD)`, `…LEFT`, `…RIGHT` | true while an obstacle, a wall or the floor's edge is less than 3 cm in front of that sensor (all three look forward) |
| key PLAY / REC pressed (`robSensors_key_getSample`; `robSensors_getSample` `KEY_PRESSED`) | `Ed.ReadKeypad() == Ed.KEYPAD_TRIANGLE` (PLAY), `KEYPAD_ROUND` (REC) | true while the key is held |
| sound / clap (`robSensors_sound_getSample`; `robSensors_getSample` `SOUND_SOUND`) | `Ed.ReadClapSensor() == Ed.CLAP_DETECTED` | true while it is loud: a clap is loud for about 0.3 s |
| IR remote code, IR message, send IR, reset sensor | `_irSeek`, `Ed.ReadIRData`, `_irSend` | not in the simulator: the remote and IR messages never come, send and reset do nothing |

**Sensors are states in the simulator**: a sensor is true while the thing is there, so a "wait until clap" inside a
fast loop can see one clap several times. On the real Edison, a clap is counted once. Test the simulator's behaviour.
