/**
 * The Tests tab: learners build a test suite for their program from NEPO test blocks (nepoTest.blocks), look at the code it turns into and run it.
 *
 * - the workspace (#testsBlocklyDiv) holds the red start block of the suite, test blocks, and "run test" blocks below the start block
 * - the suite is saved with the program (nepoTest.suite: extra instances of the program's XML)
 * - "Code" shows the suite as NepoTest JSON and the program's generated EdPy
 * - "Test runner" converts the program with the Lab (REST /projectWorkflow/sourceForTest: EdPy + source map) and runs the suite in the browser
 *   with NepoTest in Pyodide (nepoTest.runner); the tests of simulation worlds run on the Lab's simulator (nepoTest.simRun). Results come back
 *   per test, errors per block (the block coverage only if SHOW_COVERAGE)
 * - "Simulation" shows the selected simulation world and its tests (nepoTest.simEditor): the world is drawn there, its tests are run and
 *   replayed. The world is the world block's data (JSON), so it is saved with the suite, and undo of a deleted block brings it back.
 * - A failed check of a simulation test comes with why (nepoTest.simVerdict: the block to blame) and the facts of the second before it
 *   (nepoTest.simProgram): what the robot sensed, what ran, what it remembered, what it did. The program's blocks in them are chips: a click
 *   shows the block in the Program tab. While a run is replayed, the block running at the replay's time is marked in the Program tab.
 * Suites saved before 2026-10-26 had simulation tests of their own ("nepoTest_simtest", one world each): they are dropped when they are loaded.
 * Until 2026-10-30, a world had "rules for every test" (checks): they become checks of each of its tests when a suite is loaded. A test
 * could check that the robot stays on a path recorded before ("nepoTest_check_path"): such checks are dropped when they are loaded.
 * Only for the Edison robots (NepoTest supports them).
 */
import * as GUISTATE_C from 'guiState.controller';
import * as COMM from 'comm';
import * as LOG from 'log';
// @ts-ignore (Blockly has no type declarations)
import * as Blockly from 'blockly';
import * as $ from 'jquery';
import * as BLOCKS from 'nepoTest.blocks';
import * as SUITE from 'nepoTest.suite';
import * as RUNNER from 'nepoTest.runner';
import * as SIM from 'nepoTest.sim';
import * as SIMRUN from 'nepoTest.simRun';
import * as SIMPROGRAM from 'nepoTest.simProgram';
import * as VERDICT from 'nepoTest.simVerdict';
import { SimEditor, SimTest } from 'nepoTest.simEditor';

const SUPPORTED_GROUPS = ['edison'];

let workspace: any = null;
let listen = false;
let blocksLanguage: string = null;
let codeView: 'json' | 'edpy' = 'json';
let codeTimer: any = null;
let running = false;
let cancelled = false; // "stop": a simulation test that runs stops too
let simEditor: SimEditor = null;
let simTimer: any = null;
let unloadable: string = null; // a suite that could not be loaded: it is saved as it was, not as the empty suite shown instead
const OLD_SIM_TEST = 'nepoTest_simtest'; // a simulation test of its own (until 2026-10-26)
const OLD_PATH_CHECK = 'nepoTest_check_path'; // "the robot stays on its recorded path" (until 2026-10-30)
/**
 * the block coverage of a run (how many blocks of the program the tests executed, and which never ran) is computed, but not shown: learners
 * found it confusing. true shows it again under the results.
 */
const SHOW_COVERAGE = false;

// ------------------------------------------------------------------------------------------------ setup

export function init(): void {
    blocksLanguage = GUISTATE_C.getLanguage();
    BLOCKS.register(blocksLanguage);
    BLOCKS.setProgramInfoProvider(programInfo);
    translateLabels();
    workspace = Blockly.inject(document.getElementById('testsBlocklyDiv'), {
        path: '/blockly/',
        toolbox: BLOCKS.toolbox(),
        trashcan: true,
        scrollbars: true,
        media: '../blockly/media/',
        zoom: { controls: true, wheel: false, startScale: 1.0, maxScale: 4, minScale: 0.25, scaleSpeed: 1.1 },
        robControls: true,
        theme: GUISTATE_C.getTheme(),
    });
    workspace.setDevice({ group: GUISTATE_C.getRobotGroup(), robot: GUISTATE_C.getRobot() });
    ['runOnBrick', 'stopBrick', 'stopProgram', 'saveProgram'].forEach(function (button) {
        const element = workspace.robControls && workspace.robControls[button];
        element && element.setAttribute && element.setAttribute('style', 'display : none');
    });
    simEditor = new SimEditor(document.getElementById('testsSimPane'), {
        changed: simChanged,
        tests: simTests,
        select: function (testId: string) {
            const block = workspace.getBlockById(testId);
            block && block.select();
        },
        run: simulate,
        blockLabel: blockLabel,
        showBlock: function (blockId: string) {
            selectBlock(blockId, 'program');
        },
        replayed: markReplayed,
    });
    simEditor.setLanguage(blocksLanguage);
    SUITE.setWorkspace(serializeSuite, loadSuite);
    loadSuite(null);
    initEvents();
    updateAvailability();
    GUISTATE_C.addLanguageListener(function (lang) {
        if (GUISTATE_C.getView() === 'tabTests') {
            changeLanguage(lang); // otherwise when the tab is shown next
        }
    });
}

