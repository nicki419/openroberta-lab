/**
 * The testing strategy of the AI test assistant (docs/tests: AI_Test_Generation_Orchestration_v3 §6.3, AnalysisAgent_v3, TestGenerationAgent_v3),
 * where code and not the model decides:
 *
 * 1. branch coverage: the program's decisions and their outcomes are found here, in its blocks (indexOf: every if, wait until and repeat while /
 *    until, the decisions nepoTest.simProgram scanDecisions instruments), with ids (D1, D1.1, D1.else, …) the model must use. The analysis (task
 *    analyze) says which outcomes the simulator can make happen and plans paths that target them (checkAnalysis). The runs show which outcomes really
 *    happened (seenIn: the run report's trace counts each decision's outcomes): planned is never taken for happened;
 * 2. equivalence partitioning: every test names the input classes it stands for, word for word from the analysis, and what of the test realizes
 *    them (checkTests). Boundary value analysis, the spec's other half of this step, is left out (2026-11-06): its tests were about details a learner
 *    doesn't read (the line's edge, the edge of the sensors' range) and sat close to where readings change. An older answer's boundary_candidates and
 *    boundary_values are ignored;
 * 3. a complete test: its path, its inputs, its expected results, its postconditions (with the checks that decide them), where its expectation
 *    comes from (oracle), and at least one positive check (anti-triviality);
 * 4. consolidation: every outcome and class of the analysis is tested or deferred with a reason (checkTests); the coverage plan is computed from the
 *    tests that are left (planOf), never taken from the model.
 *
 * And the semantics of a run: a test that passed but had a check with nothing to decide, or whose planned outcome never happened, is not checked
 * (notCheckedWhy); a fix may change only a test's inputs, never what it expects (frozenProblems).
 *
 * The model sees the program's blocks with short ids (b1, b2, … in document order: shortIds); the index maps them back to the blocks' ids.
 */
import * as FORMAT from 'nepoTest.aiFormat';
import * as SIM from 'nepoTest.sim';

export const MAX_TESTS = 6; // 2026-11-06: 8 was too many to read (a line follower got 8, 7 of them about its steering)
export const MAX_SCENARIOS = 4; // of an analysis: each a situation the learner would name

const IFS = ['robControls_if', 'robControls_ifElse', 'controls_if'];
const WAITS = ['robControls_wait_for', 'robControls_wait'];
const WHILES = ['controls_whileUntil'];
const RUNS = ['robControls_start', 'robProcedures_defnoreturn', 'robProcedures_defreturn']; // the instances that run (others are left lying)
const POSITIVE = ['reaches', 'ends_in', 'does', 'whenever', 'after', 'variable']; // the others (never_bumps, never_touches) hold for a robot that never moves
const TESTABILITY = ['supported', 'uncertain', 'unsupported'];
const CONFIDENCE = ['low', 'medium', 'high'];
const CATEGORIES = ['nominal', 'alternative', 'adverse', 'recovery', 'timing', 'safety']; // the spec's 'boundary' is left out (no BVA)
const SCENARIO_BASES = ['learner_description', 'inferred', 'applicable_safety', 'unknown'];
const ORACLE_BASES = ['learner_description', 'inferred_from_program', 'applicable_safety'];
const STATUSES = ['ready_for_review', 'partial', 'no_valid_scenarios'];

export interface Outcome {
    id: string; // D1.1, D1.else, D1.waits, D1.repeats, D1.ends
    outcome: string; // in words
    count: (c: { [k: number]: number[] }) => number; // how often it happened, from the decision's counts per condition k: [yes, no]
}

export interface Decision {
    id: string; // D1
    block: string; // the block's id
    short: string; // its short id (b7)
    kind: string; // if | wait | while
    label: string;
    outcomes: Outcome[];
}

export interface Index {
    decisions: Decision[];
    outcome: { [id: string]: { decision: Decision; outcome: Outcome } };
    nepo: string; // the program's XML with the short ids
    toShort: { [block: string]: string };
    toReal: { [short: string]: string };
    lineTracker?: boolean; // a block that runs reads the line tracker: the program follows a line (tests start on one: lineProblems)
    sensors?: string[]; // the sensors blocks that run read (sensorsRead): the model is told them, and what the program can't notice
    floor?: Floor; // what the program does on a plain floor (nepoTest.ai floorRun), or null if that run failed
}

/**
 * what the program did on a plain floor, measured by the Lab (nepoTest.ai floorRun: FLOOR_MS on a peach floor, bright, nothing around, nothing
 * happening): the way its path took (cm) and how far it turned (degrees, counterclockwise: + is to the left). The model is told it, and a program
 * that reads the line tracker but drives straight on there needs no line in tests that aren't about the line (2026-11-06: a line follower that steers
 * only over black or white drove straight on the plain floor; the rule "every test starts on a line, on a plain floor it circles" put a line into its
 * tunnel tests).
 */
export interface Floor {
    seconds: number;
    moved_cm: number;
    turned_deg: number;
}

/** how the program moves on a plain floor: straight (it gets somewhere without a line), turns_left, turns_right, stands; null: not known */
export function floorMoves(floor: Floor): string {
    if (!floor || !isFinite(floor.moved_cm) || !isFinite(floor.turned_deg)) {
        return null;
    }
    if (Math.abs(floor.turned_deg) >= 30) {
        return floor.turned_deg > 0 ? 'turns_left' : 'turns_right';
    }
    return floor.moved_cm >= 5 ? 'straight' : 'stands';
}

/** an outcome of the program's decisions and what became of it: planned by a test, deferred (why), and how often the runs took it */
export interface OutcomePlan {
    id: string;
    decision: string;
    block: string; // the block's id (for a chip)
    words: string;
    planned: string[]; // the names of the tests that plan it
    deferred: string; // why no test plans it (the model's reason, the analysis' feasibility, or: lost when tests were left out), or null
    seen: number; // after the runs: how often it happened in them (null before)
}

export interface Plan {
    outcomes: OutcomePlan[];
    target: string[]; // the outcomes on the analysis' paths
    planned: string[];
    deferred: { branch_id: string; reason: string }[];
    lost: string[]; // targets neither planned nor deferred (tests were left out)
    deferredInputs: { dimension: string; value: string; reason: string }[];
    deferredScenarios: { scenario_id: string; reason: string }[];
    corrected: boolean; // the model's planned_covered_branch_ids differed from what its tests plan
}

// ------------------------------------------------------------------------------------------------ the program's decisions

/**
 * the program's decisions, from its XML (as the Program tab has it), with their outcomes and the short ids of its blocks
 *
 * @param label the label of a block (for the model and the panel), by its id
 */
