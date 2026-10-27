/**
 * What the program did in a test of a simulation world, in NEPO terms: the record of a run, and the facts of a failure.
 *
 * nepoTest.simRun observes the simulator's interpreter from outside, through its own instances: it wraps the State's getOp and the robot
 * behaviour's getSample. Nothing of the simulator changes, its debugger stays off (it would highlight blocks in the Program tab), and the
 * wrappers never throw and never call Date (nepoTest.simRun's runFrame counts Date calls as operations).
 * - ProgramModel: the program's blocks, from its XML (type, fields, nesting), to tell statements from values and to find the innermost one.
 * - scanDecisions: the conditional jumps of the compiled program that decide something (if, wait until, repeat while), found before the
 *   interpreter's State turns jump labels into indexes. AbstractStackMachineVisitor compiles case k of an if into "jump to i_{k+1}_n if the
 *   condition is false", the condition k of a wait into "... to w_{k+1}_n", the condition of a while loop into "... to r_e_n"; the compound's
 *   start comment begins its block (the block's id is in the comment's "+").
 * - Recorder: during the run, per frame of 1/60 s: the sensors the program read (and the block that read them), the decisions it took and
 *   the readings they were based on, the statement blocks that began, the block in effect for each actuator and its values, the program's
 *   global variables, the simulator's sensor values (what the robot could sense: nepoTest.simBehaviour's conditions), and what the robot did
 *   (pose, wheel speeds, LEDs, sound, bumps, areas touched); and where it started (`initial`). The
 *   blocks that run are found as the debugger finds them (State.evalHighlightings): an operation's "+" begins blocks, the next operation
 *   ends those in the previous one's "-".
 * - facts: for a failed check, the second before it: what the robot sensed, what ran (decisions and actions), what it remembered, what it
 *   did. factLines puts them into words, with the blocks as chips.
 * - trace: the record in steps of 100 ms, for the report (and the replay: what ran, what the program read, what the robot could sense).
 * - What an action block does: the block in effect for an actuator at a time (inEffectAt), the wheel speeds a motor action sets, as the
 *   simulator sets them (wheelsAfter), and how the robot moves at those speeds (motionOf). nepoTest.simVerdict blames blocks with them.
 */
import * as C from 'interpreter.constants';

// ------------------------------------------------------------------------------------------------ the program's blocks

export interface BlockInfo {
    id: string;
    type: string;
    fields: { [name: string]: string };
    parent: string; // the enclosing block's id, or null
    input: string; // the parent's input it is in (DO0, ELSE, ...)
    statement: boolean; // a statement (in a statement input, or at the top), not a value
    depth: number; // how many blocks enclose it
}

const IFS = ['robControls_if', 'robControls_ifElse', 'controls_if'];
const LITERALS = ['math_number', 'math_integer', 'logic_boolean', 'logic_null', 'text', 'robColour_picker'];

export class ProgramModel {
    readonly blocks: { [id: string]: BlockInfo } = {};
    /** the program's global variables (its declarations in the start block) */
    readonly globals: string[] = [];
    /** the blocks in a block's inputs, in their order */
    readonly children: { [id: string]: BlockInfo[] } = {};

    constructor(xml: string) {
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        const instances = Array.prototype.slice.call(doc.getElementsByTagName('instance')) as Element[];
        instances.forEach((instance) => this.visit(instance, null, true));
    }

    private visit(container: Element, parent: BlockInfo, statement: boolean, input: string = null): void {
        for (let el = container.firstElementChild; el; el = el.nextElementSibling) {
            if (el.localName !== 'block') {
                continue;
            }
            const info: BlockInfo = {
                id: el.getAttribute('id'),
                type: el.getAttribute('type'),
                fields: {},
                parent: parent ? parent.id : null,
                input: input,
                statement: statement,
                depth: parent ? parent.depth + 1 : 0,
            };
            this.blocks[info.id] = info;
            parent && (this.children[parent.id] = this.children[parent.id] || []).push(info);
            this.visitInputs(el, info);
            if (info.type === 'robGlobalVariables_declare' && info.fields.VAR) {
                this.globals.push(info.fields.VAR);
            }
        }
    }

    private visitInputs(block: Element, info: BlockInfo): void {
        for (let el = block.firstElementChild; el; el = el.nextElementSibling) {
            if (el.localName === 'field') {
                info.fields[el.getAttribute('name')] = el.textContent;
            } else if (el.localName === 'value') {
                this.visit(el, info, false, el.getAttribute('name'));
            } else if (el.localName === 'statement') {
                this.visit(el, info, true, el.getAttribute('name'));
            } else if (el.localName === 'repetitions') {
                this.visitInputs(el, info); // robControls_ifElse and others wrap their inputs
            }
        }
    }

    /** the input of `ancestor` that a block is in (DO0, ELSE, ...), or null if it isn't in it */
    inputWithin(id: string, ancestor: string): string {
        for (let b = this.blocks[id]; b && b.parent; b = this.blocks[b.parent]) {
            if (b.parent === ancestor) {
                return b.input;
            }
        }
        return null;
    }

    /** the block in an input of a block (the first one, of a statement input) */
    child(id: string, input: string): BlockInfo {
        return (this.children[id] || []).filter((c) => c.input === input)[0] || null;
    }

    /** the innermost if a block is in, and in which part: "yes" (its first condition held), "yes, condition 2", "no"; or null */
    branchOf(id: string): { block: string; part: string } {
        for (let b = this.blocks[id]; b && b.parent; b = this.blocks[b.parent]) {
            const parent = this.blocks[b.parent];
            const m = /^DO(\d+)$/.exec(b.input || '');
            if (parent && IFS.indexOf(parent.type) >= 0 && (m || b.input === 'ELSE')) {
                return { block: parent.id, part: m ? (m[1] === '0' ? 'yes' : 'yes, condition ' + (Number(m[1]) + 1)) : 'no' };
            }
        }
        return null;
    }