function initEvents(): void {
    $('#tabTests').onWrap('show.bs.tab', function () {
        GUISTATE_C.setView('tabTests');
    });
    $('#tabTests').onWrap(
        'shown.bs.tab',
        function () {
            if (blocksLanguage !== GUISTATE_C.getLanguage()) {
                changeLanguage(GUISTATE_C.getLanguage());
            }
            workspace.markFocused();
            workspace.setVisible(true);
            resize();
            refreshProgramDropdowns();
            if (codeView && $('#testsCodePane').is(':visible')) {
                refreshCode();
            }
        },
        'tabTests clicked'
    );
    $('#tabTests').onWrap('hidden.bs.tab', function () {
        workspace.setVisible(false);
    });
    $('#tabProgram').onWrap('shown.bs.tab', function () {
        setTimeout(function () {
            const id = replayedBlock; // the Program tab draws its blocks anew: the mark of the replayed block again
            replayedBlock = null;
            markReplayed(id);
        }, 0);
    });
    $(window).on('resize', function () {
        if ($('#tests').hasClass('active')) {
            resize();
        }
    });
    workspace.addChangeListener(function (event) {
        if (event.type === Blockly.Events.UI) {
            if (event.element === 'selected' || event.element === 'click') {
                openSimOf(event.element === 'selected' ? event.newValue : event.blockId);
            }
            return;
        }
        followSimTest(event);
        if (!listen) {
            return;
        }
        if (GUISTATE_C.isProgramSaved()) {
            GUISTATE_C.setProgramSaved(false);
        }
        renameRunBlocks(event);
        fillRunBlocks(event);
        if ($('#testsCodePane').is(':visible')) {
            clearTimeout(codeTimer);
            codeTimer = setTimeout(refreshCode, 600);
        }
    });
    $('#testsRunnerTab').onWrap('click', function (e) {
        e.preventDefault();
        showSide('runner');
    });
    $('#testsCodeTab').onWrap('click', function (e) {
        e.preventDefault();
        showSide('code');
    });
    $('#testsSimTab').onWrap('click', function (e) {
        e.preventDefault();
        showSide('sim');
    });
    $('#testsCodeJson').onWrap('click', function () {
        codeView = 'json';
        refreshCode();
    });
    $('#testsCodeEdpy').onWrap('click', function () {
        codeView = 'edpy';
        refreshCode();
    });
    $('#testsRunButton').onWrap('click', function () {
        runTests();
    });
    $('#testsStopButton').onWrap('click', function () {
        cancelled = true;
        RUNNER.cancel();
    });
    $('#testsResults, #testsProblems, #testsCoverage').on('click', '[data-block]', function (e) {
        e.stopPropagation(); // the innermost linked element wins (an error inside a test's result)
        selectBlock($(this).attr('data-block'), $(this).attr('data-workspace'));
    });
}

function resize(): void {
    if (workspace) {
        Blockly.svgResize(workspace);
    }
    simEditor && $('#testsSimPane').is(':visible') && simEditor.resize();
}

/** the Tests tab only exists for robots NepoTest supports; called on start and when the robot changes (via loadSuite) */
function updateAvailability(): void {
    const supported = SUPPORTED_GROUPS.indexOf(GUISTATE_C.getRobotGroup()) >= 0;
    $('#tabTests').parent().toggleClass('hidden', !supported);
    if (!supported && GUISTATE_C.getView() === 'tabTests') {
        $('#tabProgram').tabWrapShow();
    }
    if (workspace) {
        workspace.setDevice({ group: GUISTATE_C.getRobotGroup(), robot: GUISTATE_C.getRobot() });
    }
}

function translateLabels(): void {
    $('#tabTests .menuTab').text(Blockly.Msg.TAB_TESTS || 'Tests');
    const labels = LABELS[GUISTATE_C.getLanguage()] || LABELS.en;
    Object.keys(LABELS.en).forEach(function (id) {
        $('#' + id).text(labels[id] || LABELS.en[id]);
    });
}

const LABELS: { [lang: string]: { [id: string]: string } } = {
    en: {
        testsRunnerTab: 'Test runner',
        testsCodeTab: 'Code',
        testsSimTab: 'Simulation',
        testsRunButton: '▶ Run tests',
        testsStopButton: 'Stop',
        testsCodeJson: 'Tests (JSON)',
        testsCodeEdpy: 'Program (EdPy)',
    },
    de: {
        testsRunnerTab: 'Testlauf',
        testsCodeTab: 'Code',
        testsSimTab: 'Simulation',
        testsRunButton: '▶ Tests ausführen',
        testsStopButton: 'Stopp',
        testsCodeJson: 'Tests (JSON)',
        testsCodeEdpy: 'Programm (EdPy)',
    },
};

