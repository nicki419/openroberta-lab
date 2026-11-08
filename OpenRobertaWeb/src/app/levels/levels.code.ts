/**
 * The study's code per level (Edison levels; docs/ai/nepo-levels.md, "The study's code per level"). In the study the learner gets broken code
 * per level, fixes it and writes tests for it, once with the AI test assistant and once without, in two programs. A level can bring code
 * (level.model `code`): the function the learner fixes there, in versions ("1", "2"), and the function the main loop called before.
 *
 * - **The version** is chosen per program in the Edit menu ("Level code: version 1", ...), by the study's staff when they open a participant's
 *   program. It is saved with the program (levels.player codeState). Once code was added, the other versions can't be chosen: another version
 *   needs another program.
 * - **Adding a level's code**: when a level with code is played in a program whose version is chosen (opened for the first time, or the version
 *   is chosen while it is played), its function in that version is added to the program, and the main loop calls it instead of the function it
 *   called before (the new function calls that one when its own situation isn't there). The functions the learner fixed stay as they are. The
 *   code of earlier levels that wasn't added yet is added first. A level's code is added once per program; a notice over the scene says so.
 * - **Given functions** (`code.given`, since 2026-11-08): functions that come with the level's function, before it, as they are (correct, the same
 *   in every version): L6 brings driveInTheDark, which its avoidWalls calls, since L5 (where it was the code to fix) was taken out. They don't
 *   change the main loop; one that is already there is kept.
 * - **The main loop**: the call of the function before is replaced by a call of the new one; a program without a main loop gets one (forever:
 *   the new function); a main loop that calls neither gets the call at its end. A function of the same name that is already there is kept.
 * - Telemetry (levels.telemetry record): code_version_chosen, code_added (the level, the function, the version, what was done, the given functions).
 */
import * as GUISTATE_C from 'guiState.controller';
import * as $ from 'jquery';
// @ts-ignore (Blockly has no type declarations)
import * as Blockly from 'blockly';
import * as LEVEL from 'level.model';
import * as PLAYER from 'levels.player';
import * as TELEMETRY from 'levels.telemetry';

const GROUP = 'edison';
const NS = 'http://de.fhg.iais.roberta.blockly';
const DEF = 'robProcedures_defnoreturn';
const CALL = 'robProcedures_callnoreturn';

const TEXT: { [key: string]: string } = {
    menu: 'Level code: version {0}',
    menuLocked: 'This program has the code of version {0}. For another version, start a new program.',
    addedTitle: 'New code',
    added: 'The function {0} was added to your program, and the main loop now calls it.',
    addedExisting: 'Your program already had a function {0}. The main loop now calls it.',
};

function text(key: string, ...args: any[]): string {
    return TEXT[key].replace(/\{(\d)\}/g, (m, i) => String(args[Number(i)]));
}

export function init(): void {
    PLAYER.onEvent((kind: string) => {
        if (kind === 'level_opened') {
            // a loaded program's progress comes before its blocks (program.controller programToBlocklyWorkspace): add when they are there
            setTimeout(addCode, 0);
            renderMenu();
        }
    });
    $('#head-navigation-program-edit').on('show.bs.dropdown', renderMenu);
    renderMenu();
}

/** the versions the set's levels have code in */
function versions(): string[] {
    const names: { [name: string]: boolean } = {};
    PLAYER.setLevels().forEach((e) => e.level.code && Object.keys(e.level.code.versions).forEach((n) => (names[n] = true)));
    return Object.keys(names).sort();
}

function renderMenu(): void {
    $('.menuLevelCode').remove();
    const names = GUISTATE_C.getRobotGroup() === GROUP ? versions() : [];
    const state = PLAYER.codeState();
    const locked = !!state && Object.keys(state.added).length > 0;
    let after = $('#menuAiTestsItem');
    names.forEach((name) => {
        const chosen = !!state && state.version === name;
        const item = $('<li class="menuLevelCode"><a class="dropdown-item" href="#"><span class="typcn typcn-code"></span><span class="kbd"></span></a></li>');
        item.find('.typcn').text(text('menu', name));
        item.find('.kbd').text(chosen ? '✓' : '');
        if (locked && !chosen) {
            item.addClass('disabled');
            item.find('a').attr('title', text('menuLocked', state.version));
        }
        item.find('a').on('click', (e: Event) => {
            e.preventDefault();
            !item.hasClass('disabled') && choose(name);
        });
        after.after(item);
        after = item;
    });
}

/** the version of this program's code: chosen (not once code of another version was added) */
export function choose(version: string): boolean {
    const state = PLAYER.codeState();
    if (state && state.version === version) {
        return true;
    }
    if (state && Object.keys(state.added).length) {
        return false;
    }
    PLAYER.setCodeState({ version: version, added: {} });
    TELEMETRY.record({ kind: 'code_version_chosen', version: version });
    renderMenu();
    addCode();
    return true;
}

/** the level played has code that this program doesn't have yet: it is added (and that of earlier levels first) */
function addCode(): void {
    const state = PLAYER.codeState();
    const entry = PLAYER.currentEntry();
    if (!state || !entry || GUISTATE_C.getRobotGroup() !== GROUP || !GUISTATE_C.getBlocklyWorkspace()) {
        return;
    }
    const levels = PLAYER.setLevels();
    const upTo = levels.findIndex((e) => e.id === entry.id);
    const missing = levels.slice(0, upTo + 1).filter((e) => e.level.code && !state.added[e.id]);
    if (!missing.length) {
        return;
    }
    const done = missing.map((e) => addLevelCode(e, state));
    PLAYER.setCodeState(state);
    renderMenu();
    const last = done.filter((d) => d.definition !== 'missing').pop();
    last && PLAYER.showNotice(text('addedTitle'), text(last.definition === 'existing' ? 'addedExisting' : 'added', last.function));
}