export function indexOf(programXml: string, label?: (block: string) => string): Index {
    const index: Index = { decisions: [], outcome: {}, nepo: programXml || '', toShort: {}, toReal: {} };
    const doc = new DOMParser().parseFromString(programXml || '', 'text/xml');
    if (!doc.documentElement || doc.getElementsByTagName('parsererror').length) {
        return index;
    }
    const blocks = Array.prototype.slice.call(doc.getElementsByTagName('block')) as Element[];
    blocks.forEach((b, i) => {
        const real = b.getAttribute('id') || 'n' + i;
        const short = 'b' + (i + 1);
        index.toShort[real] = short;
        index.toReal[short] = real;
    });
    for (const b of blocks) {
        const type = b.getAttribute('type');
        const kind = IFS.indexOf(type) >= 0 ? 'if' : WAITS.indexOf(type) >= 0 ? 'wait' : WHILES.indexOf(type) >= 0 ? 'while' : null;
        if (!kind || !runs(b)) {
            continue;
        }
        const real = b.getAttribute('id');
        const d: Decision = { id: 'D' + (index.decisions.length + 1), block: real, short: index.toShort[real], kind: kind, label: '', outcomes: [] };
        d.label = (label && real && label(real)) || type;
        d.outcomes = outcomesOf(d.id, kind, b);
        index.decisions.push(d);
        d.outcomes.forEach((o) => (index.outcome[o.id] = { decision: d, outcome: o }));
    }
    index.sensors = sensorsRead(blocks);
    index.lineTracker = index.sensors.indexOf('LINETRACKER') >= 0;
    blocks.forEach((b) => b.setAttribute('id', index.toShort[b.getAttribute('id')] || b.getAttribute('id')));
    index.nepo = new XMLSerializer().serializeToString(doc);
    return index;
}

/**
 * the sensors the program reads, from its sensor blocks that run (not in a switched-off block, not in a function nobody calls): LINETRACKER (the floor
 * under it), LLIGHT and RLIGHT (the light from above), OBSTACLE_LEFT, OBSTACLE_FRONT, OBSTACLE_RIGHT, SOUND, KEY, IR. The model is told them, and what
 * the program can't notice (2026-11-06: a line follower that reads only the line tracker got a test in a dim tunnel, as if a "light %" were the dim
 * light of the light sensors)
 */
function sensorsRead(blocks: Element[]): string[] {
    const called: string[] = [];
    blocks
        .filter((b) => /^robProcedures_call/.test(b.getAttribute('type') || ''))
        .forEach((b) => {
            const m = Array.prototype.filter.call(b.children, (c: Element) => c.localName === 'mutation')[0];
            m && called.push(m.getAttribute('name'));
        });
    const fieldOf = (b: Element, name: string) => {
        const f = Array.prototype.filter.call(b.children, (c: Element) => c.localName === 'field' && c.getAttribute('name') === name)[0];
        return f ? f.textContent : null;
    };
    const live = (b: Element) => {
        if (!runs(b)) {
            return false;
        }
        let top: Element = b;
        for (let e: Element = b; e && e.localName !== 'instance'; e = e.parentElement) {
            if (e.localName === 'block') {
                if (e.getAttribute('disabled') === 'true') {
                    return false;
                }
                top = e;
            }
        }
        return !/^robProcedures_def/.test(top.getAttribute('type') || '') || called.indexOf(fieldOf(top, 'NAME')) >= 0;
    };
    const out: string[] = [];
    const add = (s: string) => s && out.indexOf(s) < 0 && out.push(s);
    blocks
        .filter((b) => /^robSensors_/.test(b.getAttribute('type') || '') && live(b))
        .forEach((b) => {
            const type = b.getAttribute('type');
            const port = fieldOf(b, 'SENSORPORT') || '';
            const kind = type === 'robSensors_getSample' ? (fieldOf(b, 'SENSORTYPE') || '').split('_')[0].toLowerCase() : type.replace(/^robSensors_|_getSample$/g, '');
            if (kind === 'light') {
                add(port === 'LINETRACKER' || port === 'LLIGHT' || port === 'RLIGHT' ? port : 'LINETRACKER');
            } else if (kind === 'infrared') {
                add('OBSTACLE_' + (port || 'FRONT'));
            } else if (kind === 'sound') {
                add('SOUND');
            } else if (kind === 'key') {
                add('KEY');
            } else if (kind === 'irseeker') {
                add('IR');
            }
        });
    return out;
}

/** how far (cm) a test's start has the line tracker from a line on the floor at most (more: a line follower that doesn't drive straight on a plain floor circles on the start) */
export const LINE_NEAR_CM = 10;
const LINE_TRACKER_AHEAD_CM = 5;

const ON_LINE_CM = 1.5; // the line tracker closer to a line's middle than this is on its black core (0.74 cm to each side) or at its edge
const BESIDE = /beside|next to|off the line|away from the line/i; // an input class of a start beside the line

/** how far the line tracker of a start is from the middle of the nearest line on the floor (cm; Infinity without lines) */
function lineDistance(world: SIM.SimWorld, start: SIM.SimStart): number {
    const h = (start.heading * Math.PI) / 180; // counterclockwise from +x, y down
    const px = start.x + LINE_TRACKER_AHEAD_CM * Math.cos(h);
    const py = start.y - LINE_TRACKER_AHEAD_CM * Math.sin(h);
    let nearest = Infinity;
    (world.items || [])
        .filter((i) => i.kind === 'line' && (!i.role || i.role === 'color') && Array.isArray(i.points) && i.points.length > 1)
        .forEach((i) => {
            const pts = i.closed ? i.points.concat([i.points[0]]) : i.points;
            for (let k = 1; k < pts.length; k++) {
                const [x1, y1] = pts[k - 1];
                const [x2, y2] = pts[k];
                const dx = x2 - x1;
                const dy = y2 - y1;
                const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1)));
                nearest = Math.min(nearest, Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)));
            }
        });
    return nearest;
}

/**
 * for a program that follows a line (index.lineTracker): a test whose start has no line near the line tracker (2026-11-05: "the wall already in
 * sight" stood on a plain floor; the line follower read 83 % there and circled on the start instead of driving up to the wall), or that stands
 * for a start beside the line (`beside`: its input class) but starts on one (2026-11-06: 2 of 3 "Started beside the line" tests had a line drawn
 * through their start, by the recipe for a start on the line)
 */
export function lineProblems(world: SIM.SimWorld, start: SIM.SimStart, beside: string = null, floor: Floor = null): string[] {
    if (!start) {
        return [];
    }
    const nearest = lineDistance(world, start);
    // 2026-11-07 (phase 5, round 3): a line under every start in the light, whatever the program does on a plain floor (that may be its mistake:
    // until then, one that drove straight on there got no line, and a broken one that drives straight on, where every right one circles, got
    // worlds no right one gets through); a start in the dark (inside a tunnel) needs none
    if (nearest > LINE_NEAR_CM && !inTheDark(world, start)) {
        return [
            'start "' +
                start.id +
                '": there is no line near it (the line tracker is 5 cm ahead of the start). The program follows a line: draw a line through the start ("A line through the start" in "Tests"), with the scenario\'s things on it, whatever the program does on a plain floor (that may be its mistake)',
        ];
    }
    if (beside && nearest < ON_LINE_CM) {
        return [
            'start "' +
                start.id +
                '": the test stands for "' +
                beside +
                '", but its line tracker is on a line (' +
                Math.round(nearest * 10) / 10 +
                ' cm from its middle). Draw no line through this start: the line 8 cm to its side ("A line beside the start" in "Tests")',
        ];
    }
    return [];
}

/** is it dark where the robot's light sensors are at a start (5.5 cm ahead of it: inside a tunnel, below 70 %)? */
function inTheDark(world: SIM.SimWorld, start: SIM.SimStart): boolean {
    const h = ((start.heading || 0) * Math.PI) / 180;
    return SIM.lightAt(world, start.x + 5.5 * Math.cos(h), start.y - 5.5 * Math.sin(h)) < 70;
}