const TEXT: { [lang: string]: { [key: string]: string } } = {
    en: {
        converting: 'Converting the program…',
        loadingPython: 'Starting the test runner (the first time, Python is downloaded: about 12 MB)…',
        running: 'Running test {0} of {1}…',
        passed: 'passed',
        failed: 'failed',
        skipped: 'skipped',
        expectedFailure: 'failed, as it should',
        error: 'test error',
        waiting: 'waiting',
        done: '{0} passed, {1} failed, {2} test errors',
        doneSkipped: '{0} passed, {1} failed, {2} test errors, {3} skipped',
        oldSimTests: 'This program had {0} simulation test(s) of an older kind: they were removed. Build them again as tests of a "simulation world" (in "Tests").',
        rulesMoved: 'The "rules for every test" of {0} simulation world(s) are now checks of each of its tests.',
        pathChecks: 'Paths are no longer recorded: {0} check(s) "the robot stays on its recorded path" were removed.',
        unloadable: 'The test suite of this program could not be loaded ({0}). It stays as it was when the program is saved; changes made here are not saved.',
        coverage: 'Blocks of the program executed by these tests: {0} of {1}',
        uncovered: 'never executed:',
        stopped: 'Stopped.',
        conversion: 'The program has errors and cannot be converted. Fix them first:',
        problems: 'The test suite has problems:',
        runtimeError: 'The program failed in block {0}: {1}',
        runnerFailed: 'The test runner failed: {0}',
        codeLoading: 'Starting the test runner…',
        warning: 'warning',
        showSim: 'show the run',
    },
    de: {
        converting: 'Das Programm wird übersetzt…',
        loadingPython: 'Der Testlauf startet (beim ersten Mal wird Python geladen: etwa 12 MB)…',
        running: 'Test {0} von {1} läuft…',
        passed: 'bestanden',
        failed: 'fehlgeschlagen',
        skipped: 'ausgelassen',
        expectedFailure: 'gescheitert, wie es soll',
        error: 'Testfehler',
        waiting: 'wartet',
        done: '{0} bestanden, {1} fehlgeschlagen, {2} Testfehler',
        doneSkipped: '{0} bestanden, {1} fehlgeschlagen, {2} Testfehler, {3} ausgelassen',
        oldSimTests: 'Dieses Programm hatte {0} Simulationstest(s) einer älteren Art: sie wurden entfernt. Baue sie als Tests einer „Simulationswelt“ (in „Tests“) neu.',
        rulesMoved: 'Die „Regeln für jeden Test“ von {0} Simulationswelt(en) sind jetzt Prüfungen in jedem ihrer Tests.',
        pathChecks: 'Wege werden nicht mehr aufgenommen: {0} Prüfung(en) „der Roboter bleibt auf seinem aufgenommenen Weg“ wurden entfernt.',
        unloadable: 'Die Testsammlung dieses Programms konnte nicht geladen werden ({0}). Sie bleibt beim Speichern des Programms, wie sie war; Änderungen hier werden nicht gespeichert.',
        coverage: 'Von diesen Tests ausgeführte Blöcke des Programms: {0} von {1}',
        uncovered: 'nie ausgeführt:',
        stopped: 'Gestoppt.',
        conversion: 'Das Programm hat Fehler und kann nicht übersetzt werden. Behebe sie zuerst:',
        problems: 'Die Testsammlung hat Probleme:',
        runtimeError: 'Das Programm ist in Block {0} gescheitert: {1}',
        runnerFailed: 'Der Testlauf ist gescheitert: {0}',
        codeLoading: 'Der Testlauf startet…',
        warning: 'Warnung',
        showSim: 'Fahrt zeigen',
    },
};

function text(key: string, ...args: any[]): string {
    const table = TEXT[GUISTATE_C.getLanguage()] || TEXT.en;
    let s = table[key] || TEXT.en[key] || key;
    args.forEach((a, i) => (s = s.replace('{' + i + '}', String(a))));
    return s;
}

function changeLanguage(lang: string): void {
    const xml = serializeSuite(true);
    blocksLanguage = lang;
    BLOCKS.setLanguage(lang);
    translateLabels();
    simEditor.setLanguage(lang);
    workspace.updateToolbox(BLOCKS.toolbox());
    loadSuite(xml);
}

// ------------------------------------------------------------------------------------------------ the suite and the program

function programWorkspace(): any {
    return GUISTATE_C.getBlocklyWorkspace();
}

function programXml(): string {
    return Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(programWorkspace()));
}

/** a short name of a block of the program: the text of its fields and values, up to its first statement input */
function blockLabel(blockId: string): string {
    const ws = programWorkspace();
    const block = ws && ws.getBlockById(blockId);
    if (!block) {
        return '?';
    }
    const parts: string[] = [];
    for (const input of block.inputList) {
        if (input.type === Blockly.NEXT_STATEMENT) {
            break;
        }
        input.fieldRow.forEach(function (f) {
            const t = f.getText && String(f.getText()).trim();
            t && parts.push(t);
        });
        const target = input.connection && input.connection.targetBlock();
        target && parts.push(target.toString(24));
    }
    const text = parts.join(' ').replace(/\s+/g, ' ') || block.type;
    return text.length > 48 ? text.substring(0, 47) + '…' : text;
}

/** a block of the program as a chip: a click shows it in the Program tab */
function programChip(block: string): HTMLElement {
    return $('<span class="nepoChip linked"></span>').text(blockLabel(block)).attr('data-block', block).attr('data-workspace', 'program')[0];
}

/** the facts of a failure of a simulation test, as a list item; its blocks are chips that show them in the Program tab */
function factsItem(facts: SIMPROGRAM.Facts, worldBlockId: string): any {
    const worldBlock = worldBlockId && workspace.getBlockById(worldBlockId);
    const world = worldBlock ? SIM.parseData(worldBlock.data).world : null;
    const name = function (id: string) {
        const item = world && world.items.filter((i) => i.id === id)[0];
        return item ? '"' + SIM.itemName(world, item, BLOCKS.kindWord) + '"' : id;
    };
    return $('<li class="nepoTestFactsItem"></li>').append(SIMPROGRAM.factsElement(facts, 'nepoFacts', name, programChip));
}

/** why a check of a simulation test failed (the block to blame), as a list item */
function whyItem(why: VERDICT.Explanation): any {
    return $('<li class="nepoTestWhyItem"></li>').append(VERDICT.explanationElement(why, 'nepoWhy', programChip));
}

let replayedBlock: string = null;

/** marks the block of the program that runs at the time of the replay in the Simulation tab (null: none) */
function markReplayed(blockId: string): void {
    if (blockId === replayedBlock) {
        return;
    }
    const ws = programWorkspace();
    const path = (id: string) => {
        const block = id && ws && ws.getBlockById(id);
        return block ? block.svgPath_ : null; // Blockly sets the classes of the block's group anew: the style goes on its path, as the debugger's does
    };
    const old = path(replayedBlock);
    old && old.classList.remove('nepoReplayed');
    replayedBlock = blockId;
    const now = path(blockId);
    now && now.classList.add('nepoReplayed');
}