    type(id: string): string {
        return this.blocks[id] ? this.blocks[id].type : null;
    }

    /** a block of the program, not a literal value and not one the test made (nepoTest.simRun programFor) */
    isProgramBlock(id: string): boolean {
        const b = this.blocks[id];
        return !!b && id.indexOf('nepoTest') !== 0 && !(LITERALS.indexOf(b.type) >= 0 && !b.statement);
    }

    /** the innermost of these blocks (statements only, if `statements`); null if none is a program block */
    innermost(ids: string[], statements = false): string {
        let best: BlockInfo = null;
        for (const id of ids) {
            const b = this.isProgramBlock(id) && this.blocks[id];
            if (b && (!statements || b.statement) && (!best || b.depth >= best.depth)) {
                best = b;
            }
        }
        return best ? best.id : null;
    }
}

// ------------------------------------------------------------------------------------------------ the decisions of the compiled program

export interface DecisionInfo {
    block: string;
    kind: string; // if | wait | while
    k: number; // the case of an if (0: the first condition), the condition of a wait
}

const DECISION_TARGET = /^(i|w)_(\d+)_(\d+)$|^r_e_(\d+)$/;
const CASE_LABEL = /^(i|w)_\d+_\d+$|^r_l_\d+$/;

/**
 * marks the operations of a compiled program (its "ops", before new Interpreter): a decision's conditional jump gets `nepoTestDecision`
 * (DecisionInfo), the operation where a condition begins `nepoTestCase` (its sensor readings are the decision's). Counting loops (repeat n
 * times, for) aren't decisions of interest.
 */
export function scanDecisions(ops: any[], model: ProgramModel): void {
    const starts: { [compound: string]: any } = {};
    for (const op of ops) {
        if (op[C.OPCODE] !== C.COMMENT) {
            continue;
        }
        const label: string = op[C.LABEL];
        if (op[C.TYPE] === C.START && op[C.TEXT] === C.IF_STMT) {
            starts['i' + op[C.N]] = op;
        } else if (op[C.TYPE] === C.START && op[C.TEXT] === C.WAIT_STMT) {
            starts['w' + op[C.N]] = op;
        } else if (op[C.TYPE] === C.START && op[C.TEXT] === C.REPEAT_STMT && label && label.indexOf('r_l_') === 0) {
            starts['r' + label.substring(4)] = op; // a while (until) loop: its start comment is its head, where the condition begins
        }
        if (label && CASE_LABEL.test(label)) {
            op.nepoTestCase = true;
        }
    }
    for (const op of ops) {
        if (op[C.OPCODE] !== C.JUMP || op[C.CONDITIONAL] === C.ALWAYS || typeof op[C.TARGET] !== 'string') {
            continue;
        }
        const m = DECISION_TARGET.exec(op[C.TARGET]);
        const start = m && starts[(m[1] || 'r') + (m[3] || m[4])];
        const block = start && model.innermost(start[C.HIGHTLIGHT_PLUS] || [], true);
        if (block) {
            op.nepoTestDecision = { block: block, kind: m[1] === 'i' ? 'if' : m[1] === 'w' ? 'wait' : 'while', k: m[1] ? Number(m[2]) - 1 : 0 };
        }
    }
}

// ------------------------------------------------------------------------------------------------ the record

export interface Read {
    sensor: string;
    port: string;
    mode: string;
    block: string; // the block that read it
    count: number;
    values: any[][]; // [value, how often], the first few distinct values
    last: any;
}

export interface DecisionCount {
    block: string;
    kind: string;
    k: number;
    yes: number; // the condition held
    no: number;
    inputs: { [read: string]: any }; // the readings of the last time
}

export interface Frame {
    t: number; // ms, at the end of the frame
    x: number; // cm
    y: number;
    h: number; // heading, degrees (not wrapped)
    l: number; // wheel speeds (cm/s, forward positive), as the simulator moves the wheels
    r: number;
    leds: boolean[]; // left, right
    tone: boolean;
    bump: string; // undefined: no bump; null: the wall; else the obstacle's id
    touching: string[]; // the areas the robot touches
    reads: { [key: string]: Read };
    decisions: { [key: string]: DecisionCount };
    began: string[]; // the statement blocks that began in this frame
    running: string; // the innermost statement block running at the end of the frame
    sensors: { [key: string]: any }; // the simulator's sensor values at the end of the frame (infrared/line, sound/volume, ...; shared while unchanged)
}

/** the block in effect for an actuator, from when on */
export interface Effect {
    t: number;
    actuator: string; // motors | led LLED | led RLED | sound
    block: string;
    op: string;
    args: { [name: string]: any };
}

export interface Change {
    t: number;
    name: string;
    value: any;
    block?: string; // a global variable: the block that assigned it last (none: changed in place, or its declaration)
    times?: number; // how often it was assigned in the frame (a loop that doesn't wait: several times)
}

/** what the robot does in a frame, from the run (nepoTest.simRun) */
export interface FrameState {
    t: number;
    pose: number[];
    speeds: number[];
    leds: boolean[];
    tone: boolean;
    bump: string;
    touching: string[];
}

const ACTUATORS: { [opcode: string]: string } = {};
ACTUATORS[C.DRIVE_ACTION] = 'motors';
ACTUATORS[C.CURVE_ACTION] = 'motors';
ACTUATORS[C.TURN_ACTION] = 'motors';
ACTUATORS[C.MOTOR_ON_ACTION] = 'motors';
ACTUATORS[C.BOTH_MOTORS_ON_ACTION] = 'motors';
ACTUATORS[C.STOP_DRIVE] = 'motors';
ACTUATORS[C.MOTOR_STOP] = 'motors';
ACTUATORS[C.LED_ACTION] = 'led';
ACTUATORS[C.TONE_ACTION] = 'sound';
ACTUATORS[C.PLAY_FILE_ACTION] = 'sound';
const MAX_VALUES = 6;

