/**
 * The NEPO test blocks of the Tests tab (block types nepoTest_*). They are defined here at runtime (Blockly itself is built elsewhere) and translated
 * into NepoTest's JSON test format by NepoTest/nepotest/blocks.py, which documents every block's fields and inputs. Keep both in sync.
 *
 * A test suite: the red start block "nepoTest_suite" with "nepoTest_run" blocks below it; each runs one "nepoTest_test" (given / when / then),
 * one simulation world "nepoTest_world" (all its tests) or one test of a world. A world (its data: the drawn world, see nepoTest.sim) holds
 * tests "nepoTest_simcase" (set up: a start and the past; run: the whole program; check: "nepoTest_check_*" blocks) and rules (checks for all
 * of its tests). The tests and checks refer to the world's starts and items by their ids (fields START, UNTIL, AREA, OBSTACLE) and show their
 * names: refreshWorldLabels keeps the names up to date.
 */
// @ts-ignore (Blockly has no type declarations)
import * as Blockly from 'blockly';
import * as SIM from 'nepoTest.sim';
import * as SIMRUN from 'nepoTest.simRun';

export interface ProgramInfo {
    functions: { name: string; params: { name: string; type: string }[]; returns: boolean }[];
    variables: string[];
}

let programInfo: () => ProgramInfo = () => ({ functions: [], variables: [] });

/** the tests controller tells the blocks which functions and variables the program (in the Program tab) has */
export function setProgramInfoProvider(provider: () => ProgramInfo): void {
    programInfo = provider;
}