/** the functions and global variables of the program in the Program tab, for the dropdowns of the test blocks */
function programInfo(): BLOCKS.ProgramInfo {
    const info: BLOCKS.ProgramInfo = { functions: [], variables: [] };
    const ws = programWorkspace();
    if (!ws) {
        return info;
    }
    for (const block of ws.getTopBlocks(false)) {
        if (block.type === 'robProcedures_defnoreturn' || block.type === 'robProcedures_defreturn') {
            const params = [];
            const st = block.getInput('ST');
            let p = st && st.connection && st.connection.targetBlock();
            while (p) {
                params.push({ name: p.getFieldValue('VAR'), type: p.getFieldValue('TYPE') || 'Number' });
                p = p.getNextBlock();
            }
            info.functions.push({ name: block.getFieldValue('NAME'), params: params, returns: block.type === 'robProcedures_defreturn' });
        } else if (block.type === 'robControls_start') {
            const st = block.getInput('ST');
            let d = st && st.connection && st.connection.targetBlock();
            while (d) {
                info.variables.push(d.getFieldValue('VAR'));
                d = d.getNextBlock();
            }
        }
    }
    return info;
}

/** re-renders dropdowns and call blocks after the program changed in the Program tab */
function refreshProgramDropdowns(): void {
    const info = programInfo();
    listen = false;
    for (const block of workspace.getAllBlocks()) {
        if (block.type === 'nepoTest_when_call') {
            const f = info.functions.filter((fn) => fn.name === block.getFieldValue('FUNCTION'))[0];
            if (f) {
                block.updateShape_(f.params);
            }
        }
    }
    setTimeout(() => (listen = true), 100);
}

/** keeps "run test" blocks attached to a test when it is renamed */
function renameRunBlocks(event: any): void {
    if (event.type !== Blockly.Events.CHANGE || event.element !== 'field' || event.name !== 'NAME') {
        return;
    }
    const changed = workspace.getBlockById(event.blockId);
    if (!BLOCKS.isTestBlock(changed)) {
        return;
    }
    for (const block of workspace.getAllBlocks()) {
        if (block.type === 'nepoTest_run' && block.getFieldValue('NAME') === event.oldValue) {
            block.setFieldValue(event.newValue, 'NAME');
        }
    }
}

/**
 * when a block is created (a "run test" block, or a test), "run test" blocks without a test get one that no other "run test" block runs yet,
 * in the same undo step. Loaded suites are left as they are (listen is off while loading).
 */
function fillRunBlocks(event: any): void {
    if (event.type !== Blockly.Events.CREATE) {
        return;
    }
    const runBlocks = workspace.getAllBlocks().filter((b) => b.type === 'nepoTest_run');
    const taken = runBlocks.map((b) => b.getFieldValue('NAME'));
    const free = BLOCKS.testNamesOf(workspace).filter((name) => taken.indexOf(name) < 0);
    const group = Blockly.Events.getGroup();
    Blockly.Events.setGroup(event.group);
    for (const block of runBlocks) {
        if (!free.length) {
            break;
        }
        if (block.getFieldValue('NAME') === '') {
            block.setFieldValue(free.shift(), 'NAME');
        }
    }
    Blockly.Events.setGroup(group);
}

/** the suite as block_set XML; null if it is empty (only the start block), so programs without tests stay unchanged */
function serializeSuite(always?: boolean): string {
    if (!workspace) {
        return null;
    }
    if (unloadable) {
        return unloadable;
    }
    const blocks = workspace.getAllBlocks();
    if (!always && blocks.length <= 1) {
        return null;
    }
    return Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(workspace));
}

/**
 * a suite without the simulation tests of the older kind (nepoTest_simtest) and the "run test" blocks that ran them: {xml, dropped}. The
 * suite is changed as XML, before Blockly sees it (it doesn't know the block any more). Nothing changes in a suite without them.
 */
function dropOldSimTests(xml: string): { xml: string; dropped: number } {
    if (!xml || xml.indexOf(OLD_SIM_TEST) < 0) {
        return { xml: xml, dropped: 0 };
    }
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const root = doc.documentElement;
    const children = (el: Element, name: string) => Array.prototype.slice.call(el.childNodes).filter((c: Node) => c.nodeType === 1 && (c as Element).localName === name) as Element[];
    const nameOf = (block: Element) => (children(block, 'field').filter((f) => f.getAttribute('name') === 'NAME')[0] || { textContent: '' }).textContent;
    const names: string[] = [];
    let dropped = 0;
    for (const instance of children(root, 'instance')) {
        const first = children(instance, 'block')[0];
        if (first && first.getAttribute('type') === OLD_SIM_TEST) {
            names.push(nameOf(first));
            root.removeChild(instance);
            dropped++;
        }
    }
    for (const instance of children(root, 'instance')) {
        for (const block of children(instance, 'block')) {
            if (block.getAttribute('type') === 'nepoTest_run' && names.indexOf(nameOf(block)) >= 0) {
                instance.removeChild(block);
            }
        }
    }
    return { xml: new XMLSerializer().serializeToString(doc), dropped: dropped };
}

/**
 * a suite whose simulation worlds have no "rules for every test" (statement RULES, until 2026-10-30): a copy of the rules goes to the end
 * of the checks of each test of the world (a world without tests keeps them as loose checks beside it): {xml, moved: the number of worlds}.
 * The suite is changed as XML, before Blockly sees it (it would drop the input's blocks). Nothing changes in a suite without them.
 */
