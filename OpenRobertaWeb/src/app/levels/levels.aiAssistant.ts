/**
 * The AI test assistant beside the Program tab's simulator (Edison, while a level of the sets is played). When the learner runs a changed program, it
 * guesses what the program is meant to do (nepoTest.ai infer) and offers to write scenario tests for it (generate); the learner can say in one
 * sentence what the program should do. The tests the learner keeps become blocks in the Tests tab (tests.controller addAiTests); they don't run.
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
 *   DECLINED_RUNS changed runs have passed), nothing new to test, writing, the review list (all ticked), done, no new tests, discarded, no
 *   suggestions on this level, an error. An answer that comes after the AI was switched off, or after a newer run began, is dropped.
 * - Its notes are saved with the program (nepoTest.suite): the learner's sentences word for word (sent with later calls), the guess declined
 *   and the changed runs since, the levels it doesn't ask on.
 * The EdPy of a run is the one the telemetry asks for (levels.telemetry attemptSource): one request serves both.
 */
import * as GUISTATE_C from 'guiState.controller';
import * as COMM from 'comm';
import * as $ from 'jquery';
import * as AI from 'nepoTest.ai';
import * as FORMAT from 'nepoTest.aiFormat';
import * as PLAYER from 'levels.player';
import * as TELEMETRY from 'levels.telemetry';
import * as SUITE from 'nepoTest.suite';
import * as TESTS_C from 'tests.controller';

const GROUP = 'edison';
const TICK_MS = 1000;
const DECLINED_RUNS = 3; // after "Not now": changed runs before it offers again
const MAX_SENTENCE = 200;
const MAX_SAID = 50; // sentences kept in the notes (the server sends the last 5)

type State = 'idle' | 'thinking' | 'offer' | 'guess' | 'nothing' | 'writing' | 'review' | 'done' | 'empty' | 'discarded' | 'quiet' | 'error';

/** what the learner told the assistant about the program: saved with it */
export interface Notes {
    version: number;
    said: { text: string; time: string; level: string; answer: string }[]; // word for word; answer: write | not_now
    declined: { intent: string; runs: number } | null; // the guess declined ("Not now") and the changed runs since
    quiet: string[]; // the levels it doesn't ask on ("Don't ask on this level")
}

interface View {
    state: State;
    since?: number; // thinking, writing: since when (ms)
    intent?: string;
    for?: string; // writing: the sentence, or the guess
    added?: { tests: number; worlds: FORMAT.Resolved[] };
    error?: string;
    message?: string;
    retry?: () => void;
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
let notes: Notes = newNotes();
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
    writingNote: 'Usually 10 to 20 s. You can keep working meanwhile.',
    scenarios: '{0} scenarios',
    scenario: '1 scenario',
    untick: "Untick any you don't want.",
    newWorld: 'In a new world: “{0}”',
    yourWorld: 'In your world “{0}”',
    leftOut: '{0} more were left out: they had problems, or you have them already.',
    add: 'Add {0} tests',
    addOne: 'Add 1 test',
    discard: 'Discard',
    doneHead: 'Done',
    done: '{0} added to the Tests tab, {1}. {2}',
    notRunOne: "It hasn't run yet.",
    notRunMany: "They haven't run yet.",
    oneTest: '1 test',
    tests: '{0} tests',
    inNewWorld: 'in a new world: {0}',
    inNewWorlds: 'in {0} new worlds: {1}',
    inYourWorld: 'in your world {0}',
    inWorlds: 'in the worlds {0}',
    and: ' and ',
    doneNote: 'The assistant stays like this until the next changed run.',
    openTests: 'Open Tests tab',
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
    return { version: 1, said: [], declined: null, quiet: [] };
}

// ------------------------------------------------------------------------------------------------ setup

export function init(): void {
    const server = GUISTATE_C.getServerAi();
    available = !!server.available;
    on = available && !!server.default;
    SUITE.setAiNotes(serializeNotes, loadNotes);
    PLAYER.onEvent(levelEvent);
    build();
    $('#menuAiTests').on('click', function (e: Event) {
        e.preventDefault();
        !$(this).parent().hasClass('disabled') && switchTo(!on, true);
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
    return notes.said.length || notes.declined || notes.quiet.length ? JSON.stringify(notes) : null;
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
        }
    } catch (e) {
        console.warn("the AI test assistant's notes are not readable: it starts anew", e);
        loaded = newNotes();
    }
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
            answer.on !== on && switchTo(answer.on, false);
        } else if (switchedByHand) {
            askServer({ on: on });
        } else {
            const byDefault = available && !!GUISTATE_C.getServerAi().default;
            byDefault !== on && switchTo(byDefault, false);
        }
    });
}

/** the AI on or off (byHand: the Edit menu's switch: kept for the account) */
function switchTo(value: boolean, byHand: boolean): void {
    if (value && !available) {
        return;
    }
    on = value;
    token++; // an answer on its way is dropped
    if (on) {
        lastFingerprint = null; // the next run is looked at
        show({ state: isQuiet() ? 'quiet' : 'idle' });
    }
    if (byHand) {
        account ? askServer({ on: on }) : (switchedByHand = true);
    }
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
    return view.state === 'writing' || view.state === 'review';
}