/** does a block run: is it in an instance that begins with the start block or a function's definition? */
function runs(block: Element): boolean {
    let e: Element = block;
    while (e.parentElement && e.parentElement.localName !== 'instance') {
        e = e.parentElement;
    }
    const instance = e.parentElement;
    const first = instance ? Array.prototype.filter.call(instance.children, (c: Element) => c.localName === 'block')[0] : null;
    return !instance || (first && RUNS.indexOf(first.getAttribute('type')) >= 0);
}

/** the inputs of a block itself (its value and statement elements, also inside repetitions), not those of the blocks in them */
function ownInputs(block: Element, tag: string): Element[] {
    const out: Element[] = [];
    for (let c = block.firstElementChild; c; c = c.nextElementSibling) {
        if (c.localName === tag) {
            out.push(c);
        } else if (c.localName === 'repetitions') {
            out.push(...ownInputs(c, tag));
        }
    }
    return out;
}

function mutation(block: Element, name: string): number {
    const m = Array.prototype.filter.call(block.children, (c: Element) => c.localName === 'mutation')[0] as Element;
    const v = m ? parseInt(m.getAttribute(name), 10) : NaN;
    return isNaN(v) ? 0 : v;
}

/**
 * the outcomes of a decision, and how to count them from the record (nepoTest.simProgram Recorder: for condition k of an if or a wait, how often it
 * held and how often not; for a while loop, k 0: repeated or ended). A later condition is only asked when the ones before it didn't hold.
 */
function outcomesOf(id: string, kind: string, block: Element): Outcome[] {
    const yes = (k: number) => (c: { [k: number]: number[] }) => (c[k] ? c[k][0] : 0);
    const no = (k: number) => (c: { [k: number]: number[] }) => (c[k] ? c[k][1] : 0);
    if (kind === 'while') {
        return [
            { id: id + '.repeats', outcome: 'the loop runs (again)', count: yes(0) },
            { id: id + '.ends', outcome: 'the loop ends', count: no(0) },
        ];
    }
    const names = ownInputs(block, 'value')
        .map((v) => v.getAttribute('name') || '')
        .filter((n) => (kind === 'if' ? /^IF\d+$/ : /^WAIT\d+$/).test(n));
    const n = Math.max(1, kind === 'if' ? 1 + mutation(block, 'elseif') : 1 + mutation(block, 'wait'), names.length);
    const out: Outcome[] = [];
    for (let k = 0; k < n; k++) {
        const which = n === 1 ? 'the condition holds' : 'condition ' + (k + 1) + ' holds' + (k ? ' (the ones before it don\'t)' : '');
        out.push({ id: id + '.' + (k + 1), outcome: kind === 'wait' ? which + ': it goes on' : which, count: yes(k) });
    }
    if (kind === 'wait') {
        out.push({ id: id + '.waits', outcome: (n === 1 ? "the condition doesn't hold yet" : 'no condition holds yet') + ': it waits', count: no(n - 1) });
    } else {
        const hasElse = block.getAttribute('type') === 'robControls_ifElse' || mutation(block, 'else') === 1;
        const none = n === 1 ? "the condition doesn't hold" : 'no condition holds';
        out.push({ id: id + '.else', outcome: none + (hasElse ? ': the else part runs' : ': nothing of it runs'), count: no(n - 1) });
    }
    return out;
}

/** the decisions as the model gets them (OpenRobertaServer AiPrompts: "The program's decisions") */
export function decisionsForModel(index: Index): any[] {
    return index.decisions.map((d) => ({ id: d.id, block: d.short, kind: d.kind, label: d.label, outcomes: d.outcomes.map((o) => ({ id: o.id, outcome: o.outcome })) }));
}

/** the decisions for the telemetry */
export function decisionsForLog(index: Index): any[] {
    return index.decisions.map((d) => ({ id: d.id, block: d.block, short: d.short, kind: d.kind, outcomes: d.outcomes.map((o) => o.id) }));
}

/** how often each outcome of the program's decisions happened in a run (from its report's trace); {} if the run has no trace */
export function seenIn(report: any, index: Index): { [outcome: string]: number } {
    const counts: { [block: string]: { [k: number]: number[] } } = {};
    for (const step of (report && report.trace) || []) {
        Object.keys(step.decisions || {}).forEach((key) => {
            const at = key.lastIndexOf(':');
            const block = key.substring(0, at);
            const k = Number(key.substring(at + 1));
            const c = (counts[block] = counts[block] || {});
            const s = (c[k] = c[k] || [0, 0]);
            s[0] += step.decisions[key][0];
            s[1] += step.decisions[key][1];
        });
    }
    const out: { [outcome: string]: number } = {};
    index.decisions.forEach((d) => d.outcomes.forEach((o) => (out[o.id] = o.count(counts[d.block] || {}))));
    return out;
}

// ------------------------------------------------------------------------------------------------ the analysis

function problem(list: FORMAT.Problem[], message: string, world = '', test: string = null): void {
    list.push({ world: world, test: test, message: message });
}

function isText(v: any): boolean {
    return typeof v === 'string' && v.trim().length > 0;
}

function arrayOf(v: any): any[] {
    return Array.isArray(v) ? v : [];
}

/** the analysis' paths that aren't unsupported, and the outcomes on them (the targets of branch coverage) */
export function targetsOf(analysis: any): string[] {
    const out: string[] = [];
    arrayOf(analysis && analysis.scenario_paths)
        .filter((p: any) => p && p.testability !== 'unsupported')
        .forEach((p: any) => arrayOf(p.branch_ids).forEach((b: string) => out.indexOf(b) < 0 && out.push(b)));
    return out;
}

/**
 * the problems of an answer of analyze, checked against the program's decisions and the learner's sentence (AnalysisAgent_v3 §7): every decision
 * with exactly its outcomes, every supported outcome on a path, paths and scenarios naming each other, the blocks real, the enums
 */
