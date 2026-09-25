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
        TOOLBOX_NEPOTEST_TESTS: 'Tests',
        TOOLBOX_NEPOTEST_GIVEN: 'Given',
        TOOLBOX_NEPOTEST_WHEN: 'When',
        TOOLBOX_NEPOTEST_THEN: 'Expect',
        TOOLBOX_NEPOTEST_ACTIONS: 'Actions',
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
        TOOLBOX_NEPOTEST_TESTS: 'Tests',
        TOOLBOX_NEPOTEST_GIVEN: 'Gegeben',
        TOOLBOX_NEPOTEST_WHEN: 'Wenn',
        TOOLBOX_NEPOTEST_THEN: 'Erwarte',
        TOOLBOX_NEPOTEST_ACTIONS: 'Aktionen',
        TOOLBOX_NEPOTEST_VALUES: 'Werte',
    },
};

/** puts the messages of `lang` (English for missing keys) into Blockly.Msg */
export function setLanguage(lang: string): void {
    const en = MESSAGES.en;
    const other = MESSAGES[lang] || {};
    for (const key of Object.keys(en)) {
        Blockly.Msg[key] = other[key] || en[key];
    }
}

function msg(key: string): string {
    return Blockly.Msg[key] || MESSAGES.en[key] || key;
}

const GIVEN = 'nepoTestGiven';
const WHEN = 'nepoTestWhen';
const THEN = 'nepoTestThen';
const RUN = 'nepoTestRun';
const ACTION = 'nepoTestAction';

function number(value: string | number): any {
    return new Blockly.FieldTextInput(String(value), Blockly.FieldTextInput.nonnegativeIntegerValidator);
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

/** menu generators must work without a block: Blockly calls them while the field is constructed */
function testNames(this: any): string[][] {
    const block = this && this.sourceBlock_;
    const names: string[] = block ? block.workspace.getTopBlocks(false).filter((b) => b.type === 'nepoTest_test').map((b) => b.getFieldValue('NAME')) : [];
    const current = this && this.getValue && this.getValue();
    if (current && names.indexOf(current) < 0) {
        names.push(current);
    }
    return names.length ? names.map((n) => [n, n]) : [['?', '']];
}

function functionNames(this: any): string[][] {
    const names = programInfo().functions.map((f) => f.name);
    const current = this && this.getValue && this.getValue();
    if (current && names.indexOf(current) < 0) {
        names.push(current);
    }
    return names.length ? names.map((n) => [n, n]) : [['?', '']];
}

function variableNames(this: any): string[][] {
    const names = programInfo().variables.slice();
    const current = this && this.getValue && this.getValue();
    if (current && names.indexOf(current) < 0) {
        names.push(current);
    }
    return names.length ? names.map((n) => [n, n]) : [['?', '']];
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
                b('nepoTest_expect_error')
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
