/**
 * The AI test assistant's test JSON and the Tests tab's blocks, both ways. The JSON is described for the model in
 * OpenRobertaServer/src/main/resources/ai/tests.md, its schema is ai/schemas/generate.schema.json:
 *
 *   {worlds: [{name, world: {background: 'peach', size, starts, items} | base: 'existing',
 *              tests: [{name, scenario, start, until, max_time_ms, world: [{event: 'clap' | 'key', port, at}], globals: {name: value}, checks: [...],
 *                       and what the test is for: STRATEGY_FIELDS (scenario_id, path_ids, planned_branch_ids, input_selection, ...)}]}],
 *    generation_status, coverage_plan, consolidation_notes, deferred_scenarios, warnings}
 *
 * The fields of what a test is for are kept as the model wrote them and checked by nepoTest.aiStrategy (against the analysis); the blocks don't have
 * them (they are in the test's provenance: generated).
 *
 * The model never gets the level the learner plays: it draws the world of each test itself (or adds tests to a world of the learner's).
 * - suiteToJson: the simulation worlds of the Tests tab and their tests, as the model reads them, each world in full.
 * - checkAnswer: a generated answer made whole (each world as drawn, or the learner's world it names) and checked: its structure, the things on its
 *   floor, names, ids, roles and variables. The problems go back to the model (a repair); NepoTest's translator checks the rest (geometry: a start
 *   outside the floor or on an obstacle), see nepoTest.ai.
 * - suiteXml / addToWorkspace: the tests as blocks: a world block with its data and tests (nepoTest_simcase), their set-up (claps, keys,
 *   variables) and checks. This is the inverse of NepoTest/nepotest/blocks.py: blocks made from JSON translate back to the same tests
 *   (NepoTest/tests/test_ai_format.py).
 * - duplicates: a test with the same world, start, set-up, end of the run and checks as another one.
 *
 * A test the assistant added keeps where it came from in its block's data: {ai: {call, block, scenario, generated, added}}. `block` is its id when
 * it was added, so a copy of it (another id) can be told apart from it. The world's data stays the drawn world only.
 */
// @ts-ignore (Blockly has no type declarations)
import * as Blockly from 'blockly';
import * as SIM from 'nepoTest.sim';
import * as BLOCKS from 'nepoTest.blocks';
import * as BEHAVIOUR from 'nepoTest.simBehaviour';

export type Value = number | boolean | number[];

export interface AiEvent {
    event: string; // clap | key
    at: number;
    port?: string; // a key: PLAY | REC
}

export interface AiCheck {
    check: string;
    item?: string;
    does?: string;
    after_ms?: number;
    when?: string;
    percent?: number;
    event?: string;
    within_ms?: number;
    variable?: string;
    op?: string;
    value?: Value;
}

export interface AiTest {
    name: string;
    scenario?: string;
    start: string;
    until?: string | null;
    max_time_ms: number;
    world?: AiEvent[];
    globals?: { [name: string]: Value };
    checks: AiCheck[];
    skip?: boolean; // the learner's tests: switched off
    origin?: string; // the learner's tests: 'ai' if the assistant wrote it
    // what a generated test is for (the testing strategy: nepoTest.aiStrategy checks them against the analysis; the blocks don't have them)
    scenario_id?: string;
    path_ids?: string[];
    planned_branch_ids?: string[];
    input_selection?: any; // {equivalence_partitions: [{dimension, class, selected_realization, realized_by}]} (older answers: boundary_values too, ignored)
    expected_results?: string[];
    postconditions?: { description: string; check_indices: number[] }[];
    oracle?: { basis: string; confidence: string; assumptions: string[]; review_required: boolean };
    source_block_ids?: string[];
    reason?: string;
}

/** the fields of a generated test that say what it is for: kept as the model wrote them (copies), checked by nepoTest.aiStrategy */
export const STRATEGY_FIELDS = ['scenario_id', 'path_ids', 'planned_branch_ids', 'input_selection', 'expected_results', 'postconditions', 'oracle', 'source_block_ids', 'reason'];

export interface AiWorld {
    name: string;
    world?: SIM.SimWorld; // the world in full (drawn by the model, or one of the learner's)
    base?: string; // existing: the learner's world of this name (an answer only, instead of world)
    tests: AiTest[];
}

export interface AiTests {
    worlds: AiWorld[];
}

/** what an answer is checked against (nothing of the level: the model doesn't know it) */
export interface Context {
    existing: AiTests; // the learner's tests (suiteToJson)
    variables: string[]; // the program's global variables
    names: string[]; // the names of the tests and worlds in the Tests tab (one namespace)
}

/** a world of an answer, made whole */
export interface Resolved {
    name: string;
    existing: boolean; // the learner's world of this name: the tests go into it
    data: SIM.SimData;
    tests: AiTest[];
}

export interface Problem {
    world: string;
    test: string | null; // null: the world itself
    message: string;
}

/** where an AI test came from (in its block's data) */
export interface Provenance {
    call: string; // the id of the call that wrote it, generate or fix (callId of its ai_call in the telemetry)
    block?: string; // the block's id when it was added
    scenario: string;
    generated: AiTest; // the test as the model wrote it
    added?: string; // ISO time
    asAdded?: string; // the test when it was added (signatureOf): it was edited if it differs now
    checked?: { passed: boolean; fixes: number; notChecked?: string[] }; // how it ran on the program before it was added (passed null: it couldn't run), how often it was fixed, why it wasn't checked (added anyway)
    // the outcomes of the program's decisions its run should take (planned) and how often its check run took them (seen); the oracle's basis
    coverage?: { planned: { outcome: string; block: string; words: string }[]; seen: { [outcome: string]: number } };
    basis?: string; // learner_description | inferred_from_program | applicable_safety
    stale?: boolean; // the program changed between writing and checking it
}

