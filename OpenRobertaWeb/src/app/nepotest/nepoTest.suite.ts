/**
 * Where a program's test suite lives. The Tests tab edits it in its own workspace; when the program is saved, exported or linked, the test blocks are
 * stored as extra <instance>s of the program's block_set (test block types start with "nepoTest_"), and when a program is loaded they are split off
 * again. They never reach the program workspace and never go to the code generators.
 *
 * Other data that belongs to the program travels the same way, each as one more instance with a block of its own whose data is JSON (extras):
 * - "nepoLevel_progress": the learner's progress in the levels of the Program tab's simulator (levels.player);
 * - "nepoAi_notes": what the learner told the AI test assistant about the program (levels.aiAssistant).
 * They are split off when a program is loaded and given to their owners.
 *
 * program.controller uses split/merge; tests.controller registers the workspace with setWorkspace, levels.player its progress with
 * setLevelProgress, the assistant its notes with setAiNotes. No dependency on any of them, so no import cycle.
 */

const TEST_PREFIX = 'nepoTest_';
const LEVEL_PROGRESS = 'nepoLevel_progress';
const AI_NOTES = 'nepoAi_notes';

interface Extra {
    id: string; // the block's id
    serialize: () => string | null;
    load: (json: string | null) => void;
}

let serialize: () => string | null = () => null;
let load: (testsXml: string | null) => void = () => {};
const extras: { [type: string]: Extra } = {
    [LEVEL_PROGRESS]: { id: 'nepoLevelProgress', serialize: () => null, load: () => {} },
    [AI_NOTES]: { id: 'nepoAiNotes', serialize: () => null, load: () => {} },
};

/** called by the tests controller: how to read the suite out of its workspace, and how to put a suite into it */
export function setWorkspace(serializer: () => string | null, loader: (testsXml: string | null) => void): void {
    serialize = serializer;
    load = loader;
}

/** called by the levels: their progress to save with the program (JSON; null: none), and how to take a loaded program's progress */
export function setLevelProgress(serializer: () => string | null, loader: (json: string | null) => void): void {
    extras[LEVEL_PROGRESS].serialize = serializer;
    extras[LEVEL_PROGRESS].load = loader;
}

/** called by the AI test assistant: its notes to save with the program (JSON; null: none), and how to take a loaded program's notes */
export function setAiNotes(serializer: () => string | null, loader: (json: string | null) => void): void {
    extras[AI_NOTES].serialize = serializer;
    extras[AI_NOTES].load = loader;
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

/** the type of an instance's extra (LEVEL_PROGRESS, AI_NOTES), or null */
function extraOf(instance: Element): string {
    const block = firstBlock(instance);
    const type = block && block.getAttribute('type');
    return type && extras[type] ? type : null;
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
 * { program: the block_set without test instances and extras, tests: a block_set with the test instances, or null, extras: per type the
 * extra's data (JSON; e.g. the levels' progress) }
 */
export function split(programXml: string): { program: string; tests: string | null; extras: { [type: string]: string } } {
    if (!programXml || (programXml.indexOf(TEST_PREFIX) < 0 && !Object.keys(extras).some((type) => programXml.indexOf(type) >= 0))) {
        return { program: programXml, tests: null, extras: {} };
    }
    const doc = parse(programXml);
    const root = doc.documentElement;
    if (!root || root.nodeName !== 'block_set') {
        return { program: programXml, tests: null, extras: {} };
    }
    const testsDoc = parse('<block_set xmlns="http://de.fhg.iais.roberta.blockly"/>');
    const testsRoot = testsDoc.documentElement;
    for (let i = 0; i < root.attributes.length; i++) {
        testsRoot.setAttribute(root.attributes[i].name, root.attributes[i].value);
    }
    let found = false;
    const data: { [type: string]: string } = {};
    for (const instance of instances(root)) {
        const extra = extraOf(instance);
        if (isTestInstance(instance)) {
            root.removeChild(instance);
            testsRoot.appendChild(testsDoc.importNode(instance, true));
            found = true;
        } else if (extra) {
            root.removeChild(instance);
            const element = firstBlock(instance).getElementsByTagName('data')[0];
            element && (data[extra] = element.textContent);
        }
    }
    const serializer = new XMLSerializer();
    return { program: serializer.serializeToString(root), tests: found ? serializer.serializeToString(testsRoot) : null, extras: data };
}

/** the program block_set with the current test suite (from the Tests tab) and the extras (the levels' progress, …) appended as instances */
export function merge(programXml: string): string {
    const testsXml = serialize();
    const data: { [type: string]: string } = {};
    Object.keys(extras).forEach((type) => {
        const json = extras[type].serialize();
        json && (data[type] = json);
    });
    if (!testsXml && !Object.keys(data).length) {
        return programXml;
    }
    const doc = parse(programXml);
    const root = doc.documentElement;
    if (!root || root.nodeName !== 'block_set') {
        return programXml;
    }
    for (const instance of instances(root)) {
        if (isTestInstance(instance) || extraOf(instance)) {
            root.removeChild(instance); // never twice
        }
    }
    const testsRoot = testsXml && parse(testsXml).documentElement;
    if (testsRoot) {
        for (const instance of instances(testsRoot)) {
            root.appendChild(doc.importNode(instance, true));
        }
    }
    Object.keys(data).forEach((type) => {
        const instance = doc.createElementNS(root.namespaceURI, 'instance');
        instance.setAttribute('x', '0');
        instance.setAttribute('y', '0');
        const block = doc.createElementNS(root.namespaceURI, 'block');
        block.setAttribute('type', type);
        block.setAttribute('id', extras[type].id);
        block.setAttribute('intask', 'true');
        const element = doc.createElementNS(root.namespaceURI, 'data');
        element.textContent = data[type];
        block.appendChild(element);
        instance.appendChild(block);
        root.appendChild(instance);
    });
    return new XMLSerializer().serializeToString(root);
}

/** the test suite that came with a loaded program (null: the program has none, the Tests tab starts a new one) */
export function loadTests(testsXml: string | null): void {
    load(testsXml);
}

/** the extras that came with a loaded program, each to its owner (an extra the program hasn't: null, its owner starts anew) */
export function loadExtras(data: { [type: string]: string }): void {
    Object.keys(extras).forEach((type) => {
        try {
            extras[type].load(data[type] !== undefined ? data[type] : null);
        } catch (e) {
            console.error(e);
        }
    });
}
