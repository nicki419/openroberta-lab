/**
 * The AI test assistant beside the Program tab's simulator (Edison, while a level of the sets is played). When the learner runs a changed program, it
 * guesses what the program is meant to do (nepoTest.ai infer) and offers to write scenario tests for it; the learner can say in one sentence what the
 * program should do. Writing them is the testing strategy of docs/tests (nepoTest.aiStrategy): the program is analysed first (analyze: its decisions,
 * the paths that target their outcomes, the inputs of each path, the scenarios), then the tests are written from the analysis (generate). The review
 * list says where each test's expectation comes from (the learner's words, a guess from the blocks, safety) and which outcomes of the program's
 * decisions the tests plan to try. The tests the learner ticks first run on the simulator, for the program as it is (nepoTest.ai runTests); the runs
 * show which outcomes really happened. Those that pass are added; a test whose check had nothing to decide, or whose planned outcome never
 * happened, isn't checked and counts as not passed. For those that failed or weren't checked, the learner sees what went wrong and chooses: the
 * assistant tries to fix them (nepoTest.ai fix: the model gets how they ran, and may change only their inputs), or they are discarded. A fix may also
 * say that a test is right and the program is wrong, or that a test may expect more than the learner said: the learner then adds it anyway or
 * discards it. The fixed tests run again (at most FIXES fixes). Nothing is added until every failed test is decided; then the tests become blocks in
 * the Tests tab, in one undo step (tests.controller addAiTests), where they don't run by themselves. If the program changed between writing and
 * checking, the learner chooses: write them again, or check them anyway.
 * The model never gets the level: only the program, the learner's sentences and their tests.
 *
 * - The switch: "AI test assistant" in the Edit menu. It is kept per test subject by the server (POST /rest/ai/switch, beside the telemetry), so it
 *   holds after a reload and on another machine; without a logged-in account it holds for the open page only. An account never switched has the
 *   server's default (AI_TESTS_DEFAULT). Greyed out if the server has no API key.
 * - The panel: to the right of the scene while the AI is on and a level of the sets is played (not one tried from the Level designer).
 * - A run of a changed program starts a guess (its blocks and their values count; ids and positions don't, so moving a block doesn't); a run of an
 *   unchanged one changes nothing, and no call is made. The run never waits for the AI. While tests are written or reviewed, a run doesn't
 *   interrupt: its change is looked at with the next run.
 * - What it shows: idle, thinking (from Play), the offer, the guess alone (after "Not now": until the guess means something new and at least
 *   DECLINED_RUNS changed runs have passed), nothing new to test, writing, the review list (all ticked), checking (the ticked tests run), the
 *   results (what failed, and the questions: fix or discard; add anyway or discard), fixing, done, no new tests, discarded, no suggestions on this
 *   level, an error. An answer that comes after the AI was switched off, or after a newer run began, is dropped; so is a check that runs then.
 * - Its notes are saved with the program (nepoTest.suite): the learner's sentences word for word (sent with later calls), the guess declined
 *   and the changed runs since, the levels it doesn't ask on, the tests it added (so the telemetry can tell which were deleted).
 * The EdPy of a run is the one the telemetry asks for (levels.telemetry attemptSource): one request serves both.
 *
 * The study's telemetry (levels.telemetry record; every event also says whether the AI was on):
 * - ai_switched: on or off, and why (menu: the Edit menu; account: the account's switch after a login; default: an account never switched)
 * - ai_inferred: a guess (its call, the fingerprint, the answer, what was shown; stale: it came too late and was dropped)
 * - ai_offer_shown; ai_offer_answered: write, not_now, never_here or ignored (the offer was replaced: why), the sentence word for word (also
 *   one typed but not sent), the guess answered, the time to answer
 * - ai_analyzed: the analysis (the program's decisions, the answer), its repairs and what was still wrong, the calls, the time, the tokens
 * - ai_tests_generated: the tests offered (JSON), the coverage plan, the repairs, what was left out and why, the duplicates, the calls, the time, the
 *   tokens
 * - ai_tests_checked: a run of the chosen (or fixed) tests on the program: each test's outcome, its failed checks and why, why it wasn't checked, the
 *   outcomes of the program's decisions its run took; the coverage of all of them
 * - ai_failed_answered: the learner's choice for the failed tests (fix or discard), or for those the assistant thinks right (add or discard)
 * - ai_tests_fixed: a fix: the tests fixed (JSON), those it left as they are (the program is wrong; they may expect too much) and why, the repairs,
 *   the calls, the tokens
 * - ai_stale: the program changed between writing and checking the tests, and what the learner chose
 * - ai_tests_added: the tests added (ticked; whether each passed, how often it was fixed), those unticked, the failed ones not added, their worlds;
 *   discarded: none added
 * - ai_ask_again: "Suggest tests again" on a level
 */
import * as GUISTATE_C from 'guiState.controller';
import * as COMM from 'comm';
import * as $ from 'jquery';
import * as AI from 'nepoTest.ai';
import * as FORMAT from 'nepoTest.aiFormat';
import * as STRATEGY from 'nepoTest.aiStrategy';
import * as PLAYER from 'levels.player';
import * as TELEMETRY from 'levels.telemetry';
import * as SUITE from 'nepoTest.suite';
import * as TESTS_C from 'tests.controller';
import * as VERDICT from 'nepoTest.simVerdict';

const GROUP = 'edison';
const TICK_MS = 1000;
const DECLINED_RUNS = 3; // after "Not now": changed runs before it offers again
const MAX_SENTENCE = 200;
const MAX_SAID = 50; // sentences kept in the notes (the server sends the last 5)
const FIXES = 2; // how often the assistant tries to fix the tests of a batch

type State =
    | 'idle'
    | 'thinking'
    | 'offer'
    | 'guess'
    | 'nothing'
    | 'writing'
    | 'review'
    | 'checking'
    | 'results'
    | 'fixing'
    | 'done'
    | 'empty'
    | 'discarded'
    | 'quiet'
    | 'stale'
    | 'error';

/** what the learner told the assistant about the program: saved with it */
export interface Notes {
    version: number;
    said: { text: string; time: string; level: string; answer: string }[]; // word for word; answer: write | not_now
    declined: { intent: string; runs: number } | null; // the guess declined ("Not now") and the changed runs since
    quiet: string[]; // the levels it doesn't ask on ("Don't ask on this level")
    added: string[]; // the ids of the test blocks it added
}

interface View {
    state: State;
    since?: number; // thinking, writing, fixing: since when (ms)
    phase?: string; // writing: analysing | writing
    intent?: string;
    for?: string; // writing: the sentence, or the guess
    progress?: { index: number; count: number; name: string }; // checking: the test that runs
    count?: number; // fixing: how many tests
    added?: { tests: number; worlds: FORMAT.Resolved[]; failing: number; unchecked: number; notAdded: number };
    error?: string;
    message?: string;
    retry?: () => void;
    other?: { label: string; action: () => void }; // error: another way on
}

/**
 * a test the learner chose, or one the assistant fixed: where it is, how it ran, what becomes of it. passed: it is added; failed: to be decided;
 * notChecked: its checks passed, but one had nothing to decide or a planned outcome never happened (why), to be decided as a failed one;
 * fix: to be fixed; flagged: the assistant thinks it is right and the program wrong, or that it may expect too much (flag, reason), to be decided;
 * kept: failed, added anyway;
 * unchecked: added without a run (the runs failed); discarded; leftOut: the fix left it out (reason: why); gaveUp: it still failed after the last
 * fix (not added)
 */
interface Candidate {
    world: FORMAT.Resolved; // its world (its tests don't count): one of the answer's, or the learner's (existing)
    test: FORMAT.AiTest;
    call: string; // the call that wrote it (generate or fix)
    fixes: number; // how often it was fixed
    ran: AI.Ran; // its last run
    state: 'passed' | 'failed' | 'notChecked' | 'fix' | 'flagged' | 'kept' | 'unchecked' | 'discarded' | 'leftOut' | 'gaveUp';
    reason?: string; // flagged: why the assistant thinks the program is wrong (or the test expects too much); leftOut: why the fix left it out
    flag?: string; // flagged: program_wrong | doubtful
    why?: { text: string; block: string }[]; // notChecked: what had nothing to decide, or didn't happen
    seen?: { [outcome: string]: number }; // how often its last run took each outcome of the program's decisions
}

