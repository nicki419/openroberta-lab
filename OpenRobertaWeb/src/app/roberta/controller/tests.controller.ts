/**
 * The Tests tab: learners build a test suite for their program from NEPO test blocks (nepoTest.blocks), look at the code it turns into and run it.
 *
 * - the workspace (#testsBlocklyDiv) holds the red start block of the suite, test blocks, and "run test" blocks below the start block
 * - the suite is saved with the program (nepoTest.suite: extra instances of the program's XML)
 * - "Code" shows the suite as NepoTest JSON and the program's generated EdPy
 * - "Test runner" converts the program with the Lab (REST /projectWorkflow/sourceForTest: EdPy + source map) and runs the suite in the browser
 *   with NepoTest in Pyodide (nepoTest.runner); the simulation tests run on the Lab's simulator (nepoTest.simRun). Results come back per test,
 *   errors and coverage per block
 * - "Simulation" shows the world of the selected simulation test (nepoTest.simEditor): it is drawn there, recorded, run and replayed. The world
 *   is the test block's data (JSON), so it is saved with the suite, and undo of a deleted block brings it back.
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
import { SimEditor } from 'nepoTest.simEditor';

const SUPPORTED_GROUPS = ['edison'];

let workspace: any = null;
let listen = false;
let blocksLanguage: string = null;
let codeView: 'json' | 'edpy' = 'json';
let codeTimer: any = null;
let running = false;
let cancelled = false; // "stop": a simulation test that runs stops too
let simEditor: SimEditor = null;

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
        record: function () {
            simulate(true);
        },
        run: function () {
            simulate(false);
        },
        simulatorScene: simulatorScene,
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
        expectedFailure: 'failed, as it should',
        error: 'test error',
        waiting: 'waiting',
        done: '{0} passed, {1} failed, {2} test errors',
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
        expectedFailure: 'gescheitert, wie es soll',
        error: 'Testfehler',
        waiting: 'wartet',
        done: '{0} bestanden, {1} fehlgeschlagen, {2} Testfehler',
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
    const blocks = workspace.getAllBlocks();
    if (!always && blocks.length <= 1) {
        return null;
    }
    return Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(workspace));
}

/** puts a suite into the workspace (null: a new suite with just the start block) */
function loadSuite(testsXml: string): void {
    if (!workspace) {
        return;
    }
    updateAvailability();
    listen = false;
    workspace.clear();
    const xml = testsXml || BLOCKS.emptySuite(GUISTATE_C.getRobotGroup());
    try {
        Blockly.Xml.domToWorkspace(Blockly.Xml.textToDom(xml, workspace), workspace);
    } catch (e) {
        LOG.error('could not load the test suite: ' + e);
        workspace.clear();
        Blockly.Xml.domToWorkspace(Blockly.Xml.textToDom(BLOCKS.emptySuite(GUISTATE_C.getRobotGroup()), workspace), workspace);
    }
    if (!workspace.getTopBlocks(false).some((b) => b.type === 'nepoTest_suite')) {
        Blockly.Xml.domToWorkspace(Blockly.Xml.textToDom(BLOCKS.emptySuite(GUISTATE_C.getRobotGroup()), workspace), workspace);
    }
    for (const block of workspace.getAllBlocks()) {
        if (block.type === 'nepoTest_simtest' && block.data && block.data.indexOf('"floor"') >= 0) {
            block.data = JSON.stringify(SIM.parseData(block.data)); // without the floor picture of earlier versions: the simulator draws its own
        }
    }
    $('#testsResults, #testsProblems, #testsCoverage').empty();
    $('#testsStatus').text('');
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

// ------------------------------------------------------------------------------------------------ simulation tests

/** the simulation test a block belongs to (the block itself, or the test it is in), or null */
function simTestOf(block: any): any {
    let b = block;
    while (b && b.type !== 'nepoTest_simtest') {
        b = b.getParent();
    }
    return b;
}

/** a simulation test was selected (or a block in it): its world is shown in the Simulation tab */
function openSimOf(blockId: string): void {
    const test = blockId && simTestOf(workspace.getBlockById(blockId));
    if (!test) {
        return;
    }
    if (simEditor.currentBlockId() !== test.id) {
        simEditor.show(test.id, SIM.parseData(test.data), test.getFieldValue('NAME'));
    }
    if (!$('#testsSimPane').is(':visible')) {
        showSide('sim');
    }
}

/** shows the same test again after the workspace was loaded anew (language change, ...), or nothing if it is gone */
function reopenSim(): void {
    if (!simEditor) {
        return;
    }
    const id = simEditor.currentBlockId();
    const test = id && workspace.getBlockById(id);
    if (test && test.type === 'nepoTest_simtest') {
        simEditor.show(test.id, SIM.parseData(test.data), test.getFieldValue('NAME'));
    } else {
        simEditor.show(null, null, '');
    }
}

/** keeps the Simulation tab in step with its test block: renamed, deleted */
function followSimTest(event: any): void {
    const id = simEditor && simEditor.currentBlockId();
    if (!id) {
        return;
    }
    if (event.type === Blockly.Events.DELETE && (event.ids || [event.blockId]).indexOf(id) >= 0) {
        simEditor.show(null, null, '');
    } else if (event.type === Blockly.Events.CHANGE && event.blockId === id && event.element === 'field' && event.name === 'NAME') {
        simEditor.setTitle(event.newValue);
    }
}

/** the simulation window changed the world: it goes into the test block's data (an edit makes the program unsaved, a zoom doesn't) */
function simChanged(data: SIM.SimData, quiet: boolean): void {
    const block = workspace.getBlockById(simEditor.currentBlockId());
    if (!block) {
        return;
    }
    block.data = JSON.stringify(data);
    block.updateThumbnail && block.updateThumbnail();
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

/** the scene of the Lab's simulator (its background, obstacles, coloured areas and robot) as a world, or a message why there is none */
function simulatorScene(): SIM.SimWorld | string {
    const notOpened = GUISTATE_C.getLanguage() === 'de' ? 'Öffne zuerst die Simulation (im Programm-Tab).' : 'Open the simulation first (in the Program tab).';
    let scene: any = null;
    try {
        // @ts-ignore (the simulation is loaded with the Lab; it is used here only if it was opened)
        const simulation = require('simulation.roberta');
        const instance = simulation && (simulation.SimulationRoberta ? simulation.SimulationRoberta.Instance : simulation.default);
        scene = instance && instance.scene;
    } catch (e) {
        scene = null;
    }
    if (!scene || !scene.robots || !scene.robots.length || !scene.backgroundImg) {
        return notOpened;
    }
    const src: string = scene.backgroundImg.src || '';
    const background = src.substring(src.lastIndexOf('/') + 1).replace(/\.(svg|png)$/, '');
    if (!SIM.BACKGROUNDS[background]) {
        return GUISTATE_C.getLanguage() === 'de'
            ? 'Dieser Hintergrund der Simulation geht in Tests nicht (nur die vier des Edison).'
            : 'Tests cannot use this background of the simulation (only the Edison\'s four).';
    }
    const cm = (v: number) => SIM.round2((v - SIM.BORDER) / SIM.UNITS_PER_CM);
    const items: SIM.SimItem[] = [];
    const take = (object: any, role: string, i: number) => {
        const item: SIM.SimItem = { id: 'sim' + role + i, kind: 'rect', role: role, color: object.color };
        if (object.r !== undefined) {
            Object.assign(item, { kind: 'circle', x: cm(object.x), y: cm(object.y), r: SIM.round2(object.r / SIM.UNITS_PER_CM) });
        } else if (object.ax !== undefined) {
            Object.assign(item, {
                kind: 'triangle',
                points: [
                    [cm(object.ax), cm(object.ay)],
                    [cm(object.bx), cm(object.by)],
                    [cm(object.cx), cm(object.cy)],
                ],
            });
        } else if (object.w !== undefined) {
            Object.assign(item, { x: cm(object.x), y: cm(object.y), w: SIM.round2(object.w / SIM.UNITS_PER_CM), h: SIM.round2(object.h / SIM.UNITS_PER_CM) });
        } else {
            return;
        }
        items.push(item);
    };
    (scene.colorAreaList || []).forEach((o, i) => take(o, 'color', i));
    (scene.obstacleList || []).forEach((o, i) => take(o, 'obstacle', i));
    const pose = scene.robots[0].initialPose || scene.robots[0].pose;
    const heading = SIM.round2((-pose.theta * 180) / Math.PI);
    return { background: background, start: { x: cm(pose.x), y: cm(pose.y), heading: ((heading % 360) + 540) % 360 - 180 }, items: items };
}

/** records (record: the run becomes the recorded path) or runs the test shown in the Simulation tab, on the Lab's simulator */
function simulate(record: boolean): void {
    const blockId = simEditor.currentBlockId();
    if (!blockId || running) {
        return;
    }
    running = true;
    cancelled = false;
    simEditor.setBusy(true, RUNNER.isReady() ? null : simEditor.loadingText());
    const done = function (message?: string, isError?: boolean) {
        running = false;
        simEditor.setBusy(false);
        message && simEditor.showMessage(message, isError);
    };
    const xml = programXml();
    RUNNER.simulationTest(serializeSuite(true), blockId, xml)
        .then(function (answer) {
            const errors = answer.problems.filter((p) => p.severity === 'error');
            if (errors.length || !answer.test) {
                done(text('problems') + ' ' + errors.map((p) => p.message).join('; '), true);
                return;
            }
            simEditor.setBusy(true);
            return SIMRUN.runTest(answer.test, xml, { record: record, cancelled: () => cancelled }).then(function (report) {
                done();
                if (report.simulation) {
                    simEditor.showRun(blockId, report, record);
                } else {
                    simEditor.showMessage(report.error ? report.error.message : report.outcome, report.outcome !== 'passed');
                }
            });
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
                        const report = test.simulation ? runSimulationTest(test, xml).then((r) => (simulationReports.push(r), r)) : RUNNER.runOne(i);
                        return report.then((r) => showReport(i, r));
                    });
                });
                return chain
                    .then(() => RUNNER.finish(simulationReports))
                    .then(function (finish) {
                        const s = finish.summary;
                        finishRun(text('done', s.passed, s.failed, s.error));
                        showCoverage(finish.coverage);
                    });
            })
            .then(null, function (err) {
                finishRun(err.message === 'cancelled' ? text('stopped') : text('runnerFailed', err.message));
            });
    });
}