function moveRulesIntoTests(xml: string): { xml: string; moved: number } {
    if (!xml || xml.indexOf('"RULES"') < 0) {
        return { xml: xml, moved: 0 };
    }
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const children = (el: Element, name: string) => Array.prototype.slice.call(el.childNodes).filter((c: Node) => c.nodeType === 1 && (c as Element).localName === name) as Element[];
    const statement = (block: Element, name: string) => children(block, 'statement').filter((st) => st.getAttribute('name') === name)[0] || null;
    /** a copy of a block without ids (Blockly gives the blocks new ones) */
    const copy = (block: Element) => {
        const c = block.cloneNode(true) as Element;
        [c].concat(Array.prototype.slice.call(c.getElementsByTagName('*'))).forEach((e: Element) => e.localName === 'block' && e.removeAttribute('id'));
        return c;
    };
    let moved = 0;
    const worlds = Array.prototype.slice.call(doc.getElementsByTagName('block')).filter((b: Element) => b.getAttribute('type') === BLOCKS.WORLD) as Element[];
    for (const world of worlds) {
        const rulesInput = statement(world, 'RULES');
        if (!rulesInput) {
            continue;
        }
        world.removeChild(rulesInput);
        const rules = children(rulesInput, 'block'); // the blocks of a statement are its children, in their order (the Lab's XML)
        if (!rules.length) {
            continue;
        }
        moved++;
        const testsInput = statement(world, 'TESTS');
        const tests = testsInput ? children(testsInput, 'block') : [];
        if (!tests.length) {
            const instance = world.parentNode as Element; // the world's instance: the checks go beside it
            const loose = doc.createElementNS(instance.namespaceURI, 'instance');
            loose.setAttribute('x', String(Number(instance.getAttribute('x') || 0) + 400));
            loose.setAttribute('y', instance.getAttribute('y') || '0');
            rules.forEach((rule) => loose.appendChild(rule));
            instance.parentNode.insertBefore(loose, instance.nextSibling);
            continue;
        }
        for (const test of tests) {
            let checks = statement(test, 'CHECKS');
            if (!checks) {
                checks = doc.createElementNS(test.namespaceURI, 'statement');
                checks.setAttribute('name', 'CHECKS');
                test.appendChild(checks);
            }
            rules.forEach((rule) => checks.appendChild(copy(rule)));
        }
    }
    return { xml: new XMLSerializer().serializeToString(doc), moved: moved };
}

/**
 * a suite without the checks "the robot stays on its recorded path" (nepoTest_check_path, until 2026-10-30): {xml, dropped}. The suite is
 * changed as XML, before Blockly sees it (it doesn't know the block any more). Nothing changes in a suite without them.
 */
function dropPathChecks(xml: string): { xml: string; dropped: number } {
    if (!xml || xml.indexOf(OLD_PATH_CHECK) < 0) {
        return { xml: xml, dropped: 0 };
    }
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const checks = Array.prototype.slice.call(doc.getElementsByTagName('block')).filter((b: Element) => b.getAttribute('type') === OLD_PATH_CHECK) as Element[];
    for (const check of checks) {
        const parent = check.parentNode as Element;
        parent.removeChild(check); // the blocks of a statement are its children (the Lab's XML): the others stay connected
        if (parent.localName === 'instance' && !Array.prototype.some.call(parent.childNodes, (c: Node) => c.nodeType === 1)) {
            parent.parentNode.removeChild(parent); // a loose check alone
        }
    }
    return { xml: new XMLSerializer().serializeToString(doc), dropped: checks.length };
}

/** puts a suite into the workspace (null: a new suite with just the start block) */
function loadSuite(testsXml: string): void {
    if (!workspace) {
        return;
    }
    updateAvailability();
    listen = false;
    unloadable = null;
    workspace.clear();
    const old = dropOldSimTests(testsXml);
    const rules = moveRulesIntoTests(old.xml);
    const paths = dropPathChecks(rules.xml);
    const xml = paths.xml || BLOCKS.emptySuite(GUISTATE_C.getRobotGroup());
    let failure: string = null;
    try {
        Blockly.Xml.domToWorkspace(Blockly.Xml.textToDom(xml, workspace), workspace);
    } catch (e) {
        LOG.error('could not load the test suite: ' + e);
        failure = String((e && e.message) || e);
        unloadable = testsXml; // saved as it was: the empty suite shown instead would delete the tests
        workspace.clear();
        Blockly.Xml.domToWorkspace(Blockly.Xml.textToDom(BLOCKS.emptySuite(GUISTATE_C.getRobotGroup()), workspace), workspace);
    }
    if (!workspace.getTopBlocks(false).some((b) => b.type === 'nepoTest_suite')) {
        Blockly.Xml.domToWorkspace(Blockly.Xml.textToDom(BLOCKS.emptySuite(GUISTATE_C.getRobotGroup()), workspace), workspace);
    }
    workspace.getTopBlocks(false).forEach((b) => BLOCKS.refreshWorldLabels(b)); // the dropdowns show the names of the worlds' starts and items
    $('#testsResults, #testsProblems, #testsCoverage').empty();
    $('#testsStatus').text('');
    if (failure) {
        showList(text('unloadable', failure), []);
    } else if (old.dropped || rules.moved || paths.dropped) {
        const notices = [old.dropped ? text('oldSimTests', old.dropped) : '', rules.moved ? text('rulesMoved', rules.moved) : '', paths.dropped ? text('pathChecks', paths.dropped) : ''];
        showList(notices.filter((t) => t).join(' '), []);
    }
    reopenSim();
    setTimeout(() => (listen = true), 300);
}

// ------------------------------------------------------------------------------------------------ the side panel

function showSide(which: string): void {
    $('#testsRunnerTab').toggleClass('active', which === 'runner');
    $('#testsCodeTab').toggleClass('active', which === 'code');
    $('#testsSimTab').toggleClass('active', which === 'sim');
    $('#testsRunnerPane').toggle(which === 'runner');
    $('#testsCodePane').toggle(which === 'code');
    $('#testsSimPane').css('display', which === 'sim' ? 'flex' : 'none');
    if (which === 'code') {
        refreshCode();
    }
    if (which === 'sim') {
        simEditor.resize();
    }
}

// ------------------------------------------------------------------------------------------------ simulation worlds

/** the test of a world a block belongs to (the test itself, or a block in it), or null */
function simTestOf(block: any): any {
    let b = block;
    while (b && b.type !== BLOCKS.SIM_TEST) {
        b = b.getParent();
    }
    return b;
}

/** the blocks of a statement input, in their order, without the disabled ones */
function chainOf(block: any, input: string): any[] {
    const blocks = [];
    for (let b = block.getInputTargetBlock(input); b; b = b.getNextBlock()) {
        !b.disabled && blocks.push(b);
    }
    return blocks;
}