function readKey(sensor: string, port: any, mode: any): string {
    return [sensor, port, mode].filter((p) => p !== undefined && p !== null && p !== '').join('/');
}

function same(a: any, b: any): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

/** a copy of a value of the program or a sensor (lists are copied: the program changes them in place) */
function copy(v: any): any {
    return Array.isArray(v) ? v.map(copy) : v;
}

export class Recorder {
    readonly frames: Frame[] = [];
    readonly effects: Effect[] = []; // only changes
    readonly globals: Change[] = []; // only changes of the program's global variables (the first: their values at the start)
    readonly sensors: Change[] = []; // only changes of the simulator's sensor values (hardwareState.sensors)
    /** the frame before the program starts: where the robot is, what its sensors see (begin) */
    initial: Frame = null;
    /** what went wrong in a wrapper (nothing is thrown into the interpreter) */
    failure: string = null;
    private open: string[] = []; // the blocks running, as the debugger keeps them
    private lastOp: any = null;
    private op: any = null; // the operation being executed
    private caseReads: { [key: string]: any } = {};
    private frame: Frame;
    private inEffect: { [actuator: string]: Effect } = {};
    private globalValues: { [name: string]: string } = {};
    private assigned: { [name: string]: { block: string; times: number } } = {}; // the block that assigned a global variable last in this frame, how often it was assigned
    private sensorValues: { [key: string]: any } = {};
    private changed = false; // sensorValues was copied in this frame (the frames before keep theirs)

    constructor(readonly model: ProgramModel, private state: any, private behaviour: any, private now: () => number) {
        this.frame = this.newFrame();
        const getOp = state.getOp; // the run's own wrapper (coverage) is already there: this one goes around it
        const recorder = this;
        state.getOp = function () {
            const op = getOp.call(state);
            if (op) {
                try {
                    recorder.operation(op);
                } catch (e) {
                    recorder.failure = recorder.failure || String((e && e.message) || e);
                }
            }
            return op;
        };
        const getSample = behaviour.getSample;
        behaviour.getSample = function (s: any, name: string, sensor: string, port: any, mode: any, slot: any) {
            getSample.call(behaviour, s, name, sensor, port, mode, slot);
            try {
                recorder.read(s, sensor, port, mode);
            } catch (e) {
                recorder.failure = recorder.failure || String((e && e.message) || e);
            }
        };
    }

    private newFrame(): Frame {
        return { t: 0, x: 0, y: 0, h: 0, l: 0, r: 0, leds: [false, false], tone: false, bump: undefined, touching: [], reads: {}, decisions: {}, began: [], running: null, sensors: {} };
    }

    /** the top of the interpreter's stack, or undefined (the State's own get0 throws on an empty stack) */
    private top(state: any, i = 0): any {
        const stack: any[] = state && state.stack;
        return stack && stack.length > i ? stack[stack.length - 1 - i] : undefined;
    }

    private operation(op: any): void {
        const plus: string[] = op[C.HIGHTLIGHT_PLUS] || [];
        const minus: string[] = (this.lastOp && this.lastOp[C.HIGHTLIGHT_MINUS]) || [];
        if (minus.length) {
            this.open = this.open.filter((id) => minus.indexOf(id) < 0 || plus.indexOf(id) >= 0);
        }
        for (const id of plus) {
            if (this.model.isProgramBlock(id) && this.open.indexOf(id) < 0) {
                this.open.push(id);
                this.model.blocks[id].statement && this.frame.began.indexOf(id) < 0 && this.frame.began.push(id);
            }
        }
        this.lastOp = op;
        this.op = op;
        if (op.nepoTestCase) {
            this.caseReads = {};
        }
        const decision: DecisionInfo = op.nepoTestDecision;
        if (decision) {
            const value = this.top(this.state); // the jump pops it: it jumps (past the case) if the condition is false
            const key = decision.block + ':' + decision.k;
            const d = this.frame.decisions[key] || (this.frame.decisions[key] = { block: decision.block, kind: decision.kind, k: decision.k, yes: 0, no: 0, inputs: {} });
            value === true || (value !== false && !!value) ? d.yes++ : d.no++;
            d.inputs = Object.assign({}, this.caseReads);
        }
        const actuator = ACTUATORS[op[C.OPCODE]];
        if (actuator) {
            this.effect(op, actuator === 'led' ? 'led ' + String(op[C.PORT]).toLowerCase() : actuator);
        }
        if ((op[C.OPCODE] === C.ASSIGN_STMT || op[C.OPCODE] === C.MATH_CHANGE) && this.model.globals.indexOf(op[C.NAME]) >= 0) {
            const assigned = this.assigned[op[C.NAME]];
            this.assigned[op[C.NAME]] = { block: this.model.innermost(this.open, true), times: assigned ? assigned.times + 1 : 1 };
        }
    }