/** a simulation test of the suite, on the Lab's simulator; a failure of the runner itself becomes the test's error */
function runSimulationTest(test: any, xml: string): Promise<any> {
    return SIMRUN.runTest(test, xml, { cancelled: () => cancelled }).then(null, function (err) {
        if (err.message === 'cancelled') {
            throw err;
        }
        return { name: test.name, block_id: test.block_id, outcome: 'error', failures: [], error: { kind: 'test_error', message: err.message } };
    });
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
                    .append($('<span class="nepoTestName"></span>').text(t.name))
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
            if (f.block_id) {
                $f.attr('data-block', f.block_id).attr('data-workspace', 'program').addClass('linked'); // the block that caused the state
            }
            $details.append($f);
        }
    });
    if (report.error) {
        const where = report.error.block_id ? report.error.block_type + (report.error.function ? ' (' + report.error.function + ')' : '') : '';
        const $e = $('<li class="nepoTestError"></li>').text(report.error.block_id ? text('runtimeError', where, report.error.message) : report.error.message);
        if (report.error.block_id) {
            $e.attr('data-block', report.error.block_id).attr('data-workspace', 'program');
        }
        $details.append($e);
    }
    if (report.simulation) {
        simEditor.showRun(report.block_id, report, false); // the run can be replayed in the Simulation tab
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
    if (!coverage) {
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