const MESSAGES: { [lang: string]: { [key: string]: string } } = {
    en: {
        NEPOTEST_SUITE: 'test suite: run these tests',
        NEPOTEST_SUITE_TOOLTIP: 'Put "run test" blocks below: these tests run when you press "run tests".',
        NEPOTEST_RUN: 'run test',
        NEPOTEST_TEST: 'test',
        NEPOTEST_GIVEN: 'given',
        NEPOTEST_WHEN: 'when',
        NEPOTEST_THEN: 'then',
        NEPOTEST_TEST_TOOLTIP:
            'A test: given what happens around the robot, when the program runs (or a function is called), then these expectations must hold. At the bottom: whether the test should pass or fail.',
        NEPOTEST_SHOULD: 'this test should',
        NEPOTEST_SHOULD_PASS: 'pass',
        NEPOTEST_SHOULD_FAIL: 'fail',
        NEPOTEST_AT: 'at',
        NEPOTEST_FROM: 'from',
        NEPOTEST_FOR: 'for',
        NEPOTEST_MS: 'ms',
        NEPOTEST_CLAP: 'a clap',
        NEPOTEST_KEY: 'key',
        NEPOTEST_IS_PRESSED: 'is pressed',
        NEPOTEST_OBSTACLE: 'an obstacle',
        NEPOTEST_OBSTACLE_TOOLTIP: 'An obstacle in front of the robot. Duration 0: until the end of the test.',
        NEPOTEST_LIGHT: 'light sensor',
        NEPOTEST_READS: 'reads',
        NEPOTEST_LINE: 'the line tracker sees',
        NEPOTEST_BLACK: 'black',
        NEPOTEST_WHITE: 'white',
        NEPOTEST_REMOTE: 'remote control code',
        NEPOTEST_IR: 'IR message',
        NEPOTEST_VARIABLE: 'variable',
        NEPOTEST_IS: 'is',
        NEPOTEST_VARIABLE_TOOLTIP: 'Sets a global variable of the program before the function is called.',
        NEPOTEST_RUN_PROGRAM: 'run the program for at most',
        NEPOTEST_SECONDS: 's',
        NEPOTEST_RUN_PROGRAM_TOOLTIP: 'Runs the whole program. It stops when it ends, or after this time (virtual time: a test takes much less).',
        NEPOTEST_CALL: 'call function',
        NEPOTEST_CALL_TOOLTIP: 'Calls one function of the program. The program itself does not run.',
        NEPOTEST_WORLD: 'simulation world',
        NEPOTEST_WORLD_TOOLTIP:
            'A world the robot drives through: click it to draw it on the right (lines, obstacles, areas, and where the robot can start). Each test below starts the robot somewhere, runs the program and checks what the robot does. The rules are checks for every test.',
        NEPOTEST_RULES: 'rules for every test',
        NEPOTEST_TESTS_IN_WORLD: 'tests',
        NEPOTEST_SIMCASE: 'test',
        NEPOTEST_SIMCASE_TOOLTIP:
            'A test in this world. Set up: where the robot starts, and what happened before (claps, keys, variables). Run: the whole program. Check: it passes only if every check holds (and every rule of the world). Untick the box to skip the test. At the bottom: whether the test should pass or fail.',
        NEPOTEST_SET_UP: 'set up:',
        NEPOTEST_START_AT: 'the robot starts at',
        NEPOTEST_RUN_LABEL: 'run:',
        NEPOTEST_THE_PROGRAM_RUNS: 'the program',
        NEPOTEST_MODE_FOR: 'for',
        NEPOTEST_MODE_UNTIL: 'until the robot touches',
        NEPOTEST_AT_MOST_COMMA: ', at most',
        NEPOTEST_CHECK: 'check:',
        NEPOTEST_CHECK_REACHES: 'the robot reaches',
        NEPOTEST_CHECK_REACHES_TOOLTIP: 'Holds if the robot touches this area at some time during the run.',
        NEPOTEST_CHECK_NEVER_TOUCHES: 'the robot never touches',
        NEPOTEST_CHECK_NEVER_TOUCHES_TOOLTIP: 'Fails as soon as the robot touches this area. The run goes on: every check is checked.',
        NEPOTEST_CHECK_ENDS_IN: 'at the end, the robot is completely in',
        NEPOTEST_CHECK_ENDS_IN_TOOLTIP: 'Holds if the whole robot is inside this area when the run ends.',
        NEPOTEST_CHECK_NEVER_BUMPS: 'the robot never bumps into',
        NEPOTEST_CHECK_NEVER_BUMPS_TOOLTIP: 'Fails when the robot drives against this obstacle (or against anything, the wall too).',
        NEPOTEST_CHECK_PATH: 'the robot stays on its recorded path ±',
        NEPOTEST_CHECK_PATH_TOOLTIP:
            'The robot must stay within this many cm of the path it took when the path was recorded. To record it: select the test, then "Record path" in the Simulation tab.',
        NEPOTEST_NOT_RECORDED: '(not recorded yet)',
        NEPOTEST_RECORDED: '(recorded: {0} s)',
        NEPOTEST_ANY_GOAL: 'any goal area',
        NEPOTEST_ANY_FAIL: 'any fail area',
        NEPOTEST_ANYTHING: 'anything (the wall too)',
        NEPOTEST_KIND_GOAL: 'Goal',
        NEPOTEST_KIND_FAIL: 'Fail area',
        NEPOTEST_KIND_COLOR: 'Area',
        NEPOTEST_KIND_OBSTACLE: 'Obstacle',
        NEPOTEST_KIND_LINE: 'Line',
        NEPOTEST_UNKNOWN_START: 'This start is not in the world of this test: choose one of its starts.',
        NEPOTEST_UNKNOWN_ITEM: 'This is not in the world of this test (any more): choose something else.',
        NEPOTEST_OUTSIDE_WORLD: 'Put this into a simulation world.',
        NEPOTEST_EXPECT: 'expect',
        NEPOTEST_EXPECT_NO: 'expect no',
        NEPOTEST_TIMES: 'times',
        NEPOTEST_THE_RESULT: 'the result',
        NEPOTEST_THE_PROGRAM: 'the program',
        NEPOTEST_FINISHED: 'to finish',
        NEPOTEST_RUNNING: 'to be still running',
        NEPOTEST_FUNCTION: 'function',
        NEPOTEST_TO_BE_CALLED: 'to be called',
        NEPOTEST_THE_ERROR: 'the error',
        NEPOTEST_ERROR_ANY: 'any error',
        NEPOTEST_ERROR_DIVISION: 'division by zero',
        NEPOTEST_ERROR_OVERFLOW: 'number too large (16 bit)',
        NEPOTEST_ERROR_INDEX: 'list index out of range',
        NEPOTEST_ERROR_RECURSION: 'too deep recursion',
        NEPOTEST_ERROR_STEPS: 'function does not end',
        NEPOTEST_ERROR_NEGATIVE: 'negative time, speed or duration',
        NEPOTEST_ANY: 'any',
        NEPOTEST_ON: 'on',
        NEPOTEST_OFF: 'off',
        NEPOTEST_LED: 'LED',
        NEPOTEST_DRIVE: 'drive',
        NEPOTEST_TURN: 'turn',
        NEPOTEST_CURVE: 'curve',
        NEPOTEST_MOTOR: 'motor',
        NEPOTEST_STOP: 'stop',
        NEPOTEST_TONE: 'tone',
        NEPOTEST_SOUND_FILE: 'sound file',
        NEPOTEST_IR_SEND: 'send IR message',
        NEPOTEST_WAIT: 'wait',
        NEPOTEST_FORWARD: 'forward',
        NEPOTEST_BACKWARD: 'backward',
        NEPOTEST_RIGHT: 'right',
        NEPOTEST_LEFT: 'left',
        NEPOTEST_POWER: 'power %',
        NEPOTEST_POWER_LEFT: 'power left %',
        NEPOTEST_POWER_RIGHT: 'power right %',
        NEPOTEST_DISTANCE: 'distance cm',
        NEPOTEST_DEGREES: 'degrees',
        NEPOTEST_FREQUENCY: 'frequency Hz',
        NEPOTEST_DURATION: 'duration ms',
        NEPOTEST_NUMBER: 'number',
        NEPOTEST_VALUE: 'value',
        NEPOTEST_ACTION_TOOLTIP: 'An action of the robot. Empty inputs and "any" match everything.',
        NEPOTEST_AT_THE_END: 'at the end',
        NEPOTEST_WINDOW_FROM: 'from',
        NEPOTEST_TO: 'to',
        NEPOTEST_ALWAYS: 'always',
        NEPOTEST_NEVER: 'never',
        NEPOTEST_SOMETIME: 'at some point',
        NEPOTEST_WITHIN: 'within',
        NEPOTEST_MS_AFTER: 'ms after',
        NEPOTEST_EACH: 'each',
        NEPOTEST_THE_FIRST: 'the first',
        NEPOTEST_EV_CLAP: 'clap',
        NEPOTEST_EV_KEY: 'key press',
        NEPOTEST_EV_OBSTACLE_START: 'obstacle appears',
        NEPOTEST_EV_OBSTACLE_END: 'obstacle disappears',
        NEPOTEST_EV_LINE_BLACK: 'line tracker sees black',
        NEPOTEST_EV_LINE_WHITE: 'line tracker sees white',
        NEPOTEST_EV_REMOTE: 'remote code',
        NEPOTEST_EV_IR: 'IR message',
        NEPOTEST_EXPECT_WHILE: 'expect while',
        NEPOTEST_AFTER: 'after',
        NEPOTEST_MS_COLON: 'ms:',
        NEPOTEST_FOR_TOTAL: 'for',
        NEPOTEST_AT_LEAST: 'at least',
        NEPOTEST_AT_MOST: 'at most',
        NEPOTEST_ABOUT: 'about',
        NEPOTEST_MS_IN_TOTAL: 'ms in total',
        NEPOTEST_TO_BEGIN: 'to begin',
        NEPOTEST_DROVE: 'expect the robot to have driven',
        NEPOTEST_DROVE_END: '',
        NEPOTEST_TURNED: 'expect the robot to have turned',
        NEPOTEST_TURNED_END: '',
        NEPOTEST_TURN_RIGHT: 'right',
        NEPOTEST_TURN_LEFT: 'left',
        NEPOTEST_ENDS: 'expect the robot to end',
        NEPOTEST_AHEAD: 'ahead',
        NEPOTEST_BEHIND: 'behind',
        NEPOTEST_AND_POS: 'and',
        NEPOTEST_TO_THE_LEFT: 'to the left',
        NEPOTEST_TO_THE_RIGHT: 'to the right',
        NEPOTEST_OF_ITS_START: 'of its start',
        NEPOTEST_CM: 'cm',
        NEPOTEST_FINISH_WITHIN: 'expect the program to finish within',
        NEPOTEST_FINISH_WITHIN_END: '',
        NEPOTEST_LEFT_MOTOR: 'left motor',
        NEPOTEST_RIGHT_MOTOR: 'right motor',
        NEPOTEST_BOTH_MOTORS: 'both motors',
        NEPOTEST_RUNNING_ANY: 'running',
        NEPOTEST_STOPPED: 'stopped',
        NEPOTEST_AT_POWER: 'at',
        NEPOTEST_THE_ROBOT: 'the robot',
        NEPOTEST_DRIVES_FORWARD: 'drives forward',
        NEPOTEST_DRIVES_BACKWARD: 'drives backward',
        NEPOTEST_TURNS_LEFT: 'turns left',
        NEPOTEST_TURNS_RIGHT: 'turns right',
        NEPOTEST_CURVES_LEFT: 'curves left',
        NEPOTEST_CURVES_RIGHT: 'curves right',
        NEPOTEST_STANDS_STILL: 'stands still',
        NEPOTEST_LEFT_LED: 'left LED',
        NEPOTEST_RIGHT_LED: 'right LED',
        NEPOTEST_BOTH_LEDS: 'both LEDs',
        NEPOTEST_EITHER_LED: 'either LED',
        NEPOTEST_IS_SILENT: 'is silent',
        NEPOTEST_PLAYS_SOUND: 'plays a sound',
        NEPOTEST_PLAYS_TONE: 'plays a tone',
        NEPOTEST_PLAYS_FILE: 'plays a sound file',
        NEPOTEST_HZ: 'Hz',
        NEPOTEST_AND: 'and',
        NEPOTEST_OR: 'or',
        NEPOTEST_NOT: 'not',
        NEPOTEST_STATE_TOOLTIP: 'What the robot is doing at a moment. Put it into an "expect" block that says when.',
        NEPOTEST_STATE_MOTOR_TOOLTIP: 'A motor. The robot has 10 speed steps: 45 to 54 % all run at 50 %. Empty %: any power.',
        NEPOTEST_STATE_ROBOT_TOOLTIP: 'The whole robot. Turns: the wheels run in opposite directions. Curves: at different speeds, or one wheel stands.',
        NEPOTEST_STATE_SOUND_TOOLTIP: 'The sound the robot makes. Empty Hz: any tone.',
        NEPOTEST_COND_TOOLTIP: 'What happens around the robot, as it is set under "given".',
        NEPOTEST_EXPECT_STATE_TOOLTIP: 'This state must hold at that moment.',
        NEPOTEST_EXPECT_DURING_TOOLTIP: 'Empty "from" and "to": the whole run, after the robot started up.',
        NEPOTEST_EXPECT_AFTER_TOOLTIP: 'A reaction: at some moment within this time after the event (set under "given"), the state must hold.',
        NEPOTEST_EXPECT_WHILE_TOOLTIP: 'While the condition holds (set under "given"), the state must hold, beginning this many ms later.',
        NEPOTEST_EXPECT_FOR_TOOLTIP: 'How long the state held, added up over the run. "about": ± 5 %.',
        NEPOTEST_EXPECT_COUNT_TOOLTIP: 'How often the state began, e.g. how often an LED was switched on.',
        NEPOTEST_EXPECT_MEASURE_TOOLTIP:
            'Measured at the end. After "drive ... cm" and "turn ... °" blocks this is exact; after drives stopped by a wait it depends on the assumed speed.',
        TOOLBOX_NEPOTEST_TESTS: 'Tests',
        TOOLBOX_NEPOTEST_CHECKS: 'Checks',
        TOOLBOX_NEPOTEST_GIVEN: 'Given',
        TOOLBOX_NEPOTEST_WHEN: 'When',
        TOOLBOX_NEPOTEST_THEN: 'Expect',
        TOOLBOX_NEPOTEST_ACTIONS: 'Actions',
        TOOLBOX_NEPOTEST_STATES: 'States',
        TOOLBOX_NEPOTEST_VALUES: 'Values',
    },
    de: {
        NEPOTEST_SUITE: 'Testsammlung: diese Tests ausführen',
        NEPOTEST_SUITE_TOOLTIP: 'Lege „Test ausführen“-Blöcke darunter: diese Tests laufen, wenn du „Tests ausführen“ drückst.',
        NEPOTEST_RUN: 'Test ausführen',
        NEPOTEST_TEST: 'Test',
        NEPOTEST_GIVEN: 'gegeben',
        NEPOTEST_WHEN: 'wenn',
        NEPOTEST_THEN: 'dann',
        NEPOTEST_TEST_TOOLTIP:
            'Ein Test: gegeben, was um den Roboter passiert, wenn das Programm läuft (oder eine Funktion aufgerufen wird), dann müssen diese Erwartungen stimmen. Unten: ob der Test bestehen oder scheitern soll.',
        NEPOTEST_SHOULD: 'dieser Test soll',
        NEPOTEST_SHOULD_PASS: 'bestehen',
        NEPOTEST_SHOULD_FAIL: 'scheitern',
        NEPOTEST_AT: 'bei',
        NEPOTEST_FROM: 'ab',
        NEPOTEST_FOR: 'für',
        NEPOTEST_CLAP: 'ein Klatschen',
        NEPOTEST_KEY: 'Taste',
        NEPOTEST_IS_PRESSED: 'wird gedrückt',
        NEPOTEST_OBSTACLE: 'ein Hindernis',
        NEPOTEST_OBSTACLE_TOOLTIP: 'Ein Hindernis vor dem Roboter. Dauer 0: bis zum Ende des Tests.',
        NEPOTEST_LIGHT: 'Lichtsensor',
        NEPOTEST_READS: 'misst',
        NEPOTEST_LINE: 'der Linienfolger sieht',
        NEPOTEST_BLACK: 'schwarz',
        NEPOTEST_WHITE: 'weiß',
        NEPOTEST_REMOTE: 'Fernbedienungscode',
        NEPOTEST_IR: 'IR-Nachricht',
        NEPOTEST_VARIABLE: 'Variable',
        NEPOTEST_IS: 'ist',
        NEPOTEST_VARIABLE_TOOLTIP: 'Setzt eine globale Variable des Programms, bevor die Funktion aufgerufen wird.',
        NEPOTEST_RUN_PROGRAM: 'das Programm läuft höchstens',
        NEPOTEST_RUN_PROGRAM_TOOLTIP: 'Führt das ganze Programm aus. Es stoppt, wenn es endet, oder nach dieser Zeit (virtuelle Zeit: ein Test dauert viel kürzer).',
        NEPOTEST_CALL: 'rufe Funktion',
        NEPOTEST_CALL_TOOLTIP: 'Ruft eine Funktion des Programms auf. Das Programm selbst läuft nicht.',
        NEPOTEST_WORLD: 'Simulationswelt',
        NEPOTEST_WORLD_TOOLTIP:
            'Eine Welt, durch die der Roboter fährt: klicke sie an und zeichne sie rechts (Linien, Hindernisse, Flächen, und wo der Roboter starten kann). Jeder Test darunter startet den Roboter irgendwo, führt das Programm aus und prüft, was der Roboter tut. Die Regeln sind Prüfungen für jeden Test.',
        NEPOTEST_RULES: 'Regeln für jeden Test',
        NEPOTEST_TESTS_IN_WORLD: 'Tests',
        NEPOTEST_SIMCASE: 'Test',
        NEPOTEST_SIMCASE_TOOLTIP:
            'Ein Test in dieser Welt. Vorbereiten: wo der Roboter startet, und was vorher passiert ist (Klatschen, Tasten, Variablen). Ausführen: das ganze Programm. Prüfen: er besteht nur, wenn jede Prüfung stimmt (und jede Regel der Welt). Nimm das Häkchen weg, um den Test auszulassen. Unten: ob der Test bestehen oder scheitern soll.',
        NEPOTEST_SET_UP: 'vorbereiten:',
        NEPOTEST_START_AT: 'der Roboter startet bei',
        NEPOTEST_RUN_LABEL: 'ausführen:',
        NEPOTEST_THE_PROGRAM_RUNS: 'das Programm',
        NEPOTEST_MODE_FOR: 'für',
        NEPOTEST_MODE_UNTIL: 'bis der Roboter berührt:',
        NEPOTEST_AT_MOST_COMMA: ', höchstens',
        NEPOTEST_CHECK: 'prüfen:',
        NEPOTEST_CHECK_REACHES: 'der Roboter erreicht',
        NEPOTEST_CHECK_REACHES_TOOLTIP: 'Stimmt, wenn der Roboter diese Fläche irgendwann während der Fahrt berührt.',
        NEPOTEST_CHECK_NEVER_TOUCHES: 'der Roboter berührt nie',
        NEPOTEST_CHECK_NEVER_TOUCHES_TOOLTIP: 'Scheitert, sobald der Roboter diese Fläche berührt. Die Fahrt geht weiter: jede Prüfung wird geprüft.',
        NEPOTEST_CHECK_ENDS_IN: 'am Ende ist der Roboter ganz in',
        NEPOTEST_CHECK_ENDS_IN_TOOLTIP: 'Stimmt, wenn der ganze Roboter am Ende der Fahrt in dieser Fläche ist.',
        NEPOTEST_CHECK_NEVER_BUMPS: 'der Roboter stößt nie an',
        NEPOTEST_CHECK_NEVER_BUMPS_TOOLTIP: 'Scheitert, wenn der Roboter gegen dieses Hindernis fährt (oder gegen irgendetwas, auch die Wand).',
        NEPOTEST_CHECK_PATH: 'der Roboter bleibt auf seinem aufgenommenen Weg ±',
        NEPOTEST_CHECK_PATH_TOOLTIP:
            'Der Roboter muss weniger als so viele cm von dem Weg abweichen, den er beim Aufnehmen gefahren ist. Zum Aufnehmen: wähle den Test aus, dann „Weg aufnehmen“ im Simulations-Tab.',
        NEPOTEST_NOT_RECORDED: '(noch nicht aufgenommen)',
        NEPOTEST_RECORDED: '(aufgenommen: {0} s)',
        NEPOTEST_ANY_GOAL: 'irgendeinen Zielbereich',
        NEPOTEST_ANY_FAIL: 'irgendeinen Fehlerbereich',
        NEPOTEST_ANYTHING: 'irgendetwas (auch die Wand)',
        NEPOTEST_KIND_GOAL: 'Ziel',
        NEPOTEST_KIND_FAIL: 'Fehlerbereich',
        NEPOTEST_KIND_COLOR: 'Fläche',
        NEPOTEST_KIND_OBSTACLE: 'Hindernis',
        NEPOTEST_KIND_LINE: 'Linie',
        NEPOTEST_UNKNOWN_START: 'Dieser Start ist nicht in der Welt dieses Tests: wähle einen ihrer Starts.',
        NEPOTEST_UNKNOWN_ITEM: 'Das ist nicht (mehr) in der Welt dieses Tests: wähle etwas anderes.',
        NEPOTEST_OUTSIDE_WORLD: 'Lege das in eine Simulationswelt.',
        NEPOTEST_EXPECT: 'erwarte',
        NEPOTEST_EXPECT_NO: 'erwarte kein(e)',
        NEPOTEST_TIMES: 'mal',
        NEPOTEST_THE_RESULT: 'das Ergebnis',
        NEPOTEST_THE_PROGRAM: 'dass das Programm',
        NEPOTEST_FINISHED: 'endet',
        NEPOTEST_RUNNING: 'noch läuft',
        NEPOTEST_FUNCTION: 'Funktion',
        NEPOTEST_TO_BE_CALLED: 'wird aufgerufen',
        NEPOTEST_THE_ERROR: 'den Fehler',
        NEPOTEST_ERROR_ANY: 'irgendein Fehler',
        NEPOTEST_ERROR_DIVISION: 'Division durch null',
        NEPOTEST_ERROR_OVERFLOW: 'Zahl zu groß (16 Bit)',
        NEPOTEST_ERROR_INDEX: 'Listenindex außerhalb',
        NEPOTEST_ERROR_RECURSION: 'zu tiefe Rekursion',
        NEPOTEST_ERROR_STEPS: 'Funktion endet nicht',
        NEPOTEST_ERROR_NEGATIVE: 'negative Zeit, Geschwindigkeit oder Dauer',
        NEPOTEST_ANY: 'beliebig',
        NEPOTEST_ON: 'an',
        NEPOTEST_OFF: 'aus',
        NEPOTEST_DRIVE: 'fahren',
        NEPOTEST_TURN: 'drehen',
        NEPOTEST_CURVE: 'Kurve',
        NEPOTEST_MOTOR: 'Motor',
        NEPOTEST_STOP: 'anhalten',
        NEPOTEST_TONE: 'Ton',
        NEPOTEST_SOUND_FILE: 'Klang',
        NEPOTEST_IR_SEND: 'sende IR-Nachricht',
        NEPOTEST_WAIT: 'warten',
        NEPOTEST_FORWARD: 'vorwärts',
        NEPOTEST_BACKWARD: 'rückwärts',
        NEPOTEST_RIGHT: 'rechts',
        NEPOTEST_LEFT: 'links',
        NEPOTEST_POWER: 'Leistung %',
        NEPOTEST_POWER_LEFT: 'Leistung links %',
        NEPOTEST_POWER_RIGHT: 'Leistung rechts %',
        NEPOTEST_DISTANCE: 'Strecke cm',
        NEPOTEST_DEGREES: 'Grad',
        NEPOTEST_FREQUENCY: 'Frequenz Hz',
        NEPOTEST_DURATION: 'Dauer ms',
        NEPOTEST_NUMBER: 'Nummer',
        NEPOTEST_VALUE: 'Wert',
        NEPOTEST_ACTION_TOOLTIP: 'Eine Aktion des Roboters. Leere Eingänge und „beliebig“ passen zu allem.',
        NEPOTEST_AT_THE_END: 'am Ende',
        NEPOTEST_WINDOW_FROM: 'von',
        NEPOTEST_TO: 'bis',
        NEPOTEST_ALWAYS: 'immer',
        NEPOTEST_NEVER: 'nie',
        NEPOTEST_SOMETIME: 'irgendwann',
        NEPOTEST_WITHIN: 'innerhalb von',
        NEPOTEST_MS_AFTER: 'ms nach',
        NEPOTEST_EACH: 'jedem',
        NEPOTEST_THE_FIRST: 'dem ersten',
        NEPOTEST_EV_CLAP: 'Klatschen',
        NEPOTEST_EV_KEY: 'Tastendruck',
        NEPOTEST_EV_OBSTACLE_START: 'Auftauchen eines Hindernisses',
        NEPOTEST_EV_OBSTACLE_END: 'Verschwinden eines Hindernisses',
        NEPOTEST_EV_LINE_BLACK: 'Wechsel auf Schwarz (Linienfolger)',
        NEPOTEST_EV_LINE_WHITE: 'Wechsel auf Weiß (Linienfolger)',
        NEPOTEST_EV_REMOTE: 'Fernbedienungscode',
        NEPOTEST_EV_IR: 'Empfang einer IR-Nachricht',
        NEPOTEST_EXPECT_WHILE: 'erwarte, solange',
        NEPOTEST_AFTER: 'nach',
        NEPOTEST_MS_COLON: 'ms:',
        NEPOTEST_FOR_TOTAL: 'insgesamt',
        NEPOTEST_AT_LEAST: 'mindestens',
        NEPOTEST_AT_MOST: 'höchstens',
        NEPOTEST_ABOUT: 'etwa',
        NEPOTEST_MS_IN_TOTAL: 'ms lang',
        NEPOTEST_TO_BEGIN: 'beginnt',
        NEPOTEST_DROVE: 'erwarte, dass der Roboter',
        NEPOTEST_DROVE_END: 'gefahren ist',
        NEPOTEST_TURNED: 'erwarte, dass der Roboter sich',
        NEPOTEST_TURNED_END: 'gedreht hat',
        NEPOTEST_TURN_RIGHT: 'nach rechts',
        NEPOTEST_TURN_LEFT: 'nach links',
        NEPOTEST_ENDS: 'erwarte, dass der Roboter',
        NEPOTEST_AHEAD: 'vor',
        NEPOTEST_BEHIND: 'hinter',
        NEPOTEST_AND_POS: 'und',
        NEPOTEST_TO_THE_LEFT: 'links',
        NEPOTEST_TO_THE_RIGHT: 'rechts',
        NEPOTEST_OF_ITS_START: 'von seinem Start endet',
        NEPOTEST_CM: 'cm',
        NEPOTEST_FINISH_WITHIN: 'erwarte, dass das Programm innerhalb von',
        NEPOTEST_FINISH_WITHIN_END: 'endet',
        NEPOTEST_LEFT_MOTOR: 'linker Motor',
        NEPOTEST_RIGHT_MOTOR: 'rechter Motor',
        NEPOTEST_BOTH_MOTORS: 'beide Motoren',
        NEPOTEST_RUNNING_ANY: 'läuft',
        NEPOTEST_STOPPED: 'steht',
        NEPOTEST_AT_POWER: 'mit',
        NEPOTEST_THE_ROBOT: 'der Roboter',
        NEPOTEST_DRIVES_FORWARD: 'fährt vorwärts',
        NEPOTEST_DRIVES_BACKWARD: 'fährt rückwärts',
        NEPOTEST_TURNS_LEFT: 'dreht sich nach links',
        NEPOTEST_TURNS_RIGHT: 'dreht sich nach rechts',
        NEPOTEST_CURVES_LEFT: 'fährt eine Linkskurve',
        NEPOTEST_CURVES_RIGHT: 'fährt eine Rechtskurve',
        NEPOTEST_STANDS_STILL: 'steht still',
        NEPOTEST_LEFT_LED: 'linke LED',
        NEPOTEST_RIGHT_LED: 'rechte LED',
        NEPOTEST_BOTH_LEDS: 'beide LEDs',
        NEPOTEST_EITHER_LED: 'eine der LEDs',
        NEPOTEST_IS_SILENT: 'ist still',
        NEPOTEST_PLAYS_SOUND: 'spielt einen Klang',
        NEPOTEST_PLAYS_TONE: 'spielt einen Ton',
        NEPOTEST_PLAYS_FILE: 'spielt eine Klangdatei',
        NEPOTEST_HZ: 'Hz',
        NEPOTEST_AND: 'und',
        NEPOTEST_OR: 'oder',
        NEPOTEST_NOT: 'nicht',
        NEPOTEST_STATE_TOOLTIP: 'Was der Roboter in einem Moment tut. Lege es in einen „erwarte“-Block, der sagt, wann.',
        NEPOTEST_STATE_MOTOR_TOOLTIP: 'Ein Motor. Der Roboter hat 10 Geschwindigkeitsstufen: 45 bis 54 % laufen alle mit 50 %. Leeres %: beliebige Leistung.',
        NEPOTEST_STATE_ROBOT_TOOLTIP: 'Der ganze Roboter. Drehen: die Räder laufen gegeneinander. Kurve: verschieden schnell, oder ein Rad steht.',
        NEPOTEST_STATE_SOUND_TOOLTIP: 'Der Klang des Roboters. Leeres Hz: beliebiger Ton.',
        NEPOTEST_COND_TOOLTIP: 'Was um den Roboter passiert, so wie es unter „gegeben“ steht.',
        NEPOTEST_EXPECT_STATE_TOOLTIP: 'Dieser Zustand muss in diesem Moment gelten.',
        NEPOTEST_EXPECT_DURING_TOOLTIP: 'Leeres „von“ und „bis“: der ganze Lauf, nachdem der Roboter gestartet ist.',
        NEPOTEST_EXPECT_AFTER_TOOLTIP: 'Eine Reaktion: irgendwann innerhalb dieser Zeit nach dem Ereignis (unter „gegeben“) muss der Zustand gelten.',
        NEPOTEST_EXPECT_WHILE_TOOLTIP: 'Solange die Bedingung gilt (unter „gegeben“), muss der Zustand gelten, beginnend so viele ms später.',
        NEPOTEST_EXPECT_FOR_TOOLTIP: 'Wie lange der Zustand galt, über den ganzen Lauf zusammengezählt. „etwa“: ± 5 %.',
        NEPOTEST_EXPECT_COUNT_TOOLTIP: 'Wie oft der Zustand begann, z. B. wie oft eine LED eingeschaltet wurde.',
        NEPOTEST_EXPECT_MEASURE_TOOLTIP:
            'Am Ende gemessen. Nach „fahre … cm“ und „drehe … °“ genau; nach Fahrten, die ein Warten beendet, hängt es von der angenommenen Geschwindigkeit ab.',
        TOOLBOX_NEPOTEST_TESTS: 'Tests',
        TOOLBOX_NEPOTEST_CHECKS: 'Prüfungen',
        TOOLBOX_NEPOTEST_GIVEN: 'Gegeben',
        TOOLBOX_NEPOTEST_WHEN: 'Wenn',
        TOOLBOX_NEPOTEST_THEN: 'Erwarte',
        TOOLBOX_NEPOTEST_ACTIONS: 'Aktionen',
        TOOLBOX_NEPOTEST_STATES: 'Zustände',
        TOOLBOX_NEPOTEST_VALUES: 'Werte',
    },
};