/** the tests the learner chose from the review list, until they are added */
interface Batch {
    call: string; // the generate call
    prefix: string; // of the blocks added
    intent: string;
    sentence: string;
    before: string[]; // the learner's sentences before (said)
    worlds: FORMAT.Resolved[]; // the worlds of the answer
    candidates: Candidate[];
    fixes: number; // the fixes made
    leftOut: number; // tests a fix left out (it couldn't fix them, or they had problems)
    unticked: { name: string; world: string }[];
    strategy: AI.Strategy; // the program's decisions and the analysis the tests were written from
    plan: STRATEGY.Plan; // the coverage plan of the answer
    stale: boolean; // the program changed between writing and checking, and the learner checked them anyway
}

let on = false;
let available = false;
let account: string = undefined; // whose switch it is (null: nobody is logged in)
let switchedByHand = false; // switched while nobody was logged in: kept for an account that logs in and was never switched
let lastFingerprint: string = null; // the program of the last changed run looked at
let token = 0; // an answer counts only while this is unchanged
let view: View = { state: 'idle' };
let request: AI.Request = null; // the last guess's
let guess: any = null; // its answer {intent, confidence, ask, same_as_declined, not_covered}
let generated: AI.Generated = null;
let ticked: boolean[][] = [];
let writing: { intent: string; sentence: string; before: string[]; strategy: AI.Strategy } = null; // what the tests of the review list were written for, and from
let index: STRATEGY.Index = null; // the decisions of the program of the last guess (its blocks' short ids: the model's)
let runProgram: string = null; // the program of the last guess, as the Program tab had it (its blocks' own ids)
let batch: Batch = null;
let notes: Notes = newNotes();
let guessCall: any = null; // the meta of the guess's call
let offer: { intent: string; call: string; shownAt: number } = null; // the offer shown and not answered yet
const ui: { [name: string]: any } = {};

const TEXT: { [key: string]: string } = {
    menu: 'AI test assistant',
    menuUnavailable: 'The Lab server has no API key for the AI.',
    head: 'Test assistant',
    idle: "Run your program, and I'll suggest tests for it.",
    thinkingHead: 'Thinking',
    thinking: 'Looking at what your program does …',
    since: 'Since you pressed Play, {0} s ago. It goes on after the run ends; the answer usually takes a few seconds.',
    offerHead: 'Test suggestion',
    looksLike: 'It looks like your program should:',
    question: 'Should I write tests that check this?',
    sentenceLabel: 'In your own words: what should your program do? (optional)',
    sentencePlaceholder: 'This program should follow a black line and stop if it senses an obstacle',
    write: 'Write tests',
    notNow: 'Not now',
    quietLink: "Don't ask on this level",
    guessHead: 'Your program',
    guessNote: "I'll suggest tests again when your program does something new.",
    nothingHead: 'Nothing new to test',
    nothing: "Your tests already check this. I'll look again after your next change.",
    writingHead: 'Writing tests',
    writingFor: 'For: ',
    writingNote: 'Usually 30 s to 2 minutes. You can keep working meanwhile.',
    fixingNote: 'Usually 10 to 20 s. You can keep working meanwhile.',
    analysing: 'First I look at the decisions in your program, then I write the tests.',
    writingTests: 'Now I write the tests.',
    insufficientHead: 'Nothing to test yet',
    insufficient: "Your program doesn't do enough to test yet.",
    basis_learner_description: 'Based on your description',
    basis_inferred_from_program: 'Suggested from your blocks',
    basis_applicable_safety: 'A safety guess',
    assumes: 'It assumes',
    plans: 'Plans to try {0} of {1} outcomes of the decisions in your program.',
    plansNone: 'Your program makes no decisions: the tests try its one way through.',
    notPlanned: 'Not tried',
    seen: 'Seen in the runs: {0} of {1} outcomes of the decisions in your program.',
    notSeen: 'Not seen',
    ranNotChecked: "not checked: it passed, but that doesn't show much",
    staleHead: 'Your program changed',
    stale: 'You changed your program after these tests were written. They may not fit it any more.',
    writeAgain: 'Write them again',
    checkAnyway: 'Check them anyway',
    scenarios: '{0} scenarios',
    scenario: '1 scenario',
    untick: "Untick any you don't want. The others run on your program before they are added.",
    newWorld: 'In a new world: “{0}”',
    yourWorld: 'In your world “{0}”',
    leftOut: '{0} more were left out: they had problems, or you have them already.',
    add: 'Add {0} tests',
    addOne: 'Add 1 test',
    discard: 'Discard',
    doneHead: 'Done',
    done: '{0} added to the Tests tab, {1}. {2}',
    passedOne: 'It passed on your program.',
    passedMany: 'They passed on your program.',
    failingOne: '1 of them fails on your program: you added it anyway.',
    failingMany: '{0} of them fail on your program: you added them anyway.',
    uncheckedOne: "It couldn't run on your program first.",
    uncheckedMany: "They couldn't run on your program first.",
    notAddedOne: "1 more failed, and wasn't added.",
    notAddedMany: "{0} more failed, and weren't added.",
    oneTest: '1 test',
    tests: '{0} tests',
    inNewWorld: 'in a new world: {0}',
    inNewWorlds: 'in {0} new worlds: {1}',
    inYourWorld: 'in your world {0}',
    inWorlds: 'in the worlds {0}',
    and: ' and ',
    doneNote: 'The assistant stays like this until the next changed run.',
    openTests: 'Open Tests tab',
    checkingHead: 'Checking the tests',
    checking: 'Test {0} of {1} runs on your program: “{2}”',
    checkingNote: 'Each test runs in its own world on the simulator.',
    resultsHead: 'Test results',
    resultsSummary: '{0} of {1} passed on your program.',
    ranPassed: 'passed',
    ranPassedFixed: 'passed after a fix',
    ranFailed: 'failed',
    ranKept: 'fails: added anyway',
    ranDiscarded: 'discarded',
    ranGaveUp: "still failed after {0} fixes: it won't be added",
    ranFix: 'failed: to be fixed',
    ranSame: 'left out: fixed, it checks the same as “{0}”',
    ranBroken: 'left out: its fix had problems',
    ranNotFixed: "left out: I couldn't fix it",
    flagged: 'I think this test is right, and your program is wrong:',
    doubtful: 'This test may expect more than you said:',
    askFix: "Should I try to fix the tests that failed or weren't checked, or discard them?",
    askFixOne: 'Should I try to fix the test, or discard it?',
    askFixNote: 'The tests that passed are added either way.',
    fixThem: 'Fix them',
    fixIt: 'Fix it',
    discardThem: 'Discard them',
    discardIt: 'Discard it',
    fixChosen: "I'll fix them once you've decided about the others.",
    askFlagged: "Add them anyway? A test that fails shows what your program doesn't do yet, or what you didn't ask for.",
    askFlaggedOne: "Add it anyway? A test that fails shows what your program doesn't do yet, or what you didn't ask for.",
    addAnyway: 'Add anyway',
    goOnAdd: 'Add the others',
    goOnNone: 'OK',
    fixingHead: 'Fixing tests',
    fixing: 'Fixing {0} tests: I look at how they ran on your program.',
    fixingOne: 'Fixing 1 test: I look at how it ran on your program.',
    noneAdded: 'None of the tests passed on your program, so none were added.',
    runFailed: "The tests couldn't run on your program ({0}).",
    addUnchecked: 'Add them without running',
    emptyHead: 'No new tests',
    empty: 'The tests I wrote were already there or had problems, so none were added.',
    discardedHead: 'No tests added',
    again: "I'll look again after your next change.",
    quietHead: 'No suggestions here',
    quiet: "I won't suggest tests on this level.",
    quietUndo: 'Suggest tests again',
    errorHead: 'Something went wrong',
    noAnswerInfer: "The assistant didn't answer.",
    noAnswerGenerate: "The test writer didn't answer.",
    badAnalysis: "I couldn't make sense of your program's decisions.",
    limit: "That's a lot of suggestions for one hour. Try again later.",
    busy: 'The assistant is still busy with an earlier request. Try again in a moment.',
    notConfigured: "The AI isn't set up on this Lab server.",
    unusable: "The answer couldn't be used ({0}).",
    tryAgain: 'Try again',
};