/** adds a level's code to the program; notes it in the state and tells the telemetry */
function addLevelCode(entry: LEVEL.LevelEntry, state: PLAYER.CodeState): { function: string; definition: string; main: string; given?: { [fn: string]: string } } {
    const code = entry.level.code;
    const workspace = GUISTATE_C.getBlocklyWorkspace();
    const xml = code.versions[state.version];
    let definition = 'missing'; // the level has no code in this version
    let main = 'unchanged';
    const given: { [fn: string]: string } = {};
    const there = (fn: string) => workspace.getTopBlocks(false).some((b: any) => b.type === DEF && b.getFieldValue('NAME') === fn);
    const group = Blockly.Events.getGroup();
    Blockly.Events.setGroup(true);
    try {
        if (xml) {
            for (const g of code.given || []) {
                if (there(g.function)) {
                    given[g.function] = 'existing';
                } else {
                    addDefinition(workspace, g.xml);
                    given[g.function] = 'added';
                }
            }
            if (there(code.function)) {
                definition = 'existing';
            } else {
                addDefinition(workspace, xml);
                definition = 'added';
            }
            main = callFromMain(workspace, code.function, code.calls);
        }
    } finally {
        Blockly.Events.setGroup(group);
    }
    const done: { function: string; definition: string; main: string; given?: { [fn: string]: string } } = { function: code.function, definition: definition, main: main };
    Object.keys(given).length && (done.given = given);
    state.added[entry.id] = Object.assign({ at: Date.now() }, done);
    TELEMETRY.record(Object.assign({ kind: 'code_added', level: entry.id, version: state.version }, done));
    return done;
}

/** the definition's instance, placed to the right of the blocks there */
function addDefinition(workspace: any, xml: string): void {
    const dom = Blockly.Xml.textToDom(xml, workspace);
    const instance = dom.getElementsByTagName('instance')[0];
    if (!instance) {
        return;
    }
    instance.setAttribute('x', String(Math.round(rightOf(workspace) + 60)));
    instance.setAttribute('y', String(Math.round(topOf(workspace))));
    const set = Blockly.Xml.textToDom('<block_set xmlns="' + NS + '" robottype="edison"></block_set>', workspace);
    set.appendChild(instance);
    Blockly.Xml.domToWorkspace(set, workspace);
}

/** the main loop calls the function: replaced (the call of the function before), kept (it calls it already), created (no main loop), appended */
function callFromMain(workspace: any, fn: string, before: string): string {
    const start = workspace.getTopBlocks(false).filter((b: any) => b.type === 'robControls_start')[0];
    if (!start) {
        return 'no_start';
    }
    let loop = start.getNextBlock();
    while (loop && loop.type !== 'robControls_loopForever') {
        loop = loop.getNextBlock();
    }
    if (!loop) {
        const created = newBlock(workspace, '<block type="robControls_loopForever"><statement name="DO"><block type="' + CALL + '"><mutation name="' + fn + '"/></block></statement></block>');
        let last = start;
        while (last.getNextBlock()) {
            last = last.getNextBlock();
        }
        last.nextConnection.connect(created.previousConnection);
        return 'created';
    }
    const calls: any[] = [];
    for (let b = loop.getInputTargetBlock('DO'); b; b = b.getNextBlock()) {
        b.type === CALL && calls.push(b);
    }
    const nameOf = (b: any) => (b.getFieldValue('NAME') || (b.mutationToDom && b.mutationToDom().getAttribute('name')) || '') as string;
    if (calls.some((b) => nameOf(b) === fn)) {
        return 'kept';
    }
    const call = newBlock(workspace, '<block type="' + CALL + '"><mutation name="' + fn + '"/></block>');
    const old = before ? calls.filter((b) => nameOf(b) === before)[0] : null;
    if (old) {
        const target = old.previousConnection.targetConnection;
        old.unplug(true); // the blocks after it move up
        target.connect(call.previousConnection); // and hang on after the new call
        old.dispose(false);
        return 'replaced';
    }
    let last = loop.getInputTargetBlock('DO');
    if (!last) {
        loop.getInput('DO').connection.connect(call.previousConnection);
    } else {
        while (last.getNextBlock()) {
            last = last.getNextBlock();
        }
        last.nextConnection.connect(call.previousConnection);
    }
    return 'appended';
}

/** a new block of the program (a top block until it is connected) */
function newBlock(workspace: any, blockXml: string): any {
    const dom = Blockly.Xml.textToDom('<block_set xmlns="' + NS + '" robottype="edison"><instance x="0" y="0">' + blockXml + '</instance></block_set>', workspace);
    const before = workspace.getTopBlocks(false).map((b: any) => b.id);
    Blockly.Xml.domToWorkspace(dom, workspace);
    return workspace.getTopBlocks(false).filter((b: any) => before.indexOf(b.id) < 0)[0];
}

function rightOf(workspace: any): number {
    let right = 0;
    workspace.getTopBlocks(false).forEach((b: any) => (right = Math.max(right, b.getRelativeToSurfaceXY().x + b.getHeightWidth().width)));
    return right;
}

function topOf(workspace: any): number {
    const tops = workspace.getTopBlocks(false).map((b: any) => b.getRelativeToSurfaceXY().y);
    return tops.length ? Math.min.apply(null, tops) : 40;
}