export function checkAnalysis(answer: any, index: Index, sentence: string, learnerTests: string[] = []): FORMAT.Problem[] {
    const problems: FORMAT.Problem[] = [];
    const add = (message: string) => problem(problems, message);
    const blocksOk = (ids: any, where: string) =>
        arrayOf(ids).forEach((b: any) => index.toReal[b] === undefined && add(where + ': there is no block "' + b + '" in the program (its blocks are b1 to b' + Object.keys(index.toReal).length + ')'));
    if (!answer || typeof answer !== 'object') {
        add('the answer is not an object');
        return problems;
    }
    const basis = sentence ? 'learner_description' : 'inferred_from_program';
    const intent = answer.likely_intent || {};
    intent.basis !== basis && add('likely_intent.basis must be "' + basis + '": the learner ' + (sentence ? 'wrote a sentence' : 'wrote no sentence'));
    CONFIDENCE.indexOf(intent.confidence) < 0 && add('likely_intent.confidence must be low, medium or high');
    const facts = answer.program_facts || {};
    arrayOf(facts.sensors).concat(arrayOf(facts.actions)).forEach((f: any) => blocksOk(f && f.source_block_ids, 'program_facts "' + (f && f.name) + '"'));

    // the decisions: every one of the program, with exactly its outcomes
    const listed: string[] = [];
    for (const d of arrayOf(answer.decision_points)) {
        const known = index.decisions.filter((x) => x && d && x.id === d.id)[0];
        if (!known) {
            add('decision_points: there is no decision "' + (d && d.id) + '" (the program\'s decisions: ' + (index.decisions.map((x) => x.id).join(', ') || 'none') + ')');
            continue;
        }
        if (listed.indexOf(d.id) >= 0) {
            add('decision_points: ' + d.id + ' is listed twice');
            continue;
        }
        listed.push(d.id);
        isText(d.condition) || add('decision ' + d.id + ' needs its condition in words');
        blocksOk(d.source_block_ids, 'decision ' + d.id);
        const ids = arrayOf(d.branches).map((b: any) => b && b.id);
        const want = known.outcomes.map((o) => o.id);
        const same = ids.length === want.length && want.every((w) => ids.indexOf(w) >= 0);
        same || add('decision ' + d.id + ': its branches must be exactly ' + want.join(', ') + ' (they are ' + (ids.join(', ') || 'none') + ')');
        for (const b of arrayOf(d.branches)) {
            if (!b || want.indexOf(b.id) < 0) {
                continue;
            }
            isText(b.outcome) || add('branch ' + b.id + ' needs its outcome in words');
            TESTABILITY.indexOf(b.feasibility) < 0 && add('branch ' + b.id + ': feasibility must be supported, uncertain or unsupported');
            b.feasibility !== 'supported' && !isText(b.reason) && add('branch ' + b.id + ' is ' + b.feasibility + ': say why (reason)');
        }
    }
    index.decisions.filter((x) => listed.indexOf(x.id) < 0).forEach((x) => add('decision_points: decision ' + x.id + ' (block ' + x.short + ') is missing: list every decision of the program'));

    // the paths and the scenarios: they name each other
    const scenarios: { [id: string]: any } = {};
    for (const s of arrayOf(answer.scenarios)) {
        if (!s || !/^S\d+$/.test(String(s.id))) {
            add('a scenario needs an id S1, S2, …');
        } else if (scenarios[s.id]) {
            add('scenario ' + s.id + ' is there twice');
        } else {
            scenarios[s.id] = s;
        }
    }
    const paths: { [id: string]: any } = {};
    for (const p of arrayOf(answer.scenario_paths)) {
        if (!p || !/^P\d+$/.test(String(p.id))) {
            add('a path needs an id P1, P2, …');
            continue;
        }
        if (paths[p.id]) {
            add('path ' + p.id + ' is there twice');
            continue;
        }
        paths[p.id] = p;
        const s = scenarios[p.scenario_id];
        !s ? add('path ' + p.id + ': there is no scenario "' + p.scenario_id + '"') : arrayOf(s.path_ids).indexOf(p.id) < 0 && add('path ' + p.id + ' belongs to ' + p.scenario_id + ', but ' + p.scenario_id + "'s path_ids don't name it");
        const seen: string[] = [];
        for (const b of arrayOf(p.branch_ids)) {
            !index.outcome[b] ? add('path ' + p.id + ': there is no outcome "' + b + '" of the program\'s decisions') : seen.indexOf(b) >= 0 ? add('path ' + p.id + ' names ' + b + ' twice') : seen.push(b);
        }
        TESTABILITY.indexOf(p.testability) < 0 && add('path ' + p.id + ': testability must be supported, uncertain or unsupported');
        for (const dim of arrayOf(p.input_dimensions)) {
            if (!dim || !isText(dim.dimension)) {
                add('path ' + p.id + ': an input dimension needs its name (dimension)');
            } else if (!Array.isArray(dim.equivalence_classes)) {
                add('path ' + p.id + ', dimension "' + dim.dimension + '": it needs equivalence_classes (a list)');
            }
        }
    }
    for (const id of Object.keys(scenarios)) {
        const s = scenarios[id];
        const ps = arrayOf(s.path_ids);
        ps.length || add('scenario ' + id + ' needs its paths (path_ids)');
        ps.forEach((p: string) => (!paths[p] ? add('scenario ' + id + ': there is no path "' + p + '"') : paths[p].scenario_id !== id && add('scenario ' + id + ' names path ' + p + ', which belongs to ' + paths[p].scenario_id)));
        CATEGORIES.indexOf(s.category) < 0 && add('scenario ' + id + ': category must be one of ' + CATEGORIES.join(', '));
        SCENARIO_BASES.indexOf(s.oracle_basis) < 0 && add('scenario ' + id + ': oracle_basis must be one of ' + SCENARIO_BASES.join(', '));
        s.oracle_basis === 'learner_description' && !sentence && add('scenario ' + id + ': oracle_basis can\'t be learner_description: the learner wrote no sentence');
        // 2026-11-07 (phase 5, round 3): with a sentence, the program never says what is right (in the study it is broken)
        s.oracle_basis === 'inferred' &&
            sentence &&
            add(
                'scenario ' +
                    id +
                    ": oracle_basis can't be inferred: the learner wrote a sentence, so what the robot should do comes from it (learner_description) or from safety (applicable_safety); where it says nothing, expected_response_hypothesis is null (unknown). What the program does may be its mistake"
            );
        const none = s.expected_response_hypothesis === null || s.expected_response_hypothesis === undefined || s.expected_response_hypothesis === '';
        none && s.oracle_basis !== 'unknown' && add('scenario ' + id + ': without an expected_response_hypothesis its oracle_basis is unknown');
        !none && s.oracle_basis === 'unknown' && add('scenario ' + id + ': with an expected_response_hypothesis its oracle_basis isn\'t unknown');
        TESTABILITY.indexOf(s.testability) < 0 && add('scenario ' + id + ': testability must be supported, uncertain or unsupported');
        CONFIDENCE.indexOf(s.confidence) < 0 && add('scenario ' + id + ': confidence must be low, medium or high');
        blocksOk(s.source_block_ids, 'scenario ' + id);
        if (s.tested_by !== undefined && s.tested_by !== null) {
            // missing: none (an answer without it isn't repaired for that alone)
            !Array.isArray(s.tested_by)
                ? add('scenario ' + id + ': tested_by must be a list of the names of the learner\'s tests that test it ([] if none)')
                : s.tested_by.forEach(
                      (n: any) =>
                          learnerTests.indexOf(n) < 0 &&
                          add('scenario ' + id + ': tested_by: the learner has no test "' + n + '"' + (learnerTests.length ? ' (their tests: ' + learnerTests.map((x) => '"' + x + '"').join(', ') + ')' : ' (they have no tests)'))
                  );
        }
    }

    // branch coverage: every outcome the simulator can make happen is on a path that isn't unsupported
    const targets = targetsOf(answer);
    for (const d of arrayOf(answer.decision_points)) {
        for (const b of arrayOf(d && d.branches)) {
            b && b.feasibility === 'supported' && index.outcome[b.id] && targets.indexOf(b.id) < 0 && add('branch ' + b.id + ' is supported, but no path targets it: add it to a path, or say why it is uncertain or unsupported');
        }
    }
    answer.analysis_status === 'ok' && !Object.keys(scenarios).length && add('the analysis is ok but has no scenarios');
    // few scenarios, each a situation the learner would name (2026-11-06: a line follower got 5: following the line, one per steering outcome and one
    // per boundary, and so 8 tests, 7 of them about its steering)
    const ids = Object.keys(scenarios);
    ids.length > MAX_SCENARIOS &&
        add('there are ' + ids.length + ' scenarios, at most ' + MAX_SCENARIOS + ': a scenario is a situation the learner would name, not one per decision outcome or per input class; merge them');
    const outcomesOf = (id: string) =>
        arrayOf(scenarios[id].path_ids)
            .map((p: string) => paths[p])
            .filter((p: any) => p)
            .reduce((all: string[], p: any) => all.concat(arrayOf(p.branch_ids)), [])
            .filter((b: string, i: number, all: string[]) => all.indexOf(b) === i)
            .sort()
            .join();
    ids.forEach((a, i) =>
        ids.slice(i + 1).forEach((b) => {
            const same = outcomesOf(a);
            same && same === outcomesOf(b) && add('scenarios ' + a + ' and ' + b + ' take the same outcomes (' + same + '): they are one situation; merge them (an input class is an input of the path, not a scenario)');
        })
    );
    return problems;
}