function text(key: string, ...args: any[]): string {
    let s = TEXT[key] !== undefined ? TEXT[key] : key;
    args.forEach((a, i) => (s = s.replace('{' + i + '}', String(a))));
    return s;
}

function html(tag: string, cls: string, parent: Element, content?: string): any {
    const e = document.createElement(tag);
    cls && (e.className = cls);
    content !== undefined && (e.textContent = content);
    parent && parent.appendChild(e);
    return e;
}

function newNotes(): Notes {
    return { version: 1, said: [], declined: null, quiet: [], added: [] };
}

/** an event for the study's telemetry */
function record(kind: string, data: any): void {
    TELEMETRY.record(Object.assign({ kind: kind }, data));
}

/** the fields of a call's meta the telemetry keeps */
function callOf(meta: any): any {
    return meta ? { callId: meta.callId, model: meta.model, promptVersion: meta.promptVersion, latencyMs: meta.latencyMs, attempts: meta.attempts, tokens: meta.tokens } : null;
}

// ------------------------------------------------------------------------------------------------ setup

export function init(): void {
    const server = GUISTATE_C.getServerAi();
    available = !!server.available;
    on = available && !!server.default;
    SUITE.setAiNotes(serializeNotes, loadNotes);
    TELEMETRY.setAi({ isOn: () => on, addedTests: () => notes.added.slice() });
    PLAYER.onEvent(levelEvent);
    build();
    $('#menuAiTests').on('click', function (e: Event) {
        e.preventDefault();
        !$(this).parent().hasClass('disabled') && switchTo(!on, 'menu');
    });
    setInterval(tick, TICK_MS);
    tick();
}

/** is the AI on (for the telemetry: every event says so) */
export function isOn(): boolean {
    return on;
}

/** the notes to save with the program (JSON), once there is something in them (else null: the program stays as it is) */
function serializeNotes(): string {
    return notes.said.length || notes.declined || notes.quiet.length || notes.added.length ? JSON.stringify(notes) : null;
}

/** the notes of a loaded program (null: none); the assistant starts anew with the program */
function loadNotes(json: string): void {
    let loaded = newNotes();
    try {
        const n = json ? JSON.parse(json) : null;
        if (n && typeof n === 'object') {
            loaded.said = Array.isArray(n.said) ? n.said.filter((s: any) => s && typeof s.text === 'string') : [];
            loaded.declined = n.declined && typeof n.declined.intent === 'string' ? { intent: n.declined.intent, runs: Number(n.declined.runs) || 0 } : null;
            loaded.quiet = Array.isArray(n.quiet) ? n.quiet.filter((q: any) => typeof q === 'string') : [];
            loaded.added = Array.isArray(n.added) ? n.added.filter((a: any) => typeof a === 'string') : [];
        }
    } catch (e) {
        console.warn("the AI test assistant's notes are not readable: it starts anew", e);
        loaded = newNotes();
    }
    closeOffer('program_loaded');
    notes = loaded;
    lastFingerprint = null;
    token++;
    show({ state: isQuiet() ? 'quiet' : 'idle' });
}

/** the notes changed: an unsaved change of the program (autosave saves it) */
function notesChanged(): void {
    GUISTATE_C.setProgramSaved(false);
}

/** the notes (a copy) */
export function getNotes(): Notes {
    return JSON.parse(JSON.stringify(notes));
}

// ------------------------------------------------------------------------------------------------ the switch

function accountNow(): string {
    return GUISTATE_C.isUserLoggedIn() ? GUISTATE_C.getUserAccountName() : null;
}

/** POST /rest/ai/switch: {on} switches it for the account, {} only asks; the answer {on: true, false or null (never switched), stored} */
function askServer(data: any): Promise<any> {
    return new Promise(function (resolve) {
        const request: any = COMM.json('/ai/switch', data, (result: any) => resolve(result.rc === 'ok' ? result.answer : null), 'AI switch');
        request && request.fail && request.fail(() => resolve(null));
    });
}

/** someone logged in or out: the switch of the account (one never switched: the page's, if it was switched by hand, else the default) */
function accountChanged(): void {
    if (!account) {
        return; // logged out: the page keeps its switch
    }
    const asked = account;
    askServer({}).then(function (answer) {
        if (!answer || asked !== account) {
            return;
        }
        if (answer.on === true || answer.on === false) {
            answer.on !== on && switchTo(answer.on, 'account');
        } else if (switchedByHand) {
            askServer({ on: on });
        } else {
            const byDefault = available && !!GUISTATE_C.getServerAi().default;
            byDefault !== on && switchTo(byDefault, 'default');
        }
    });
}

/** the AI on or off (cause: menu, the Edit menu's switch: kept for the account; account: the account's switch; default: never switched) */
function switchTo(value: boolean, cause: string): void {
    if (value && !available) {
        return;
    }
    !value && closeOffer('switched_off');
    on = value;
    token++; // an answer on its way is dropped
    if (on) {
        lastFingerprint = null; // the next run is looked at
        show({ state: isQuiet() ? 'quiet' : 'idle' });
    }
    if (cause === 'menu') {
        account ? askServer({ on: on }) : (switchedByHand = true);
    }
    record('ai_switched', { on: on, cause: cause, stored: cause === 'menu' ? !!account : cause === 'account' });
    renderMenu();
    renderVisibility();
}

function renderMenu(): void {
    const item = $('#menuAiTests').parent();
    item.toggleClass('hidden', GUISTATE_C.getRobotGroup() !== GROUP);
    item.toggleClass('disabled', !available);
    $('#menuAiTests').attr('title', available ? '' : text('menuUnavailable'));
    $('#menuAiTestsTick').text(on ? '✓' : '');
}

// ------------------------------------------------------------------------------------------------ the runs

/** the level played (one of the sets) */
function levelNow(): string {
    const level = PLAYER.currentLevel();
    return level ? level.id : null;
}

function isQuiet(): boolean {
    const level = levelNow();
    return !!level && notes.quiet.indexOf(level) >= 0;
}

function shown(): boolean {
    return on && GUISTATE_C.getRobotGroup() === GROUP && !!levelNow();
}

function busy(): boolean {
    return ['writing', 'review', 'checking', 'results', 'fixing'].indexOf(view.state) >= 0;
}

function levelEvent(kind: string, data: any): void {
    if (kind === 'attempt_started') {
        on && attemptStarted(data);
    } else if (kind === 'level_opened' && !busy()) {
        if (notes.quiet.indexOf(data.level) >= 0) {
            closeOffer('level_changed');
            token++;
            show({ state: 'quiet' });
        } else if (view.state === 'quiet') {
            show({ state: 'idle' });
        }
    }
}

/** a run on a level: a changed program is looked at, an unchanged one changes nothing */
function attemptStarted(data: any): void {
    const run = TELEMETRY.attemptSource(data.level, data.attempt);
    const print = fingerprint(run.program);
    if (print === lastFingerprint || busy()) {
        return;
    }
    lastFingerprint = print;
    closeOffer('new_run');
    if (notes.declined) {
        notes.declined.runs++;
        notesChanged();
    }
    if (notes.quiet.indexOf(data.level) >= 0) {
        show({ state: 'quiet' });
        return;
    }
    think(data.level, run, print);
}

/** the guess: thinking from Play until it is in */
async function think(level: string, run: { program: string; edpy: Promise<{ edpy: string; error: string }> }, print: string): Promise<void> {
    const mine = ++token;
    show({ state: 'thinking', since: Date.now() });
    const source = await run.edpy;
    if (mine !== token) {
        return;
    }
    index = STRATEGY.indexOf(run.program, TESTS_C.aiBlockLabel);
    runProgram = run.program;
    request = {
        levelId: level,
        program: { nepo: index.nepo, edpy: source.edpy || '' }, // its blocks with short ids (b1, …): the analysis and the tests name them
        tests: TESTS_C.aiTests(),
        said: notes.said.map((s) => s.text),
        fingerprint: print,
    };
    const declined = notes.declined ? notes.declined.intent : null;
    const result = await AI.infer(request, declined);
    const event: any = Object.assign({ level: level, fingerprint: print, edpyError: source.error || null, declined: declined, ok: result.ok, error: result.error }, callOf(result.meta));
    result.ok && Object.assign(event, result.answer);
    if (mine !== token || !on) {
        record('ai_inferred', Object.assign(event, { stale: true, shown: null }));
        return; // a newer run, or switched off meanwhile: dropped
    }
    if (!result.ok) {
        record('ai_inferred', Object.assign(event, { shown: 'error' }));
        show(errorView('infer', result, () => think(level, run, print)));
        return;
    }
    guess = result.answer;
    guessCall = result.meta;
    const held = !!notes.declined && (guess.same_as_declined || notes.declined.runs < DECLINED_RUNS);
    const state: State = held ? 'guess' : guess.ask ? 'offer' : 'nothing';
    record('ai_inferred', Object.assign(event, { shown: state, declinedRuns: notes.declined ? notes.declined.runs : null }));
    show({ state: state, intent: guess.intent });
}