const NS = 'http://de.fhg.iais.roberta.blockly';
const KINDS = ['rect', 'circle', 'triangle', 'line', 'tunnel'];
const ROLES = ['obstacle', 'goal', 'fail'];
const OPS = ['EQ', 'NEQ', 'LT', 'LTE', 'GT', 'GTE'];
const PORTS = ['PLAY', 'REC'];
export const MAX_TIME_MS = 120000;
const DOES = Object.keys(BEHAVIOUR.DOES);
const CONDITIONS = Object.keys(BEHAVIOUR.CONDITIONS);
const EVENTS = Object.keys(BEHAVIOUR.EVENTS);
const LIGHT = /_light_/;
const CHECK_BLOCKS: { [check: string]: string } = {
    reaches: 'nepoTest_check_reaches',
    never_touches: 'nepoTest_check_never_touches',
    ends_in: 'nepoTest_check_ends_in',
    never_bumps: 'nepoTest_check_never_bumps',
    does: 'nepoTest_check_does',
    whenever: 'nepoTest_check_whenever',
    after: 'nepoTest_check_after',
    variable: 'nepoTest_check_variable',
};

// ------------------------------------------------------------------------------------------------ blocks → JSON

/** the simulation worlds of a Tests workspace and their tests (each world in full); a given / when / then test isn't part of it */
export function suiteToJson(workspace: any): AiTests {
    const worlds: AiWorld[] = [];
    for (const top of workspace.getTopBlocks(true)) {
        if (top.type === BLOCKS.WORLD && !top.disabled) {
            worlds.push({ name: top.getFieldValue('NAME'), world: SIM.parseData(top.data).world, tests: BLOCKS.testsOf(top).map(testOfBlock) });
        }
    }
    return { worlds: worlds };
}

/** a test of a world (a nepoTest_simcase block) as JSON */
export function testOfBlock(block: any): AiTest {
    const test: AiTest = {
        name: block.getFieldValue('NAME'),
        start: block.getFieldValue('START') || '',
        until: block.getFieldValue('MODE') === 'until' ? block.getFieldValue('UNTIL') || null : null,
        max_time_ms: secondsToMs(block.getFieldValue('SECONDS')),
        world: [],
        globals: {},
        checks: [],
    };
    for (const b of chain(block, 'SETUP')) {
        if (b.type === 'nepoTest_given_clap') {
            test.world.push({ event: 'clap', at: whole(b.getFieldValue('AT')) });
        } else if (b.type === 'nepoTest_given_key') {
            test.world.push({ event: 'key', port: b.getFieldValue('PORT'), at: whole(b.getFieldValue('AT')) });
        } else if (b.type === 'nepoTest_given_variable') {
            test.globals[b.getFieldValue('VAR')] = literalOf(b.getInputTargetBlock('VALUE'));
        }
    }
    for (const b of chain(block, 'CHECKS')) {
        const check = checkOfBlock(b);
        check && test.checks.push(check);
    }
    const ai = provenanceOf(block);
    ai && ai.scenario && (test.scenario = ai.scenario);
    ai && (test.origin = 'ai');
    block.getFieldValue('ACTIVE') === 'FALSE' && (test.skip = true);
    return test;
}

function checkOfBlock(b: any): AiCheck {
    const kind = Object.keys(CHECK_BLOCKS).filter((k) => CHECK_BLOCKS[k] === b.type)[0];
    if (!kind) {
        return null;
    }
    const check: AiCheck = { check: kind };
    if (kind === 'reaches' || kind === 'ends_in') {
        const area = b.getFieldValue('AREA');
        area && area !== BLOCKS.ANY_ITEM && (check.item = area);
    } else if (kind === 'never_bumps') {
        const obstacle = b.getFieldValue('OBSTACLE');
        obstacle && obstacle !== BLOCKS.ANY_ITEM && (check.item = obstacle);
    } else if (kind === 'does') {
        check.does = b.getFieldValue('DOES');
        check.after_ms = whole(b.getFieldValue('AFTER'));
    } else if (kind === 'whenever') {
        check.when = b.getFieldValue('WHEN');
        LIGHT.test(check.when) && (check.percent = whole(b.getFieldValue('PERCENT')));
        check.does = b.getFieldValue('DOES');
        check.after_ms = whole(b.getFieldValue('AFTER'));
    } else if (kind === 'after') {
        check.event = b.getFieldValue('EVENT');
        check.within_ms = whole(b.getFieldValue('WITHIN'));
        check.does = b.getFieldValue('DOES');
    } else if (kind === 'variable') {
        check.variable = b.getFieldValue('VAR');
        check.op = b.getFieldValue('OP');
        check.value = literalOf(b.getInputTargetBlock('VALUE'));
    }
    return check;
}

/** the value of a literal block: a number, true / false, a list of numbers; null if there is none */
function literalOf(b: any): Value {
    if (!b) {
        return null;
    }
    if (b.type === 'math_number' || b.type === 'math_integer') {
        return Number(b.getFieldValue('NUM'));
    }
    if (b.type === 'logic_boolean') {
        return b.getFieldValue('BOOL') === 'TRUE';
    }
    if (b.type === 'robLists_create_with') {
        const items: number[] = [];
        for (let i = 0; b.getInput('ADD' + i); i++) {
            items.push(literalOf(b.getInputTargetBlock('ADD' + i)) as number);
        }
        return items;
    }
    return null;
}