    /** the values an action takes from the stack (the interpreter pops them when it runs the operation) */
    private args(op: any): { [name: string]: any } {
        const s = this.state;
        const speedOnly = op[C.SPEED_ONLY];
        const setTime = op[C.SET_TIME];
        const last = setTime ? 'time' : 'distance';
        switch (op[C.OPCODE]) {
            case C.DRIVE_ACTION:
                return speedOnly
                    ? { direction: op[C.DRIVE_DIRECTION], power: this.top(s) }
                    : { direction: op[C.DRIVE_DIRECTION], power: this.top(s, 1), [last]: this.top(s) };
            case C.CURVE_ACTION:
                return speedOnly
                    ? { direction: op[C.DRIVE_DIRECTION], left: this.top(s, 1), right: this.top(s) }
                    : { direction: op[C.DRIVE_DIRECTION], left: this.top(s, 2), right: this.top(s, 1), [last]: this.top(s) };
            case C.TURN_ACTION:
                return speedOnly
                    ? { direction: op[C.TURN_DIRECTION], power: this.top(s) }
                    : { direction: op[C.TURN_DIRECTION], power: this.top(s, 1), [setTime ? 'time' : 'degrees']: this.top(s) };
            case C.MOTOR_ON_ACTION:
                return speedOnly ? { port: op[C.PORT], power: this.top(s) } : { port: op[C.PORT], power: this.top(s, 1), [setTime ? 'time' : 'rotations']: this.top(s) };
            case C.BOTH_MOTORS_ON_ACTION:
                return { left: this.top(s, 1), right: this.top(s) };
            case C.MOTOR_STOP:
                return { port: op[C.PORT] };
            case C.LED_ACTION:
                return { on: op[C.MODE] === 'ON' };
            case C.TONE_ACTION:
                return { frequency: this.top(s, 1), duration: this.top(s) };
            case C.PLAY_FILE_ACTION:
                return { file: op[C.FILE] };
            default:
                return {};
        }
    }

    private effect(op: any, actuator: string): void {
        const block = this.model.innermost(this.open, true) || this.model.innermost(op[C.HIGHTLIGHT_PLUS] || []);
        const args = this.args(op);
        const current = this.inEffect[actuator];
        if (current && current.block === block && current.op === op[C.OPCODE] && same(current.args, args)) {
            return;
        }
        const effect: Effect = { t: Math.round(this.now() * 10) / 10, actuator: actuator, block: block, op: op[C.OPCODE], args: args };
        this.inEffect[actuator] = effect;
        this.effects.push(effect);
    }

    private read(s: any, sensor: string, port: any, mode: any): void {
        const value = copy(this.top(s));
        const key = readKey(sensor, port, mode);
        const block = this.model.innermost((this.op && this.op[C.HIGHTLIGHT_PLUS]) || []) || this.model.innermost(this.open);
        const r = this.frame.reads[key] || (this.frame.reads[key] = { sensor: sensor, port: port, mode: mode, block: block, count: 0, values: [], last: undefined });
        r.count++;
        r.last = value;
        const known = r.values.filter((v) => same(v[0], value))[0];
        known ? known[1]++ : r.values.length < MAX_VALUES && r.values.push([value, 1]);
        this.caseReads[key] = value;
    }

    /** the innermost block running now (a statement or a value) */
    innermostOpen(): string {
        return this.model.innermost(this.open);
    }

    /** before the program starts (time 0): where the robot is, what its sensors see */
    begin(state: FrameState): void {
        const f = this.newFrame();
        this.state0(f, state);
        try {
            this.flatten((this.behaviour.hardwareState && this.behaviour.hardwareState.sensors) || {}, '', 0, 0);
        } catch (e) {
            this.failure = this.failure || String((e && e.message) || e);
        }
        f.sensors = this.sensorValues;
        this.changed = false;
        this.initial = f;
    }

    private state0(f: Frame, state: FrameState): void {
        f.t = Math.round(state.t * 10) / 10;
        [f.x, f.y, f.h] = state.pose;
        [f.l, f.r] = state.speeds;
        f.leds = state.leds;
        f.tone = state.tone;
        f.bump = state.bump;
        f.touching = state.touching;
    }

    /** the end of a frame: what the robot did in it; the variables and sensor values that changed */
    endFrame(state: FrameState, interpreter: any): void {
        const f = this.frame;
        this.state0(f, state);
        f.running = this.model.innermost(this.open, true);
        this.frames.push(f);
        this.frame = this.newFrame();
        try {
            const bindings = interpreter.getVariables() || {};
            for (const name of this.model.globals) {
                const value = bindings[name] && bindings[name].length ? bindings[name][0] : undefined;
                const text = JSON.stringify(value);
                if (value !== undefined && this.globalValues[name] !== text) {
                    const assigned = this.assigned[name];
                    this.globalValues[name] = text;
                    this.globals.push({ t: f.t, name: name, value: copy(value), block: assigned ? assigned.block : undefined, times: assigned ? assigned.times : undefined });
                }
            }
            this.assigned = {};
            const sensors = this.behaviour.hardwareState && this.behaviour.hardwareState.sensors;
            this.flatten(sensors || {}, '', f.t, 0);
        } catch (e) {
            this.failure = this.failure || String((e && e.message) || e);
        }
        f.sensors = this.sensorValues;
        this.changed = false;
    }

    private flatten(o: any, prefix: string, t: number, depth: number): void {
        for (const k of Object.keys(o)) {
            const v = o[k];
            const key = prefix ? prefix + '/' + k : k;
            if (k === 'timer') {
                continue; // it changes every frame
            }
            if (v !== null && typeof v === 'object' && !Array.isArray(v) && depth < 3) {
                this.flatten(v, key, t, depth + 1);
            } else if (typeof v !== 'function' && !same(this.sensorValues[key], v)) {
                if (!this.changed) {
                    this.sensorValues = Object.assign({}, this.sensorValues); // the frames before keep the values they had
                    this.changed = true;
                }
                this.sensorValues[key] = copy(v);
                this.sensors.push({ t: t, name: key, value: copy(v) });
            }
        }
    }
}

// ------------------------------------------------------------------------------------------------ the facts of a failure

export interface Facts {
    from: number; // ms
    to: number;
    sensed: Read[];
    ran: { decisions: DecisionCount[]; actions: Action[] };
    remembered: { name: string; from: any; to: any }[];
    did: {
        distance_cm: number; // along the path
        moved_cm: number; // from where it was to where it is
        turned_deg: number; // counterclockwise (left) positive
        speeds: number[]; // mean wheel speeds, cm/s
        leds: boolean[][]; // [left, right] at the start and at the end
        sound_ms: number;
        bumps: { into: string; count: number }[]; // into: an obstacle's id, null: the wall
        touched: string[];
    };
}