// ------------------------------------------------------------------------------------------------ the tests

/** the analysis' paths of a test, with their dimensions */
function pathsOf(test: any, analysis: any): any[] {
    const ids = arrayOf(test.path_ids);
    return arrayOf(analysis.scenario_paths).filter((p: any) => p && ids.indexOf(p.id) >= 0);
}

/**
 * the scenarios generate writes tests for, one call each (2026-11-05: one call for all of them crammed unrelated scenarios into one world, and at
 * effort low ran into the token cap): those that are testable, have an expected behaviour and that none of the learner's tests tests (tested_by);
 * and those the learner's tests test, with the names of those tests
 */
export function scenariosToWrite(analysis: any): { write: string[]; tested: { id: string; by: string[] }[] } {
    const write: string[] = [];
    const tested: { id: string; by: string[] }[] = [];
    arrayOf(analysis && analysis.scenarios).forEach((s: any) => {
        if (!s || !isText(s.id)) {
            return;
        }
        const by = arrayOf(s.tested_by).filter(isText);
        if (by.length) {
            tested.push({ id: s.id, by: by });
        } else if (s.testability !== 'unsupported' && s.oracle_basis !== 'unknown') {
            write.push(s.id);
        }
    });
    return { write: write, tested: tested };
}

/** the part of the analysis one generate call is about: these scenarios and their paths (its checks and coverage are about them only) */
export function analysisFor(analysis: any, ids: string[]): any {
    const scenarios = arrayOf(analysis && analysis.scenarios).filter((s: any) => s && ids.indexOf(s.id) >= 0);
    const pathIds: string[] = [];
    scenarios.forEach((s: any) => arrayOf(s.path_ids).forEach((p: string) => pathIds.push(p)));
    const paths = arrayOf(analysis && analysis.scenario_paths).filter((p: any) => p && (pathIds.indexOf(p.id) >= 0 || ids.indexOf(p.scenario_id) >= 0));
    return Object.assign({}, analysis, { scenarios: scenarios, scenario_paths: paths });
}

/**
 * the deferrals of the scenarios the learner's tests test (for the coverage plan of the merged answer): the scenarios, and the outcomes of their
 * paths that no new test plans, each "tested by" their tests
 */
export function testedDeferrals(analysis: any, tested: { id: string; by: string[] }[], planned: string[]): { scenarios: any[]; branches: any[] } {
    const scenarios: any[] = [];
    const branches: any[] = [];
    tested.forEach((t) => {
        const reason = 'tested by ' + t.by.map((n) => '"' + n + '"').join(', ');
        scenarios.push({ scenario_id: t.id, reason: reason });
        arrayOf(analysisFor(analysis, [t.id]).scenario_paths).forEach((p: any) =>
            arrayOf(p.branch_ids).forEach((b: string) => planned.indexOf(b) < 0 && !branches.some((x) => x.branch_id === b) && branches.push({ branch_id: b, reason: reason }))
        );
    });
    return { scenarios: scenarios, branches: branches };
}

/** the input classes of the analysis' paths (all of them, or those that aren't unsupported): {dimension → classes} */
function classesOf(analysis: any, unsupportedToo: boolean): { [dimension: string]: string[] } {
    const out: { [dimension: string]: string[] } = {};
    arrayOf(analysis && analysis.scenario_paths)
        .filter((p: any) => p && (unsupportedToo || p.testability !== 'unsupported'))
        .forEach((p: any) =>
            arrayOf(p.input_dimensions).forEach((d: any) => {
                if (!d || !isText(d.dimension)) {
                    return;
                }
                const e = (out[d.dimension] = out[d.dimension] || []);
                arrayOf(d.equivalence_classes).forEach((c: string) => isText(c) && e.indexOf(c) < 0 && e.push(c));
            })
        );
    return out;
}

/** a realization's parts that aren't in the test: problems */
function realizationProblems(r: any, test: FORMAT.AiTest, world: FORMAT.Resolved): string[] {
    const out: string[] = [];
    if (!r || typeof r !== 'object' || !Object.keys(r).length) {
        return ['realized_by needs what of the test realizes it: its start or items'];
    }
    r.start !== undefined && r.start !== test.start && out.push('realized_by.start "' + r.start + '" is not the test\'s start ("' + test.start + '")');
    const items = world.data.world.items.map((i) => i.id);
    arrayOf(r.items).forEach((i: string) => items.indexOf(i) < 0 && out.push('realized_by.items: the world has no thing "' + i + '"'));
    arrayOf(r.events).forEach((e: number) => !(e >= 0 && e < (test.world || []).length) && out.push('realized_by.events: the set-up has no event ' + e + ' (it has ' + (test.world || []).length + ', counted from 0)'));
    arrayOf(r.globals).forEach((g: string) => !(test.globals && g in test.globals) && out.push('realized_by.globals: the test sets no variable "' + g + '"'));
    return out;
}

/**
 * the problems of an answer's tests (generate, or the tests of a fix), checked against the analysis (TestGenerationAgent_v3 §8): each test's
 * scenario, paths, planned outcomes, input classes (and what realizes them), expected results, postconditions, oracle, a positive check, its
 * blocks; then, for generate (not a fix), the answer: at most MAX_TESTS tests, every target outcome planned or deferred, every class tested or
 * deferred, every scenario tested or deferred, the status. No boundaries: boundary value analysis is left out (see the top).
 */