/** where an AI test block came from, or null (a test of the learner's) */
export function provenanceOf(block: any): Provenance {
    try {
        const data = block && block.data ? JSON.parse(block.data) : null;
        return data && data.ai ? data.ai : null;
    } catch (e) {
        return null;
    }
}

/**
 * a test block as the learner can change it: its name, run length, switch and meaning (meaningOf, in its world). An AI test whose signature differs
 * from the one it had when it was added (Provenance.asAdded) was edited; one outside a world has none of a world.
 */
export function signatureOf(block: any): string {
    let world = block.getSurroundParent();
    while (world && world.type !== BLOCKS.WORLD) {
        world = world.getSurroundParent();
    }
    const test = testOfBlock(block);
    return canonical({ name: test.name, max_time_ms: test.max_time_ms, skip: !!test.skip, meaning: world ? meaningOf(test, SIM.parseData(world.data).world) : null });
}

/** was an AI test edited since it was added? null: a test of the learner's, or one added before this was recorded */
export function isEdited(block: any): boolean {
    const p = provenanceOf(block);
    return p && p.asAdded ? signatureOf(block) !== p.asAdded : null;
}

function chain(block: any, input: string): any[] {
    const blocks = [];
    for (let b = block.getInputTargetBlock(input); b; b = b.getNextBlock()) {
        !b.disabled && blocks.push(b);
    }
    return blocks;
}

function whole(text: any): number {
    const n = parseInt(String(text), 10);
    return isNaN(n) ? 0 : n;
}

/** a run's length in s (one decimal, as the field holds it) in ms, as blocks.py reads it */
function secondsToMs(text: any): number {
    const s = parseFloat(String(text).replace(',', '.'));
    return isNaN(s) ? 5000 : Math.round(s * 10) * 100;
}

// ------------------------------------------------------------------------------------------------ checking an answer

/**
 * an answer made whole and checked: {worlds, problems}. A world or test with problems is still in `worlds` (the problems name it), so the answer
 * can be repaired or the broken tests left out (without). own: the learner's tests (suiteToJson), not an answer: no scenarios, worlds as they are.
 */
export function checkAnswer(answer: any, ctx: Context, own = false): { worlds: Resolved[]; problems: Problem[] } {
    const problems: Problem[] = [];
    const worlds: Resolved[] = [];
    const add = (world: string, test: string, message: string) => problems.push({ world: world, test: test, message: message });
    if (!answer || !Array.isArray(answer.worlds) || !answer.worlds.length) {
        add('', null, 'the answer has no worlds');
        return { worlds: worlds, problems: problems };
    }
    const names: string[] = [];
    const taken = (name: string) => ctx.names.indexOf(name) >= 0 || names.indexOf(name) >= 0;
    const generated = !own; // the learner's own suite (blocks → JSON → blocks) has no scenarios and needs no checks of its things
    for (const w of answer.worlds) {
        const wname = text(w && w.name);
        if (!wname) {
            add('', null, 'a world has no name');
            continue;
        }
        const resolved = resolveWorld(w, wname, ctx, (message) => add(wname, null, message), generated);
        if (!resolved) {
            continue;
        }
        if (!resolved.existing) {
            taken(wname) ? add(wname, null, 'the name "' + wname + '" is taken: give the world another name') : names.push(wname);
        }
        const world = resolved.data.world;
        const tests: AiTest[] = Array.isArray(w.tests) ? w.tests : [];
        if (!tests.length) {
            add(wname, null, 'the world has no tests');
        }
        for (const raw of tests) {
            const name = text(raw && raw.name);
            if (!name) {
                add(wname, null, 'a test has no name');
                continue;
            }
            if (taken(name)) {
                add(wname, name, 'the name "' + name + '" is taken: give the test another name');
            }
            names.push(name);
            const test = checkTest(raw, world, ctx, generated, (message) => add(wname, name, message));
            resolved.tests.push(test);
        }
        worlds.push(resolved);
    }
    return { worlds: worlds, problems: problems };
}

/** a world of an answer, made whole (null if it can't be): as drawn (checked thing by thing if generated), or the learner's world it names */
function resolveWorld(w: any, name: string, ctx: Context, problem: (message: string) => void, generated: boolean): Resolved {
    if (w.base === 'existing') {
        const own = ctx.existing.worlds.filter((e) => e.name === name)[0];
        if (!own) {
            problem('there is no world named "' + name + '" among the learner\'s tests: draw the world instead (world)');
            return null;
        }
        w.world && problem('the learner\'s world can\'t be changed: leave out world, or draw a new world with another name');
        return { name: name, existing: true, data: dataOf(own.world), tests: [] };
    }
    const drawn = w.world;
    if (!drawn || typeof drawn !== 'object') {
        problem('draw the world (world: background, starts, items), or add to a world of the learner\'s (base "existing")');
        return null;
    }
    if (!generated) {
        return { name: name, existing: false, data: dataOf(drawn), tests: [] }; // the learner's own (blocks → JSON → blocks)
    }
    drawn.background === SIM.PEACH || problem('the world\'s background must be "peach"');
    const world: SIM.SimWorld = { background: SIM.PEACH, starts: [], items: [] };
    if (drawn.size !== undefined && drawn.size !== null) {
        const ok = drawn.size && [drawn.size.w, drawn.size.h].every((v: any) => isWhole(v) && v >= SIM.FLOOR_MIN_CM && v <= SIM.FLOOR_MAX_CM);
        ok ? (world.size = { w: drawn.size.w, h: drawn.size.h }) : problem('size: w and h are whole cm from ' + SIM.FLOOR_MIN_CM + ' to ' + SIM.FLOOR_MAX_CM);
    }
    const [width, height] = SIM.backgroundSize(world).map((u) => u / SIM.UNITS_PER_CM);
    for (const item of Array.isArray(drawn.items) ? drawn.items : []) {
        const message = itemProblem(item, world, width, height);
        message ? problem('items: ' + message) : world.items.push(cleanItem(item));
    }
    for (const start of Array.isArray(drawn.starts) ? drawn.starts : []) {
        const id = text(start && start.id);
        if (!id || world.starts.some((s) => s.id === id)) {
            problem('starts: ' + (id ? 'there are two starts "' + id + '"' : 'a start has no id'));
        } else if (![start.x, start.y, start.heading].every(isNumber)) {
            problem('starts: start "' + id + '" needs x, y and heading as numbers');
        } else {
            world.starts.push({ id: id, name: text(start.name) || id, x: SIM.round2(start.x), y: SIM.round2(start.y), heading: SIM.round2(start.heading) });
        }
    }
    world.starts.length || problem('the world has no start');
    tunnelProblems(world).forEach((m) => problem('items: ' + m));
    return { name: name, existing: false, data: dataOf(world), tests: [] };
}