/** an action in effect in the facts' window: a block (with its values), from when on, how often it took effect anew */
export interface Action extends Effect {
    times: number;
    when: { block: string; part: string }; // the if (and its part) the block is in
}

export const FACTS_MS = 1000;

/** the frames of a time (ms): those that end after `from` and by `to` */
export function framesBetween(rec: Recorder, from: number, to: number): Frame[] {
    return rec.frames.filter((f) => f.t > from && f.t <= to + 0.05);
}

/** what the program read in these frames, per sensor (key: sensor/port/mode) */
export function readsIn(frames: Frame[]): { [key: string]: Read } {
    const sensed: { [key: string]: Read } = {};
    for (const f of frames) {
        for (const key of Object.keys(f.reads)) {
            const r = f.reads[key];
            const s = sensed[key] || (sensed[key] = { sensor: r.sensor, port: r.port, mode: r.mode, block: r.block, count: 0, values: [], last: undefined });
            s.count += r.count;
            s.last = r.last;
            for (const [value, n] of r.values) {
                const known = s.values.filter((v) => same(v[0], value))[0];
                known ? (known[1] += n) : s.values.length < MAX_VALUES && s.values.push([value, n]);
            }
        }
    }
    return sensed;
}

/** the decisions taken in these frames (key: block:k), with the readings of the last time */
export function decisionsIn(frames: Frame[]): { [key: string]: DecisionCount } {
    const decisions: { [key: string]: DecisionCount } = {};
    for (const f of frames) {
        for (const key of Object.keys(f.decisions)) {
            const d = f.decisions[key];
            const s = decisions[key] || (decisions[key] = { block: d.block, kind: d.kind, k: d.k, yes: 0, no: 0, inputs: {} });
            s.yes += d.yes;
            s.no += d.no;
            s.inputs = d.inputs;
        }
    }
    return decisions;
}

/** what happened in the second before `to` (ms): sensed, ran, remembered, did */
export function facts(rec: Recorder, to: number, ms = FACTS_MS): Facts {
    const from = Math.max(0, to - ms);
    const frames = framesBetween(rec, from, to);
    const before = rec.frames.filter((f) => f.t <= from).pop() || frames[0];
    const sensed = readsIn(frames);
    const decisions = decisionsIn(frames);
    const bumps: { [into: string]: number } = {};
    const touched: string[] = [];
    let distance = 0;
    let sound = 0;
    let previous = before;
    for (const f of frames) {
        if (f.bump !== undefined) {
            const key = String(f.bump);
            bumps[key] = (bumps[key] || 0) + 1;
        }
        f.touching.forEach((id) => touched.indexOf(id) < 0 && touched.push(id));
        f.tone && (sound += f.t - (previous ? previous.t : from));
        previous && (distance += Math.hypot(f.x - previous.x, f.y - previous.y));
        previous = f;
    }
    const last = frames[frames.length - 1] || before;
    const atStart = (changes: Change[]) => {
        const values: { [name: string]: any } = {};
        changes.filter((c) => c.t <= from).forEach((c) => (values[c.name] = c.value));
        return values;
    };
    const start = atStart(rec.globals);
    rec.globals.forEach((c) => !(c.name in start) && (start[c.name] = c.value)); // first recorded after `from` (the first frame ends after 0): its first value
    const end: { [name: string]: any } = {};
    rec.globals.filter((c) => c.t <= to + 0.05).forEach((c) => (end[c.name] = c.value));
    const inEffect: { [actuator: string]: Effect } = {};
    rec.effects.filter((e) => e.t <= from).forEach((e) => (inEffect[e.actuator] = e));
    const actions: Action[] = [];
    for (const e of Object.keys(inEffect)
        .map((a) => inEffect[a])
        .concat(rec.effects.filter((e) => e.t > from && e.t <= to + 0.05))) {
        const known = actions.filter((a) => a.block === e.block && a.op === e.op && same(a.args, e.args))[0];
        known ? known.times++ : actions.push(Object.assign({ times: 1, when: rec.model.branchOf(e.block) }, e)); // one entry per block and values, from its first time on
    }
    const n = frames.length || 1;
    return {
        from: Math.round(from),
        to: Math.round(to),
        sensed: Object.keys(sensed).map((k) => sensed[k]),
        ran: { decisions: Object.keys(decisions).map((k) => decisions[k]), actions: actions },
        remembered: Object.keys(end).map((name) => ({ name: name, from: name in start ? start[name] : end[name], to: end[name] })),
        did: {
            distance_cm: round1(distance),
            moved_cm: before && last ? round1(Math.hypot(last.x - before.x, last.y - before.y)) : 0,
            turned_deg: before && last ? round1(last.h - before.h) : 0,
            speeds: [round1(frames.reduce((s, f) => s + f.l, 0) / n), round1(frames.reduce((s, f) => s + f.r, 0) / n)],
            leds: [before ? before.leds : [false, false], last ? last.leds : [false, false]],
            sound_ms: Math.round(sound),
            bumps: Object.keys(bumps).map((k) => ({ into: k === 'null' ? null : k, count: bumps[k] })),
            touched: touched,
        },
    };
}

function round1(v: number): number {
    return Math.round(v * 10) / 10;
}

// ------------------------------------------------------------------------------------------------ what the action blocks do