/**
 * "Write tests": the tests for the guess (and the learner's sentence), checked and repaired; then the review list
 *
 * @param before the learner's sentences before this one
 */
async function write(intent: string, sentence: string, before: string[]): Promise<void> {
    const mine = ++token;
    show({ state: 'writing', since: Date.now(), for: sentence || intent, intent: intent, phase: 'analysing' });
    const data = Object.assign({}, request, { tests: TESTS_C.aiTests(), said: before });
    const decisions = index;
    let started = Date.now();
    const analyzed = await AI.analyze(data, intent, sentence, decisions);
    let stale = mine !== token || !on;
    recordAnalyzed(intent, sentence, analyzed, decisions, Date.now() - started, stale);
    if (stale) {
        return;
    }
    if (!analyzed.ok) {
        show(errorView('analyze', analyzed, () => write(intent, sentence, before)));
        return;
    }
    if (analyzed.insufficient) {
        const why = (analyzed.analysis.uncertainties || []).filter((u: any) => typeof u === 'string')[0];
        show({ state: 'empty', intent: intent, phase: 'insufficient', message: why || text('insufficient') });
        return;
    }
    show({ state: 'writing', since: view.since, for: sentence || intent, intent: intent, phase: 'writing' });
    const strategy: AI.Strategy = { index: decisions, analysis: analyzed.analysis };
    started = Date.now();
    const result = await AI.generate(data, intent, sentence, TESTS_C.aiContext(), runProgram, strategy);
    stale = mine !== token || !on;
    recordGenerated(intent, sentence, result, Date.now() - started, stale);
    if (stale) {
        return;
    }
    if (!result.ok) {
        show(errorView('generate', result, () => write(intent, sentence, before)));
        return;
    }
    generated = result;
    writing = { intent: intent, sentence: sentence, before: before, strategy: strategy };
    ticked = result.worlds.map((w) => w.tests.map(() => true));
    show({ state: result.worlds.some((w) => w.tests.length) ? 'review' : 'empty', intent: intent });
}

/** ai_analyzed: the program's decisions, the analysis, its repairs and what was still wrong, the calls */
function recordAnalyzed(intent: string, sentence: string, result: AI.Analyzed, decisions: STRATEGY.Index, ms: number, stale: boolean): void {
    record('ai_analyzed', {
        intent: intent,
        sentence: sentence || null,
        guessCall: guessCall ? guessCall.callId : null,
        ok: result.ok,
        error: result.error,
        message: result.message || null,
        stale: stale,
        decisions: STRATEGY.decisionsForLog(decisions),
        status: result.analysis ? result.analysis.analysis_status : null,
        analysis: result.analysis || result.answers[result.answers.length - 1] || null,
        problems: result.problems.map(AI.problemText),
        repairs: result.repairs,
        calls: result.calls.map(callOf),
        latencyMs: ms,
        tokens: tokensOf(result.calls),
    });
}

/** the coverage plan for the telemetry: per outcome, the tests that plan it, why not, how often the runs took it */
function planOfLog(plan: STRATEGY.Plan): any {
    return plan
        ? {
              outcomes: plan.outcomes.map((o) => ({ id: o.id, block: o.block, planned: o.planned, deferred: o.deferred, seen: o.seen })),
              target: plan.target,
              planned: plan.planned,
              deferred: plan.deferred,
              lost: plan.lost,
              deferredInputs: plan.deferredInputs,
              deferredScenarios: plan.deferredScenarios,
              corrected: plan.corrected,
          }
        : null;
}

/** ai_tests_generated: the tests offered, the coverage plan, the repairs, what was left out, the calls */
function recordGenerated(intent: string, sentence: string, result: AI.Generated, ms: number, stale: boolean): void {
    record('ai_tests_generated', {
        intent: intent,
        sentence: sentence || null,
        guessCall: guessCall ? guessCall.callId : null,
        ok: result.ok,
        error: result.error,
        message: result.message || null,
        stale: stale,
        count: result.worlds.reduce((n, w) => n + w.tests.length, 0),
        tests: { worlds: result.worlds.map((w) => (w.existing ? { name: w.name, base: 'existing', tests: w.tests } : { name: w.name, world: w.data.world, tests: w.tests })) },
        status: result.status,
        plan: planOfLog(result.plan),
        warnings: result.warnings,
        unresolved: result.unresolved.map(AI.problemText),
        repairs: result.repairs,
        leftOut: result.dropped.map(AI.problemText),
        duplicates: result.duplicates,
        calls: result.calls.map(callOf),
        latencyMs: ms,
        tokens: tokensOf(result.calls),
    });
}

/** the tokens of calls, summed */
function tokensOf(calls: any[]): any {
    const tokens: any = {};
    calls.forEach((m) => Object.keys((m && m.tokens) || {}).forEach((k) => (tokens[k] = (tokens[k] || 0) + (Number(m.tokens[k]) || 0))));
    return tokens;
}

/** the offer shown is answered (write, not_now, never_here) or, replaced by something else, ignored (reason: what replaced it) */
function closeOffer(answer: string, sentence?: string): void {
    if (!offer) {
        return;
    }
    const typed = ui.sentence ? String(ui.sentence.value).trim().substring(0, MAX_SENTENCE) : '';
    const ignored = ['write', 'not_now', 'never_here'].indexOf(answer) < 0;
    record('ai_offer_answered', {
        answer: ignored ? 'ignored' : answer,
        reason: ignored ? answer : null,
        sentence: (ignored ? typed : sentence) || null,
        intent: offer.intent,
        guessCall: offer.call,
        msToAnswer: Date.now() - offer.shownAt,
    });
    offer = null;
}

function errorView(kind: string, result: { error: string; message: string }, retry: () => void, other?: { label: string; action: () => void }): View {
    const e = result.error || '';
    const message =
        kind === 'check'
            ? text('runFailed', result.message)
            : e === 'invalid_analysis'
            ? text('badAnalysis')
            : e === 'timeout' || e === 'network' || e === 'unreachable' || e.indexOf('http_') === 0
            ? text(kind === 'infer' ? 'noAnswerInfer' : 'noAnswerGenerate')
            : e === 'limit'
            ? text('limit')
            : e === 'busy'
            ? text('busy')
            : e === 'not_configured'
            ? text('notConfigured')
            : text('unusable', e);
    return { state: 'error', error: e, message: message, retry: e === 'not_configured' ? null : retry, other: other };
}

/** the learner's sentence, if they wrote one: kept word for word */
function said(answer: string): string {
    const sentence = ui.sentence ? String(ui.sentence.value).trim().substring(0, MAX_SENTENCE) : '';
    if (sentence) {
        notes.said.push({ text: sentence, time: new Date().toISOString(), level: request ? request.levelId : levelNow(), answer: answer });
        notes.said.length > MAX_SAID && notes.said.splice(0, notes.said.length - MAX_SAID);
        notesChanged();
    }
    return sentence;
}

function writeTests(): void {
    const before = notes.said.map((s) => s.text);
    const sentence = said('write');
    closeOffer('write', sentence);
    if (notes.declined) {
        notes.declined = null;
        notesChanged();
    }
    write(guess.intent, sentence, before);
}

function notNow(): void {
    closeOffer('not_now', said('not_now'));
    notes.declined = { intent: guess.intent, runs: 0 };
    notesChanged();
    show({ state: 'guess', intent: guess.intent });
}

function dontAskHere(): void {
    closeOffer('never_here', said('never_here'));
    const level = levelNow();
    if (level && notes.quiet.indexOf(level) < 0) {
        notes.quiet.push(level);
        notesChanged();
    }
    token++;
    show({ state: 'quiet' });
}