const ROBOT_WIDTH_CM = 7.5;
const ROOMY_TUNNEL_CM = 30; // in a tunnel at least this wide the robot can drive around a block (a dark room)

/**
 * the obstacles inside a tunnel narrower than ROOMY_TUNNEL_CM that don't close it: the robot, 7.5 cm wide, can't get around them in there, and bumps
 * into them. 2026-11-06: "a wall on the left in dim light" was a 2 × 2.5 cm box inside a 15 cm tunnel, in the robot's way, and the test failed on a
 * right program; the tunnel's own walls, in a bend, are what such a test needs (simulator runs: bends 15 and 20 cm wide, the robot gets through
 * without bumping). A wall across the whole tunnel (for a stop in dim light) is fine.
 */
export function tunnelProblems(world: SIM.SimWorld): string[] {
    const out: string[] = [];
    const tunnels = (world.items || []).filter((t) => t.kind === 'tunnel' && Array.isArray(t.points) && t.points.length > 1);
    (world.items || [])
        .filter((i) => i.role === 'obstacle' && i.kind !== 'tunnel')
        .forEach((item) => {
            const outline = outlineOf(item);
            if (!outline.length) {
                return;
            }
            const cx = outline.reduce((s, p) => s + p[0], 0) / outline.length;
            const cy = outline.reduce((s, p) => s + p[1], 0) / outline.length;
            tunnels.forEach((t) => {
                const width = isNumber(t.width) ? t.width : 15;
                const near = nearestSegment(t.points, cx, cy);
                if (width >= ROOMY_TUNNEL_CM || near.distance >= width / 2) {
                    return;
                }
                const across = outline.map(([x, y]) => -x * near.uy + y * near.ux); // along the tunnel's normal
                const extent = Math.max(...across) - Math.min(...across);
                if (extent < width - 2) {
                    out.push(
                        'item "' +
                            item.id +
                            '" is inside the tunnel "' +
                            t.id +
                            '" (' +
                            width +
                            ' cm wide), and leaves no room to get around it: the robot is ' +
                            ROBOT_WIDTH_CM +
                            ' cm wide and bumps into it. Nothing goes inside a tunnel but a line on the floor, or a wall across the whole tunnel for a stop in dim light. For walls on its left or right in dim light, bend the tunnel: its own walls are those walls ("Dim light: walls on its left or right" in "Tests")'
                    );
                }
            });
        });
    return out;
}

/** the corners or points of an item (cm) */
function outlineOf(item: SIM.SimItem): number[][] {
    if (item.kind === 'rect' && [item.x, item.y, item.w, item.h].every(isNumber)) {
        return [
            [item.x, item.y],
            [item.x + item.w, item.y],
            [item.x, item.y + item.h],
            [item.x + item.w, item.y + item.h],
        ];
    }
    if (item.kind === 'circle' && [item.x, item.y, item.r].every(isNumber)) {
        return [
            [item.x - item.r, item.y],
            [item.x + item.r, item.y],
            [item.x, item.y - item.r],
            [item.x, item.y + item.r],
        ];
    }
    return Array.isArray(item.points) ? item.points.filter((p) => Array.isArray(p) && p.length === 2 && p.every(isNumber)) : [];
}

/** the segment of a polyline nearest to a point: the distance, and the segment's direction (unit) */
function nearestSegment(points: number[][], px: number, py: number): { distance: number; ux: number; uy: number } {
    let best = { distance: Infinity, ux: 1, uy: 0 };
    for (let k = 1; k < points.length; k++) {
        const [x1, y1] = points[k - 1];
        const [x2, y2] = points[k];
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.hypot(dx, dy) || 1;
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (length * length)));
        const distance = Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
        distance < best.distance && (best = { distance: distance, ux: dx / length, uy: dy / length });
    }
    return best;
}

/** a world as the data of a world block (the editor's view: the whole floor) */
function dataOf(world: SIM.SimWorld): SIM.SimData {
    const data = SIM.parseData(JSON.stringify({ version: SIM.DATA_VERSION, world: world }));
    const [w, h] = SIM.backgroundSize(data.world).map((u) => u / SIM.UNITS_PER_CM);
    data.view = { x: w / 2, y: h / 2, scale: 3 };
    return data;
}

