/**
 * The NEPO test blocks of the Tests tab (block types nepoTest_*). They are defined here at runtime (Blockly itself is built elsewhere) and translated
 * into NepoTest's JSON test format by NepoTest/nepotest/blocks.py, which documents every block's fields and inputs. Keep both in sync.
 *
 * A test suite: the red start block "nepoTest_suite" with "nepoTest_run" blocks below it; each runs one "nepoTest_test" (given / when / then).
 */
// @ts-ignore (Blockly has no type declarations)
import * as Blockly from 'blockly';

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
        NEPOTEST_TEST_TOOLTIP: 'A test: given what happens around the robot, when the program runs (or a function is called), then these expectations must hold.',
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
        NEPOTEST_TEST_TOOLTIP: 'Ein Test: gegeben, was um den Roboter passiert, wenn das Programm läuft (oder eine Funktion aufgerufen wird), dann müssen diese Erwartungen stimmen.',
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

function number(value: string | number): any {
    return new Blockly.FieldTextInput(String(value), Blockly.FieldTextInput.nonnegativeIntegerValidator);
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

/** the names of the test blocks of a workspace, in their order on the workspace */
export function testNamesOf(workspace: any): string[] {
    return workspace
        .getTopBlocks(true)
        .filter((b) => b.type === 'nepoTest_test')
        .map((b) => b.getFieldValue('NAME'));
}

function testNames(this: any): string[][] {
    const block = this && this.sourceBlock_;
    return nameOptions(this, block && block.workspace ? testNamesOf(block.workspace) : []);
}

function functionNames(this: any): string[][] {
    const names = programInfo().functions.map((f) => f.name);
    return nameOptions(this, names);
}

function variableNames(this: any): string[][] {
    return nameOptions(this, programInfo().variables.slice());
}

/** a test name that no other test block of the workspace has */
function uniqueTestName(this: any, name: string): string {
    const block = this.sourceBlock_;
    name = (name || '').trim() || msg('NEPOTEST_TEST');
    if (!block || !block.workspace) {
        return name;
    }
    const taken = block.workspace
        .getTopBlocks(false)
        .filter((b) => b.type === 'nepoTest_test' && b.id !== block.id)
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
    return (
        '<toolbox_set id="nepoTestToolbox" style="display: none">' +
        cat(
            'NEPOTEST_TESTS',
            b('nepoTest_test', '<statement name="WHEN">' + b('nepoTest_when_run') + '</statement><statement name="THEN">' + b('nepoTest_expect_status') + '</statement>') +
                b('nepoTest_run')
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
