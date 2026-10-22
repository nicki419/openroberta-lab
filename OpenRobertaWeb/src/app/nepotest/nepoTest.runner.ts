/**
 * The client side of the test runner: talks to the Web Worker (nepotest.worker.js) that runs NepoTest in Pyodide.
 * The worker is started on first use; Pyodide is downloaded once (about 12 MB) and then cached by the browser.
 */

/** Pyodide 314.0.7 = CPython 3.14 (NepoTest needs 3.11+); verified with NepoTest's own tests */
export const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/';
const WORKER_URL = 'js/app/nepotest/nepotest.worker.js';
const FILES_URL = '/nepotest/nepotest-files.json';

interface Pending {
    resolve: (data: any) => void;
    reject: (error: Error) => void;
    onEvent?: (event: string, data: any) => void;
}

let worker: Worker = null;
let ready = false;
let nextId = 1;
let pending: { [id: number]: Pending } = {};

function ensureWorker(): Worker {
    if (!worker) {
        worker = new Worker(WORKER_URL, { type: 'module' }); // a module worker: Pyodide is loaded with import() (see nepotest.worker.js)
        worker.onmessage = function (e: MessageEvent) {
            const m = e.data;
            const p = pending[m.id];
            if (!p) {
                return;
            }
            if (m.event === 'error') {
                delete pending[m.id];
                p.reject(new Error(m.message));
            } else if (m.event === 'result' || m.event === 'ready') {
                delete pending[m.id];
                ready = true;
                p.resolve(m.data);
            } else if (p.onEvent) {
                p.onEvent(m.event, m.data);
            }
        };
        worker.onerror = function (e: ErrorEvent) {
            failAll(new Error(e.message || 'the test runner failed'));
        };
    }
    return worker;
}

function failAll(error: Error): void {
    const all = pending;
    pending = {};
    Object.keys(all).forEach((id) => all[id].reject(error));
}

function request(message: any, onEvent?: (event: string, data: any) => void): Promise<any> {
    const id = nextId++;
    return new Promise(function (resolve, reject) {
        pending[id] = { resolve: resolve, reject: reject, onEvent: onEvent };
        message.id = id;
        message.config = { pyodideUrl: PYODIDE_URL, filesUrl: FILES_URL };
        ensureWorker().postMessage(message);
    });
}

/** true once Python is loaded in the worker */
export function isReady(): boolean {
    return ready && worker !== null;
}

/** loads Pyodide and NepoTest (resolves with the Pyodide version) */
export function init(): Promise<any> {
    return request({ cmd: 'init' });
}

/** the test suite (block_set XML) as NepoTest JSON: {spec, problems} */
export function translate(testsXml: string, programXml: string): Promise<any> {
    return request({ cmd: 'translate', testsXml: testsXml, programXml: programXml });
}

/**
 * a suite for a converted program (a NepoTest bundle as JSON string): resolves with {spec, problems, tests, conversion_errors}. Then runOne()
 * runs its tests one by one (the simulation tests run on the Lab's simulator instead: nepoTest.simRun), and finish() sums up.
 */
export function prepare(bundleJson: string, testsXml: string): Promise<any> {
    return request({ cmd: 'prepare', bundle: bundleJson, testsXml: testsXml });
}

/** runs test `index` of the prepared suite: resolves with its report */
export function runOne(index: number): Promise<any> {
    return request({ cmd: 'runOne', index: index });
}

/** the summary and the block coverage of the tests run since prepare(), with the reports of the simulation tests: {summary, coverage} */
export function finish(simulationReports: any[]): Promise<any> {
    return request({ cmd: 'finish', simulationReports: simulationReports });
}

/** one test of the suite on its own, as NepoTest JSON (the Simulation tab's "record" and "run"): resolves with {test, problems} */
export function simulationTest(testsXml: string, blockId: string, programXml: string): Promise<any> {
    return request({ cmd: 'simulationTest', testsXml: testsXml, blockId: blockId, programXml: programXml });
}

/** stops a running suite: the worker is terminated (and Python has to be loaded again next time) */
export function cancel(): void {
    if (worker) {
        worker.terminate();
        worker = null;
        ready = false;
    }
    failAll(new Error('cancelled'));
}