export function checkTests(
    answer: any,
    worlds: FORMAT.Resolved[],
    analysis: any,
    index: Index,
    sentence: string,
    fix: boolean,
    maxTests: number = MAX_TESTS,
    only: string[] = null, // one generate call of several: the scenarios it writes (the analysis is their part)
    whole: any = null // … and the whole analysis: a test's classes may come from any of its paths
): FORMAT.Problem[] {
    const problems: FORMAT.Problem[] = [];
    analysis = analysis || {};
    // the classes a test may name: those of every path of the (whole) analysis (2026-11-05: "dimension not of its paths" left out good tests on
    // every effort and API, for a test of one path that needs an input of another: a bright floor in a test of stopping at a wall)
    const named = classesOf(whole || analysis, true);
    const scenarios: { [id: string]: any } = {};
    arrayOf(analysis.scenarios).forEach((s: any) => s && (scenarios[s.id] = s));
    const dims = classesOf(analysis, false);
    let count = 0;
    for (const w of worlds) {
        for (const t of w.tests) {
            count++;
            const add = (message: string) => problem(problems, message, w.name, t.name);
            const s = scenarios[t.scenario_id];
            if (!s && only && only.length) {
                // a test of another scenario of the analysis: the rest of its problems would only be noise
                add('this call writes tests only for scenario ' + only.join(', ') + ' (see the task): leave this test out; ' + (t.scenario_id || 'its scenario') + ' gets its own call');
                continue;
            }
            if (!s) {
                add('scenario_id: there is no scenario "' + t.scenario_id + '" in the analysis');
            } else if (s.oracle_basis === 'unknown') {
                add('scenario ' + s.id + ' has no defensible expected behaviour (oracle_basis unknown): leave the test out and defer the scenario');
            }
            const own = s ? arrayOf(s.path_ids) : [];
            const ps = arrayOf(t.path_ids);
            ps.length || add('path_ids: name the paths of ' + (t.scenario_id || 'its scenario') + ' it follows');
            ps.forEach((p: string) => own.indexOf(p) < 0 && add('path_ids: "' + p + '" is not a path of scenario ' + t.scenario_id + ' (its paths: ' + (own.join(', ') || 'none') + ')'));
            Array.isArray(t.planned_branch_ids) || add('planned_branch_ids: the outcomes its run should take (a list, empty for a path without decisions)');
            // any outcome of the program's decisions: a run takes outcomes on its way to the path's (2026-11-05: "D1.else is not on its paths" left out
            // nearly every wall test, which drives with nothing ahead, D1.else, before it sees the wall); "not checked" shows if one never happens
            arrayOf(t.planned_branch_ids).forEach((b: string) => !index.outcome[b] && add('planned_branch_ids: "' + b + '" is not an outcome of the program\'s decisions'));
            const sel = t.input_selection;
            if (!sel || !Array.isArray(sel.equivalence_partitions)) {
                add('input_selection needs equivalence_partitions (a list; may be empty)');
            } else {
                const where = (d: string) => (named[d] ? '' : 'dimension "' + d + '" is not one of the analysis\' (' + (Object.keys(named).map((x) => '"' + x + '"').join(', ') || 'none') + ')');
                for (const e of sel.equivalence_partitions) {
                    const bad = !e ? 'an empty class' : where(e.dimension) || (named[e.dimension].indexOf(e.class) < 0 ? 'class "' + e.class + '" is not one of "' + e.dimension + '" (' + named[e.dimension].map((c) => '"' + c + '"').join(', ') + ')' : '');
                    bad && add('input_selection: ' + bad);
                    e && !isText(e.selected_realization) && add('input_selection: class "' + e.class + '" needs its selected_realization');
                    e && realizationProblems(e.realized_by, t, w).forEach((m) => add('input_selection, class "' + e.class + '": ' + m));
                }
            }
            arrayOf(t.expected_results).filter(isText).length || add('expected_results: say what the robot should observably do (at least one)');
            Array.isArray(t.postconditions) || add('postconditions: a list (may be empty if nothing holds at the end)');
            arrayOf(t.postconditions).forEach((p: any, i: number) => {
                !p || !isText(p.description) ? add('postcondition ' + i + ' needs a description') : null;
                const ci = arrayOf(p && p.check_indices);
                ci.length || add('postcondition ' + i + ' needs the check_indices of the checks that decide it');
                ci.forEach((c: number) => !(Number.isInteger(c) && c >= 0 && c < t.checks.length) && add('postcondition ' + i + ': there is no check ' + c + ' (the test has ' + t.checks.length + ', counted from 0)'));
            });
            const o = t.oracle;
            if (!o || ORACLE_BASES.indexOf(o.basis) < 0) {
                add('oracle.basis must be one of ' + ORACLE_BASES.join(', '));
            } else {
                o.basis === 'learner_description' && !sentence && add("oracle.basis can't be learner_description: the learner wrote no sentence");
                o.basis === 'inferred_from_program' &&
                    sentence &&
                    add(
                        "oracle.basis can't be inferred_from_program: the learner wrote a sentence, so the test expects what it says (learner_description) or what safety asks (applicable_safety). What their sentence doesn't say gets no test: defer it"
                    );
                CONFIDENCE.indexOf(o.confidence) < 0 && add('oracle.confidence must be low, medium or high');
                Array.isArray(o.assumptions) || add('oracle.assumptions: a list (may be empty)');
                typeof o.review_required !== 'boolean' && add('oracle.review_required must be true or false');
            }
            t.checks.some((c) => POSITIVE.indexOf(c.check) >= 0) ||
                add('it has only never_bumps / never_touches, which hold for a robot that never moves: add a check that shows its scenario happened (reaches, ends_in, does, whenever, after, variable)');
            contradictions(t.checks).forEach((m) => add(m));
            // a turn away ends what the robot sees within a fraction of a second: a `whenever` that waits longer has nothing to decide (2026-11-05: two
            // tests of turning away from a wall passed, but were shown as not checked, with after_ms 200)
            const seesObstacle = (c: any) => /^obstacle_/.test(String(c.when || ''));
            const turns = (c: any) => c.does === 'turns_left' || c.does === 'turns_right';
            t.checks
                .filter((c: any) => c && c.check === 'whenever' && turns(c) && !seesObstacle(c) && c.after_ms > 50)
                .forEach((c: any) =>
                    add(
                        'a "whenever" with "' + c.does + '" and after_ms ' + c.after_ms + ': turning ends what the robot sees sooner, so the check would have nothing to decide. Leave after_ms out (0): the program reacts in the next frame'
                    )
                );
            // 2026-11-07 (phase 5, round 3): checks a right program fails. Turning away from a wall: one that turns in steps drives on between
            // them while the wall is in view; standing still at once: one that reads another sensor sees the wall a few frames later
            t.checks
                .filter((c: any) => c && c.check === 'whenever' && turns(c) && seesObstacle(c))
                .forEach((c: any) =>
                    add(
                        'a "whenever ' +
                            c.when +
                            ', ' +
                            c.does +
                            '": a right program that turns in steps drives on between them while it still sees the thing, and fails it. Test turning away by where the robot gets to (it gets past the wall without bumping: reaches, never_bumps)'
                    )
                );
            t.checks
                .filter((c: any) => c && c.check === 'whenever' && c.does === 'stands_still' && !(c.after_ms >= 200))
                .forEach((c: any) =>
                    add(
                        'a "whenever ' +
                            c.when +
                            ', stands_still" with after_ms ' +
                            (c.after_ms || 0) +
                            ': give the robot 200 ms or more (a right program may see it a few frames later with another sensor, and needs a frame to stop)'
                    )
                );
            w.data && w.data.world && arrivalProblems(t, w.data.world).forEach((m) => add(m));
            if (index.lineTracker && w.data && w.data.world) {
                const beside = arrayOf(t.input_selection && t.input_selection.equivalence_partitions)
                    .map((e: any) => e && e.class)
                    .filter((c: any) => isText(c) && BESIDE.test(c) && !/\bon the line\b/i.test(c))[0];
                lineProblems(w.data.world, (w.data.world.starts || []).filter((s) => s.id === t.start)[0], beside, index.floor).forEach((m) => add(m));
                // a line follower is tested by where it gets to, not by how it steers: its positive checks only "whenever it sees (no) line, it turns"
                // or "always turns" repeat the program (2026-11-06: 7 of 8 tests of a line follower were such)
                const positive = t.checks.filter((c: any) => POSITIVE.indexOf(c.check) >= 0);
                const steering = (c: any) => (c.check === 'whenever' && (c.when === 'line' || c.when === 'no_line')) || (c.check === 'does' && (c.does === 'turns_left' || c.does === 'turns_right'));
                positive.length &&
                    positive.every(steering) &&
                    add('it only checks how the line follower steers, which is the program itself: check where it gets to (it reaches a goal area over the line\'s end), or leave the test out');
            }
            arrayOf(t.source_block_ids).forEach((b: string) => index.toReal[b] === undefined && add('source_block_ids: there is no block "' + b + '"'));
            isText(t.reason) || add('reason: one sentence, why this test is in the set');
        }
    }
    if (fix) {
        return problems;
    }
    const add = (message: string) => problem(problems, message);
    count > maxTests && add('the answer has ' + count + ' tests, at most ' + maxTests + ': leave out those that test the same as another (consolidate), and defer what doesn\'t fit');
    STATUSES.indexOf(answer && answer.generation_status) < 0 && add('generation_status must be one of ' + STATUSES.join(', '));
    const tests: FORMAT.AiTest[] = [];
    worlds.forEach((w) => tests.push(...w.tests));
    const plan = (answer && answer.coverage_plan) || {};
    if (!plan || !Array.isArray(plan.deferred_branch_ids) || !Array.isArray(plan.deferred_inputs)) {
        add('coverage_plan needs target_branch_ids, planned_covered_branch_ids, deferred_branch_ids and deferred_inputs');
    }
    const deferredBranches = arrayOf(plan.deferred_branch_ids).filter((d: any) => d && isText(d.reason)).map((d: any) => d.branch_id);
    const planned: string[] = [];
    tests.forEach((t) => arrayOf(t.planned_branch_ids).forEach((b: string) => planned.push(b)));
    targetsOf(analysis).forEach(
        (b) => planned.indexOf(b) < 0 && deferredBranches.indexOf(b) < 0 && add('outcome ' + b + ' is on a path of the analysis, but no test plans it: write a test whose run takes it, or defer it (coverage_plan.deferred_branch_ids, with the reason)')
    );
    const deferredInputs = arrayOf(plan.deferred_inputs).filter((d: any) => d && isText(d.reason));
    const isDeferred = (dimension: string, value: string) => deferredInputs.some((d: any) => d.dimension === dimension && d.value === value);
    Object.keys(dims).forEach((dimension) =>
        dims[dimension].forEach((c) => {
            const tested = tests.some((t) => arrayOf(t.input_selection && t.input_selection.equivalence_partitions).some((e: any) => e && e.dimension === dimension && e.class === c));
            tested || isDeferred(dimension, c) || add('input class "' + c + '" of "' + dimension + '": no test stands for it: write one, or defer it (coverage_plan.deferred_inputs, with the reason)');
        })
    );
    const deferredScenarios = arrayOf(answer && answer.deferred_scenarios).filter((d: any) => d && isText(d.reason)).map((d: any) => d.scenario_id);
    Object.keys(scenarios).forEach((id) => {
        const s = scenarios[id];
        const due = s.testability !== 'unsupported' && s.oracle_basis !== 'unknown';
        due && !tests.some((t) => t.scenario_id === id) && deferredScenarios.indexOf(id) < 0 && add('scenario ' + id + ' ("' + s.title + '") has no test: write one, or defer it (deferred_scenarios, with the reason)');
    });
    const none = answer && answer.generation_status === 'no_valid_scenarios';
    none && count && add('generation_status is no_valid_scenarios, but the answer has tests');
    !none && !count && add('the answer has no tests: write them, or say generation_status no_valid_scenarios');
    return problems;
}

