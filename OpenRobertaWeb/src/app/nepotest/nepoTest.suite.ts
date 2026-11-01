/**
 * Where a program's test suite lives. The Tests tab edits it in its own workspace; when the program is saved, exported or linked, the test blocks are
 * stored as extra <instance>s of the program's block_set (test block types start with "nepoTest_"), and when a program is loaded they are split off
 * again. They never reach the program workspace and never go to the code generators.
 *
 * The learner's progress in the levels of the Program tab's simulator (levels.player) travels the same way: one more instance with a block
 * "nepoLevel_progress" whose data is the progress (JSON). It is split off when a program is loaded and given to the levels.
 *
 * program.controller uses split/merge; tests.controller registers the workspace with setWorkspace, levels.player its progress with
 * setLevelProgress. No dependency on either, so no import cycle.
 */

const TEST_PREFIX = 'nepoTest_';
const LEVEL_PROGRESS = 'nepoLevel_progress';

let serialize: () => string | null = () => null;
let load: (testsXml: string | null) => void = () => {};
let serializeProgress: () => string | null = () => null;
let loadProgress: (json: string | null) => void = () => {};

/** called by the tests controller: how to read the suite out of its workspace, and how to put a suite into it */
export function setWorkspace(serializer: () => string | null, loader: (testsXml: string | null) => void): void {
    serialize = serializer;
    load = loader;
}

/** called by the levels: their progress to save with the program (JSON; null: none), and how to take a loaded program's progress */
export function setLevelProgress(serializer: () => string | null, loader: (json: string | null) => void): void {
    serializeProgress = serializer;
    loadProgress = loader;
}

function parse(xml: string): Document {
    return new DOMParser().parseFromString(xml, 'text/xml');
}

function firstBlock(instance: Element): Element {
    for (let i = 0; i < instance.childNodes.length; i++) {
        const child = instance.childNodes[i] as Element;
        if (child.nodeType === 1 && child.nodeName === 'block') {
            return child;
        }
    }
    return null;
}

function isTestInstance(instance: Element): boolean {
    const block = firstBlock(instance);
    return !!block && (block.getAttribute('type') || '').indexOf(TEST_PREFIX) === 0;
}

function isProgressInstance(instance: Element): boolean {
    const block = firstBlock(instance);
    return !!block && block.getAttribute('type') === LEVEL_PROGRESS;
}

function instances(blockSet: Element): Element[] {
    const result: Element[] = [];
    for (let i = 0; i < blockSet.childNodes.length; i++) {
        const child = blockSet.childNodes[i] as Element;
        if (child.nodeType === 1 && child.nodeName === 'instance') {
            result.push(child);
        }
    }
    return result;
}

/**
 * { program: the block_set without test instances and progress, tests: a block_set with the test instances, or null, progress: the levels'
 * progress (JSON), or null }
 */
export function split(programXml: string): { program: string; tests: string | null; progress: string | null } {
    if (!programXml || (programXml.indexOf(TEST_PREFIX) < 0 && programXml.indexOf(LEVEL_PROGRESS) < 0)) {
        return { program: programXml, tests: null, progress: null };
    }
    const doc = parse(programXml);
    const root = doc.documentElement;
    if (!root || root.nodeName !== 'block_set') {
        return { program: programXml, tests: null, progress: null };
    }
    const testsDoc = parse('<block_set xmlns="http://de.fhg.iais.roberta.blockly"/>');
    const testsRoot = testsDoc.documentElement;
    for (let i = 0; i < root.attributes.length; i++) {
        testsRoot.setAttribute(root.attributes[i].name, root.attributes[i].value);
    }
    let found = false;
    let progress: string = null;
    for (const instance of instances(root)) {
        if (isTestInstance(instance)) {
            root.removeChild(instance);
            testsRoot.appendChild(testsDoc.importNode(instance, true));
            found = true;
        } else if (isProgressInstance(instance)) {
            root.removeChild(instance);
            const data = firstBlock(instance).getElementsByTagName('data')[0];
            progress = data ? data.textContent : null;
        }
    }
    const serializer = new XMLSerializer();
    return { program: serializer.serializeToString(root), tests: found ? serializer.serializeToString(testsRoot) : null, progress: progress };
}

/** the program block_set with the current test suite (from the Tests tab) and the levels' progress appended as extra instances */
export function merge(programXml: string): string {
    const testsXml = serialize();
    const progress = serializeProgress();
    if (!testsXml && !progress) {
        return programXml;
    }
    const doc = parse(programXml);
    const root = doc.documentElement;
    if (!root || root.nodeName !== 'block_set') {
        return programXml;
    }
    for (const instance of instances(root)) {
        if (isTestInstance(instance) || isProgressInstance(instance)) {
            root.removeChild(instance); // never twice
        }
    }
    const testsRoot = testsXml && parse(testsXml).documentElement;
    if (testsRoot) {
        for (const instance of instances(testsRoot)) {
            root.appendChild(doc.importNode(instance, true));
        }
    }
    if (progress) {
        const instance = doc.createElementNS(root.namespaceURI, 'instance');
        instance.setAttribute('x', '0');
        instance.setAttribute('y', '0');
        const block = doc.createElementNS(root.namespaceURI, 'block');
        block.setAttribute('type', LEVEL_PROGRESS);
        block.setAttribute('id', 'nepoLevelProgress');
        block.setAttribute('intask', 'true');
        const data = doc.createElementNS(root.namespaceURI, 'data');
        data.textContent = progress;
        block.appendChild(data);
        instance.appendChild(block);
        root.appendChild(instance);
    }
    return new XMLSerializer().serializeToString(root);
}

/** the test suite that came with a loaded program (null: the program has none, the Tests tab starts a new one) */
export function loadTests(testsXml: string | null): void {
    load(testsXml);
}

/** the levels' progress that came with a loaded program (null: the program has none, the levels start anew) */
export function loadLevelProgress(json: string | null): void {
    loadProgress(json);
}