/** the tests of the world shown in the Simulation tab, as it needs them */
function simTests(): SimTest[] {
    const world = workspace.getBlockById(simEditor.currentBlockId());
    if (!world) {
        return [];
    }
    const itemsOf = (checks: any[]) => checks.map((c) => c.getFieldValue('AREA') || c.getFieldValue('OBSTACLE')).filter((id) => id && id !== BLOCKS.ANY_ITEM);
    return BLOCKS.testsOf(world).map(function (test) {
        const checks = chainOf(test, 'CHECKS');
        const until = test.getFieldValue('MODE') === 'until' ? [test.getFieldValue('UNTIL')] : [];
        return {
            id: test.id,
            name: test.getFieldValue('NAME'),
            start: test.getFieldValue('START'),
            active: test.getFieldValue('ACTIVE') !== 'FALSE' && !test.disabled,
            checks: checks.length,
            refs: [test.getFieldValue('START')].concat(until, itemsOf(checks)),
        };
    });
}

/** the program is unsaved, and the code shown follows */
function suiteEdited(): void {
    if (GUISTATE_C.isProgramSaved()) {
        GUISTATE_C.setProgramSaved(false);
    }
    if ($('#testsCodePane').is(':visible')) {
        clearTimeout(codeTimer);
        codeTimer = setTimeout(refreshCode, 600);
    }
}

/** a world, or a block in it, was selected: the world is shown in the Simulation tab (and the test the block is in is selected there) */
function openSimOf(blockId: string): void {
    const block = blockId && workspace.getBlockById(blockId);
    const world = block && BLOCKS.worldOf(block);
    if (!world) {
        return;
    }
    if (simEditor.currentBlockId() !== world.id) {
        simEditor.show(world.id, SIM.parseData(world.data), world.getFieldValue('NAME'));
    }
    const test = simTestOf(block);
    test && simEditor.selectTest(test.id);
    if (!$('#testsSimPane').is(':visible')) {
        showSide('sim');
    }
}

/** shows the same world again after the workspace was loaded anew (language change, ...), or nothing if it is gone */
function reopenSim(): void {
    if (!simEditor) {
        return;
    }
    const id = simEditor.currentBlockId();
    const world = id && workspace.getBlockById(id);
    if (world && world.type === BLOCKS.WORLD) {
        const selected = simEditor.currentTestId();
        simEditor.show(world.id, SIM.parseData(world.data), world.getFieldValue('NAME'));
        selected && simEditor.selectTest(selected);
    } else {
        simEditor.show(null, null, '');
    }
}

/** keeps the Simulation tab in step with its world block: renamed, deleted, and its tests (added, removed, changed) */
function followSimTest(event: any): void {
    const id = simEditor && simEditor.currentBlockId();
    if (!id) {
        return;
    }
    if (event.type === Blockly.Events.DELETE && (event.ids || [event.blockId]).indexOf(id) >= 0) {
        simEditor.show(null, null, '');
    } else if (event.type === Blockly.Events.CHANGE && event.blockId === id && event.element === 'field' && event.name === 'NAME') {
        simEditor.setTitle(event.newValue);
    } else {
        clearTimeout(simTimer);
        simTimer = setTimeout(() => simEditor.refreshTests(), 50);
    }
}

/** the simulation window changed the world: it goes into the world block's data (an edit makes the program unsaved, a zoom doesn't) */
function simChanged(data: SIM.SimData, quiet: boolean): void {
    const block = workspace.getBlockById(simEditor.currentBlockId());
    if (!block) {
        return;
    }
    block.data = JSON.stringify(data);
    block.updateThumbnail && block.updateThumbnail();
    BLOCKS.refreshWorldLabels(block); // the names of its starts and items
    if (!quiet) {
        if (GUISTATE_C.isProgramSaved()) {
            GUISTATE_C.setProgramSaved(false);
        }
        if ($('#testsCodePane').is(':visible')) {
            clearTimeout(codeTimer);
            codeTimer = setTimeout(refreshCode, 600);
        }
    }
}

/** runs tests of the world shown in the Simulation tab on the Lab's simulator, one after the other. A test with problems doesn't run: the problems are shown. */
function simulate(testIds: string[]): void {
    const worldId = simEditor.currentBlockId();
    if (!worldId || running || !testIds.length) {
        return;
    }
    running = true;
    cancelled = false;
    simEditor.setBusy(true, RUNNER.isReady() ? null : simEditor.loadingText());
    let problems: string[] = [];
    const done = function (message?: string, isError?: boolean) {
        running = false;
        simEditor.setBusy(false);
        message = message || (problems.length ? text('problems') + ' ' + problems.join('; ') : null);
        message && simEditor.showMessage(message, isError || problems.length > 0);
    };
    const xml = programXml();
    RUNNER.simulationTest(serializeSuite(true), testIds.length === 1 ? testIds[0] : worldId, xml)
        .then(function (answer) {
            problems = answer.problems.filter((p) => p.severity === 'error').map((p) => p.message);
            if (!answer.tests.length) {
                done();
                return;
            }
            simEditor.setBusy(true);
            let chain: Promise<any> = Promise.resolve();
            answer.tests.forEach(function (test) {
                chain = chain.then(function () {
                    if (cancelled) {
                        throw new Error('cancelled');
                    }
                    return SIMRUN.runTest(test, xml, { cancelled: () => cancelled }).then(function (report) {
                        if (report.simulation || report.outcome === 'skipped') {
                            simEditor.showRun(test.block_id, report);
                        } else if (report.error) {
                            problems.push(test.name + ': ' + report.error.message);
                        }
                    });
                });
            });
            return chain.then(() => done());
        })
        .then(null, function (err) {
            done(err.message === 'cancelled' ? text('stopped') : text('runnerFailed', err.message), true);
        });
}