function levelEvent(kind: string, data: any): void {
    if (kind === 'attempt_started') {
        on && attemptStarted(data);
    } else if (kind === 'level_opened' && !busy()) {
        if (notes.quiet.indexOf(data.level) >= 0) {
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
    request = {
        levelId: level,
        program: { nepo: run.program, edpy: source.edpy || '' },
        tests: TESTS_C.aiTests(),
        said: notes.said.map((s) => s.text),
        fingerprint: print,
    };
    const result = await AI.infer(request, notes.declined ? notes.declined.intent : null);
    if (mine !== token || !on) {
        return; // a newer run, or switched off meanwhile: dropped
    }
    if (!result.ok) {
        show(errorView('infer', result, () => think(level, run, print)));
        return;
    }
    guess = result.answer;
    const held = !!notes.declined && (guess.same_as_declined || notes.declined.runs < DECLINED_RUNS);
    show({ state: held ? 'guess' : guess.ask ? 'offer' : 'nothing', intent: guess.intent });
}

/**
 * "Write tests": the tests for the guess (and the learner's sentence), checked and repaired; then the review list
 *
 * @param before the learner's sentences before this one
 */
async function write(intent: string, sentence: string, before: string[]): Promise<void> {
    const mine = ++token;
    show({ state: 'writing', since: Date.now(), for: sentence || intent, intent: intent });
    const data = Object.assign({}, request, { tests: TESTS_C.aiTests(), said: before });
    const result = await AI.generate(data, intent, sentence, TESTS_C.aiContext(), request.program.nepo);
    if (mine !== token || !on) {
        return;
    }
    if (!result.ok) {
        show(errorView('generate', result, () => write(intent, sentence, before)));
        return;
    }
    generated = result;
    ticked = result.worlds.map((w) => w.tests.map(() => true));
    show({ state: result.worlds.some((w) => w.tests.length) ? 'review' : 'empty', intent: intent });
}

function errorView(kind: string, result: { error: string; message: string }, retry: () => void): View {
    const e = result.error || '';
    const message =
        e === 'timeout' || e === 'network' || e === 'unreachable' || e.indexOf('http_') === 0
            ? text(kind === 'infer' ? 'noAnswerInfer' : 'noAnswerGenerate')
            : e === 'limit'
            ? text('limit')
            : e === 'busy'
            ? text('busy')
            : e === 'not_configured'
            ? text('notConfigured')
            : text('unusable', e);
    return { state: 'error', error: e, message: message, retry: e === 'not_configured' ? null : retry };
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
    if (notes.declined) {
        notes.declined = null;
        notesChanged();
    }
    write(guess.intent, sentence, before);
}

function notNow(): void {
    said('not_now');
    notes.declined = { intent: guess.intent, runs: 0 };
    notesChanged();
    show({ state: 'guess', intent: guess.intent });
}

function dontAskHere(): void {
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
    notes.quiet = notes.quiet.filter((q) => q !== level);
    notesChanged();
    lastFingerprint = null; // the next run is looked at
    show({ state: 'idle' });
}

/** "Add n tests": the ticked ones become blocks in the Tests tab, with where they came from; they don't run */
function addTests(): void {
    const worlds = generated.worlds
        .map((w, i) => Object.assign({}, w, { tests: w.tests.filter((t, j) => ticked[i][j]) }))
        .filter((w) => w.tests.length);
    const meta = generated.calls[generated.calls.length - 1] || {};
    const ids = TESTS_C.addAiTests(worlds, AI.prefixOf(meta, generated.repairs), (w, test) => ({
        call: meta.callId || null,
        scenario: test.scenario || '',
        generated: test,
        added: new Date().toISOString(),
    }));
    show({ state: 'done', added: { tests: ids.length, worlds: worlds } });
}

function discard(): void {
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
    view = next;
    render();
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
            progress();
            note(text('writingNote'));
            break;
        }
        case 'review':
            renderReview(body, head, note, buttons, button);
            break;
        case 'done': {
            head('doneHead');
            const added = view.added;
            const one = added.tests === 1;
            html('p', '', body, text('done', one ? text('oneTest') : text('tests', added.tests), whereAdded(added.worlds), text(one ? 'notRunOne' : 'notRunMany')));
            note(text('doneNote'));
            button(buttons(), text('openTests'), 'btn-primary aiOpenTests', openTests);
            break;
        }
        case 'empty':
            head('emptyHead');
            html('p', '', body, text('empty'));
            note(text('again'));
            break;
        case 'discarded':
            head('discardedHead');
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
            view.retry && button(buttons(), text('tryAgain'), 'btn-primary aiRetry', view.retry);
            break;
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
            t.scenario && html('small', '', span, t.scenario);
        });
    });
    const left = generated.dropped.length + generated.duplicates.length;
    left && note(text('leftOut', left));
    const row = buttons();
    const add = button(row, total === 1 ? text('addOne') : text('add', total), 'btn-primary aiAdd', addTests);
    button(row, text('discard'), 'btn-default aiDiscard', discard);
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