// the Edison in the simulator (robot.edison: track width 7 cm, wheel diameter 3.7 cm; ChassisDiffDrive.MAXPOWER: 3 turns a second at 100 %)
export const CM_S_PER_PERCENT = (3 * 3.7 * Math.PI) / 100;
export const TRACK_CM = 7;
const FRAME_MS = 1000 / 60;
const AMOUNTS = ['distance', 'degrees', 'rotations', 'time']; // an action with an amount ends by itself (the simulator stops the motors)

function num(v: any): number {
    return typeof v === 'number' ? v : Number(v) || 0;
}

function clamp(p: number): number {
    return Math.max(-100, Math.min(100, p));
}

/**
 * the wheel speeds (%, forward positive) after an action of the motors, as interpreter.robotSimBehaviour sets them (backward, or a negative
 * amount, turns the speeds round; an amount of 0 stops); `before`: the speeds until then (a single motor changes one)
 */
export function wheelsAfter(e: Effect, before: number[] = [0, 0]): number[] {
    const a = e.args;
    const forward = a.direction === C.FOREWARD || a.direction === C.FORWARD;
    const sign = (amount: any) => (amount === 0 ? 0 : (!forward && (num(amount) > 0 || !amount)) || (forward && num(amount) < 0) ? -1 : 1);
    const left = String(a.port || '').toLowerCase().indexOf('l') === 0; // LMOTOR
    switch (e.op) {
        case C.DRIVE_ACTION:
            return [clamp(sign(a.distance) * num(a.power)), clamp(sign(a.distance) * num(a.power))];
        case C.CURVE_ACTION:
            return [clamp(sign(a.distance) * num(a.left)), clamp(sign(a.distance) * num(a.right))];
        case C.TURN_ACTION: {
            const p = a.degrees === 0 ? 0 : num(a.degrees) < 0 ? -num(a.power) : num(a.power);
            return String(a.direction).toLowerCase() === C.LEFT ? [clamp(-p), clamp(p)] : [clamp(p), clamp(-p)];
        }
        case C.MOTOR_ON_ACTION:
            return left ? [clamp(num(a.power)), before[1]] : [before[0], clamp(num(a.power))];
        case C.MOTOR_STOP:
            return left ? [0, before[1]] : [before[0], 0];
        case C.BOTH_MOTORS_ON_ACTION:
            return [clamp(num(a.left)), clamp(num(a.right))];
        case C.STOP_DRIVE:
            return [0, 0];
        default:
            return before;
    }
}

/** how the robot moves at these wheel speeds (%): v cm/s along its heading, w degrees/s counterclockwise (left) */
export function motionOf(wheels: number[]): { v: number; w: number } {
    const [l, r] = wheels.map((p) => clamp(p) * CM_S_PER_PERCENT);
    return { v: (l + r) / 2, w: (((r - l) / TRACK_CM) * 180) / Math.PI };
}

/** the frame the robot moves in at a time (ms): the first that ends then or later */
export function frameAt(rec: Recorder, t: number): Frame {
    return rec.frames.filter((f) => f.t >= t - 0.05)[0] || rec.frames[rec.frames.length - 1] || rec.initial;
}

export interface InEffect {
    effect: Effect; // null: no block has set this actuator yet
    wheels: number[]; // the motors: the wheel speeds (%) then
    finished: boolean; // the motors: the action's amount is done (the simulator stopped them), no other block set them since
}

/**
 * the block in effect for an actuator (motors, led lled, led rled, sound) in the frame that ends at `t` (ms): the last of the actions that
 * ran before (an action runs at the beginning of a frame, before the robot moves)
 */
export function inEffectAt(rec: Recorder, actuator: string, t: number): InEffect {
    let effect: Effect = null;
    let wheels = [0, 0];
    for (const e of rec.effects) {
        if (e.t > t - FRAME_MS / 2) {
            break; // the effects are in the order they happened
        }
        if (e.actuator === actuator) {
            effect = e;
            wheels = actuator === 'motors' ? wheelsAfter(e, wheels) : wheels;
        }
    }
    const frame = frameAt(rec, t);
    const stopped = !!frame && frame.l === 0 && frame.r === 0 && (wheels[0] !== 0 || wheels[1] !== 0);
    const finished = !!effect && actuator === 'motors' && stopped && AMOUNTS.some((k) => effect.args[k] !== undefined);
    return { effect: effect, wheels: finished ? [0, 0] : wheels, finished: finished };
}

/**
 * what an Edison action block of the program would do, from its fields and the numbers in its inputs (for a block that didn't run: its
 * effect as the record would have it, t -1); null if it isn't an action, or a value isn't a number written into it
 */
export function blockEffect(model: ProgramModel, id: string): Effect {
    const b = model.blocks[id];
    if (!b) {
        return null;
    }
    const value = (input: string) => {
        const c = model.child(id, input);
        return c && (c.type === 'math_number' || c.type === 'math_integer') ? Number(c.fields.NUM) : undefined;
    };
    const amount = (input: string) => (/_for$/.test(b.type) ? value(input) : null);
    const direction = b.fields.DIRECTION || 'FOREWARD';
    const effect = (actuator: string, op: string, args: { [name: string]: any }) =>
        Object.keys(args).some((k) => args[k] === undefined) ? null : { t: -1, actuator: actuator, block: id, op: op, args: clean(args) };
    switch (b.type) {
        case 'robActions_motorDiff_on':
        case 'robActions_motorDiff_on_for':
            return effect('motors', C.DRIVE_ACTION, { direction: direction, power: value('POWER'), distance: amount('DISTANCE') });
        case 'robActions_motorDiff_curve':
        case 'robActions_motorDiff_curve_for':
            return effect('motors', C.CURVE_ACTION, { direction: direction, left: value('POWER_LEFT'), right: value('POWER_RIGHT'), distance: amount('DISTANCE') });
        case 'robActions_motorDiff_turn':
        case 'robActions_motorDiff_turn_for':
            return effect('motors', C.TURN_ACTION, { direction: (b.fields.DIRECTION || 'RIGHT').toLowerCase(), power: value('POWER'), degrees: amount('DEGREE') });
        case 'robActions_motorDiff_stop':
            return effect('motors', C.STOP_DRIVE, {});
        case 'robActions_motor_on':
        case 'robActions_motor_on_for':
            return effect('motors', C.MOTOR_ON_ACTION, { port: String(b.fields.MOTORPORT || '').toLowerCase(), power: value('POWER') });
        case 'robActions_motor_stop':
            return effect('motors', C.MOTOR_STOP, { port: String(b.fields.MOTORPORT || '').toLowerCase() });
        case 'actions_led_edison':
            return effect('led ' + String(b.fields.ACTORPORT || '').toLowerCase(), C.LED_ACTION, { on: b.fields.MODE === 'ON' });
        default:
            return null;
    }
}