/** puts the messages of `lang` (English for missing keys) into Blockly.Msg */
export function setLanguage(lang: string): void {
    const en = MESSAGES.en;
    const other = MESSAGES[lang] || {};
    for (const key of Object.keys(en)) {
        Blockly.Msg[key] = other[key] !== undefined ? other[key] : en[key];
    }
}

/** a message; some are empty on purpose (a German sentence end that English doesn't need), and appendField('') adds nothing */
function msg(key: string): string {
    const m = Blockly.Msg[key];
    if (m !== undefined && m !== null) {
        return m;
    }
    return MESSAGES.en[key] !== undefined ? MESSAGES.en[key] : key;
}

const GIVEN = 'nepoTestGiven';
const WHEN = 'nepoTestWhen';
const THEN = 'nepoTestThen';
const RUN = 'nepoTestRun';
const ACTION = 'nepoTestAction';
const STATE = 'nepoTestState';
const CONDITION = 'nepoTestCondition';
const SIM_CASE = 'nepoTestSimCase';
const SIM_CHECK = 'nepoTestSimCheck';
export const WORLD = 'nepoTest_world';
export const SIM_TEST = 'nepoTest_simcase';
export const PATH_CHECK = 'nepoTest_check_path';
const TEST_TYPES = ['nepoTest_test', WORLD, SIM_TEST]; // their names are one namespace: "run test" runs any of them by its name
const CHECK_TYPES = ['nepoTest_check_reaches', 'nepoTest_check_never_touches', 'nepoTest_check_ends_in', 'nepoTest_check_never_bumps', PATH_CHECK];
const WORLD_FIELDS = ['START', 'UNTIL', 'AREA', 'OBSTACLE']; // the fields that hold the id of a start or an item of the world
export const ANY_ITEM = 'ANY'; // "any goal area", "any fail area", "anything"
const THUMB_W = 132;
const THUMB_H = 110;
const THUMB_EMPTY = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="132" height="110"><rect width="132" height="110" fill="#f4f4f4"/></svg>');

