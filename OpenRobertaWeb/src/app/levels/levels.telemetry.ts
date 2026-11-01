/**
 * The study's telemetry (the levels of the Program tab's simulator, Edison): what the learner does with the levels is sent to the server, which
 * appends it to a file per participant (REST /levels/telemetry: levels.telemetry.dir in .env, user-<id>-<account>.jsonl). Nothing is shown.
 *
 * - level_opened: a level becomes the one played (chosen, unlocked and chosen, or the program with the progress was opened); set_selected
 * - attempt_started: a run of the program on the level, with the program that runs: NEPO (with its tests) and EdPy
 * - attempt_ended: how (win, win_soft, fail_area, fail_hit, time_limit, program_ended, stopped, restarted, switched) and when (the simulator's
 *   time), the active time on the level so far, the tests
 * - level_beaten: the attempts, the active time, the time since the level was first opened, the tests added since then, the test runs
 * - test_run: a run of tests (the Test runner, or the Simulation panel of the Tests tab) while a level is played
 * Per level, in the progress (saved with the program, levels.player): the active time (the level the current one and the page visible), when
 * it was first opened and the tests there were then, the test runs. Each event has an id (the page's and a number: a resent one can be told),
 * the client's time, the program's name, the robot and the account; the server adds its time, the user and the session.
 * The events wait in a queue: sent every few seconds, and when the page is hidden or left (navigator.sendBeacon).
 */
import * as GUISTATE_C from 'guiState.controller';
import * as COMM from 'comm';
import * as LOG from 'log';
import * as PROGRAM from 'program.model';
import * as PLAYER from 'levels.player';
import * as SUITE from 'nepoTest.suite';
import * as TESTS_C from 'tests.controller';
// @ts-ignore (Blockly has no type declarations)
import * as Blockly from 'blockly';

const URL = '/levels/telemetry';
const GROUP = 'edison';
const FLUSH_MS = 5000;
const TICK_MS = 1000;
const MAX_TICK_MS = 5000; // a longer gap (the computer slept) counts this much
const EDPY_WAIT_MS = 15000; // an attempt's event is sent without EdPy if the Lab doesn't answer
const STUCK_MS = 30000; // a send without an answer: its events are sent again

const page = Date.now().toString(36) + Math.random().toString(36).substring(2, 8); // this page's id
let counter = 0;
let queue: any[] = [];
let sending: any[] = null;
let sendingSince = 0;
let lastTick = Date.now();

export function init(): void {
    PLAYER.onEvent(levelEvent);
    TESTS_C.onRunFinished(testRun);
    setInterval(tick, TICK_MS);
    setInterval(flush, FLUSH_MS);
    window.addEventListener('pagehide', flushNow);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushNow());
}

// ------------------------------------------------------------------------------------------------ what happens

/** the active time: the level played the current one, the page visible */
function tick(): void {
    const now = Date.now();
    const dt = Math.min(now - lastTick, MAX_TICK_MS);
    lastTick = now;
    const level = PLAYER.currentLevel();
    if (level && document.visibilityState === 'visible' && GUISTATE_C.getRobotGroup() === GROUP) {
        const stats = PLAYER.levelStats(level.id);
        stats.activeMs = (stats.activeMs || 0) + dt;
    }
}

function testIds(): string[] {
    return TESTS_C.testInventory().map((t) => t.id);
}

/** the tests now that weren't there when the level was first opened */
function testsAdded(level: string): { id: string; name: string }[] {
    const before = PLAYER.levelStats(level).testsAtStart || [];
    return TESTS_C.testInventory().filter((t) => before.indexOf(t.id) < 0);
}