/**
 * 2026-11-07 (phase 5, round 4): a reaction to something the robot drives up to ("whenever obstacle_ahead, stands_still", "after obstacle") holds
 * for a robot that never gets there: a test with one, whose robot sees nothing at the start, also checks where it gets to (reaches, ends_in).
 * Round 3: "Stop at the wall." was tested by that `whenever` and never_bumps only, and the broken versions that don't move passed; with an area
 * before the wall that the robot ends in, every right version passes and every broken one fails (check_round4.py).
 */
export function arrivalProblems(t: FORMAT.AiTest, world: SIM.SimWorld): string[] {
    const reacts = t.checks.filter((c: any) => c && ((c.check === 'whenever' && /^obstacle_/.test(String(c.when || ''))) || (c.check === 'after' && c.event === 'obstacle')));
    const start = (world.starts || []).filter((s) => s.id === t.start)[0];
    if (!reacts.length || !start || t.checks.some((c: any) => c.check === 'reaches' || c.check === 'ends_in')) {
        return [];
    }
    if (SIM.infrared(world, start.x, start.y, start.heading || 0).seen.some(Boolean)) {
        return []; // it sees the thing at the start: the reaction is decided at once
    }
    return [
        'it checks what the robot does when it sees something ("' +
            (reacts[0].when || 'after ' + reacts[0].event) +
            '"), which holds for a robot that never gets there: it sees nothing at the start. Show that it gets there: a goal area just before the thing, and ends_in it ("A wall ahead" in "Tests"), or reaches',
    ];
}

/** what the robot can't do in the same frame: turning left and right, standing still and moving, an LED on and off, playing and silent */
const EXCLUSIVE: string[][] = [
    ['turns_left', 'turns_right'],
    ['drives_forward', 'drives_backward'],
    ['stands_still', 'drives_forward'],
    ['stands_still', 'drives_backward'],
    ['stands_still', 'turns_left'],
    ['stands_still', 'turns_right'],
    ['left_led_on', 'left_led_off'],
    ['right_led_on', 'right_led_off'],
    ['leds_on', 'leds_off'],
    ['leds_on', 'left_led_off'],
    ['leds_on', 'right_led_off'],
    ['leds_off', 'left_led_on'],
    ['leds_off', 'right_led_on'],
    ['plays_sound', 'silent'],
];

/**
 * the checks of a test that can't both hold: two `does` (each holds to the end of the run, so they overlap), or two `whenever` with the same
 * condition, that ask for what the robot can't do at the same time (2026-11-05: "it doesn't turn" was written as `does turns_left` and `does
 * turns_right`, a test no program passes)
 */
export function contradictions(checks: any[]): string[] {
    const out: string[] = [];
    const clash = (a: string, b: string) => EXCLUSIVE.some((p) => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a));
    arrayOf(checks).forEach((c: any, i: number) =>
        arrayOf(checks).forEach((d: any, j: number) => {
            if (j <= i || !c || !d || !clash(c.does, d.does)) {
                return;
            }
            const both = c.check === 'does' && d.check === 'does';
            const same = c.check === 'whenever' && d.check === 'whenever' && c.when === d.when && (c.percent || null) === (d.percent || null);
            (both || same) &&
                out.push(
                    'checks ' + i + ' and ' + j + " can't both hold: the robot can't " + c.does + ' and ' + d.does + ' at the same time' + (both ? ' (each `does` holds to the end of the run)' : '') + '. For "it doesn\'t …", check what it does instead (`does` `stands_still`, `drives_forward`)'
                );
        })
    );
    return out;
}

/** the answer-wide problems (no world, no test): they don't leave a test out */
export function isAnswerWide(p: FORMAT.Problem): boolean {
    return !p.world && p.test === null;
}