function askHereAgain(): void {
    const level = levelNow();
    record('ai_ask_again', { level: level });
    notes.quiet = notes.quiet.filter((q) => q !== level);
    notesChanged();
    lastFingerprint = null; // the next run is looked at
    show({ state: 'idle' });
}

/** "Add n tests": the ticked ones run on the program first (checking); if the program changed since they were written, the learner chooses first */
function chooseTests(): void {
    if (fingerprint(TESTS_C.aiProgramXml()) !== request.fingerprint && view.state !== 'stale') {
        show({ state: 'stale' });
        return;
    }
    const meta = generated.calls[generated.calls.length - 1] || {};
    const chosen: Candidate[] = [];
    generated.worlds.forEach((w, i) =>
        w.tests.forEach((t, j) => ticked[i][j] && chosen.push({ world: w, test: t, call: meta.callId || null, fixes: 0, ran: null, state: 'failed' }))
    );
    batch = {
        call: meta.callId || null,
        prefix: AI.prefixOf(meta, generated.repairs),
        intent: writing.intent,
        sentence: writing.sentence,
        before: writing.before,
        worlds: generated.worlds,
        candidates: chosen,
        fixes: 0,
        leftOut: 0,
        unticked: unticked(),
        strategy: writing.strategy,
        plan: generated.plan,
        stale: view.state === 'stale',
    };
    check(chosen);
}

/** the program changed between writing and checking: write the tests again (for the program as it is now), or check them anyway */
function answerStale(answer: 'write_again' | 'check_anyway'): void {
    record('ai_stale', { call: (generated.calls[generated.calls.length - 1] || {}).callId || null, answer: answer });
    if (answer === 'check_anyway') {
        chooseTests();
        return;
    }
    const run = TELEMETRY.attemptSource(levelNow() || (request && request.levelId), 0);
    const print = fingerprint(run.program);
    run.edpy.then((source) => {
        index = STRATEGY.indexOf(run.program, TESTS_C.aiBlockLabel);
        runProgram = run.program;
        request = Object.assign({}, request, { program: { nepo: index.nepo, edpy: source.edpy || '' }, fingerprint: print });
        lastFingerprint = print;
        write(writing.intent, writing.sentence, writing.before);
    });
}

/** the tests in their worlds, as an answer has them (a world: the tests of the list that are in it) */
function worldsOf(list: Candidate[]): FORMAT.Resolved[] {
    const worlds: FORMAT.Resolved[] = [];
    const sources: FORMAT.Resolved[] = [];
    list.forEach((c) => {
        let i = sources.indexOf(c.world);
        if (i < 0) {
            i = sources.push(c.world) - 1;
            worlds.push({ name: c.world.name, existing: c.world.existing, data: c.world.data, tests: [] });
        }
        worlds[i].tests.push(c.test);
    });
    return worlds;
}

/** the tests run on the program, one after the other; then what is still to be decided, or they are added */
async function check(list: Candidate[]): Promise<void> {
    const mine = ++token;
    const started = Date.now();
    show({ state: 'checking', progress: { index: 0, count: list.length, name: list[0].test.name } });
    let runs: AI.Ran[];
    try {
        runs = await AI.runTests(worldsOf(list), TESTS_C.aiProgramXml(), {
            cancelled: () => mine !== token,
            onTest: (index, count, test) => {
                if (mine === token && view.state === 'checking') {
                    view.progress = { index: index, count: count, name: test.name };
                    render();
                }
            },
        });
    } catch (e) {
        if (mine !== token) {
            return; // switched off, or another program loaded
        }
        const message = String((e && e.message) || e);
        record('ai_tests_checked', { call: batch.call, fix: batch.fixes, ok: false, error: message, latencyMs: Date.now() - started, tests: [] });
        show(
            errorView('check', { error: 'run', message: message }, () => check(list), {
                label: text('addUnchecked'),
                action: () => {
                    list.forEach((c) => (c.state = 'unchecked'));
                    decide();
                },
            })
        );
        return;
    }
    if (mine !== token) {
        return;
    }
    const decisions = batch.strategy.index;
    runs.forEach((r) => {
        const c = list.filter((x) => x.test === r.test)[0];
        c.ran = r;
        c.seen = STRATEGY.seenIn(r.report, decisions);
        c.why = STRATEGY.notCheckedWhy(r.report, r.test, decisions);
        c.state = !AI.passed(r) ? 'failed' : c.why.length ? 'notChecked' : 'passed';
    });
    batch.plan = batch.plan && STRATEGY.withSeen(batch.plan, batch.candidates.filter((c) => c.seen).map((c) => c.seen));
    record('ai_tests_checked', {
        call: batch.call,
        fix: batch.fixes,
        ok: true,
        latencyMs: Date.now() - started,
        passed: list.filter((c) => c.state === 'passed').length,
        failed: list.filter((c) => c.state === 'failed').length,
        notChecked: list.filter((c) => c.state === 'notChecked').length,
        tests: list.map((c) => ({
            name: c.test.name,
            world: c.world.name,
            outcome: c.ran.report.outcome,
            state: c.state,
            fixes: c.fixes,
            failed: AI.failuresOf(c.ran).map((f) => f.text),
            why: AI.failuresOf(c.ran).map((f) => (f.why ? f.why.kind : null)),
            notChecked: c.why.map((w) => w.text),
            planned: c.test.planned_branch_ids || [],
            seen: c.seen,
        })),
        plan: planOfLog(batch.plan),
    });
    decide();
}

/**
 * what is still to be decided is shown (results; also the tests that still failed after the last fix, once); then the tests to fix are fixed, or
 * the tests are added
 */
function decide(): void {
    const gaveUp = batch.fixes >= FIXES ? batch.candidates.filter((c) => c.state === 'failed' || c.state === 'notChecked') : [];
    gaveUp.forEach((c) => (c.state = 'gaveUp'));
    if (gaveUp.length || batch.candidates.some((c) => c.state === 'failed' || c.state === 'notChecked' || c.state === 'flagged')) {
        show({ state: 'results' });
        return;
    }
    const toFix = batch.candidates.filter((c) => c.state === 'fix');
    toFix.length ? fix(toFix) : finish();
}

/** the learner's choice for the failed tests (fix, discard) or for those the assistant thinks right (add, discard) */
function answerFailed(group: 'failed' | 'flagged', answer: string): void {
    const tests = batch.candidates.filter((c) => c.state === group || (group === 'failed' && c.state === 'notChecked'));
    tests.forEach((c) => (c.state = answer === 'fix' ? 'fix' : answer === 'add' ? 'kept' : 'discarded'));
    record('ai_failed_answered', { call: batch.call, group: group, answer: answer, fix: batch.fixes, tests: tests.map((c) => ({ name: c.test.name, world: c.world.name })) });
    decide();
}

/** the worlds of the batch's answer (a fix may keep a test in one of them: base "existing") */
function batchWorlds(): FORMAT.Resolved[] {
    const worlds = batch.worlds.filter((w) => !w.existing);
    batch.candidates.forEach((c) => !c.world.existing && worlds.indexOf(c.world) < 0 && worlds.push(c.world));
    return worlds;
}

/** what a fix is checked against: the learner's tests, and the answer's worlds as existing worlds, with the tests kept in them */
function fixContext(kept: Candidate[]): FORMAT.Context {
    const ctx = TESTS_C.aiContext();
    const own = batchWorlds();
    ctx.existing.worlds.forEach((w) => kept.filter((c) => c.world.existing && c.world.name === w.name).forEach((c) => w.tests.push(c.test)));
    own.forEach((w) => ctx.existing.worlds.push({ name: w.name, world: w.data.world, tests: kept.filter((c) => c.world === w).map((c) => c.test) }));
    ctx.names = ctx.names.concat(
        own.map((w) => w.name),
        kept.map((c) => c.test.name)
    );
    return ctx;
}

/** the world of a fixed test: one of the answer's (base "existing" with its name), the learner's, or a new one */
function worldOfFix(w: FORMAT.Resolved): FORMAT.Resolved {
    const own = w.existing ? batchWorlds().filter((x) => x.name === w.name)[0] : null;
    return own || { name: w.name, existing: w.existing, data: w.data, tests: [] };
}