/** the arguments of an action without those it doesn't have (null) */
function clean(args: { [name: string]: any }): { [name: string]: any } {
    const out: { [name: string]: any } = {};
    Object.keys(args).forEach((k) => args[k] !== null && (out[k] = args[k]));
    return out;
}

// ------------------------------------------------------------------------------------------------ the trace (the report's record)

/**
 * the record in steps of `step` ms: where the robot was, its wheel speeds, LEDs and sound, what ran, the decisions and readings, and what the
 * robot could sense at the step's end (the simulator's values of the Edison's sensors, as the program would read them: SENSOR_NAMES)
 */
export function trace(rec: Recorder, step = 100): any[] {
    const out: any[] = [];
    let w: any = null;
    for (const f of rec.frames) {
        const end = Math.ceil(f.t / step - 1e-9) * step;
        if (!w || w.t !== end) {
            w && out.push(w);
            w = { t: end, x: 0, y: 0, h: 0, l: 0, r: 0, frames: 0, leds: f.leds, tone: false, bumps: 0, running: null, reads: {}, decisions: {}, sensors: {} };
        }
        w.sensors = f.sensors;
        w.frames++;
        [w.x, w.y, w.h] = [Math.round(f.x * 100) / 100, Math.round(f.y * 100) / 100, round1(f.h)];
        w.l += f.l;
        w.r += f.r;
        w.leds = f.leds;
        w.tone = w.tone || f.tone;
        w.bumps += f.bump !== undefined ? 1 : 0;
        w.running = f.running || w.running;
        Object.keys(f.reads).forEach((k) => (w.reads[k] = f.reads[k].last));
        Object.keys(f.decisions).forEach((k) => {
            const d = f.decisions[k];
            const s = w.decisions[k] || (w.decisions[k] = [0, 0]);
            s[0] += d.yes;
            s[1] += d.no;
        });
    }
    w && out.push(w);
    out.forEach((x) => {
        x.l = round1(x.l / x.frames);
        x.r = round1(x.r / x.frames);
        delete x.frames;
        const sensors: { [key: string]: any } = {};
        Object.keys(SENSOR_NAMES).forEach((k) => k in x.sensors && (sensors[k] = x.sensors[k]));
        x.sensors = sensors;
    });
    return out;
}

// ------------------------------------------------------------------------------------------------ the facts in words

/** a piece of a line of facts: text, or a block of the program (shown as a chip that selects it) */
export type Part = string | { block: string };

// the Edison's readings (EdisonStackMachineVisitor): GetSample, port, mode
const SENSOR_NAMES: { [key: string]: string } = {
    'infrared/line': 'line tracker sees black',
    'infrared/light': 'line tracker light %',
    'infrared/LLIGHT/light': 'left light sensor %',
    'infrared/RLIGHT/light': 'right light sensor %',
    'infrared/FRONT/obstacle': 'obstacle ahead',
    'infrared/LEFT/obstacle': 'obstacle to the left',
    'infrared/RIGHT/obstacle': 'obstacle to the right',
    'buttons/play': 'key ▶ pressed',
    'buttons/rec': 'key ● pressed',
    'sound/volume': 'sound',
};

function sensorName(r: Read): string {
    return keyName(readKey(r.sensor, r.port, r.mode));
}