function number(value: string | number): any {
    return new Blockly.FieldTextInput(String(value), Blockly.FieldTextInput.nonnegativeIntegerValidator);
}

/** a number field for cm, with one decimal (a tolerance) */
function decimal(value: string | number): any {
    return new Blockly.FieldTextInput(String(value), function (text: string) {
        const n = parseFloat(String(text).replace(',', '.'));
        return isNaN(n) || n < 0 ? null : String(Math.round(n * 10) / 10);
    });
}

/** a whole number field that may be empty (empty: "not set") */
function optionalNumber(value: string | number): any {
    return new Blockly.FieldTextInput(String(value), function (text: string) {
        text = String(text).trim();
        return text === '' ? '' : Blockly.FieldTextInput.nonnegativeIntegerValidator(text);
    });
}

function dropdown(options: string[][]): any {
    return new Blockly.FieldDropdown(options.map((o) => [msg(o[0]), o[1]]));
}

/** a checkbox field. The bundled Blockly's undo gives it true / false, which its own setValue takes as "unchecked": both kinds are taken here. */
function checkbox(value: string): any {
    const box = new Blockly.FieldCheckbox(value);
    const set = box.setValue;
    box.setValue = function (a: any) {
        set.call(this, a === true || String(a).toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE');
    };
    return box;
}

/** the last row of a test: "this test should [pass / fail]" (SHOULD: pass | fail; a test that should fail passes if it fails) */
function shouldRow(block: any): void {
    block
        .appendDummyInput('SHOULD_ROW')
        .appendField(msg('NEPOTEST_SHOULD'))
        .appendField(
            dropdown([
                ['NEPOTEST_SHOULD_PASS', 'pass'],
                ['NEPOTEST_SHOULD_FAIL', 'fail'],
            ]),
            'SHOULD'
        );
}

function comparison(): any {
    return new Blockly.FieldDropdown([
        ['=', 'EQ'],
        ['≠', 'NEQ'],
        ['<', 'LT'],
        ['≤', 'LTE'],
        ['>', 'GT'],
        ['≥', 'GTE'],
    ]);
}

/**
 * the options of a name dropdown, called with the field as `this`. Menu generators must work without a block: Blockly calls
 * them while the field is constructed (value still undefined: the first option becomes the default).
 * Blockly opens a dropdown only if it has at least two options, so '?' stays in the list while nothing is chosen (''):
 * otherwise a single name could never be picked.
 */
function nameOptions(field: any, names: string[]): string[][] {
    const current = field && field.getValue && field.getValue();
    const options = names.map((n) => [n, n]);
    if (current && names.indexOf(current) < 0) {
        options.push([current, current]);
    }
    if (current === '' || !options.length) {
        options.unshift(['?', '']);
    }
    return options;
}

/** the tests of a simulation world (its blocks), in their order */
export function testsOf(world: any): any[] {
    const tests = [];
    for (let b = world.getInputTargetBlock('TESTS'); b; b = b.getNextBlock()) {
        b.type === SIM_TEST && tests.push(b);
    }
    return tests;
}

/** the names a new "run test" block can get, in their order on the workspace: the tests (given / when / then) and the simulation worlds */
export function testNamesOf(workspace: any): string[] {
    return workspace
        .getTopBlocks(true)
        .filter((b) => b.type === 'nepoTest_test' || b.type === WORLD)
        .map((b) => b.getFieldValue('NAME'));
}

/** what a "run test" block can run, as dropdown options [label, name]: the tests, the worlds (all their tests) and each test of a world */
function runnableOptions(workspace: any): string[][] {
    const options: string[][] = [];
    for (const top of workspace.getTopBlocks(true)) {
        const name = top.getFieldValue('NAME');
        if (top.type === 'nepoTest_test') {
            options.push([name, name]);
        } else if (top.type === WORLD) {
            options.push([name, name]);
            testsOf(top).forEach((t) => options.push([name + ' ▸ ' + t.getFieldValue('NAME'), t.getFieldValue('NAME')]));
        }
    }
    return options;
}

/** a test (given / when / then), a simulation world, or a test of a world: what "run test" runs by its name */
export function isTestBlock(block: any): boolean {
    return !!block && TEST_TYPES.indexOf(block.type) >= 0;
}

function testNames(this: any): string[][] {
    const block = this && this.sourceBlock_;
    const options = block && block.workspace ? runnableOptions(block.workspace) : [];
    const current = this && this.getValue && this.getValue();
    if (current && !options.some((o) => o[1] === current)) {
        options.push([current, current]);
    }
    if (current === '' || !options.length) {
        options.unshift(['?', '']);
    }
    return options;
}

// ------------------------------------------------------------------------------------------------ the blocks in a simulation world

/** the simulation world a block is in (a test of it, a check of a test, a rule), or null */
export function worldOf(block: any): any {
    let b = block;
    while (b && b.type !== WORLD) {
        b = b.getParent();
    }
    return b || null;
}

/** the word for a kind of item (goal, fail, color, obstacle, line), for the names of items without one */
export function kindWord(kind: string): string {
    return msg('NEPOTEST_KIND_' + String(kind).toUpperCase());
}

/**
 * the options of a dropdown that holds the id of a start or an item of the block's world, called with the field as `this`. Without a world
 * (while a block is loaded or in the toolbox) a new world's: the toolbox's test starts at its start A. A value that isn't in the world shows
 * as "?" (refreshWorldLabels warns).
 */
function worldOptions(field: any, make: (world: SIM.SimWorld) => string[][]): string[][] {
    const block = field && field.sourceBlock_;
    const world = block && worldOf(block);
    const options = make(world ? SIM.parseData(world.data).world : SIM.defaultWorld());
    const current = field && field.getValue && field.getValue();
    if (current && !options.some((o) => o[1] === current)) {
        options.push(['?', current]);
    }
    if (current === '' || !options.length) {
        options.unshift(['?', '']);
    }
    return options;
}

function startMenu(this: any): string[][] {
    return worldOptions(this, (world) => world.starts.map((s) => [s.name, s.id]));
}

/** the areas of the world (goal, fail and coloured areas), those with `role` first; with "any ... area" first if anyKey is given */
function areaMenu(role: string, anyKey?: string): (this: any) => string[][] {
    return function (this: any) {
        return worldOptions(this, function (world) {
            const areas = world.items.filter(SIM.isArea);
            const sorted = areas.filter((i) => i.role === role).concat(areas.filter((i) => i.role !== role));
            return (anyKey ? [[msg(anyKey), ANY_ITEM]] : []).concat(sorted.map((i) => [SIM.itemName(world, i, kindWord), i.id]));
        });
    };
}

function obstacleMenu(this: any): string[][] {
    return worldOptions(this, (world) =>
        [[msg('NEPOTEST_ANYTHING'), ANY_ITEM]].concat(world.items.filter((i) => i.kind !== 'line' && i.role === 'obstacle').map((i) => [SIM.itemName(world, i, kindWord), i.id]))
    );
}

function isWorldPart(block: any): boolean {
    return block.type === SIM_TEST || CHECK_TYPES.indexOf(block.type) >= 0;
}

/**
 * keeps the blocks in a world (all blocks under `root`) in step with the world: the names of its starts and items in their dropdowns (Blockly
 * only sets a dropdown's text when its value changes), the warnings of blocks whose start or item isn't in their world, the recorded path of
 * path checks. A dropdown without a value gets the first item that fits (in the undo step `group`, if given). Called when a world changed,
 * after a suite was loaded, and when such a block is moved or created.
 */
export function refreshWorldLabels(root: any, group?: string): void {
    if (!root || !root.workspace || root.workspace.isFlyout) {
        return;
    }
    for (const block of root.getDescendants()) {
        if (!isWorldPart(block)) {
            continue;
        }
        const world = worldOf(block);
        let warning: string = world ? null : msg('NEPOTEST_OUTSIDE_WORLD');
        for (const name of WORLD_FIELDS) {
            const field = block.getField(name);
            if (!field || !field.isVisible()) {
                continue;
            }
            const options: string[][] = field.getOptions_ ? field.getOptions_() : field.getOptions();
            let value = field.getValue();
            const known = options.filter((o) => o[1] === value && o[0] !== '?')[0];
            if (world && value === '' && options.some((o) => o[1] !== '')) {
                const old = Blockly.Events.getGroup();
                group && Blockly.Events.setGroup(group);
                field.setValue((value = options.filter((o) => o[1] !== '')[0][1]));
                Blockly.Events.setGroup(old);
            } else {
                field.setText(known ? known[0] : '?');
                if (world && !known && value !== '' && !warning) {
                    warning = msg(name === 'START' ? 'NEPOTEST_UNKNOWN_START' : 'NEPOTEST_UNKNOWN_ITEM');
                }
            }
        }
        if (block.type === PATH_CHECK) {
            const path = SIM.parsePath(block.data);
            const info = block.getField('PATH_INFO');
            info && info.setText(path ? msg('NEPOTEST_RECORDED').replace('{0}', String(Math.round((path.time_ms || 0) / 100) / 10)) : msg('NEPOTEST_NOT_RECORDED'));
        }
        if (block.worldWarning_ !== warning && block.setWarningText) {
            block.worldWarning_ = warning;
            block.setWarningText(warning);
        }
    }
}

/** the onchange of the blocks in a world: moved into a world, out of it, or created (pasted) */
function followWorld(block: any, event: any): void {
    if (event && (event.type === Blockly.Events.MOVE || event.type === Blockly.Events.CREATE) && event.blockId === block.id) {
        refreshWorldLabels(block, event.group);
    }
}

function checkBlock(block: any, tooltip: string): void {
    block.setColour(Blockly.CAT_LOGIC_RGB);
    block.setTooltip(msg(tooltip));
    block.setPreviousStatement(true, SIM_CHECK);
    block.setNextStatement(true, SIM_CHECK);
}

function functionNames(this: any): string[][] {
    const names = programInfo().functions.map((f) => f.name);
    return nameOptions(this, names);
}

function variableNames(this: any): string[][] {
    return nameOptions(this, programInfo().variables.slice());
}

/** a test name that no other test block of the workspace has (tests, simulation worlds and their tests: one namespace) */
function uniqueTestName(this: any, name: string): string {
    const block = this.sourceBlock_;
    name = (name || '').trim() || msg('NEPOTEST_TEST');
    if (!block || !block.workspace) {
        return name;
    }
    const taken = block.workspace
        .getAllBlocks()
        .filter((b) => TEST_TYPES.indexOf(b.type) >= 0 && b.id !== block.id)
        .map((b) => b.getFieldValue('NAME'));
    let candidate = name;
    for (let i = 2; taken.indexOf(candidate) >= 0; i++) {
        candidate = name + ' ' + i;
    }
    return candidate;
}

function hat(block: any, colour: string, tooltip: string): void {
    block.setColour(colour);
    block.setTooltip(msg(tooltip));
}

function optionalInputs(block: any, inputs: string[][]): void {
    for (const [name, label] of inputs) {
        block.appendValueInput(name).setCheck('Number').setAlign(Blockly.ALIGN_RIGHT).appendField(msg(label));
    }
}

function actionBlock(block: any, label: string): void {
    block.setColour(Blockly.CAT_ACTION_RGB);
    block.setOutput(true, ACTION);
    block.setTooltip(msg('NEPOTEST_ACTION_TOOLTIP'));
    block.appendDummyInput('HEAD').appendField(msg(label));
}

function given(block: any): void {
    block.setColour(Blockly.CAT_SENSOR_RGB);
    block.setPreviousStatement(true, GIVEN);
    block.setNextStatement(true, GIVEN);
}

function then(block: any): void {
    block.setColour(Blockly.CAT_LOGIC_RGB);
    block.setPreviousStatement(true, THEN);
    block.setNextStatement(true, THEN);
}

/** a state block: a value of type STATE, for the "expect <state> ..." blocks */
function stateBlock(block: any, tooltip = 'NEPOTEST_STATE_TOOLTIP'): void {
    block.setColour(Blockly.CAT_VARIABLE_RGB);
    block.setOutput(true, STATE);
    block.setTooltip(msg(tooltip));
    block.setInputsInline(true);
}

/**
 * shows an optional value input (and its unit, the dummy input UNIT) only where it applies: no power for "stands still", no Hz for "is
 * silent". An input with a block in it stays visible, so nothing is hidden that the translator would complain about. Called from init and
 * from onchange (dropdown changes, blocks loaded from XML); toolbox presets in the flyout keep the shape of the block's defaults.
 */
function showOptional(block: any, name: string, applies: boolean): void {
    const input = block.getInput(name);
    if (!input) {
        return;
    }
    const show = applies || !!(input.connection && input.connection.targetBlock());
    if (input.isVisible() !== show) {
        input.setVisible(show);
        const unit = block.getInput('UNIT');
        unit && unit.setVisible(show);
        if (block.rendered) {
            block.render();
        }
    }
}

const POWER_MOVES = ['forward', 'backward', 'turn_left', 'turn_right'];

/** a condition block: the world of "given", for "expect while" */
function conditionBlock(block: any): void {
    block.setColour(Blockly.CAT_SENSOR_RGB);
    block.setOutput(true, CONDITION);
    block.setTooltip(msg('NEPOTEST_COND_TOOLTIP'));
}

/** "expect <state>" plus the timing fields `rest` adds to the dummy input after it */
function stateExpect(block: any, tooltip: string, rest?: (input: any) => void): void {
    then(block);
    block.setTooltip(msg(tooltip));
    block.appendValueInput('STATE').setCheck(STATE).appendField(msg('NEPOTEST_EXPECT'));
    const input = block.appendDummyInput();
    if (rest) {
        rest(input);
    }
    block.setInputsInline(true);
}

function measureBlock(block: any): void {
    then(block);
    block.setTooltip(msg('NEPOTEST_EXPECT_MEASURE_TOOLTIP'));
}

const DEFINITIONS: { [type: string]: any } = {
    nepoTest_suite: {
        init: function () {
            hat(this, Blockly.CAT_ACTIVITY_RGB, 'NEPOTEST_SUITE_TOOLTIP');
            this.appendDummyInput().appendField(msg('NEPOTEST_SUITE'));
            this.setNextStatement(true, RUN);
            this.setDeletable(false);
        },
    },
    nepoTest_run: {
        init: function () {
            this.setColour(Blockly.CAT_PROCEDURE_RGB);
            this.appendDummyInput().appendField(msg('NEPOTEST_RUN')).appendField(new Blockly.FieldDropdown(testNames), 'NAME');
            this.setPreviousStatement(true, RUN);
            this.setNextStatement(true, RUN);
        },
    },
    nepoTest_test: {
        init: function () {
            hat(this, Blockly.CAT_PROCEDURE_RGB, 'NEPOTEST_TEST_TOOLTIP');
            this.appendDummyInput().appendField(msg('NEPOTEST_TEST')).appendField(new Blockly.FieldTextInput(msg('NEPOTEST_TEST'), uniqueTestName), 'NAME');
            this.appendStatementInput('GIVEN').setCheck(GIVEN).appendField(msg('NEPOTEST_GIVEN'));
            this.appendStatementInput('WHEN').setCheck(WHEN).appendField(msg('NEPOTEST_WHEN'));
            this.appendStatementInput('THEN').setCheck(THEN).appendField(msg('NEPOTEST_THEN'));
            shouldRow(this);
        },
    },
    nepoTest_world: {
        init: function () {
            hat(this, Blockly.CAT_PROCEDURE_RGB, 'NEPOTEST_WORLD_TOOLTIP');
            this.appendDummyInput().appendField(msg('NEPOTEST_WORLD')).appendField(new Blockly.FieldTextInput(msg('NEPOTEST_WORLD'), uniqueTestName), 'NAME');
            this.appendDummyInput('PREVIEW').appendField(new Blockly.FieldImage(THUMB_EMPTY, THUMB_W, THUMB_H, '*'), 'PREVIEW');
            this.appendStatementInput('RULES').setCheck(SIM_CHECK).appendField(msg('NEPOTEST_RULES'));
            this.appendStatementInput('TESTS').setCheck(SIM_CASE).appendField(msg('NEPOTEST_TESTS_IN_WORLD'));
            this.thumbData_ = null;
            const block = this;
            setTimeout(() => block.updateThumbnail(), 0); // after loading: the data is set right after init
        },
        /** the picture follows the block's data (set when loaded from XML, and by the simulation window); it is drawn asynchronously */
        updateThumbnail: function () {
            const key = this.data || '';
            if (this.thumbData_ === key) {
                return;
            }
            this.thumbData_ = key;
            const block = this;
            const data = SIM.parseData(this.data);
            SIMRUN.floorCanvas(data.world)
                .then((floor) => SIM.thumbnail(data, THUMB_W, THUMB_H, floor))
                .then(
                    function (url) {
                        const field = block.thumbData_ === key && block.getField('PREVIEW');
                        field && field.setValue(url);
                    },
                    function () {
                        // the images could not be loaded: the block keeps its empty picture
                    }
                );
        },
        onchange: function () {
            this.updateThumbnail();
        },
    },
    nepoTest_simcase: {
        init: function () {
            const block = this;
            this.setColour(Blockly.CAT_PROCEDURE_RGB);
            this.setTooltip(msg('NEPOTEST_SIMCASE_TOOLTIP'));
            this.setPreviousStatement(true, SIM_CASE);
            this.setNextStatement(true, SIM_CASE);
            this.appendDummyInput('HEAD')
                .appendField(checkbox('TRUE'), 'ACTIVE')
                .appendField(msg('NEPOTEST_SIMCASE'))
                .appendField(new Blockly.FieldTextInput(msg('NEPOTEST_SIMCASE'), uniqueTestName), 'NAME');
            this.appendDummyInput('START_ROW').appendField(msg('NEPOTEST_SET_UP')).appendField(msg('NEPOTEST_START_AT')).appendField(new Blockly.FieldDropdown(startMenu), 'START');
            this.appendStatementInput('SETUP').setCheck(GIVEN);
            this.appendDummyInput('RUN_ROW')
                .appendField(msg('NEPOTEST_RUN_LABEL'))
                .appendField(msg('NEPOTEST_THE_PROGRAM_RUNS'))
                .appendField(
                    new Blockly.FieldDropdown(
                        [
                            [msg('NEPOTEST_MODE_FOR'), 'for'],
                            [msg('NEPOTEST_MODE_UNTIL'), 'until'],
                        ],
                        function (mode: string) {
                            block.showMode_(mode);
                            return mode;
                        }
                    ),
                    'MODE'
                )
                .appendField(new Blockly.FieldDropdown(areaMenu('goal')), 'UNTIL')
                .appendField(msg('NEPOTEST_AT_MOST_COMMA'), 'AT_MOST')
                .appendField(number(5), 'SECONDS')
                .appendField(msg('NEPOTEST_SECONDS'));
            this.appendStatementInput('CHECKS').setCheck(SIM_CHECK).appendField(msg('NEPOTEST_CHECK'));
            shouldRow(this);
            this.showMode_();
        },
        /** "until the robot touches [area], at most": only in the mode "until" (the area stays, so switching back and forth keeps it) */
        showMode_: function (mode?: string) {
            const until = (mode || this.getFieldValue('MODE')) === 'until';
            let changed = false;
            for (const name of ['UNTIL', 'AT_MOST']) {
                const field = this.getField(name);
                if (field && field.isVisible() !== until) {
                    field.setVisible(until);
                    changed = true;
                }
            }
            if (changed && this.rendered) {
                this.render();
                until && refreshWorldLabels(this);
            }
        },
        onchange: function (event: any) {
            this.showMode_();
            followWorld(this, event);
        },
    },
    nepoTest_check_reaches: {
        init: function () {
            checkBlock(this, 'NEPOTEST_CHECK_REACHES_TOOLTIP');
            this.appendDummyInput().appendField(msg('NEPOTEST_CHECK_REACHES')).appendField(new Blockly.FieldDropdown(areaMenu('goal', 'NEPOTEST_ANY_GOAL')), 'AREA');
        },
        onchange: function (event: any) {
            followWorld(this, event);
        },
    },
    nepoTest_check_never_touches: {
        init: function () {
            checkBlock(this, 'NEPOTEST_CHECK_NEVER_TOUCHES_TOOLTIP');
            this.appendDummyInput().appendField(msg('NEPOTEST_CHECK_NEVER_TOUCHES')).appendField(new Blockly.FieldDropdown(areaMenu('fail', 'NEPOTEST_ANY_FAIL')), 'AREA');
        },
        onchange: function (event: any) {
            followWorld(this, event);
        },
    },
    nepoTest_check_ends_in: {
        init: function () {
            checkBlock(this, 'NEPOTEST_CHECK_ENDS_IN_TOOLTIP');
            this.appendDummyInput().appendField(msg('NEPOTEST_CHECK_ENDS_IN')).appendField(new Blockly.FieldDropdown(areaMenu('goal')), 'AREA');
        },
        onchange: function (event: any) {
            followWorld(this, event);
        },
    },
    nepoTest_check_never_bumps: {
        init: function () {
            checkBlock(this, 'NEPOTEST_CHECK_NEVER_BUMPS_TOOLTIP');
            this.appendDummyInput().appendField(msg('NEPOTEST_CHECK_NEVER_BUMPS')).appendField(new Blockly.FieldDropdown(obstacleMenu), 'OBSTACLE');
        },
        onchange: function (event: any) {
            followWorld(this, event);
        },
    },
    nepoTest_check_path: {
        /** its data: the recorded path (nepoTest.sim SimPath), set by the Simulation tab's "Record path" */
        init: function () {
            checkBlock(this, 'NEPOTEST_CHECK_PATH_TOOLTIP');
            this.appendDummyInput()
                .appendField(msg('NEPOTEST_CHECK_PATH'))
                .appendField(decimal(SIM.DEFAULT_TOLERANCE_CM), 'TOL')
                .appendField(msg('NEPOTEST_CM'))
                .appendField(msg('NEPOTEST_NOT_RECORDED'), 'PATH_INFO');
        },
        onchange: function (event: any) {
            followWorld(this, event);
        },
    },
    nepoTest_given_clap: {
        init: function () {
            given(this);
            this.appendDummyInput().appendField(msg('NEPOTEST_AT')).appendField(number(1000), 'AT').appendField(msg('NEPOTEST_MS') + ':').appendField(msg('NEPOTEST_CLAP'));
        },
    },
    nepoTest_given_key: {
        init: function () {
            given(this);
            this.appendDummyInput()
                .appendField(msg('NEPOTEST_AT'))
                .appendField(number(1000), 'AT')
                .appendField(msg('NEPOTEST_MS') + ':')
                .appendField(msg('NEPOTEST_KEY'))
                .appendField(
                    new Blockly.FieldDropdown([
                        ['▶ PLAY', 'PLAY'],
                        ['● REC', 'REC'],
                    ]),
                    'PORT'
                )
                .appendField(msg('NEPOTEST_IS_PRESSED'));
        },
    },
    nepoTest_given_obstacle: {
        init: function () {
            given(this);
            this.setTooltip(msg('NEPOTEST_OBSTACLE_TOOLTIP'));
            this.appendDummyInput()
                .appendField(msg('NEPOTEST_FROM'))
                .appendField(number(1000), 'FROM')
                .appendField(msg('NEPOTEST_MS'))
                .appendField(msg('NEPOTEST_FOR'))
                .appendField(number(500), 'DURATION')
                .appendField(msg('NEPOTEST_MS') + ':')
                .appendField(msg('NEPOTEST_OBSTACLE'))
                .appendField(
                    new Blockly.FieldDropdown([
                        ['FRONT', 'FRONT'],
                        ['LEFT', 'LEFT'],
                        ['RIGHT', 'RIGHT'],
                    ]),
                    'PORT'
                );
        },
    },
    nepoTest_given_light: {
        init: function () {
            given(this);
            this.appendDummyInput()
                .appendField(msg('NEPOTEST_FROM'))
                .appendField(number(0), 'AT')
                .appendField(msg('NEPOTEST_MS') + ':')
                .appendField(msg('NEPOTEST_LIGHT'))
                .appendField(
                    new Blockly.FieldDropdown([
                        ['LLIGHT', 'LLIGHT'],
                        ['RLIGHT', 'RLIGHT'],
                        ['LINETRACKER', 'LINETRACKER'],
                    ]),
                    'PORT'
                )
                .appendField(msg('NEPOTEST_READS'))
                .appendField(number(50), 'VALUE')
                .appendField('%');
        },
    },
    nepoTest_given_line: {
        init: function () {
            given(this);
            this.appendDummyInput()
                .appendField(msg('NEPOTEST_FROM'))
                .appendField(number(0), 'AT')
                .appendField(msg('NEPOTEST_MS') + ':')
                .appendField(msg('NEPOTEST_LINE'))
                .appendField(
                    dropdown([
                        ['NEPOTEST_BLACK', 'black'],
                        ['NEPOTEST_WHITE', 'white'],
                    ]),
                    'COLOR'
                );
        },
    },
    nepoTest_given_remote: {
        init: function () {
            given(this);
            this.appendDummyInput()
                .appendField(msg('NEPOTEST_AT'))
                .appendField(number(1000), 'AT')
                .appendField(msg('NEPOTEST_MS') + ':')
                .appendField(msg('NEPOTEST_REMOTE'))
                .appendField(new Blockly.FieldDropdown([0, 1, 2, 3, 4, 5, 6, 7].map((c) => [String(c), String(c)])), 'CODE');
        },
    },
    nepoTest_given_ir: {
        init: function () {
            given(this);
            this.appendDummyInput()
                .appendField(msg('NEPOTEST_AT'))
                .appendField(number(1000), 'AT')
                .appendField(msg('NEPOTEST_MS') + ':')
                .appendField(msg('NEPOTEST_IR'))
                .appendField(number(1), 'VALUE');
        },
    },
    nepoTest_given_variable: {
        init: function () {
            given(this);
            this.setTooltip(msg('NEPOTEST_VARIABLE_TOOLTIP'));
            this.appendValueInput('VALUE')
                .appendField(msg('NEPOTEST_VARIABLE'))
                .appendField(new Blockly.FieldDropdown(variableNames), 'VAR')
                .appendField(msg('NEPOTEST_IS'));
        },
    },
    nepoTest_when_run: {
        init: function () {
            this.setColour(Blockly.CAT_CONTROL_RGB);
            this.setTooltip(msg('NEPOTEST_RUN_PROGRAM_TOOLTIP'));
            this.appendDummyInput().appendField(msg('NEPOTEST_RUN_PROGRAM')).appendField(number(10), 'SECONDS').appendField(msg('NEPOTEST_SECONDS'));
            this.setPreviousStatement(true, WHEN);
        },
    },
    nepoTest_when_call: {
        init: function () {
            this.setColour(Blockly.CAT_CONTROL_RGB);
            this.setTooltip(msg('NEPOTEST_CALL_TOOLTIP'));
            const block = this;
            this.appendDummyInput('HEAD')
                .appendField(msg('NEPOTEST_CALL'))
                .appendField(
                    new Blockly.FieldDropdown(functionNames, function (name) {
                        block.updateShape_(paramsOf(name));
                        return name;
                    }),
                    'FUNCTION'
                );
            this.setPreviousStatement(true, WHEN);
            this.params_ = [];
            const first = programInfo().functions[0];
            if (first) {
                this.updateShape_(first.params);
            }
        },
        mutationToDom: function () {
            const mutation = document.createElement('mutation');
            mutation.setAttribute('name', this.getFieldValue('FUNCTION'));
            for (const p of this.params_) {
                const arg = document.createElement('arg');
                arg.setAttribute('name', p.name);
                arg.setAttribute('type', p.type);
                mutation.appendChild(arg);
            }
            return mutation;
        },
        domToMutation: function (xml) {
            const params = [];
            for (let i = 0; i < xml.childNodes.length; i++) {
                const child = xml.childNodes[i];
                if (child.nodeName.toLowerCase() === 'arg') {
                    params.push({ name: child.getAttribute('name'), type: child.getAttribute('type') });
                }
            }
            this.updateShape_(params);
        },
        updateShape_: function (params) {
            for (let i = 0; this.getInput('ARG' + i); i++) {
                if (i >= params.length) {
                    this.removeInput('ARG' + i);
                }
            }
            for (let i = 0; i < params.length; i++) {
                let input = this.getInput('ARG' + i);
                if (input) {
                    input.fieldRow.forEach((f) => f.name === 'LABEL' + i && f.setText(params[i].name));
                } else {
                    input = this.appendValueInput('ARG' + i).setAlign(Blockly.ALIGN_RIGHT);
                    input.appendField(new Blockly.FieldLabel(params[i].name), 'LABEL' + i);
                }
            }
            this.params_ = params;
        },
    },
    nepoTest_expect_result: {
        init: function () {
            then(this);
            this.appendValueInput('VALUE').appendField(msg('NEPOTEST_EXPECT')).appendField(msg('NEPOTEST_THE_RESULT')).appendField(comparison(), 'OP');
        },
    },
    nepoTest_expect_variable: {
        init: function () {
            then(this);
            this.appendValueInput('VALUE')
                .appendField(msg('NEPOTEST_EXPECT'))
                .appendField(msg('NEPOTEST_VARIABLE'))
                .appendField(new Blockly.FieldDropdown(variableNames), 'VAR')
                .appendField(comparison(), 'OP');
        },
    },
    nepoTest_expect_status: {
        init: function () {
            then(this);
            this.appendDummyInput()
                .appendField(msg('NEPOTEST_EXPECT'))
                .appendField(msg('NEPOTEST_THE_PROGRAM'))
                .appendField(
                    dropdown([
                        ['NEPOTEST_FINISHED', 'finished'],
                        ['NEPOTEST_RUNNING', 'running'],
                    ]),
                    'STATUS'
                );
        },
    },
    nepoTest_expect_action: {
        init: function () {
            then(this);
            this.appendValueInput('ACTION').setCheck(ACTION).appendField(msg('NEPOTEST_EXPECT'));
        },
    },
    nepoTest_expect_no_action: {
        init: function () {
            then(this);
            this.appendValueInput('ACTION').setCheck(ACTION).appendField(msg('NEPOTEST_EXPECT_NO'));
        },
    },
    nepoTest_expect_count: {
        init: function () {
            then(this);
            this.appendValueInput('ACTION').setCheck(ACTION).appendField(msg('NEPOTEST_EXPECT'));
            this.appendDummyInput().appendField(comparison(), 'OP').appendField(number(1), 'COUNT').appendField(msg('NEPOTEST_TIMES'));
            this.setInputsInline(true);
        },
    },
    nepoTest_expect_called: {
        init: function () {
            then(this);
            this.appendDummyInput()
                .appendField(msg('NEPOTEST_EXPECT'))
                .appendField(msg('NEPOTEST_FUNCTION'))
                .appendField(new Blockly.FieldDropdown(functionNames), 'FUNCTION')
                .appendField(msg('NEPOTEST_TO_BE_CALLED'));
        },
    },
    nepoTest_expect_error: {
        init: function () {
            then(this);
            this.appendDummyInput()
                .appendField(msg('NEPOTEST_EXPECT'))
                .appendField(msg('NEPOTEST_THE_ERROR'))
                .appendField(
                    dropdown([
                        ['NEPOTEST_ERROR_ANY', 'any'],
                        ['NEPOTEST_ERROR_DIVISION', 'division_by_zero'],
                        ['NEPOTEST_ERROR_OVERFLOW', 'overflow'],
                        ['NEPOTEST_ERROR_INDEX', 'index_out_of_range'],
                        ['NEPOTEST_ERROR_RECURSION', 'recursion'],
                        ['NEPOTEST_ERROR_STEPS', 'step_limit'],
                        ['NEPOTEST_ERROR_NEGATIVE', 'negative_value'],
                    ]),
                    'KIND'
                );
        },
    },
    nepoTest_action_led: {
        init: function () {
            actionBlock(this, 'NEPOTEST_LED');
            this.getInput('HEAD')
                .appendField(
                    dropdown([
                        ['NEPOTEST_ANY', 'ANY'],
                        ['LLED', 'LLED'],
                        ['RLED', 'RLED'],
                    ]),
                    'PORT'
                )
                .appendField(
                    dropdown([
                        ['NEPOTEST_ANY', 'ANY'],
                        ['NEPOTEST_ON', 'ON'],
                        ['NEPOTEST_OFF', 'OFF'],
                    ]),
                    'MODE'
                );
        },
    },
    nepoTest_action_drive: {
        init: function () {
            actionBlock(this, 'NEPOTEST_DRIVE');
            this.getInput('HEAD').appendField(
                dropdown([
                    ['NEPOTEST_ANY', 'ANY'],
                    ['NEPOTEST_FORWARD', 'forward'],
                    ['NEPOTEST_BACKWARD', 'backward'],
                ]),
                'DIR'
            );
            optionalInputs(this, [
                ['POWER', 'NEPOTEST_POWER'],
                ['DISTANCE', 'NEPOTEST_DISTANCE'],
            ]);
        },
    },
    nepoTest_action_turn: {
        init: function () {
            actionBlock(this, 'NEPOTEST_TURN');
            this.getInput('HEAD').appendField(
                dropdown([
                    ['NEPOTEST_ANY', 'ANY'],
                    ['NEPOTEST_RIGHT', 'right'],
                    ['NEPOTEST_LEFT', 'left'],
                ]),
                'DIR'
            );
            optionalInputs(this, [
                ['POWER', 'NEPOTEST_POWER'],
                ['DEGREES', 'NEPOTEST_DEGREES'],
            ]);
        },
    },
    nepoTest_action_curve: {
        init: function () {
            actionBlock(this, 'NEPOTEST_CURVE');
            this.getInput('HEAD').appendField(
                dropdown([
                    ['NEPOTEST_ANY', 'ANY'],
                    ['NEPOTEST_FORWARD', 'forward'],
                    ['NEPOTEST_BACKWARD', 'backward'],
                ]),
                'DIR'
            );
            optionalInputs(this, [
                ['POWER_LEFT', 'NEPOTEST_POWER_LEFT'],
                ['POWER_RIGHT', 'NEPOTEST_POWER_RIGHT'],
                ['DISTANCE', 'NEPOTEST_DISTANCE'],
            ]);
        },
    },
    nepoTest_action_motor: {
        init: function () {
            actionBlock(this, 'NEPOTEST_MOTOR');
            this.getInput('HEAD').appendField(
                dropdown([
                    ['NEPOTEST_ANY', 'ANY'],
                    ['LMOTOR', 'LMOTOR'],
                    ['RMOTOR', 'RMOTOR'],
                ]),
                'PORT'
            );
            optionalInputs(this, [['POWER', 'NEPOTEST_POWER']]);
        },
    },
    nepoTest_action_stop: {
        init: function () {
            actionBlock(this, 'NEPOTEST_STOP');
        },
    },
    nepoTest_action_tone: {
        init: function () {
            actionBlock(this, 'NEPOTEST_TONE');
            optionalInputs(this, [
                ['FREQUENCY', 'NEPOTEST_FREQUENCY'],
                ['DURATION', 'NEPOTEST_DURATION'],
            ]);
        },
    },
    nepoTest_action_sound_file: {
        init: function () {
            actionBlock(this, 'NEPOTEST_SOUND_FILE');
            optionalInputs(this, [['FILE', 'NEPOTEST_NUMBER']]);
        },
    },
    nepoTest_action_ir_send: {
        init: function () {
            actionBlock(this, 'NEPOTEST_IR_SEND');
            optionalInputs(this, [['VALUE', 'NEPOTEST_VALUE']]);
        },
    },
    nepoTest_action_wait: {
        init: function () {
            actionBlock(this, 'NEPOTEST_WAIT');
            optionalInputs(this, [['MS', 'NEPOTEST_MS']]);
        },
    },

    // ---------------------------------------------------------------- "expect <state> <timing>" (under "then")
    nepoTest_expect_state_end: {
        init: function () {
            stateExpect(this, 'NEPOTEST_EXPECT_STATE_TOOLTIP', (input) => input.appendField(msg('NEPOTEST_AT_THE_END')));
        },
    },
    nepoTest_expect_state_at: {
        init: function () {
            stateExpect(this, 'NEPOTEST_EXPECT_STATE_TOOLTIP', (input) =>
                input.appendField(msg('NEPOTEST_AT')).appendField(number(2000), 'AT').appendField(msg('NEPOTEST_MS'))
            );
        },
    },
    nepoTest_expect_state_during: {
        init: function () {
            stateExpect(this, 'NEPOTEST_EXPECT_DURING_TOOLTIP', (input) =>
                input
                    .appendField(
                        dropdown([
                            ['NEPOTEST_ALWAYS', 'always'],
                            ['NEPOTEST_NEVER', 'never'],
                            ['NEPOTEST_SOMETIME', 'sometime'],
                        ]),
                        'QUANT'
                    )
                    .appendField(msg('NEPOTEST_WINDOW_FROM'))
                    .appendField(optionalNumber(''), 'FROM')
                    .appendField(msg('NEPOTEST_TO'))
                    .appendField(optionalNumber(''), 'TO')
                    .appendField(msg('NEPOTEST_MS'))
            );
        },
    },
    nepoTest_expect_state_after: {
        init: function () {
            stateExpect(this, 'NEPOTEST_EXPECT_AFTER_TOOLTIP', (input) =>
                input
                    .appendField(msg('NEPOTEST_WITHIN'))
                    .appendField(number(200), 'WITHIN')
                    .appendField(msg('NEPOTEST_MS_AFTER'))
                    .appendField(
                        dropdown([
                            ['NEPOTEST_EACH', 'each'],
                            ['NEPOTEST_THE_FIRST', 'first'],
                        ]),
                        'EACH'
                    )
                    .appendField(
                        dropdown([
                            ['NEPOTEST_EV_CLAP', 'clap'],
                            ['NEPOTEST_EV_KEY', 'key'],
                            ['NEPOTEST_EV_OBSTACLE_START', 'obstacle_start'],
                            ['NEPOTEST_EV_OBSTACLE_END', 'obstacle_end'],
                            ['NEPOTEST_EV_LINE_BLACK', 'line_black'],
                            ['NEPOTEST_EV_LINE_WHITE', 'line_white'],
                            ['NEPOTEST_EV_REMOTE', 'remote'],
                            ['NEPOTEST_EV_IR', 'ir_message'],
                        ]),
                        'EVENT'
                    )
            );
        },
    },
    nepoTest_expect_state_while: {
        init: function () {
            then(this);
            this.setTooltip(msg('NEPOTEST_EXPECT_WHILE_TOOLTIP'));
            this.appendValueInput('COND').setCheck(CONDITION).appendField(msg('NEPOTEST_EXPECT_WHILE'));
            this.appendValueInput('STATE')
                .setCheck(STATE)
                .appendField(msg('NEPOTEST_AFTER'))
                .appendField(number(100), 'DELAY')
                .appendField(msg('NEPOTEST_MS_COLON'));
            this.setInputsInline(true);
        },
    },
    nepoTest_expect_state_for: {
        init: function () {
            stateExpect(this, 'NEPOTEST_EXPECT_FOR_TOOLTIP', (input) =>
                input
                    .appendField(msg('NEPOTEST_FOR_TOTAL'))
                    .appendField(
                        dropdown([
                            ['NEPOTEST_AT_LEAST', 'GTE'],
                            ['NEPOTEST_AT_MOST', 'LTE'],
                            ['NEPOTEST_ABOUT', 'ABOUT'],
                        ]),
                        'OP'
                    )
                    .appendField(number(1000), 'MS')
                    .appendField(msg('NEPOTEST_MS_IN_TOTAL'))
            );
        },
    },
    nepoTest_expect_state_count: {
        init: function () {
            stateExpect(this, 'NEPOTEST_EXPECT_COUNT_TOOLTIP', (input) =>
                input.appendField(msg('NEPOTEST_TO_BEGIN')).appendField(comparison(), 'OP').appendField(number(1), 'COUNT').appendField(msg('NEPOTEST_TIMES'))
            );
        },
    },
    nepoTest_expect_distance: {
        init: function () {
            measureBlock(this);
            this.appendDummyInput()
                .appendField(msg('NEPOTEST_DROVE'))
                .appendField(number(20), 'DISTANCE')
                .appendField(msg('NEPOTEST_CM'))
                .appendField(
                    dropdown([
                        ['NEPOTEST_FORWARD', 'forward'],
                        ['NEPOTEST_BACKWARD', 'backward'],
                    ]),
                    'DIR'
                )
                .appendField(msg('NEPOTEST_DROVE_END'))
                .appendField('±')
                .appendField(number(1), 'TOL')
                .appendField(msg('NEPOTEST_CM'));
        },
    },
    nepoTest_expect_turned: {
        init: function () {
            measureBlock(this);
            this.appendDummyInput()
                .appendField(msg('NEPOTEST_TURNED'))
                .appendField(number(90), 'DEGREES')
                .appendField('°')
                .appendField(
                    dropdown([
                        ['NEPOTEST_TURN_RIGHT', 'right'],
                        ['NEPOTEST_TURN_LEFT', 'left'],
                    ]),
                    'DIR'
                )
                .appendField(msg('NEPOTEST_TURNED_END'))
                .appendField('±')
                .appendField(number(5), 'TOL')
                .appendField('°');
        },
    },
    nepoTest_expect_position: {
        init: function () {
            measureBlock(this);
            this.appendDummyInput()
                .appendField(msg('NEPOTEST_ENDS'))
                .appendField(number(0), 'AHEAD')
                .appendField(msg('NEPOTEST_CM'))
                .appendField(
                    dropdown([
                        ['NEPOTEST_AHEAD', 'ahead'],
                        ['NEPOTEST_BEHIND', 'behind'],
                    ]),
                    'AHEAD_DIR'
                )
                .appendField(msg('NEPOTEST_AND_POS'))
                .appendField(number(0), 'SIDE')
                .appendField(msg('NEPOTEST_CM'))
                .appendField(
                    dropdown([
                        ['NEPOTEST_TO_THE_LEFT', 'left'],
                        ['NEPOTEST_TO_THE_RIGHT', 'right'],
                    ]),
                    'SIDE_DIR'
                )
                .appendField(msg('NEPOTEST_OF_ITS_START'))
                .appendField('±')
                .appendField(number(2), 'TOL')
                .appendField(msg('NEPOTEST_CM'));
        },
    },
    nepoTest_expect_finish_within: {
        init: function () {
            then(this);
            this.appendDummyInput()
                .appendField(msg('NEPOTEST_FINISH_WITHIN'))
                .appendField(number(5), 'SECONDS')
                .appendField(msg('NEPOTEST_SECONDS'))
                .appendField(msg('NEPOTEST_FINISH_WITHIN_END'));
        },
    },

    // ---------------------------------------------------------------- states (values for "expect <state> ...")
    nepoTest_state_motor: {
        init: function () {
            stateBlock(this, 'NEPOTEST_STATE_MOTOR_TOOLTIP');
            this.appendDummyInput()
                .appendField(
                    dropdown([
                        ['NEPOTEST_LEFT_MOTOR', 'left'],
                        ['NEPOTEST_RIGHT_MOTOR', 'right'],
                        ['NEPOTEST_BOTH_MOTORS', 'both'],
                    ]),
                    'PORT'
                )
                .appendField(
                    dropdown([
                        ['NEPOTEST_FORWARD', 'forward'],
                        ['NEPOTEST_BACKWARD', 'backward'],
                        ['NEPOTEST_RUNNING_ANY', 'running'],
                        ['NEPOTEST_STOPPED', 'stopped'],
                    ]),
                    'IS'
                );
            this.appendValueInput('POWER').setCheck('Number').appendField(msg('NEPOTEST_AT_POWER'));
            this.appendDummyInput('UNIT').appendField('%');
            this.onchange();
        },
        onchange: function () {
            showOptional(this, 'POWER', this.getFieldValue('IS') !== 'stopped');
        },
    },
    nepoTest_state_robot: {
        init: function () {
            stateBlock(this, 'NEPOTEST_STATE_ROBOT_TOOLTIP');
            this.appendDummyInput()
                .appendField(msg('NEPOTEST_THE_ROBOT'))
                .appendField(
                    dropdown([
                        ['NEPOTEST_DRIVES_FORWARD', 'forward'],
                        ['NEPOTEST_DRIVES_BACKWARD', 'backward'],
                        ['NEPOTEST_TURNS_LEFT', 'turn_left'],
                        ['NEPOTEST_TURNS_RIGHT', 'turn_right'],
                        ['NEPOTEST_CURVES_LEFT', 'curve_left'],
                        ['NEPOTEST_CURVES_RIGHT', 'curve_right'],
                        ['NEPOTEST_STANDS_STILL', 'still'],
                    ]),
                    'MOVE'
                );
            this.appendValueInput('POWER').setCheck('Number').appendField(msg('NEPOTEST_AT_POWER'));
            this.appendDummyInput('UNIT').appendField('%');
            this.onchange();
        },
        onchange: function () {
            showOptional(this, 'POWER', POWER_MOVES.indexOf(this.getFieldValue('MOVE')) >= 0);
        },
    },
    nepoTest_state_led: {
        init: function () {
            stateBlock(this);
            this.appendDummyInput()
                .appendField(
                    dropdown([
                        ['NEPOTEST_LEFT_LED', 'left'],
                        ['NEPOTEST_RIGHT_LED', 'right'],
                        ['NEPOTEST_BOTH_LEDS', 'both'],
                        ['NEPOTEST_EITHER_LED', 'either'],
                    ]),
                    'PORT'
                )
                .appendField(
                    dropdown([
                        ['NEPOTEST_ON', 'on'],
                        ['NEPOTEST_OFF', 'off'],
                    ]),
                    'IS'
                );
        },
    },
    nepoTest_state_sound: {
        init: function () {
            stateBlock(this, 'NEPOTEST_STATE_SOUND_TOOLTIP');
            this.appendDummyInput()
                .appendField(msg('NEPOTEST_THE_ROBOT'))
                .appendField(
                    dropdown([
                        ['NEPOTEST_PLAYS_TONE', 'tone'],
                        ['NEPOTEST_PLAYS_SOUND', 'any'],
                        ['NEPOTEST_PLAYS_FILE', 'file'],
                        ['NEPOTEST_IS_SILENT', 'silent'],
                    ]),
                    'SOUND'
                );
            this.appendValueInput('FREQUENCY').setCheck('Number');
            this.appendDummyInput('UNIT').appendField(msg('NEPOTEST_HZ'));
            this.onchange();
        },
        onchange: function () {
            showOptional(this, 'FREQUENCY', this.getFieldValue('SOUND') === 'tone');
        },
    },
    nepoTest_state_variable: {
        init: function () {
            stateBlock(this);
            this.appendValueInput('VALUE')
                .appendField(msg('NEPOTEST_VARIABLE'))
                .appendField(new Blockly.FieldDropdown(variableNames), 'VAR')
                .appendField(comparison(), 'OP');
        },
    },
    nepoTest_state_logic: {
        init: function () {
            stateBlock(this);
            this.appendValueInput('A').setCheck(STATE);
            this.appendValueInput('B')
                .setCheck(STATE)
                .appendField(
                    dropdown([
                        ['NEPOTEST_AND', 'AND'],
                        ['NEPOTEST_OR', 'OR'],
                    ]),
                    'OP'
                );
        },
    },
    nepoTest_state_not: {
        init: function () {
            stateBlock(this);
            this.appendValueInput('STATE').setCheck(STATE).appendField(msg('NEPOTEST_NOT'));
        },
    },

    // ---------------------------------------------------------------- conditions (the world, for "expect while")
    nepoTest_cond_obstacle: {
        init: function () {
            conditionBlock(this);
            this.appendDummyInput()
                .appendField(msg('NEPOTEST_OBSTACLE'))
                .appendField(
                    dropdown([
                        ['FRONT', 'FRONT'],
                        ['LEFT', 'LEFT'],
                        ['RIGHT', 'RIGHT'],
                        ['NEPOTEST_ANY', 'ANY'],
                    ]),
                    'PORT'
                );
        },
    },
    nepoTest_cond_line: {
        init: function () {
            conditionBlock(this);
            this.appendDummyInput()
                .appendField(msg('NEPOTEST_LINE'))
                .appendField(
                    dropdown([
                        ['NEPOTEST_BLACK', 'black'],
                        ['NEPOTEST_WHITE', 'white'],
                    ]),
                    'COLOR'
                );
        },
    },
    nepoTest_cond_light: {
        init: function () {
            conditionBlock(this);
            this.appendDummyInput()
                .appendField(msg('NEPOTEST_LIGHT'))
                .appendField(
                    new Blockly.FieldDropdown([
                        ['LLIGHT', 'LLIGHT'],
                        ['RLIGHT', 'RLIGHT'],
                        ['LINETRACKER', 'LINETRACKER'],
                    ]),
                    'PORT'
                )
                .appendField(comparison(), 'OP')
                .appendField(number(50), 'VALUE')
                .appendField('%');
        },
    },
};

function paramsOf(functionName: string): { name: string; type: string }[] {
    const f = programInfo().functions.filter((fn) => fn.name === functionName)[0];
    return f ? f.params : [];
}

const CATEGORIES: { [name: string]: [string, string] } = {
    NEPOTEST_TESTS: ['CAT_PROCEDURE_RGB', 'flag-outline'],
    NEPOTEST_CHECKS: ['CAT_LOGIC_RGB', 'input-checked'],
    NEPOTEST_GIVEN: ['CAT_SENSOR_RGB', 'sensor'],
    NEPOTEST_WHEN: ['CAT_CONTROL_RGB', 'media-play-outline'],
    NEPOTEST_THEN: ['CAT_LOGIC_RGB', 'input-checked'],
    NEPOTEST_ACTIONS: ['CAT_ACTION_RGB', 'action'],
    NEPOTEST_STATES: ['CAT_VARIABLE_RGB', 'variable'],
    NEPOTEST_VALUES: ['CAT_MATH_RGB', 'math'],
};

/** defines all test blocks and the toolbox categories. Call it after the theme is applied (after the first Blockly.inject). */
export function register(lang: string): void {
    setLanguage(lang);
    for (const type of Object.keys(DEFINITIONS)) {
        Blockly.Blocks[type] = DEFINITIONS[type];
    }
    for (const name of Object.keys(CATEGORIES)) {
        Blockly['CAT_' + name + '_RGB'] = Blockly[CATEGORIES[name][0]];
        Blockly.CAT_ICON['TOOLBOX_' + name] = CATEGORIES[name][1];
    }
}

function num(value: number): string {
    return '<block type="math_number"><field name="NUM">' + value + '</field></block>';
}

/** the toolbox of the Tests tab */
export function toolbox(): string {
    const cat = (name: string, blocks: string) => '<category name="TOOLBOX_' + name + '" svg="true">' + blocks + '</category>';
    const b = (type: string, inner = '') => '<block type="' + type + '">' + inner + '</block>';
    const f = (name: string, value: string) => '<field name="' + name + '">' + value + '</field>';
    const v = (name: string, inner: string) => '<value name="' + name + '">' + inner + '</value>';
    const motor = b('nepoTest_state_motor', f('PORT', 'left') + f('IS', 'forward') + v('POWER', num(50)));
    const still = b('nepoTest_state_robot', f('MOVE', 'still'));
    const ledOn = b('nepoTest_state_led', f('PORT', 'left') + f('IS', 'on'));
    const simTest = b(SIM_TEST, f('START', SIM.DEFAULT_START) + f('MODE', 'for') + f('SECONDS', '5'));
    return (
        '<toolbox_set id="nepoTestToolbox" style="display: none">' +
        cat(
            'NEPOTEST_TESTS',
            b('nepoTest_test', '<statement name="WHEN">' + b('nepoTest_when_run') + '</statement><statement name="THEN">' + b('nepoTest_expect_status') + '</statement>') +
                b(WORLD, '<statement name="TESTS">' + simTest + '</statement>') +
                simTest +
                b('nepoTest_run')
        ) +
        cat(
            'NEPOTEST_CHECKS',
            b('nepoTest_check_reaches', f('AREA', ANY_ITEM)) +
                b('nepoTest_check_never_touches', f('AREA', ANY_ITEM)) +
                b('nepoTest_check_ends_in') +
                b('nepoTest_check_never_bumps', f('OBSTACLE', ANY_ITEM)) +
                b(PATH_CHECK)
        ) +
        cat(
            'NEPOTEST_GIVEN',
            b('nepoTest_given_clap') +
                b('nepoTest_given_key') +
                b('nepoTest_given_obstacle') +
                b('nepoTest_given_light') +
                b('nepoTest_given_line') +
                b('nepoTest_given_remote') +
                b('nepoTest_given_ir') +
                b('nepoTest_given_variable', '<value name="VALUE">' + num(0) + '</value>')
        ) +
        cat('NEPOTEST_WHEN', b('nepoTest_when_run') + b('nepoTest_when_call')) +
        cat(
            'NEPOTEST_THEN',
            b('nepoTest_expect_result', '<value name="VALUE">' + num(0) + '</value>') +
                b('nepoTest_expect_variable', '<value name="VALUE">' + num(0) + '</value>') +
                b('nepoTest_expect_status') +
                b('nepoTest_expect_action', '<value name="ACTION">' + b('nepoTest_action_led') + '</value>') +
                b('nepoTest_expect_no_action', '<value name="ACTION">' + b('nepoTest_action_drive') + '</value>') +
                b('nepoTest_expect_count', '<value name="ACTION">' + b('nepoTest_action_led') + '</value>') +
                b('nepoTest_expect_called') +
                b('nepoTest_expect_error') +
                b('nepoTest_expect_state_end', v('STATE', motor)) +
                b('nepoTest_expect_state_at', v('STATE', still)) +
                b('nepoTest_expect_state_during', v('STATE', ledOn)) +
                b('nepoTest_expect_state_after', f('EVENT', 'obstacle_start') + v('STATE', still)) +
                b('nepoTest_expect_state_while', v('COND', b('nepoTest_cond_obstacle', f('PORT', 'FRONT'))) + v('STATE', still)) +
                b('nepoTest_expect_state_for', v('STATE', ledOn)) +
                b('nepoTest_expect_state_count', v('STATE', ledOn)) +
                b('nepoTest_expect_distance') +
                b('nepoTest_expect_turned') +
                b('nepoTest_expect_position') +
                b('nepoTest_expect_finish_within')
        ) +
        cat(
            'NEPOTEST_ACTIONS',
            b('nepoTest_action_led') +
                b('nepoTest_action_drive', '<value name="POWER">' + num(50) + '</value>') +
                b('nepoTest_action_turn') +
                b('nepoTest_action_curve') +
                b('nepoTest_action_motor') +
                b('nepoTest_action_stop') +
                b('nepoTest_action_tone') +
                b('nepoTest_action_sound_file') +
                b('nepoTest_action_ir_send') +
                b('nepoTest_action_wait')
        ) +
        cat(
            'NEPOTEST_STATES',
            motor +
                b('nepoTest_state_robot', f('MOVE', 'forward')) +
                ledOn +
                b('nepoTest_state_sound', f('SOUND', 'tone')) +
                b('nepoTest_state_variable', v('VALUE', num(0))) +
                b('nepoTest_state_logic') +
                b('nepoTest_state_not') +
                b('nepoTest_cond_obstacle', f('PORT', 'FRONT')) +
                b('nepoTest_cond_line') +
                b('nepoTest_cond_light', f('OP', 'GT'))
        ) +
        cat('NEPOTEST_VALUES', num(0) + b('logic_boolean') + b('robLists_create_with', '<mutation items="3"></mutation>')) +
        '</toolbox_set>'
    );
}

/** the content of a new, empty test suite: the start block */
export function emptySuite(robotGroup: string): string {
    return (
        '<block_set xmlns="http://de.fhg.iais.roberta.blockly" robottype="' +
        robotGroup +
        '" xmlversion="3.1" description="" tags=""><instance x="40" y="40"><block type="nepoTest_suite" id="nepoTestSuite" deletable="false"></block></instance></block_set>'
    );
}