function itemProblem(item: any, world: SIM.SimWorld, width: number, height: number): string {
    const id = text(item && item.id);
    if (!id) {
        return 'an item has no id';
    }
    if (world.items.some((i) => i.id === id)) {
        return 'there is an item "' + id + '" already';
    }
    if (KINDS.indexOf(item.kind) < 0) {
        return 'item "' + id + '": kind must be rect, circle, triangle, line or tunnel';
    }
    if (item.role !== undefined && item.role !== null && ROLES.indexOf(item.role) < 0) {
        return 'item "' + id + '": role must be obstacle, goal or fail';
    }
    if (item.kind === 'tunnel' && item.role !== 'obstacle') {
        return 'item "' + id + '": a tunnel has the role obstacle';
    }
    if (item.kind === 'tunnel' && item.width !== undefined && !(isNumber(item.width) && item.width >= SIM.TUNNEL_WIDTH_MIN_CM && item.width <= SIM.TUNNEL_WIDTH_MAX_CM)) {
        return 'item "' + id + '": a tunnel\'s width (inside) is ' + SIM.TUNNEL_WIDTH_MIN_CM + ' to ' + SIM.TUNNEL_WIDTH_MAX_CM + ' cm';
    }
    if (item.kind !== 'line' && !item.role) {
        return 'item "' + id + '": a ' + item.kind + ' needs a role (obstacle, goal or fail)';
    }
    let points: number[][];
    if (item.kind === 'rect') {
        if (![item.x, item.y, item.w, item.h].every(isNumber) || !(item.w > 0 && item.h > 0)) {
            return 'item "' + id + '": a rect needs x, y, w and h (w, h > 0)';
        }
        points = [
            [item.x, item.y],
            [item.x + item.w, item.y + item.h],
        ];
    } else if (item.kind === 'circle') {
        if (![item.x, item.y, item.r].every(isNumber) || !(item.r > 0)) {
            return 'item "' + id + '": a circle needs x, y and r (r > 0)';
        }
        points = [
            [item.x - item.r, item.y - item.r],
            [item.x + item.r, item.y + item.r],
        ];
    } else {
        const n = item.kind === 'triangle' ? 3 : 2;
        const ok = Array.isArray(item.points) && item.points.every((p: any) => Array.isArray(p) && p.length === 2 && p.every(isNumber));
        if (!ok || (item.kind === 'triangle' ? item.points.length !== 3 : item.points.length < n)) {
            return 'item "' + id + '": a ' + item.kind + ' needs ' + (item.kind === 'triangle' ? 'three' : 'at least two') + ' points [x, y]';
        }
        if (item.kind === 'line' && item.role && item.role !== 'obstacle') {
            return 'item "' + id + '": a line is a black line (no role) or a wall (role obstacle)';
        }
        points = item.points;
    }
    const outside = points.some((p) => p[0] < 0 || p[1] < 0 || p[0] > width || p[1] > height);
    return outside ? 'item "' + id + '" lies (partly) outside the floor (' + width + ' x ' + height + ' cm)' : null;
}

/** an item with only the fields of its kind, numbers rounded as the editor does */
function cleanItem(item: any): SIM.SimItem {
    const out: any = { id: text(item.id), kind: item.kind };
    text(item.name) && (out.name = text(item.name));
    item.role && (out.role = item.role);
    const keys = item.kind === 'rect' ? ['x', 'y', 'w', 'h'] : item.kind === 'circle' ? ['x', 'y', 'r'] : [];
    keys.forEach((k) => (out[k] = SIM.round2(item[k])));
    if (item.kind === 'triangle' || item.kind === 'line' || item.kind === 'tunnel') {
        out.points = item.points.map((p: number[]) => [SIM.round2(p[0]), SIM.round2(p[1])]);
    }
    if (item.kind === 'tunnel') {
        item.smooth && (out.smooth = true);
        out.width = isNumber(item.width) ? SIM.round2(item.width) : SIM.TUNNEL_WIDTH_CM;
    }
    if (item.kind === 'line') {
        item.smooth && (out.smooth = true);
        item.closed && (out.closed = true);
        out.width = isNumber(item.width) && item.width > 0 ? SIM.round2(item.width) : item.role === 'obstacle' ? 1.5 : SIM.round2(SIM.LINE_WIDTH_CM);
    }
    return out;
}

