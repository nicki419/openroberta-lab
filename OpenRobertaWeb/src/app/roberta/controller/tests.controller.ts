/**
 * The Tests tab: learners build a test suite for their program from NEPO test blocks (nepoTest.blocks), look at the code it turns into and run it.
 *
 * - the workspace (#testsBlocklyDiv) holds the red start block of the suite, test blocks, and "run test" blocks below the start block
 * - the suite is saved with the program (nepoTest.suite: extra instances of the program's XML)
 * - "Code" shows the suite as NepoTest JSON and the program's generated EdPy
 * - "Test runner" converts the program with the Lab (REST /projectWorkflow/sourceForTest: EdPy + source map) and runs the suite in the browser
 *   with NepoTest in Pyodide (nepoTest.runner); results come back per test, errors and coverage per block
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

const SUPPORTED_GROUPS = ['edison'];

let workspace: any = null;
let listen = false;
let blocksLanguage: string = null;
let codeView: 'json' | 'edpy' = 'json';
let codeTimer: any = null;
let running = false;

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
        if (!listen || event.type === Blockly.Events.UI) {
            return;
        }
        if (GUISTATE_C.isProgramSaved()) {
            GUISTATE_C.setProgramSaved(false);
        }
        renameRunBlocks(event);
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
        testsRunButton: '▶ Run tests',
        testsStopButton: 'Stop',
        testsCodeJson: 'Tests (JSON)',
        testsCodeEdpy: 'Program (EdPy)',
    },
    de: {
        testsRunnerTab: 'Testlauf',
        testsCodeTab: 'Code',
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
    },
    de: {
        converting: 'Das Programm wird übersetzt…',
        loadingPython: 'Der Testlauf startet (beim ersten Mal wird Python geladen: etwa 12 MB)…',
        running: 'Test {0} von {1} läuft…',
        passed: 'bestanden',
        failed: 'fehlgeschlagen',
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
    if (!changed || changed.type !== 'nepoTest_test') {
        return;
    }
    for (const block of workspace.getAllBlocks()) {
        if (block.type === 'nepoTest_run' && block.getFieldValue('NAME') === event.oldValue) {
            block.setFieldValue(event.newValue, 'NAME');
        }
    }
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
    $('#testsResults, #testsProblems, #testsCoverage').empty();
    $('#testsStatus').text('');
    setTimeout(() => (listen = true), 300);
}

// ------------------------------------------------------------------------------------------------ the side panel

function showSide(which: string): void {
    $('#testsRunnerTab').toggleClass('active', which === 'runner');
    $('#testsCodeTab').toggleClass('active', which === 'code');
    $('#testsRunnerPane').toggle(which === 'runner');
    $('#testsCodePane').toggle(which === 'code');
    if (which === 'code') {
        refreshCode();
    }
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

function runTests(): void {
    if (running) {
        return;
    }
    running = true;
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
        const bundle = {
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
        $('#testsStatus').text(RUNNER.isReady() ? '' : text('loadingPython'));
        let total = 0;
        RUNNER.run(JSON.stringify(bundle), testsXml, onPrepared, onProgress).then(
            function (data) {
                if (data.finish) {
                    const s = data.finish.summary;
                    finishRun(text('done', s.passed, s.failed, s.error));
                    showCoverage(data.finish.coverage);
                } else {
                    finishRun('');
                }
            },
            function (err) {
                finishRun(err.message === 'cancelled' ? text('stopped') : text('runnerFailed', err.message));
            }
        );

        function onPrepared(prepared: any): void {
            if (prepared.conversion_errors.length) {
                showList(
                    text('conversion'),
                    prepared.conversion_errors.map((e) => ({ message: e.block_type + ': ' + (Blockly.Msg[e.key] || e.key), block: e.block_id, where: 'program' }))
                );
                return;
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
                return; // nothing runs: the problems above say why
            }
            total = prepared.tests.length;
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
            $('#testsStatus').text(total ? text('running', 1, total) : '');
        }

        function onProgress(index: number, report: any): void {
            const $li = $('#nepoTestResult' + index).removeClass('waiting').addClass(report.outcome);
            $li.find('.nepoTestOutcome').text(text(report.outcome));
            const $details = $('<ul class="nepoTestDetails"></ul>');
            (report.failures || []).forEach(function (f) {
                if (!(f.expect === 'error' && f.expected === null && report.error)) {
                    $details.append($('<li></li>').text(describeFailure(f))); // an unexpected runtime error is shown once, below
                }
            });
            if (report.error) {
                const where = report.error.block_id ? report.error.block_type + (report.error.function ? ' (' + report.error.function + ')' : '') : '';
                const $e = $('<li class="nepoTestError"></li>').text(
                    report.error.block_id ? text('runtimeError', where, report.error.message) : report.error.message
                );
                if (report.error.block_id) {
                    $e.attr('data-block', report.error.block_id).attr('data-workspace', 'program');
                }
                $details.append($e);
            }
            $li.append($details);
            if (index + 1 < total) {
                $('#testsStatus').text(text('running', index + 2, total));
            }
        }
    });
}

function describeFailure(f: any): string {
    const show = (v) => (v === undefined ? '—' : JSON.stringify(v));
    let s = f.expect + ': ' + show(f.expected) + ' ≠ ' + show(f.actual);
    if (f.message) {
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