/** "Fix": the model gets how the tests ran, and fixes them or says the program is wrong; the fixed tests run again */
async function fix(toFix: Candidate[]): Promise<void> {
    const mine = ++token;
    show({ state: 'fixing', since: Date.now(), count: toFix.length });
    const strategy = batch.strategy;
    const kept = batch.candidates.filter((c) => c.state === 'passed' || c.state === 'kept' || c.state === 'unchecked');
    const data = Object.assign({}, request, { tests: TESTS_C.aiTests(), said: batch.before });
    const started = Date.now();
    const result = await AI.fix(
        data,
        batch.intent,
        batch.sentence,
        toFix.map((c) => c.ran),
        kept.map((c) => ({ test: c.test.name, world: c.world.name })),
        fixContext(kept),
        TESTS_C.aiProgramXml(),
        TESTS_C.aiBlockLabel,
        strategy
    );
    const stale = mine !== token || !on;
    recordFixed(result, Date.now() - started, stale, toFix);
    if (stale) {
        return;
    }
    if (!result.ok) {
        show(
            errorView('fix', result, () => fix(toFix), {
                label: toFix.length === 1 ? text('discardIt') : text('discardThem'),
                action: () => {
                    toFix.forEach((c) => (c.state = 'discarded'));
                    decide();
                },
            })
        );
        return;
    }
    batch.fixes++;
    const call = (result.calls[result.calls.length - 1] || {}).callId || null;
    const fixed: Candidate[] = [];
    result.worlds.forEach((w) =>
        w.tests.forEach((t) => {
            const from = toFix.filter((c) => c.test.name === t.name)[0]; // a fix keeps the name (nepoTest.ai checks it)
            const c: Candidate = { world: worldOfFix(w), test: t, call: call, fixes: (from ? from.fixes : 0) + 1, ran: null, state: 'failed' };
            fixed.push(c);
            from ? (batch.candidates[batch.candidates.indexOf(from)] = c) : batch.candidates.push(c); // in the place of the test it fixes
        })
    );
    toFix.forEach((c) => {
        const wrong = result.programWrong.filter((p) => p.test === c.test.name)[0];
        const doubtful = result.doubtful.filter((p) => p.test === c.test.name)[0];
        if (wrong || doubtful) {
            c.state = 'flagged';
            c.flag = wrong ? 'program_wrong' : 'doubtful';
            c.reason = (wrong || doubtful).reason;
        } else if (!fixed.some((f) => f.test.name === c.test.name)) {
            const same = result.duplicates.filter((d) => d.test === c.test.name)[0]; // fixed, it checks the same as another test
            const broken = result.dropped.some((p) => p.test === c.test.name);
            c.state = 'leftOut';
            c.reason = same ? text('ranSame', same.same) : broken ? text('ranBroken') : text('ranNotFixed');
            batch.leftOut++;
        }
    });
    fixed.length ? check(fixed) : decide();
}

/** ai_tests_fixed: the tests fixed, those left as they are (the program is wrong), the repairs, what was left out, the calls */
function recordFixed(result: AI.Generated, ms: number, stale: boolean, toFix: Candidate[]): void {
    record('ai_tests_fixed', {
        call: batch.call,
        fix: batch.fixes + 1,
        failed: toFix.map((c) => ({ name: c.test.name, world: c.world.name, state: c.ran && c.why && c.why.length ? 'not_checked' : 'failed' })),
        ok: result.ok,
        error: result.error,
        message: result.message || null,
        stale: stale,
        count: result.worlds.reduce((n, w) => n + w.tests.length, 0),
        tests: { worlds: result.worlds.map((w) => (w.existing ? { name: w.name, base: 'existing', tests: w.tests } : { name: w.name, world: w.data.world, tests: w.tests })) },
        programWrong: result.programWrong,
        doubtful: result.doubtful,
        repairs: result.repairs,
        leftOut: result.dropped.map(AI.problemText),
        duplicates: result.duplicates,
        calls: result.calls.map(callOf),
        latencyMs: ms,
        tokens: tokensOf(result.calls),
    });
}

/** every failed test is decided: the tests that passed, those kept anyway (and those added unchecked) become blocks in the Tests tab */
function finish(): void {
    const keep = batch.candidates.filter((c) => c.state === 'passed' || c.state === 'kept' || c.state === 'unchecked');
    const notAdded = batch.candidates.filter((c) => c.state === 'discarded' || c.state === 'leftOut' || c.state === 'gaveUp');
    if (!keep.length) {
        record('ai_tests_added', { call: batch.call, discarded: true, added: [], unticked: batch.unticked, failed: notAdded.map(failedOf), leftOut: batch.leftOut, fixes: batch.fixes, worlds: [] });
        batch = null;
        show({ state: 'discarded', message: text('noneAdded') });
        return;
    }
    const worlds = worldsOf(keep);
    const added = new Date().toISOString();
    const passedOf = (c: Candidate) => (c.state === 'unchecked' ? null : c.state === 'passed');
    const ids = TESTS_C.addAiTests(worlds, batch.prefix, (w, test) => {
        const c = keep.filter((x) => x.test === test)[0];
        const decisions = batch.strategy.index;
        const planned = (test.planned_branch_ids || []).filter((b) => decisions.outcome[b]).map((b) => ({ outcome: b, block: decisions.outcome[b].decision.block, words: decisions.outcome[b].outcome.outcome }));
        const notChecked = c.why && c.why.length ? c.why.map((w) => w.text) : undefined;
        return {
            call: c.call,
            scenario: test.scenario || '',
            generated: test,
            added: added,
            checked: { passed: passedOf(c), fixes: c.fixes, notChecked: notChecked },
            coverage: { planned: planned, seen: c.seen || {} },
            basis: test.oracle ? test.oracle.basis : undefined,
            stale: batch.stale || undefined,
        };
    });
    notes.added = notes.added.concat(ids);
    notesChanged();
    const names = TESTS_C.testInventory().filter((x) => ids.indexOf(x.id) >= 0);
    record('ai_tests_added', {
        call: batch.call,
        discarded: false,
        added: names.map((x) => {
            const c = keep.filter((k) => k.test.name === x.name)[0];
            return { id: x.id, name: x.name, passed: c ? passedOf(c) : null, fixes: c ? c.fixes : 0, basis: c && c.test.oracle ? c.test.oracle.basis : null };
        }),
        unticked: batch.unticked,
        failed: notAdded.map(failedOf),
        leftOut: batch.leftOut,
        fixes: batch.fixes,
        worlds: worlds.map((w) => ({ name: w.name, existing: w.existing, tests: w.tests.map((x) => x.name) })),
        stale: batch.stale,
        plan: planOfLog(batch.plan),
    });
    const counts = {
        tests: ids.length,
        worlds: worlds,
        failing: keep.filter((c) => c.state === 'kept').length,
        unchecked: keep.filter((c) => c.state === 'unchecked').length,
        notAdded: notAdded.length,
    };
    batch = null;
    show({ state: 'done', added: counts });
}

/** a failed test that wasn't added: discarded by the learner, left out by a fix, or still failing after the last fix */
function failedOf(c: Candidate): any {
    return {
        name: c.test.name,
        world: c.world.name,
        fixes: c.fixes,
        how: c.state === 'gaveUp' ? 'gave_up' : c.state === 'leftOut' ? 'left_out' : 'discarded',
        reason: c.reason || null,
        notChecked: c.why && c.why.length ? c.why.map((w) => w.text) : null,
    };
}

/** the tests of the review list the learner unticked: their names and worlds */
function unticked(all?: boolean): { name: string; world: string }[] {
    const out: { name: string; world: string }[] = [];
    generated.worlds.forEach((w, i) => w.tests.forEach((x, j) => (all || !ticked[i][j]) && out.push({ name: x.name, world: w.name })));
    return out;
}

function discard(): void {
    const meta = generated.calls[generated.calls.length - 1] || {};
    record('ai_tests_added', { call: meta.callId || null, discarded: true, added: [], unticked: unticked(true), worlds: [] });
    show({ state: 'discarded' });
}

function openTests(): void {
    $('#tabTests').tabWrapShow();
}

/**
 * the program's blocks and their values: its XML without ids and positions, and without the program's description and tags; the top blocks in an
 * order of their own (Blockly orders them by position). Moving a block doesn't change it.
 */