/**
 * the coverage plan of the tests that are left (after the repairs, the tests left out and the duplicates), computed here (the model's isn't trusted):
 * every outcome of the program's decisions, the tests that plan it, why it isn't planned (deferred by the model, unsupported in the analysis, or
 * lost: its test was left out)
 */
export function planOf(worlds: FORMAT.Resolved[], analysis: any, index: Index, answer: any): Plan {
    const plan = (answer && answer.coverage_plan) || {};
    const target = targetsOf(analysis);
    const planned: string[] = [];
    const by: { [outcome: string]: string[] } = {};
    worlds.forEach((w) =>
        w.tests.forEach((t) =>
            arrayOf(t.planned_branch_ids).forEach((b: string) => {
                index.outcome[b] && planned.indexOf(b) < 0 && planned.push(b);
                (by[b] = by[b] || []).push(t.name);
            })
        )
    );
    const deferred = arrayOf(plan.deferred_branch_ids).filter((d: any) => d && index.outcome[d.branch_id] && planned.indexOf(d.branch_id) < 0 && isText(d.reason));
    const feasibility: { [outcome: string]: any } = {};
    arrayOf(analysis && analysis.decision_points).forEach((d: any) => arrayOf(d && d.branches).forEach((b: any) => b && (feasibility[b.id] = b)));
    const lost = target.filter((b) => planned.indexOf(b) < 0 && !deferred.some((d: any) => d.branch_id === b));
    const outcomes: OutcomePlan[] = [];
    index.decisions.forEach((d) =>
        d.outcomes.forEach((o) => {
            const def = deferred.filter((x: any) => x.branch_id === o.id)[0];
            const f = feasibility[o.id];
            const why = planned.indexOf(o.id) >= 0 ? null : def ? def.reason : lost.indexOf(o.id) >= 0 ? 'its test was left out' : f && f.feasibility !== 'supported' ? f.reason || f.feasibility : 'no path of the analysis takes it';
            outcomes.push({ id: o.id, decision: d.id, block: d.block, words: o.outcome, planned: by[o.id] || [], deferred: why, seen: null });
        })
    );
    const said = arrayOf(plan.planned_covered_branch_ids).slice().sort().join();
    return {
        outcomes: outcomes,
        target: target,
        planned: planned,
        deferred: deferred,
        lost: lost,
        deferredInputs: arrayOf(plan.deferred_inputs).filter((d: any) => d && isText(d.reason)),
        deferredScenarios: arrayOf(answer && answer.deferred_scenarios).filter((d: any) => d && isText(d.reason)),
        corrected: said !== planned.slice().sort().join(),
    };
}

/** the plan with how often the runs took each outcome (the runs of the chosen tests, summed) */
export function withSeen(plan: Plan, seen: { [outcome: string]: number }[]): Plan {
    const out: Plan = JSON.parse(JSON.stringify(plan));
    out.outcomes.forEach((o) => (o.seen = seen.reduce((n, s) => n + (s[o.id] || 0), 0)));
    return out;
}

// ------------------------------------------------------------------------------------------------ the semantics of a run

/**
 * why a test that passed is not checked (TestGenerationAgent_v3 G5, §8): a check had nothing to decide, or an outcome its run should have taken never
 * happened; [] if neither (a test that failed is failed, not unchecked)
 *
 * @param label the label of a block (for the words)
 * @param analysis the analysis (if given, only the planned outcomes on the test's own paths count: 2026-11-05, a test planned outcomes it never needed,
 *        "a wall on the right" in a test of a wall on the left, and passed but was shown as not checked)
 */
export function notCheckedWhy(report: any, test: FORMAT.AiTest, index: Index, label?: (block: string) => string, analysis?: any): { text: string; block: string }[] {
    if (!report || report.outcome !== 'passed') {
        return [];
    }
    const out: { text: string; block: string }[] = [];
    (report.checks || []).filter((c: any) => c.passed === null).forEach((c: any) => out.push({ text: 'nothing to decide for “' + (c.text || c.check) + '”', block: null }));
    const seen = seenIn(report, index);
    const onPaths: string[] = [];
    analysis && pathsOf(test, analysis).forEach((p: any) => arrayOf(p.branch_ids).forEach((b: string) => onPaths.push(b)));
    arrayOf(test.planned_branch_ids)
        .filter((b: string) => !onPaths.length || onPaths.indexOf(b) >= 0)
        .forEach((b: string) => {
            const o = index.outcome[b];
            o && !seen[b] && out.push({ text: o.outcome.outcome.replace(/: .*$/, '') + ': never happened', block: o.decision.block });
        });
    return out;
}

/** the planned outcomes of a test and how often its run took them, for the model (the task fix): "D1.1 (…): taken 34×; D2.else (…): never taken" */
export function plannedText(report: any, test: FORMAT.AiTest, index: Index): string {
    const planned = arrayOf(test.planned_branch_ids).filter((b: string) => index.outcome[b]);
    if (!planned.length) {
        return null;
    }
    const seen = seenIn(report, index);
    return planned.map((b: string) => b + ' (' + index.outcome[b].outcome.outcome + '): ' + (seen[b] ? 'taken ' + seen[b] + '×' : 'never taken')).join('; ');
}

// what a fix may not change (tasks.md, "Task: fix"): all but the world, start, until, max_time_ms and the realizations
const FROZEN = ['scenario', 'scenario_id', 'path_ids', 'planned_branch_ids', 'expected_results', 'postconditions', 'oracle', 'source_block_ids', 'reason'];

/** a value with sorted keys, for comparing */
function canonical(value: any): string {
    if (Array.isArray(value)) {
        return '[' + value.map(canonical).join(',') + ']';
    }
    if (value && typeof value === 'object') {
        return '{' + Object.keys(value).filter((k) => value[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
    }
    return JSON.stringify(value === undefined ? null : value);
}

/** a test's checks with the things they are about as their roles (a fix may draw the world anew, with other ids) */
function checksOf(test: FORMAT.AiTest, world: FORMAT.Resolved): string {
    const role = (id: string) => {
        const item = world.data.world.items.filter((i) => i.id === id)[0];
        return item ? 'a ' + (item.role || item.kind) : id;
    };
    return canonical(test.checks.map((c) => Object.assign({}, c, { item: c.item ? role(c.item) : undefined })));
}

function selectionOf(test: FORMAT.AiTest): string {
    const sel = test.input_selection || {};
    return canonical(arrayOf(sel.equivalence_partitions).map((e: any) => e && [e.dimension, e.class]));
}

/**
 * the problems of a fixed test: what it may not change (its expectation, its checks, what it is for) differs from the test it fixes (TestGenerationAgent
 * §8: only an invalid or untriggered scenario may be corrected; a failed test is never made to expect less)
 */
export function frozenProblems(fixed: FORMAT.AiTest, fixedWorld: FORMAT.Resolved, original: FORMAT.AiTest, originalWorld: FORMAT.Resolved): string[] {
    const out: string[] = [];
    FROZEN.forEach((k) => canonical((fixed as any)[k]) !== canonical((original as any)[k]) && out.push(k));
    checksOf(fixed, fixedWorld) !== checksOf(original, originalWorld) && out.push('checks');
    selectionOf(fixed) !== selectionOf(original) && out.push('the classes of input_selection');
    return out.length ? ['a fix may change only the world, start, until, max_time_ms and the realizations of its inputs; it changed ' + out.join(', ') + ': keep them as they were'] : [];
}
