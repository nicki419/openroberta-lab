/**
 * Where a program's test suite lives. The Tests tab edits it in its own workspace; when the program is saved, exported or linked, the test blocks are
 * stored as extra <instance>s of the program's block_set (test block types start with "nepoTest_"), and when a program is loaded they are split off
 * again. They never reach the program workspace and never go to the code generators.
 *
 * program.controller uses split/merge; tests.controller registers the workspace with setWorkspace. No dependency on either, so no import cycle.
 */

const TEST_PREFIX = 'nepoTest_';

let serialize: () => string | null = () => null;
let load: (testsXml: string | null) => void = () => {};

/** called by the tests controller: how to read the suite out of its workspace, and how to put a suite into it */
export function setWorkspace(serializer: () => string | null, loader: (testsXml: string | null) => void): void {
    serialize = serializer;
    load = loader;
}

function parse(xml: string): Document {
    return new DOMParser().parseFromString(xml, 'text/xml');
}

function isTestInstance(instance: Element): boolean {
    for (let i = 0; i < instance.childNodes.length; i++) {
        const child = instance.childNodes[i] as Element;
        if (child.nodeType === 1 && child.nodeName === 'block') {
            return (child.getAttribute('type') || '').indexOf(TEST_PREFIX) === 0;
        }
    }
    return false;
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

/** { program: the block_set without test instances, tests: a block_set with the test instances, or null } */
export function split(programXml: string): { program: string; tests: string | null } {
    if (!programXml || programXml.indexOf(TEST_PREFIX) < 0) {
        return { program: programXml, tests: null };
    }
    const doc = parse(programXml);
    const root = doc.documentElement;
    if (!root || root.nodeName !== 'block_set') {
        return { program: programXml, tests: null };
    }
    const testsDoc = parse('<block_set xmlns="http://de.fhg.iais.roberta.blockly"/>');
    const testsRoot = testsDoc.documentElement;
    for (let i = 0; i < root.attributes.length; i++) {
        testsRoot.setAttribute(root.attributes[i].name, root.attributes[i].value);
    }
    let found = false;
    for (const instance of instances(root)) {
        if (isTestInstance(instance)) {
            root.removeChild(instance);
            testsRoot.appendChild(testsDoc.importNode(instance, true));
            found = true;
        }
    }
    const serializer = new XMLSerializer();
    return { program: serializer.serializeToString(root), tests: found ? serializer.serializeToString(testsRoot) : null };
}

/** the program block_set with the current test suite (from the Tests tab) appended as extra instances */
export function merge(programXml: string): string {
    const testsXml = serialize();
    if (!testsXml) {
        return programXml;
    }
    const doc = parse(programXml);
    const root = doc.documentElement;
    const testsRoot = parse(testsXml).documentElement;
    if (!root || root.nodeName !== 'block_set' || !testsRoot) {
        return programXml;
    }
    for (const instance of instances(root)) {
        if (isTestInstance(instance)) {
            root.removeChild(instance); // never twice
        }
    }
    for (const instance of instances(testsRoot)) {
        root.appendChild(doc.importNode(instance, true));
    }
    return new XMLSerializer().serializeToString(root);
}

/** the test suite that came with a loaded program (null: the program has none, the Tests tab starts a new one) */
export function loadTests(testsXml: string | null): void {
    load(testsXml);
}