/** what a reading (sensor/port/mode) is called: "line tracker sees black" */
export function keyName(key: string): string {
    return SENSOR_NAMES[key] || key.toLowerCase().replace(/\//g, ' ');
}

/** a value as the facts show it: yes / no, numbers with two decimals */
export function show(v: any): string {
    if (typeof v === 'boolean') {
        return v ? 'yes' : 'no';
    }
    return typeof v === 'number' ? String(Math.round(v * 100) / 100) : Array.isArray(v) ? '[' + v.map(show).join(', ') + ']' : String(v);
}

function seconds(ms: number): string {
    return (ms / 1000).toFixed(1).replace(/\.0$/, '');
}

function direction(d: string): string {
    return { FOREWARD: 'forward', BACKWARD: 'backward', LEFT: 'left', RIGHT: 'right' }[d] || String(d || '').toLowerCase();
}

function actionWords(e: Effect): string {
    const a = e.args;
    const pct = (v: any) => (v === undefined ? '?' : show(v)) + ' %';
    switch (e.op) {
        case C.DRIVE_ACTION:
            return 'drives ' + direction(a.direction) + ', power ' + pct(a.power) + (a.distance !== undefined ? ', ' + show(a.distance) + ' cm' : '');
        case C.CURVE_ACTION:
            return 'curves ' + direction(a.direction) + ', left ' + pct(a.left) + ', right ' + pct(a.right) + (a.distance !== undefined ? ', ' + show(a.distance) + ' cm' : '');
        case C.TURN_ACTION:
            return 'turns ' + direction(a.direction) + ', power ' + pct(a.power) + (a.degrees !== undefined ? ', ' + show(a.degrees) + '°' : '');
        case C.MOTOR_ON_ACTION:
            return 'motor ' + a.port + ' on, power ' + pct(a.power);
        case C.BOTH_MOTORS_ON_ACTION:
            return 'motors on, left ' + pct(a.left) + ', right ' + pct(a.right);
        case C.STOP_DRIVE:
            return 'stops';
        case C.MOTOR_STOP:
            return 'motor ' + a.port + ' stops';
        case C.LED_ACTION:
            return ({ LLED: 'left LED', RLED: 'right LED' }[e.actuator.replace(/^led /, '').toUpperCase()] || 'LED') + ' ' + (a.on ? 'on' : 'off');
        case C.TONE_ACTION:
            return 'tone ' + show(a.frequency) + ' Hz, ' + show(a.duration) + ' ms';
        case C.PLAY_FILE_ACTION:
            return 'sound file ' + show(a.file);
        default:
            return e.op;
    }
}

export function decisionWords(d: DecisionCount): string {
    const times = (n: number) => n + '×';
    if (d.kind === 'wait') {
        return (d.yes ? 'waited until it held (' + times(d.yes) + ')' : 'still waiting') + (d.no ? ', not yet ' + times(d.no) : '');
    }
    if (d.kind === 'while') {
        return 'repeated ' + times(d.yes) + (d.no ? ', ended ' + times(d.no) : '');
    }
    return (d.k ? 'condition ' + (d.k + 1) + ': ' : '') + 'yes ' + times(d.yes) + ', no ' + times(d.no);
}

/** the facts as lines of words and chips: [label, parts]; `name`: what an item of the world is called */
export function factLines(f: Facts, name: (item: string) => string): { label: string; parts: Part[] }[] {
    const lines: { label: string; parts: Part[] }[] = [];
    const join = (items: Part[][]) => items.reduce((all, p, i) => all.concat(i ? ['; '] : [], p), [] as Part[]);
    const chip = (block: string): Part[] => (block ? [{ block: block }, ' '] : []);
    if (f.sensed.length) {
        lines.push({
            label: 'sensed',
            parts: join(f.sensed.map((r) => chip(r.block).concat([sensorName(r) + ': ' + r.values.map((v) => show(v[0]) + ' ' + v[1] + '×').join(', ') + (r.values.length > 1 ? ' (last: ' + show(r.last) + ')' : '')]))),
        });
    } else {
        lines.push({ label: 'sensed', parts: ['the program read no sensor'] });
    }
    const ran = f.ran.decisions.map((d) => chip(d.block).concat([decisionWords(d)])).concat(
        f.ran.actions.map((e) =>
            chip(e.block).concat(
                [actionWords(e) + (e.t > f.from ? ' (from ' + seconds(e.t) + ' s' + (e.times > 1 ? ', ' + e.times + '×' : '') + ')' : e.times > 1 ? ' (' + e.times + '×)' : '')],
                e.when ? [' when ', { block: e.when.block }, ' says ' + e.when.part] : []
            )
        )
    );
    lines.push({ label: 'ran', parts: ran.length ? join(ran) : ['no decision, no action'] });
    if (f.remembered.length) {
        lines.push({ label: 'remembered', parts: [f.remembered.map((v) => v.name + ' = ' + (same(v.from, v.to) ? show(v.to) : show(v.from) + ' → ' + show(v.to))).join(', ')] });
    }
    const d = f.did;
    const did: string[] = [];
    if (d.distance_cm < 0.3 && Math.abs(d.turned_deg) < 3) {
        did.push('stood still');
    } else {
        did.push('drove ' + d.distance_cm + ' cm' + (Math.abs(d.turned_deg) >= 3 ? ' and turned ' + Math.abs(d.turned_deg) + '° to the ' + (d.turned_deg > 0 ? 'left' : 'right') : ', straight'));
    }
    did.push('wheels left ' + d.speeds[0] + ', right ' + d.speeds[1] + ' cm/s');
    const leds = (l: boolean[]) => (l[0] && l[1] ? 'both LEDs on' : l[0] ? 'left LED on' : l[1] ? 'right LED on' : 'LEDs off');
    did.push(same(d.leds[0], d.leds[1]) ? leds(d.leds[1]) : leds(d.leds[0]) + ' → ' + leds(d.leds[1]));
    d.sound_ms && did.push('sound for ' + d.sound_ms + ' ms');
    d.bumps.forEach((b) => did.push('bumped into ' + (b.into ? name(b.into) : 'the wall') + ' (' + b.count + ' frames)'));
    d.touched.length && did.push('touched ' + d.touched.map(name).join(', '));
    lines.push({ label: 'did', parts: [did.join('; ')] });
    return lines;
}

/**
 * the facts as a list (ul.className), a line each: "sensed", "ran", "remembered", "did". `chip` makes the element of a block (the Tests tab
 * links it to the block in the Program tab).
 */
export function factsElement(f: Facts, className: string, name: (item: string) => string, chip: (block: string) => HTMLElement): HTMLElement {
    const ul = document.createElement('ul');
    ul.className = className;
    const head = document.createElement('li');
    head.className = 'nepoFactsHead';
    head.textContent = 'from ' + seconds(f.from) + ' to ' + seconds(f.to) + ' s:';
    ul.appendChild(head);
    for (const line of factLines(f, name)) {
        const li = document.createElement('li');
        const label = document.createElement('b');
        label.textContent = line.label + ': ';
        li.appendChild(label);
        partsInto(li, line.parts, chip);
        ul.appendChild(li);
    }
    return ul;
}

/** puts words and chips into an element */
export function partsInto(parent: HTMLElement, parts: Part[], chip: (block: string) => HTMLElement): void {
    for (const part of parts) {
        parent.appendChild(typeof part === 'string' ? document.createTextNode(part) : chip(part.block));
    }
}