function levelEvent(kind: string, data: any): void {
    if (kind === 'level_opened') {
        const stats = PLAYER.levelStats(data.level);
        if (!stats.firstOpened) {
            stats.firstOpened = Date.now();
            stats.testsAtStart = testIds();
        }
        send({ kind: kind, level: data.level, set: data.set, index: data.index, attempts: stats.attempts, activeMs: stats.activeMs || 0 });
    } else if (kind === 'set_selected') {
        send({ kind: kind, set: data.set });
    } else if (kind === 'attempt_started') {
        attemptStarted(data);
    } else if (kind === 'attempt_ended') {
        const stats = PLAYER.levelStats(data.level);
        const added = testsAdded(data.level);
        send({
            kind: kind,
            level: data.level,
            set: data.set,
            attempt: data.attempt,
            outcome: data.outcome,
            simTime: Math.round(data.t * 1000) / 1000,
            item: data.item,
            activeMs: stats.activeMs || 0,
            tests: TESTS_C.testInventory().length,
            testsAdded: added.length,
        });
        if (data.outcome === 'win' || data.outcome === 'win_soft') {
            send({
                kind: 'level_beaten',
                level: data.level,
                set: data.set,
                attempts: stats.attempts,
                winningAttempt: data.attempt,
                activeMs: stats.activeMs || 0,
                wallMs: stats.firstOpened ? Date.now() - stats.firstOpened : null,
                testsAtStart: (stats.testsAtStart || []).length,
                tests: TESTS_C.testInventory().length,
                testsAdded: added,
                testRuns: stats.testRuns || 0,
            });
        }
    }
}

/** an attempt: the program that runs, in NEPO (with its tests) and in EdPy (the Lab generates it) */
function attemptStarted(data: any): void {
    const workspace = GUISTATE_C.getBlocklyWorkspace();
    const program = Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(workspace));
    const event: any = {
        kind: 'attempt_started',
        level: data.level,
        set: data.set,
        attempt: data.attempt,
        tests: TESTS_C.testInventory().length,
        nepo: SUITE.merge(program),
        edpy: null,
    };
    let sent = false;
    const done = function (edpy: string, error: string) {
        if (!sent) {
            sent = true;
            event.edpy = edpy;
            error && (event.edpyError = error);
            send(event);
        }
    };
    setTimeout(() => done(null, 'no answer'), EDPY_WAIT_MS);
    const isNamedConfig = !GUISTATE_C.isConfigurationStandard() && !GUISTATE_C.isConfigurationAnonymous();
    const configName = isNamedConfig ? GUISTATE_C.getConfigurationName() : undefined;
    const configXml = GUISTATE_C.isConfigurationAnonymous() ? GUISTATE_C.getConfigurationXML() : undefined;
    PROGRAM.showSourceProgram(GUISTATE_C.getProgramName(), configName, program, configXml, '', '', GUISTATE_C.getLanguage(), function (result: any) {
        done(result.rc === 'ok' ? result.sourceCode : null, result.rc === 'ok' ? null : result.message || result.rc);
    });
}

function testRun(run: any): void {
    const level = PLAYER.currentLevel();
    if (!level || GUISTATE_C.getRobotGroup() !== GROUP) {
        return;
    }
    const stats = PLAYER.levelStats(level.id);
    stats.testRuns = (stats.testRuns || 0) + 1;
    send({ kind: 'test_run', level: level.id, set: level.set, from: run.from, passed: run.passed, failed: run.failed, error: run.error, skipped: run.skipped, tests: TESTS_C.testInventory().length });
}

// ------------------------------------------------------------------------------------------------ sending

/** an event to send: with its id, the client's time, the program, the robot and the account */
function send(event: any): void {
    event.id = page + '-' + ++counter;
    event.time = new Date().toISOString();
    event.program = GUISTATE_C.getProgramName();
    event.robot = GUISTATE_C.getRobot();
    event.clientAccount = GUISTATE_C.isUserLoggedIn() ? GUISTATE_C.getUserAccountName() : null;
    queue.push(event);
    event.kind === 'attempt_started' && flush(); // it is big: not left for the page's end
}

function flush(): void {
    const now = Date.now();
    if (sending && now - sendingSince < STUCK_MS) {
        return;
    }
    if (sending) {
        queue = sending.concat(queue); // no answer: again (the events' ids tell a twice sent one)
        sending = null;
    }
    if (!queue.length) {
        return;
    }
    sending = queue;
    queue = [];
    sendingSince = now;
    const events = sending;
    COMM.json(
        URL,
        { events: events },
        function (result: any) {
            if (sending === events) {
                sending = null;
                result.rc !== 'ok' && (queue = events.concat(queue));
            }
        },
        'level telemetry'
    );
}

/** the page is hidden or left: the queue goes now, in a way that survives the page */
function flushNow(): void {
    const events = (sending || []).concat(queue);
    if (!events.length || !navigator.sendBeacon) {
        return;
    }
    const body = JSON.stringify({ log: LOG.reportToComm(), data: { events: events }, initToken: COMM.getInitToken() });
    if (navigator.sendBeacon('/rest' + URL, new Blob([body], { type: 'application/json' }))) {
        queue = [];
        sending = null;
    }
}