export function fingerprint(programXml: string): string {
    const doc = new DOMParser().parseFromString(programXml || '', 'text/xml');
    const root = doc.documentElement;
    if (!root) {
        return hash(programXml || '');
    }
    const strip = function (e: Element) {
        ['id', 'x', 'y'].forEach((a) => e.removeAttribute(a));
        Array.prototype.forEach.call(e.children, strip);
    };
    strip(root);
    root.removeAttribute('description');
    root.removeAttribute('tags');
    const serializer = new XMLSerializer();
    const tops: string[] = Array.prototype.map.call(root.children, (c: Element) => serializer.serializeToString(c));
    while (root.firstChild) {
        root.removeChild(root.firstChild);
    }
    return hash(serializer.serializeToString(root) + tops.sort().join(''));
}

/** a 53-bit hash (cyrb53), as 14 hex digits */
function hash(s: string): string {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 2654435761);
        h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

// ------------------------------------------------------------------------------------------------ the panel

function tick(): void {
    const now = accountNow();
    if (now !== account) {
        account = now;
        accountChanged();
    }
    renderMenu();
    renderVisibility();
    if (ui.since && view.since && view.state === 'thinking') {
        ui.since.textContent = text('since', Math.round((Date.now() - view.since) / 1000));
    }
}

function build(): void {
    const simDiv = document.getElementById('simDiv');
    ui.panel = html('div', 'levelSidePanel', simDiv);
    ui.panel.id = 'aiAssistant';
    ui.panel.setAttribute('aria-live', 'polite');
    const head = html('div', 'aiHead', ui.panel);
    html('span', 'aiDot', head).setAttribute('aria-hidden', 'true');
    html('span', '', head, text('head'));
    ui.body = html('div', 'aiBody', ui.panel);
    render();
}

/** the panel is there while the AI is on and a level of the sets is played; the scene makes room for it */
function renderVisibility(): void {
    const simDiv = $('#simDiv');
    const visible = shown();
    if (simDiv.hasClass('nepoAi') !== visible) {
        simDiv.toggleClass('nepoAi', visible);
        PLAYER.sidePanelChanged();
    }
}

function show(next: View): void {
    next.state !== 'offer' && closeOffer(next.state); // replaced: ignored
    view = next;
    render();
    if (next.state === 'offer') {
        offer = { intent: next.intent, call: guessCall ? guessCall.callId : null, shownAt: Date.now() };
        record('ai_offer_shown', { intent: next.intent, guessCall: offer.call });
    }
}

function render(): void {
    if (!ui.body) {
        return;
    }
    const body = ui.body;
    body.innerHTML = '';
    ui.sentence = null;
    ui.since = null;
    body.setAttribute('data-state', view.state);
    const head = (key: string) => html('p', 'aiEyebrow', body, text(key));
    const note = (s: string) => html('p', 'aiNote', body, s);
    const progress = () => html('i', '', html('div', 'aiProgress', body)).parentElement.setAttribute('aria-hidden', 'true');
    const intent = () => {
        html('p', '', body, text('looksLike'));
        html('blockquote', 'aiIntent', body, view.intent || '');
    };
    const buttons = () => html('div', 'aiButtons', body);
    const button = (parent: Element, label: string, cls: string, action: () => void) => {
        const b = html('button', 'btn ' + cls, parent, label);
        b.type = 'button';
        b.addEventListener('click', (e: Event) => {
            e.preventDefault();
            action();
        });
        return b;
    };
    const link = (label: string, action: () => void) => button(body, label, 'aiLink', action);
    switch (view.state) {
        case 'idle':
            html('p', '', body, text('idle'));
            break;
        case 'thinking':
            head('thinkingHead');
            html('p', '', body, text('thinking'));
            progress();
            ui.since = note(text('since', Math.round((Date.now() - view.since) / 1000)));
            break;
        case 'offer': {
            head('offerHead');
            intent();
            html('p', '', body, text('question'));
            const label = html('label', 'aiLabel', body, text('sentenceLabel'));
            label.setAttribute('for', 'aiSentence');
            ui.sentence = html('input', 'aiSentence', body);
            ui.sentence.id = 'aiSentence';
            ui.sentence.type = 'text';
            ui.sentence.maxLength = MAX_SENTENCE;
            ui.sentence.placeholder = text('sentencePlaceholder');
            ui.sentence.addEventListener('keydown', (e: KeyboardEvent) => e.stopPropagation()); // not Blockly's or the simulator's keys
            const row = buttons();
            button(row, text('write'), 'btn-primary aiWrite', writeTests);
            button(row, text('notNow'), 'btn-default aiNotNow', notNow);
            link(text('quietLink'), dontAskHere).classList.add('aiQuiet');
            break;
        }
        case 'guess':
            head('guessHead');
            intent();
            note(text('guessNote'));
            break;
        case 'nothing':
            head('nothingHead');
            intent();
            html('p', '', body, text('nothing'));
            break;
        case 'writing': {
            head('writingHead');
            const p = html('p', '', body, text('writingFor'));
            html('strong', '', p, '“' + view.for + '”');
            html('p', 'aiPhase', body, view.phase === 'writing' ? text('writingTests') : text('analysing'));
            progress();
            note(text('writingNote'));
            break;
        }
        case 'review':
            renderReview(body, head, note, buttons, button);
            break;
        case 'checking': {
            head('checkingHead');
            const p = view.progress;
            html('p', '', body, text('checking', p.index + 1, p.count, p.name));
            html('i', '', html('div', 'aiProgress aiProgressSteps', body)).style.width = Math.round((100 * (p.index + 0.5)) / p.count) + '%';
            note(text('checkingNote'));
            break;
        }
        case 'results':
            renderResults(body, head, note, buttons, button);
            break;
        case 'fixing':
            head('fixingHead');
            html('p', '', body, view.count === 1 ? text('fixingOne') : text('fixing', view.count));
            progress();
            note(text('fixingNote'));
            break;
        case 'done': {
            head('doneHead');
            const added = view.added;
            const one = added.tests === 1;
            const how = added.unchecked
                ? text(one ? 'uncheckedOne' : 'uncheckedMany')
                : added.failing
                ? added.failing === 1
                    ? text('failingOne')
                    : text('failingMany', added.failing)
                : text(one ? 'passedOne' : 'passedMany');
            html('p', '', body, text('done', one ? text('oneTest') : text('tests', added.tests), whereAdded(added.worlds), how));
            added.notAdded && note(added.notAdded === 1 ? text('notAddedOne') : text('notAddedMany', added.notAdded));
            note(text('doneNote'));
            button(buttons(), text('openTests'), 'btn-primary aiOpenTests', openTests);
            break;
        }
        case 'empty':
            head(view.phase === 'insufficient' ? 'insufficientHead' : 'emptyHead');
            html('p', '', body, view.phase === 'insufficient' ? view.message : text('empty'));
            note(text('again'));
            break;
        case 'stale': {
            head('staleHead');
            html('p', '', body, text('stale'));
            const row = buttons();
            button(row, text('writeAgain'), 'btn-primary aiWriteAgain', () => answerStale('write_again'));
            button(row, text('checkAnyway'), 'btn-default aiCheckAnyway', () => answerStale('check_anyway'));
            break;
        }
        case 'discarded':
            head('discardedHead');
            view.message && html('p', '', body, view.message);
            note(text('again'));
            break;
        case 'quiet':
            head('quietHead');
            html('p', '', body, text('quiet'));
            link(text('quietUndo'), askHereAgain).classList.add('aiQuietUndo');
            break;
        case 'error':
            head('errorHead');
            html('p', '', body, view.message);
            if (view.retry || view.other) {
                const row = buttons();
                view.retry && button(row, text('tryAgain'), 'btn-primary aiRetry', view.retry);
                view.other && button(row, view.other.label, 'btn-default aiOther', view.other.action);
            }
            break;
    }
}

/** a block of the program as a chip: a click selects it in the Program tab */
function chip(block: string): HTMLElement {
    const e = html('span', 'nepoChip', null, TESTS_C.aiBlockLabel(block));
    e.addEventListener('click', () => {
        const b = GUISTATE_C.getBlocklyWorkspace() && GUISTATE_C.getBlocklyWorkspace().getBlockById(block);
        b && b.select();
    });
    return e;
}