function selectBlock(blockId: string, where: string): void {
    if (!blockId) {
        return;
    }
    if (where === 'program') {
        $('#tabProgram').oneWrap('shown.bs.tab', function () {
            const block = programWorkspace().getBlockById(blockId);
            block && block.select();
        });
        $('#tabProgram').tabWrapShow();
    } else {
        const block = workspace.getBlockById(blockId);
        block && block.select();
        openSimOf(blockId); // a simulation test: its run is replayed in the Simulation tab
    }
}

function refreshCode(): void {
    $('#testsCodeJson').toggleClass('active', codeView === 'json');
    $('#testsCodeEdpy').toggleClass('active', codeView === 'edpy');
    const $content = $('#testsCodeContent');
    if (codeView === 'edpy') {
        convertProgram(function (result) {
            $content.text(result.rc === 'ok' ? result.sourceCode : text('conversion') + '\n' + conversionErrors(result).join('\n'));
        });
        return;
    }
    if (!RUNNER.isReady()) {
        $content.text(text('codeLoading'));
    }
    RUNNER.translate(serializeSuite(true), programXml()).then(
        function (result) {
            const problems = result.problems.map((p) => '// ' + (p.severity === 'warning' ? text('warning') + ': ' : '') + p.message);
            $content.text((problems.length ? problems.join('\n') + '\n\n' : '') + JSON.stringify(result.spec, null, 2));
        },
        function (err) {
            $content.text(text('runnerFailed', err.message));
        }
    );
}

function convertProgram(callback: (result: any) => void): void {
    const isNamedConfig = !GUISTATE_C.isConfigurationStandard() && !GUISTATE_C.isConfigurationAnonymous();
    COMM.json(
        '/projectWorkflow/sourceForTest',
        {
            programName: GUISTATE_C.getProgramName(),
            configurationName: isNamedConfig ? GUISTATE_C.getConfigurationName() : undefined,
            progXML: programXml(),
            confXML: GUISTATE_C.isConfigurationAnonymous() ? GUISTATE_C.getConfigurationXML() : undefined,
            SSID: '',
            password: '',
            language: GUISTATE_C.getLanguage(),
        },
        callback,
        'convert program for tests'
    );
}

function conversionErrors(result: any): string[] {
    const errors = [];
    try {
        const doc = new DOMParser().parseFromString(result.progXML || '', 'text/xml');
        const blocks = doc.getElementsByTagName('block');
        for (let i = 0; i < blocks.length; i++) {
            for (let j = 0; j < blocks[i].childNodes.length; j++) {
                const child = blocks[i].childNodes[j];
                if (child.nodeName === 'error') {
                    const key = child.textContent;
                    errors.push(blocks[i].getAttribute('type') + ': ' + (Blockly.Msg[key] || key));
                }
            }
        }
    } catch (e) {
        // no annotations
    }
    return errors.length ? errors : [Blockly.Msg[result.message] || result.message];
}

// ------------------------------------------------------------------------------------------------ running

/** a NepoTest bundle: the program as the Lab converted it (sourceForTest) */
function bundleOf(result: any, xml: string): any {
    return {
        format: 'nepotest-bundle',
        version: 1,
        robot: GUISTATE_C.getRobot(),
        program_name: GUISTATE_C.getProgramName(),
        xml: xml,
        rc: result.rc,
        message: result.message,
        cause: result.cause,
        edpy: result.sourceCode || null,
        source_map: result.sourceMap || null,
        annotated_prog_xml: result.progXML || null,
    };
}

function runTests(): void {
    if (running) {
        return;
    }
    running = true;
    cancelled = false;
    $('#testsRunButton').prop('disabled', true);
    $('#testsStopButton').prop('disabled', false);
    $('#testsResults, #testsProblems, #testsCoverage').empty();
    $('#testsStatus').text(text('converting'));
    const testsXml = serializeSuite(true);
    const xml = programXml();
    convertProgram(function (result) {
        if (result.rc !== 'ok' && !result.progXML) {
            finishRun(text('runnerFailed', Blockly.Msg[result.message] || result.message));
            return;
        }
        const bundle = bundleOf(result, xml);
        $('#testsStatus').text(RUNNER.isReady() ? '' : text('loadingPython'));
        const simulationReports: any[] = [];
        RUNNER.prepare(JSON.stringify(bundle), testsXml)
            .then(function (prepared) {
                if (!showPrepared(prepared)) {
                    finishRun('');
                    return;
                }
                const total = prepared.tests.length;
                let chain: Promise<any> = Promise.resolve();
                prepared.spec.tests.forEach(function (test, i) {
                    chain = chain.then(function () {
                        if (cancelled) {
                            throw new Error('cancelled');
                        }
                        $('#testsStatus').text(text('running', i + 1, total));
                        const report = test.simulation ? runSimulationTest(test, xml).then((r) => (simulationReports.push(compactReport(r)), r)) : RUNNER.runOne(i);
                        return report.then((r) => showReport(i, r));
                    });
                });
                return chain
                    .then(() => RUNNER.finish(simulationReports))
                    .then(function (finish) {
                        const s = finish.summary;
                        finishRun(s.skipped ? text('doneSkipped', s.passed, s.failed, s.error, s.skipped) : text('done', s.passed, s.failed, s.error));
                        showCoverage(finish.coverage);
                    });
            })
            .then(null, function (err) {
                finishRun(err.message === 'cancelled' ? text('stopped') : text('runnerFailed', err.message));
            });
    });
}

/** a test of a simulation world, on the Lab's simulator; a failure of the runner itself becomes the test's error */
function runSimulationTest(test: any, xml: string): Promise<any> {
    return SIMRUN.runTest(test, xml, { cancelled: () => cancelled }).then(null, function (err) {
        if (err.message === 'cancelled') {
            throw err;
        }
        return { name: test.name, block_id: test.block_id, outcome: 'error', failures: [], error: { kind: 'test_error', message: err.message } };
    });
}

/** what NepoTest needs of a simulation report for the summary and the coverage (not the path: it is long) */
function compactReport(report: any): any {
    return { name: report.name, block_id: report.block_id, outcome: report.outcome, covered_blocks: report.covered_blocks || [] };
}