/** a test checked against its world (generated: written by the model, not one of the learner's): the problems are told; the test is returned with only the fields of the format */
function checkTest(raw: any, world: SIM.SimWorld, ctx: Context, generated: boolean, problem: (message: string) => void): AiTest {
    const items: { [id: string]: SIM.SimItem } = {};
    world.items.forEach((i) => (items[i.id] = i));
    const isGoal = (id: string) => items[id] && SIM.isArea(items[id]) && items[id].role === 'goal';
    const test: AiTest = { name: text(raw.name), scenario: text(raw.scenario), start: text(raw.start), until: null, max_time_ms: 0, world: [], globals: {}, checks: [] };
    test.scenario || !generated || problem('the test has no scenario'); // the learner's tests have none
    world.starts.some((s) => s.id === test.start) || problem('start "' + test.start + '" is not in the world (its starts: ' + world.starts.map((s) => s.id).join(', ') + ')');
    if (raw.until !== undefined && raw.until !== null && raw.until !== '') {
        test.until = text(raw.until);
        isGoal(test.until) || problem('until "' + test.until + '" is not a goal area of the world');
    }
    if (!isNumber(raw.max_time_ms) || raw.max_time_ms < 100 || raw.max_time_ms > MAX_TIME_MS) {
        problem('max_time_ms must be a number from 100 to ' + MAX_TIME_MS);
    } else {
        test.max_time_ms = Math.round(raw.max_time_ms / 100) * 100;
    }
    for (const e of Array.isArray(raw.world) ? raw.world : []) {
        if (!e || (e.event !== 'clap' && e.event !== 'key')) {
            problem('the set-up (world) has only claps and key presses: ' + JSON.stringify(e));
        } else if (!isWhole(e.at) || e.at < 0) {
            problem('a ' + e.event + ' needs "at": ms from 0 on, as a whole number');
        } else if (e.event === 'key' && PORTS.indexOf(e.port) < 0) {
            problem('a key press needs "port": PLAY or REC');
        } else {
            test.world.push(e.event === 'key' ? { event: 'key', port: e.port, at: e.at } : { event: 'clap', at: e.at });
        }
    }
    const globals = raw.globals && typeof raw.globals === 'object' ? raw.globals : {};
    for (const name of Object.keys(globals)) {
        if (ctx.variables.indexOf(name) < 0) {
            problem('globals: the program has no global variable "' + name + '"' + variablesList(ctx));
        } else if (!isValue(globals[name])) {
            problem('globals: "' + name + '" must be a whole number, true / false or a list of whole numbers');
        } else {
            test.globals[name] = globals[name];
        }
    }
    if (!Array.isArray(raw.checks) || !raw.checks.length) {
        problem('the test has no checks');
    }
    for (const c of Array.isArray(raw.checks) ? raw.checks : []) {
        const check = checkCheck(c, items, isGoal, test, ctx, problem);
        check && test.checks.push(check);
    }
    if (generated) {
        STRATEGY_FIELDS.forEach((k) => raw[k] !== undefined && ((test as any)[k] = JSON.parse(JSON.stringify(raw[k]))));
    }
    return test;
}

function checkCheck(
    c: any,
    items: { [id: string]: SIM.SimItem },
    isGoal: (id: string) => boolean,
    test: AiTest,
    ctx: Context,
    problem: (message: string) => void
): AiCheck {
    const kind = c && c.check;
    const where = 'check ' + JSON.stringify(kind) + ': ';
    if (!CHECK_BLOCKS[kind]) {
        problem('unknown check ' + JSON.stringify(kind) + ' (checks: ' + Object.keys(CHECK_BLOCKS).join(', ') + ')');
        return null;
    }
    const check: AiCheck = { check: kind };
    const hasItem = c.item !== undefined && c.item !== null && c.item !== '';
    if (kind === 'reaches' || kind === 'ends_in') {
        if (hasItem) {
            isGoal(c.item) ? (check.item = c.item) : problem(where + '"' + c.item + '" is not a goal area of the world');
        } else if (kind === 'ends_in') {
            problem(where + 'needs the item: a goal area');
        }
    } else if (kind === 'never_touches') {
        Object.keys(items).some((id) => SIM.isArea(items[id]) && items[id].role === 'fail') || problem(where + 'the world has no fail area');
    } else if (kind === 'never_bumps') {
        if (hasItem) {
            items[c.item] && items[c.item].role === 'obstacle' ? (check.item = c.item) : problem(where + '"' + c.item + '" is not an obstacle or wall of the world');
        }
    } else if (kind === 'variable') {
        ctx.variables.indexOf(c.variable) >= 0 ? (check.variable = c.variable) : problem(where + 'the program has no global variable "' + c.variable + '"' + variablesList(ctx));
        check.op = c.op === undefined ? 'EQ' : c.op;
        OPS.indexOf(check.op) >= 0 || problem(where + 'op must be one of ' + OPS.join(', '));
        if (!isValue(c.value)) {
            problem(where + 'value must be a whole number, true / false or a list of whole numbers');
        } else if (['LT', 'LTE', 'GT', 'GTE'].indexOf(check.op) >= 0 && !isWhole(c.value)) {
            problem(where + 'only numbers can be compared with ' + check.op);
        } else {
            check.value = c.value;
        }
    } else {
        if (kind === 'whenever') {
            CONDITIONS.indexOf(c.when) >= 0 ? (check.when = c.when) : problem(where + 'when must be one of ' + CONDITIONS.join(', '));
            if (LIGHT.test(c.when)) {
                const percent = c.percent === undefined ? 50 : c.percent;
                isWhole(percent) && percent >= 0 && percent <= 100 ? (check.percent = percent) : problem(where + 'percent must be 0 to 100');
            }
        }
        if (kind === 'after') {
            EVENTS.indexOf(c.event) >= 0 ? (check.event = c.event) : problem(where + 'event must be one of ' + EVENTS.join(', '));
            if ((c.event === 'clap' || c.event === 'key') && !test.world.some((e) => e.event === c.event)) {
                problem(where + 'the set-up (world) has no ' + (c.event === 'clap' ? 'clap' : 'key press') + ', so the check checks nothing');
            }
            const within = c.within_ms === undefined ? 500 : c.within_ms;
            isWhole(within) && within >= 1 ? (check.within_ms = within) : problem(where + 'within_ms must be a whole number of at least 1');
        }
        DOES.indexOf(c.does) >= 0 ? (check.does = c.does) : problem(where + 'does must be one of ' + DOES.join(', '));
        if (kind !== 'after') {
            const after = c.after_ms === undefined ? BEHAVIOUR.DEFAULT_REACTION_MS[kind] : c.after_ms;
            isWhole(after) && after >= 0 ? (check.after_ms = after) : problem(where + 'after_ms must be a whole number from 0 on');
        }
    }
    return check;
}

function variablesList(ctx: Context): string {
    return ctx.variables.length ? ' (it has: ' + ctx.variables.join(', ') + ')' : ' (it has none)';
}