/** the runs of the batch: each test, how it ran and what becomes of it; then the questions for the failed ones and for those the assistant thinks right */
function renderResults(body: Element, head: (key: string) => any, note: (s: string) => any, buttons: () => any, button: (parent: Element, label: string, cls: string, action: () => void) => any): void {
    const shown = batch.candidates.filter((c) => c.ran || c.state === 'flagged');
    head('resultsHead');
    html('p', '', body, text('resultsSummary', shown.filter((c) => c.state === 'passed').length, shown.length));
    const list = html('ul', 'aiResults', body);
    shown.forEach((c) => {
        const state = c.state;
        const li = html('li', 'aiRun aiRun_' + state, list);
        const unchecked = state === 'notChecked' || (state === 'flagged' && c.ran && c.ran.report.outcome === 'passed');
        html('span', 'aiRunIcon', li, state === 'passed' ? '✓' : state === 'discarded' || state === 'leftOut' ? '–' : unchecked ? '?' : '✗').setAttribute('aria-hidden', 'true');
        const main = html('div', 'aiRunMain', li);
        html('span', 'aiRunName', main, c.test.name);
        const label: { [s: string]: string } = {
            passed: c.fixes ? text('ranPassedFixed') : text('ranPassed'),
            failed: text('ranFailed'),
            fix: text('ranFix'),
            flagged: c.ran && c.ran.report.outcome === 'passed' ? text('ranNotChecked') : text('ranFailed'),
            notChecked: text('ranNotChecked'),
            kept: text('ranKept'),
            discarded: text('ranDiscarded'),
            leftOut: c.reason,
            gaveUp: text('ranGaveUp', batch.fixes),
        };
        html('small', 'aiRunState', main, label[state] || state);
        if (state !== 'passed' && state !== 'discarded' && state !== 'leftOut' && c.ran) {
            const details = html('ul', 'aiRunDetails', main);
            AI.failuresOf(c.ran).forEach((f) => {
                const item = html('li', '', details, f.text);
                f.why && item.appendChild(VERDICT.explanationElement(f.why, 'nepoWhy', chip));
            });
            (c.why || []).forEach((w) => {
                const item = html('li', 'aiNotChecked', details);
                w.block && item.appendChild(chip(w.block));
                item.appendChild(document.createTextNode((w.block ? ' ' : '') + w.text));
            });
        }
        if (state === 'flagged' && c.reason) {
            const box = html('div', 'aiReason', main);
            html('b', '', box, text(c.flag === 'doubtful' ? 'doubtful' : 'flagged') + ' ');
            box.appendChild(document.createTextNode(c.reason));
        }
    });
    batch.plan && coverageLine(body, batch.plan, true);
    const failed = batch.candidates.filter((c) => c.state === 'failed' || c.state === 'notChecked');
    const flagged = batch.candidates.filter((c) => c.state === 'flagged');
    if (failed.length) {
        const one = failed.length === 1;
        html('p', 'aiQuestion', body, one ? text('askFixOne') : text('askFix'));
        shown.some((c) => c.state === 'passed') && note(text('askFixNote'));
        const row = buttons();
        button(row, one ? text('fixIt') : text('fixThem'), 'btn-primary aiFix', () => answerFailed('failed', 'fix'));
        button(row, one ? text('discardIt') : text('discardThem'), 'btn-default aiDiscardFailed', () => answerFailed('failed', 'discard'));
    } else if (batch.candidates.some((c) => c.state === 'fix')) {
        note(text('fixChosen'));
    }
    if (flagged.length) {
        const one = flagged.length === 1;
        html('p', 'aiQuestion', body, one ? text('askFlaggedOne') : text('askFlagged'));
        const row = buttons();
        button(row, text('addAnyway'), 'btn-primary aiAddAnyway', () => answerFailed('flagged', 'add'));
        button(row, one ? text('discardIt') : text('discardThem'), 'btn-default aiDiscardFlagged', () => answerFailed('flagged', 'discard'));
    }
    if (!failed.length && !flagged.length && !batch.candidates.some((c) => c.state === 'fix')) {
        // only the tests that still failed after the last fix were left: shown once
        const others = batch.candidates.some((c) => c.state === 'passed' || c.state === 'kept' || c.state === 'unchecked');
        button(buttons(), others ? text('goOnAdd') : text('goOnNone'), 'btn-primary aiGoOn', finish);
    }
}

function renderReview(body: Element, head: (key: string) => any, note: (s: string) => any, buttons: () => any, button: (parent: Element, label: string, cls: string, action: () => void) => any): void {
    const count = () => ticked.reduce((n, w) => n + w.filter((t) => t).length, 0);
    const total = generated.worlds.reduce((n, w) => n + w.tests.length, 0);
    html('p', 'aiEyebrow', body, total === 1 ? text('scenario') : text('scenarios', total));
    note(text('untick'));
    generated.worlds.forEach((w, i) => {
        if (!w.tests.length) {
            return;
        }
        html('p', 'aiWorld', body, text(w.existing ? 'yourWorld' : 'newWorld', w.name));
        const list = html('ul', 'aiChecklist', body);
        w.tests.forEach((t, j) => {
            const label = html('label', '', html('li', '', list));
            const box = html('input', '', label);
            box.type = 'checkbox';
            box.checked = ticked[i][j];
            box.addEventListener('change', () => {
                ticked[i][j] = box.checked;
                const n = count();
                add.textContent = n === 1 ? text('addOne') : text('add', n);
                add.disabled = n === 0;
            });
            const span = html('span', '', label, t.name);
            t.oracle && TEXT['basis_' + t.oracle.basis] && html('em', 'aiBasis aiBasis_' + t.oracle.basis, span, text('basis_' + t.oracle.basis));
            t.scenario && html('small', '', span, t.scenario);
            const assumptions = (t.oracle && Array.isArray(t.oracle.assumptions) ? t.oracle.assumptions : []).filter((a: any) => typeof a === 'string' && a.trim());
            if (assumptions.length) {
                const details = html('details', 'aiAssumptions', span);
                html('summary', '', details, text('assumes'));
                const ul = html('ul', '', details);
                assumptions.forEach((a: string) => html('li', '', ul, a));
            }
        });
    });
    generated.plan && coverageLine(body, generated.plan, false);
    const left = generated.dropped.length + generated.duplicates.length;
    left && note(text('leftOut', left));
    const row = buttons();
    const add = button(row, total === 1 ? text('addOne') : text('add', total), 'btn-primary aiAdd', chooseTests);
    button(row, text('discard'), 'btn-default aiDiscard', discard);
}

/**
 * one line of coverage: the outcomes of the program's decisions the tests plan to try (review), or that the runs took (results), and those they
 * don't, as chips with their words (and why not: deferred, unsupported, left out)
 */
function coverageLine(body: Element, plan: STRATEGY.Plan, seen: boolean): void {
    const total = plan.outcomes.length;
    const box = html('div', 'aiCoverage', body);
    if (!total) {
        html('p', '', box, text('plansNone'));
        return;
    }
    const hit = plan.outcomes.filter((o) => (seen ? o.seen > 0 : o.planned.length > 0));
    html('p', '', box, seen ? text('seen', hit.length, total) : text('plans', plan.outcomes.filter((o) => o.planned.length).length, total));
    const missing = plan.outcomes.filter((o) => hit.indexOf(o) < 0);
    if (!missing.length) {
        return;
    }
    const details = html('details', 'aiMissing', box);
    html('summary', '', details, (seen ? text('notSeen') : text('notPlanned')) + ' (' + missing.length + ')');
    const ul = html('ul', '', details);
    missing.forEach((o) => {
        const li = html('li', '', ul);
        li.appendChild(chip(o.block));
        li.appendChild(document.createTextNode(' ' + o.words + (!seen && o.deferred ? ': ' + o.deferred : seen && o.planned.length ? ': planned, but it didn\'t happen' : '')));
    });
}

/** "in a new world: “A”", "in 2 new worlds: “A” and “B”", "in your world “C”", "in the worlds “A” and “C”" */
function whereAdded(worlds: FORMAT.Resolved[]): string {
    const names = worlds.map((w) => '“' + w.name + '”');
    const list = names.length > 1 ? names.slice(0, -1).join(', ') + text('and') + names[names.length - 1] : names[0] || '';
    if (worlds.every((w) => !w.existing)) {
        return worlds.length === 1 ? text('inNewWorld', list) : text('inNewWorlds', worlds.length, list);
    }
    if (worlds.length === 1) {
        return text('inYourWorld', list);
    }
    return text('inWorlds', list);
}