/** the problems of a prepared suite, and its tests as a list (waiting); false if nothing can run */
function showPrepared(prepared: any): boolean {
    if (prepared.conversion_errors.length) {
        showList(
            text('conversion'),
            prepared.conversion_errors.map((e) => ({ message: e.block_type + ': ' + (Blockly.Msg[e.key] || e.key), block: e.block_id, where: 'program' }))
        );
        return false;
    }
    if (prepared.problems.length) {
        showList(
            text('problems'),
            prepared.problems.map((p) => ({
                message: (p.severity === 'warning' ? text('warning') + ': ' : '') + p.message,
                block: p.block_id,
                where: 'tests',
                cls: p.severity,
            }))
        );
    }
    if (prepared.problems.some((p) => p.severity === 'error')) {
        return false; // nothing runs: the problems above say why
    }
    const $results = $('#testsResults');
    prepared.spec &&
        prepared.spec.tests.forEach(function (t, i) {
            $results.append(
                $('<li class="nepoTestResult waiting"></li>')
                    .attr('id', 'nepoTestResult' + i)
                    .attr('data-block', t.block_id)
                    .attr('data-workspace', 'tests')
                    .append($('<span class="nepoTestIcon"></span>'))
                    .append($('<span class="nepoTestName"></span>').text(t.simulation ? t.simulation.world_name + ' ▸ ' + t.name : t.name))
                    .append($('<span class="nepoTestOutcome"></span>').text(text('waiting')))
            );
        });
    return true;
}

function showReport(index: number, report: any): void {
    const $li = $('#nepoTestResult' + index).removeClass('waiting').addClass(report.outcome);
    $li.find('.nepoTestOutcome').text(text(report.expected_failure ? 'expectedFailure' : report.outcome)); // it should fail, and it did: passed
    const $details = $('<ul class="nepoTestDetails"></ul>');
    (report.failures || []).forEach(function (f) {
        if (!(f.expect === 'error' && f.expected === null && report.error)) {
            const $f = $('<li></li>').text(describeFailure(f)); // an unexpected runtime error is shown once, below
            if (f.check_block_id) {
                $f.attr('data-block', f.check_block_id).attr('data-workspace', 'tests').addClass('linked'); // the check of a simulation world's test
            } else if (f.block_id) {
                $f.attr('data-block', f.block_id).attr('data-workspace', 'program').addClass('linked'); // the block that caused the state
            }
            $details.append($f);
            f.why && $details.append(whyItem(f.why));
            f.facts && $details.append(factsItem(f.facts, report.world_block_id));
        }
    });
    const errorFacts = (report.failures || []).filter((f) => f.expect === 'error' && f.facts)[0];
    if (report.error) {
        const where = report.error.block_id ? report.error.block_type + (report.error.function ? ' (' + report.error.function + ')' : '') : '';
        const $e = $('<li class="nepoTestError"></li>').text(report.error.block_id ? text('runtimeError', where, report.error.message) : report.error.message);
        if (report.error.block_id) {
            $e.attr('data-block', report.error.block_id).attr('data-workspace', 'program');
        }
        $details.append($e);
        errorFacts && $details.append(factsItem(errorFacts.facts, report.world_block_id));
    }
    if (report.simulation) {
        simEditor.showRun(report.block_id, report); // the run can be replayed in the Simulation tab
        $details.append($('<li class="linked nepoTestShowSim"></li>').text(text('showSim')).attr('data-block', report.block_id).attr('data-workspace', 'tests'));
    }
    $li.append($details);
}

function describeFailure(f: any): string {
    const show = (v) => (v === undefined ? '—' : JSON.stringify(v));
    let s = f.expect + ': ' + show(f.expected) + ' ≠ ' + show(f.actual);
    if (f.message && f.described) {
        s = f.message; // it says what was expected and what happened (states, distances)
    } else if (f.message) {
        s = f.expect + ': ' + f.message + ' (' + show(f.expected) + ')';
    }
    return s.length > 400 ? s.substring(0, 400) + '…' : s;
}

function showList(title: string, items: { message: string; block?: string; where?: string; cls?: string }[]): void {
    const $box = $('#testsProblems').append($('<div class="nepoTestProblemsTitle"></div>').text(title));
    const $ul = $('<ul></ul>').appendTo($box);
    items.forEach(function (item) {
        const $li = $('<li></li>').text(item.message);
        item.cls && $li.addClass(item.cls);
        if (item.block) {
            $li.attr('data-block', item.block).attr('data-workspace', item.where).addClass('linked');
        }
        $ul.append($li);
    });
}

function showCoverage(coverage: any): void {
    if (!coverage || !SHOW_COVERAGE) {
        return;
    }
    const $c = $('#testsCoverage').empty();
    $c.append($('<div></div>').text(text('coverage', coverage.blocks_covered, coverage.blocks_total)));
    const pct = coverage.blocks_total ? Math.round((100 * coverage.blocks_covered) / coverage.blocks_total) : 100;
    $c.append($('<div class="nepoTestCoverageBar"><div></div></div>').find('div').css('width', pct + '%').end());
    if (coverage.uncovered.length) {
        const $ul = $('<ul class="nepoTestUncovered"></ul>');
        coverage.uncovered.forEach(function (u) {
            $ul.append(
                $('<li class="linked"></li>')
                    .text(u.type + (u.function ? ' (' + u.function + ')' : ''))
                    .attr('data-block', u.block_id)
                    .attr('data-workspace', 'program')
            );
        });
        $c.append($('<div></div>').text(text('uncovered'))).append($ul);
    }
}

function finishRun(status: string): void {
    running = false;
    $('#testsRunButton').prop('disabled', false);
    $('#testsStopButton').prop('disabled', true);
    $('#testsStatus').text(status);
    $('#testsResults .waiting .nepoTestOutcome').text('—');
}

export { serializeSuite, loadSuite };