/** the answer without the tests that have problems (and without worlds left without tests) */
export function without(worlds: Resolved[], problems: Problem[]): Resolved[] {
    const broken = (w: Resolved, t: AiTest) => problems.some((p) => p.world === w.name && (p.test === t.name || p.test === null));
    return worlds.map((w) => ({ name: w.name, existing: w.existing, data: w.data, tests: w.tests.filter((t) => !broken(w, t)) })).filter((w) => w.tests.length);
}

// ------------------------------------------------------------------------------------------------ duplicates

/**
 * a test's meaning, to find duplicates: its world's floor and things (without ids and names), the pose it starts at, its set-up, the area that ends
 * it and its checks (with the things they are about instead of ids). Names, scenarios and the run's length don't count.
 */
export function meaningOf(test: AiTest, world: SIM.SimWorld): string {
    const thing = (id: string) => {
        const item = world.items.filter((i) => i.id === id)[0];
        return item ? canonical(Object.assign({}, item, { id: undefined, name: undefined })) : id;
    };
    const start = world.starts.filter((s) => s.id === test.start)[0];
    return canonical({
        floor: [world.background, world.size || null],
        things: world.items.map((i) => thing(i.id)).sort(),
        start: start ? [start.x, start.y, start.heading] : test.start,
        until: test.until ? thing(test.until) : null,
        setup: (test.world || []).map(canonical).sort(),
        globals: canonical(test.globals || {}),
        checks: test.checks.map((c) => canonical(Object.assign({}, c, { item: c.item ? thing(c.item) : undefined }))).sort(),
    });
}

/** the answer without the tests that mean the same as one of the learner's or as one before them: {worlds, duplicates: [test names]} */
export function dropDuplicates(worlds: Resolved[], existing: AiTests): { worlds: Resolved[]; duplicates: { world: string; test: string; same: string }[] } {
    const seen: { [meaning: string]: string } = {};
    for (const w of existing.worlds) {
        const world = SIM.parseData(JSON.stringify({ version: SIM.DATA_VERSION, world: w.world })).world;
        w.tests.forEach((t) => (seen[meaningOf(t, world)] = t.name));
    }
    const duplicates: { world: string; test: string; same: string }[] = [];
    const out = worlds.map((w) => {
        const tests = w.tests.filter((t) => {
            const meaning = meaningOf(t, w.data.world);
            if (seen[meaning] !== undefined) {
                duplicates.push({ world: w.name, test: t.name, same: seen[meaning] });
                return false;
            }
            seen[meaning] = t.name;
            return true;
        });
        return { name: w.name, existing: w.existing, data: w.data, tests: tests };
    });
    return { worlds: out.filter((w) => w.tests.length), duplicates: duplicates };
}

/** JSON with sorted keys and without undefined values */
function canonical(value: any): string {
    if (Array.isArray(value)) {
        return '[' + value.map(canonical).join(',') + ']';
    }
    if (value && typeof value === 'object') {
        return (
            '{' +
            Object.keys(value)
                .filter((k) => value[k] !== undefined)
                .sort()
                .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
                .join(',') +
            '}'
        );
    }
    return JSON.stringify(value);
}

// ------------------------------------------------------------------------------------------------ JSON → blocks

/**
 * the worlds as a Tests suite (block_set XML): the world blocks with their tests (every ticked test runs). The ids are `<prefix>-<world>`,
 * `<prefix>-<world>-<test>`, `<prefix>-<world>-<test>-<part>`, so a problem of the translator names its test. For a world of the learner
 * (existing), its block holds only the new tests.
 */
export function suiteXml(worlds: Resolved[], prefix: string, provenance?: (world: Resolved, test: AiTest) => Provenance): string {
    let tops = '';
    worlds.forEach((w, i) => {
        tops += '<instance x="40" y="' + (200 + 400 * i) + '">' + worldXml(w, prefix + '-' + (i + 1), provenance) + '</instance>';
    });
    return '<block_set xmlns="' + NS + '" robottype="edison" xmlversion="3.1" description="" tags="">' + tops + '</block_set>';
}

/** a world block with its data and tests */
export function worldXml(w: Resolved, id: string, provenance?: (world: Resolved, test: AiTest) => Provenance): string {
    return (
        '<block type="' +
        BLOCKS.WORLD +
        '" id="' +
        id +
        '"><field name="NAME">' +
        esc(w.name) +
        '</field><data>' +
        esc(JSON.stringify(w.data)) +
        '</data><statement name="TESTS">' +
        w.tests.map((t, j) => testXml(t, id + '-' + (j + 1), provenance ? provenance(w, t) : null)).join('') +
        '</statement></block>'
    );
}

/** a test of a world (nepoTest_simcase) with its set-up and checks */
export function testXml(t: AiTest, id: string, provenance: Provenance): string {
    let part = 0;
    const next = () => id + '-' + ++part;
    const field = (name: string, value: any) => '<field name="' + name + '">' + esc(String(value)) + '</field>';
    let setup = '';
    for (const e of t.world || []) {
        setup +=
            e.event === 'key'
                ? '<block type="nepoTest_given_key" id="' + next() + '">' + field('AT', e.at) + field('PORT', e.port) + '</block>'
                : '<block type="nepoTest_given_clap" id="' + next() + '">' + field('AT', e.at) + '</block>';
    }
    for (const name of Object.keys(t.globals || {})) {
        setup += '<block type="nepoTest_given_variable" id="' + next() + '">' + field('VAR', name) + '<value name="VALUE">' + literalXml(t.globals[name], next) + '</value></block>';
    }
    let checks = '';
    for (const c of t.checks) {
        let inner = '';
        if (c.check === 'reaches') {
            inner = field('AREA', c.item || BLOCKS.ANY_ITEM);
        } else if (c.check === 'ends_in') {
            inner = field('AREA', c.item);
        } else if (c.check === 'never_bumps') {
            inner = field('OBSTACLE', c.item || BLOCKS.ANY_ITEM);
        } else if (c.check === 'does') {
            inner = field('AFTER', c.after_ms) + field('DOES', c.does);
        } else if (c.check === 'whenever') {
            inner = field('WHEN', c.when) + field('PERCENT', c.percent === undefined ? 50 : c.percent) + field('DOES', c.does) + field('AFTER', c.after_ms);
        } else if (c.check === 'after') {
            inner = field('WITHIN', c.within_ms) + field('EVENT', c.event) + field('DOES', c.does);
        } else if (c.check === 'variable') {
            inner = field('VAR', c.variable) + field('OP', c.op || 'EQ') + '<value name="VALUE">' + literalXml(c.value, next) + '</value>';
        }
        checks += '<block type="' + CHECK_BLOCKS[c.check] + '" id="' + next() + '">' + inner + '</block>';
    }
    return (
        '<block type="' +
        BLOCKS.SIM_TEST +
        '" id="' +
        id +
        '">' +
        field('ACTIVE', t.skip ? 'FALSE' : 'TRUE') +
        field('NAME', t.name) +
        field('START', t.start) +
        field('MODE', t.until ? 'until' : 'for') +
        (t.until ? field('UNTIL', t.until) : '') +
        field('SECONDS', Math.round(t.max_time_ms / 100) / 10) +
        (provenance ? '<data>' + esc(JSON.stringify({ ai: provenance })) + '</data>' : '') +
        (setup ? '<statement name="SETUP">' + setup + '</statement>' : '') +
        (checks ? '<statement name="CHECKS">' + checks + '</statement>' : '') +
        '</block>'
    );
}

function literalXml(value: Value, id: () => string): string {
    if (Array.isArray(value)) {
        return (
            '<block type="robLists_create_with" id="' +
            id() +
            '"><mutation items="' +
            value.length +
            '" list_type="Number"></mutation><field name="LIST_TYPE">Number</field>' +
            value.map((v, i) => '<value name="ADD' + i + '">' + literalXml(v, id) + '</value>').join('') +
            '</block>'
        );
    }
    if (typeof value === 'boolean') {
        return '<block type="logic_boolean" id="' + id() + '"><field name="BOOL">' + (value ? 'TRUE' : 'FALSE') + '</field></block>';
    }
    return '<block type="math_number" id="' + id() + '"><field name="NUM">' + value + '</field></block>';
}

/**
 * adds the worlds' tests to a Tests workspace, as one undo step: a new world goes to the right of the blocks there; the tests of a learner's world
 * go after its tests. Each test's block gets its provenance (with its id and its signature). Returns the ids of the test blocks added.
 */
export function addToWorkspace(workspace: any, worlds: Resolved[], prefix: string, provenance: (world: Resolved, test: AiTest) => Provenance): string[] {
    const added: string[] = [];
    const group = Blockly.Events.getGroup();
    Blockly.Events.setGroup(true);
    try {
        let x = rightOf(workspace) + 60;
        const y = topOf(workspace);
        worlds.forEach((w, i) => {
            const id = prefix + '-' + (i + 1);
            let tests: any[];
            if (w.existing) {
                const own = workspace.getTopBlocks(true).filter((b: any) => b.type === BLOCKS.WORLD && b.getFieldValue('NAME') === w.name)[0];
                if (!own) {
                    return;
                }
                tests = w.tests.map((t, j) => {
                    const block = place(workspace, testXml(t, id + '-' + (j + 1), provenance(w, t)), 0, 0);
                    const last = BLOCKS.testsOf(own).slice(-1)[0];
                    const connection = last ? last.nextConnection : own.getInput('TESTS').connection;
                    connection.connect(block.previousConnection);
                    return block;
                });
            } else {
                const world = place(workspace, worldXml(w, id, provenance), x, y);
                x += world.getHeightWidth().width + 60;
                tests = BLOCKS.testsOf(world);
            }
            tests.forEach((t) => {
                const p = provenanceOf(t);
                if (p) {
                    p.block = t.id; // its id, also if Blockly gave it another one
                    p.asAdded = signatureOf(t);
                    t.data = JSON.stringify({ ai: p });
                }
                added.push(t.id);
            });
        });
        workspace.getTopBlocks(false).forEach((b: any) => BLOCKS.refreshWorldLabels(b, Blockly.Events.getGroup()));
    } finally {
        Blockly.Events.setGroup(group);
    }
    return added;
}

/** a block from its XML, on the workspace at (x, y) */
function place(workspace: any, blockXml: string, x: number, y: number): any {
    const dom = Blockly.Xml.textToDom('<block_set xmlns="' + NS + '" robottype="edison"><instance x="' + x + '" y="' + y + '">' + blockXml + '</instance></block_set>', workspace);
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

// ------------------------------------------------------------------------------------------------ helpers

function text(value: any): string {
    return typeof value === 'string' ? value.trim() : '';
}

function isNumber(value: any): boolean {
    return typeof value === 'number' && isFinite(value);
}

function isWhole(value: any): boolean {
    return isNumber(value) && Math.round(value) === value;
}

function isValue(value: any): boolean {
    return isWhole(value) || typeof value === 'boolean' || (Array.isArray(value) && value.every(isWhole));
}

function esc(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
