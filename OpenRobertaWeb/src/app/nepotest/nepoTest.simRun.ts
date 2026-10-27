/**
 * The tests of simulation worlds run on the Lab's own simulator. The program is compiled for the simulator (REST /projectWorkflow/sourceSimulation,
 * as the Program tab's simulation does), and the simulator's own code runs it in the test's world (nepoTest.sim): the stack machine's interpreter
 * (interpreter.interpreter, interpreter.robotSimBehaviour), the Edison (robot.edison: EdisonChassis with its kinematics and bumping, the line
 * tracker, the light and infrared sensors, the LEDs, the keys, the sound sensor) and the simulator's objects (obstacles, coloured areas, the
 * ground). Nothing is shown while a test runs: it runs offscreen, and the Simulation tab replays it (nepoTest.simEditor).
 *
 * What a test run does differently from the simulator's own loop (SimulationRoberta.render, SimulationScene.update):
 * - the time is virtual: every frame is 1/60 s, and a run takes only as long as the browser needs to compute it;
 * - in a frame, the interpreter runs at most OPS_PER_FRAME operations (the simulator: as many as fit into about 15 ms of real time), so a run
 *   gives the same result every time;
 * - no sound is played: a tone only takes its time; the claps and key presses of "given" reach the simulator's sound sensor (through its
 *   volume meter: a clap is heard for about 0.3 s, as long as it is loud) and its keys (held for KEY_MS);
 * - the world adds lines to follow (drawn on the floor picture the sensors see), goal and fail areas, and the robot's starts.
 *
 * A test (NepoTest JSON, made by nepotest/blocks.py from a test of a world) starts the robot at one of the world's starts, runs the whole program
 * (until it ends, until the robot touches the test's "until" area, or for max_time_ms) and checks what the robot does: its checks and the
 * world's rules (simulation.checks, rule: true). The checks of where the robot goes (reaches, never touches, ends in, never bumps into, stays
 * on its recorded path) are decided during the run; the checks of its behaviour (does, whenever, after: nepoTest.simBehaviour) and of a
 * variable at the end, from the run's record when it has ended. A run never stops at a failed check: every check is decided. The test passes only if every
 * check holds and the program didn't fail. A test that should fail (`should: "fail"`) is turned round as in spec.py apply_should, but only by
 * its own checks: a failed rule of the world fails it anyway. A skipped test (`skip: true`) doesn't run.
 *
 * The report has the shape of NepoTest's reports (NepoTest/nepotest/spec.py), so the Tests tab shows all tests alike:
 *   {name, block_id (the test), world_block_id, kind: 'simulation', outcome, expected_failure, failures, error, time_ms, variables,
 *    covered_blocks, status, checks: [{block_id, check, text, rule, passed, t, item, point, message, facts, why}],
 *    simulation: {result, t, item, point, path: [[t_ms, x, y, heading], ...], leds: [[t_ms, left, right], ...], start, recorded, bumps}}
 * passed: true, false, or null (not decided: a path not recorded yet, the program failed before, nothing to check: the condition of a
 * "whenever" never held, no event of an "after" happened). result: why the run ended: finished |
 * until | time_limit | error. item and point: what the picture marks (the first area touched or obstacle bumped into by a failed check, where
 * the robot left its path, where its behaviour first went wrong). Positions in cm, headings in degrees (not wrapped).
 * The run is recorded (nepoTest.simProgram): a failed check, and a runtime error, get the facts of the second before (`facts`: what the
 * robot sensed, what ran, what it remembered, what it did; of a behaviour check: from half a second after it first went wrong), and the
 * report has the record in steps of 100 ms (`trace`, with what the robot did in each step: `does`). A failed check of what the robot does,
 * or of a variable, also gets why (`why`, nepoTest.simVerdict: the block to blame); a failed check of where it goes points to the test's
 * first failed check of what it does.
 */
import * as COMM from 'comm';
import * as GUISTATE_C from 'guiState.controller';
// @ts-ignore (Blockly has no type declarations)
import * as Blockly from 'blockly';
import * as SIM from 'nepoTest.sim';
import * as PROGRAM from 'nepoTest.simProgram';
import * as BEHAVIOUR from 'nepoTest.simBehaviour';
import * as VERDICT from 'nepoTest.simVerdict';
import { Interpreter } from 'interpreter.interpreter';
import { RobotSimBehaviour } from 'interpreter.robotSimBehaviour';
import { SelectionListener } from 'robot.base';
import { Pose } from 'robot.base.mobile';
import RobotEdison from 'robot.edison';
import { CircleSimulationObject, Ground, RectangleSimulationObject, SimObjectType, TriangleSimulationObject } from 'simulation.objects';

const FRAME_MS = 1000 / 60;
export const OPS_PER_FRAME = 10000;
// a clap of "given" through the simulator's volume meter (volume-meter.js): it jumps to the clap's loudness (1: as loud as it gets), then
// falls by 5 % every 512 samples (at 48 kHz); the sound sensor hears a sound while the volume is above 25 %, about 0.3 s
const METER_BUFFER_MS = (512 / 48000) * 1000;
const METER_AVERAGING = 0.95;
export const KEY_MS = 200; // how long a key of "given" is held
const TONE_FILE_MS = [200, 500, 1100, 1100, 200]; // WebAudio.tone.file: how long the simulator's sound files play
const DEFAULT_MAX_TIME_MS = 30000;
const SAMPLE_CM = 0.5; // the path gets a new pose after this much movement (as simulation.py)
const SAMPLE_DEG = 3;
const CHUNK_MS = 30; // the browser gets a chance to draw after this much computing
const BUMP_MARGIN = 3; // units: the robot bumped into the obstacle that is at most this far from its outline (else into the wall)
const KIND_WORDS: { [kind: string]: string } = { goal: 'Goal', fail: 'Fail area', color: 'Area', obstacle: 'Obstacle', line: 'Line' }; // reports are in English

function u(v: number): number {
    return SIM.BORDER + v * SIM.UNITS_PER_CM;
}

function cm(v: number): number {
    return (v - SIM.BORDER) / SIM.UNITS_PER_CM;
}

function seconds(ms: number): string {
    return (ms / 1000).toFixed(1).replace(/\.0$/, '');
}

// ------------------------------------------------------------------------------------------------ the simulator's objects

const NO_SCENE = { sim: { enableChangeObjectButtons() {}, disableChangeObjectButtons() {} } }; // what the objects call on their scene
let nextObjectId = 7000000; // the simulator's own objects count from 0: their mouse handlers on #robotLayer are never touched

/** a rect, circle or triangle of the world as the simulator's object; without the mouse handlers it puts on the simulator's canvas */
function simObject(item: SIM.SimItem, type: SimObjectType, listener: SelectionListener): any {
    const id = nextObjectId++;
    const color = item.color || undefined;
    let object: any;
    if (item.kind === 'rect') {
        object = new RectangleSimulationObject(id, NO_SCENE, listener, type, { x: u(item.x), y: u(item.y) }, null, color, item.w * SIM.UNITS_PER_CM, item.h * SIM.UNITS_PER_CM);
    } else if (item.kind === 'circle') {
        object = new CircleSimulationObject(id, NO_SCENE, listener, type, { x: u(item.x), y: u(item.y) }, null, color, item.r * SIM.UNITS_PER_CM);
    } else {
        const p = item.points.map((q) => [u(q[0]), u(q[1])]);
        object = new TriangleSimulationObject(id, NO_SCENE, listener, type, { x: 0, y: 0 }, null, color, p[0][0], p[0][1], p[1][0], p[1][1], p[2][0], p[2][1]);
    }
    object.removeMouseEvents();
    return object;
}

function isShape(item: SIM.SimItem): boolean {
    return item.kind === 'rect' || item.kind === 'circle' || (item.kind === 'triangle' && (item.points || []).length === 3);
}

/**
 * the picture the robot's floor sensors see (the simulator's uCtx): the background at (10, 10) with the wall pattern around it
 * (SimulationScene.drawColorAreas, drawPattern), or the plain peach floor (peach to the canvas's edge: it has no wall); then the coloured
 * areas drawn by the simulator's objects, then the test's lines (nepoTest.sim)
 */
export function floorCanvas(world: SIM.SimWorld): Promise<HTMLCanvasElement> {
    const peach = world.background === SIM.PEACH;
    const images = peach ? [] : [SIM.loadImage(SIM.backgroundUrl(world.background)), SIM.loadImage(SIM.WALL_IMAGE)];
    return Promise.all(images).then(function ([bg, wall]) {
        const [bw, bh] = SIM.backgroundSize(world);
        const canvas = document.createElement('canvas');
        canvas.width = bw + 2 * SIM.BORDER;
        canvas.height = bh + 2 * SIM.BORDER;
        const ctx = canvas.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D;
        if (peach) {
            ctx.fillStyle = SIM.PEACH_COLOR;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
            ctx.drawImage(bg, 10, 10, bg.width, bg.height);
            ctx.beginPath();
            ctx.strokeStyle = ctx.createPattern(wall, 'repeat');
            ctx.lineWidth = 10;
            ctx.strokeRect(5, 5, bg.width + 10, bg.height + 10);
        }
        const listener = new SelectionListener();
        const visible = document.createElement('canvas').getContext('2d'); // the objects draw on the visible layer too
        const areas = world.items.filter((item) => item.role === 'color' && isShape(item));
        areas.forEach((item) => simObject(item, SimObjectType.ColorArea, listener).draw(visible, ctx));
        areas.forEach(() => ctx.restore()); // their draw() saves the state without restoring it
        SIM.drawLines(ctx, world);
        return canvas;
    });
}

// ------------------------------------------------------------------------------------------------ the program for a test

function childElements(el: Element, name?: string): Element[] {
    const out: Element[] = [];
    for (let c = el.firstElementChild; c; c = c.nextElementSibling) {
        if (!name || c.localName === name) {
            out.push(c);
        }
    }
    return out;
}

function field(block: Element, name: string): string {
    const f = childElements(block, 'field').filter((x) => x.getAttribute('name') === name)[0];
    return f ? f.textContent : null;
}

class XmlBuilder {
    private count = 0;

    constructor(private doc: Document, private ns: string) {}

    el(name: string, attrs: { [name: string]: string }, children: (Element | string)[] = []): Element {
        const e = this.doc.createElementNS(this.ns, name);
        Object.keys(attrs).forEach((k) => e.setAttribute(k, attrs[k]));
        for (const c of children) {
            e.appendChild(typeof c === 'string' ? this.doc.createTextNode(c) : c);
        }
        return e;
    }

    block(type: string, children: Element[]): Element {
        return this.el('block', { type: type, id: 'nepoTest' + ++this.count, intask: 'true' }, children);
    }

    field(name: string, text: string): Element {
        return this.el('field', { name: name }, [text]);
    }

    value(name: string, block: Element): Element {
        return this.el('value', { name: name }, [block]);
    }

    /** a NEPO literal of a type (Number, Boolean, Array_...) for a value of the test */
    literal(value: any, type: string): Element {
        if (Array.isArray(value) || /^Array_/.test(type)) {
            const items: any[] = Array.isArray(value) ? value : [];
            const itemType = type.replace(/^Array_/, '') || 'Number';
            return this.block('robLists_create_with', [
                this.el('mutation', { items: String(items.length), list_type: itemType }),
                this.field('LIST_TYPE', itemType),
                ...items.map((v, i) => this.value('ADD' + i, this.literal(v, itemType))),
            ]);
        }
        if (typeof value === 'boolean' || type === 'Boolean') {
            return this.block('logic_boolean', [this.field('BOOL', value ? 'TRUE' : 'FALSE')]);
        }
        return this.block('math_number', [this.field('NUM', String(Number(value) || 0))]);
    }
}

/** the program a test runs: the whole program; the global variables of its "set up" start with their values instead of the declared ones */
export function programFor(programXml: string, test: any): string {
    if (!test.globals || !Object.keys(test.globals).length) {
        return programXml;
    }
    const doc = new DOMParser().parseFromString(programXml, 'text/xml');
    const blocks = Array.prototype.slice.call(doc.getElementsByTagName('block')) as Element[];
    const start = blocks.filter((b) => b.getAttribute('type') === 'robControls_start')[0];
    if (!start) {
        throw new Error('the program has no start block');
    }
    const x = new XmlBuilder(doc, start.namespaceURI);
    const declarations = blocks.filter((b) => b.getAttribute('type') === 'robGlobalVariables_declare');
    Object.keys(test.globals).forEach(function (name) {
        const declaration = declarations.filter((d) => field(d, 'VAR') === name)[0];
        if (!declaration) {
            throw new Error('the program has no variable "' + name + '"');
        }
        const value = childElements(declaration, 'value').filter((v) => v.getAttribute('name') === 'VALUE')[0];
        const literal = x.literal(test.globals[name], field(declaration, 'TYPE') || 'Number');
        if (value) {
            childElements(value).forEach((c) => value.removeChild(c));
            value.appendChild(literal);
        } else {
            declaration.appendChild(x.value('VALUE', literal));
        }
    });
    return new XMLSerializer().serializeToString(doc);
}

// ------------------------------------------------------------------------------------------------ compiling

const compiled: { key: string; result: Promise<any> }[] = [];

/** the program compiled for the simulator (the answer of sourceSimulation); the last few are kept (each set of "set up" variables is a program) */
export function compile(programXml: string): Promise<any> {
    const isNamedConfig = !GUISTATE_C.isConfigurationStandard() && !GUISTATE_C.isConfigurationAnonymous();
    const configurationName = isNamedConfig ? GUISTATE_C.getConfigurationName() : undefined;
    const confXML = GUISTATE_C.isConfigurationAnonymous() ? GUISTATE_C.getConfigurationXML() : undefined;
    const key = [GUISTATE_C.getRobot(), configurationName, confXML, programXml].join('\n');
    const known = compiled.filter((c) => c.key === key)[0];
    if (known) {
        return known.result;
    }
    const result = new Promise(function (resolve, reject) {
        (COMM as any)
            .json(
                '/projectWorkflow/sourceSimulation',
                {
                    programName: GUISTATE_C.getProgramName(),
                    configurationName: configurationName,
                    progXML: programXml,
                    confXML: confXML,
                    language: GUISTATE_C.getLanguage(),
                },
                resolve,
                'compile a simulation test'
            )
            .fail(() => reject(new Error('the Lab did not answer')));
    });
    result.then(
        (r: any) => r.rc !== 'ok' && forget(key),
        () => forget(key)
    );
    compiled.push({ key: key, result: result });
    compiled.length > 16 && compiled.shift();
    return result;
}

function forget(key: string): void {
    const i = compiled.map((c) => c.key).indexOf(key);
    i >= 0 && compiled.splice(i, 1);
}

/** why the simulator can't run a program: the message and the errors on its blocks */
function compileProblem(result: any): string {
    const errors: string[] = [];
    try {
        const doc = new DOMParser().parseFromString(result.progXML || '', 'text/xml');
        const blocks = doc.getElementsByTagName('block');
        for (let i = 0; i < blocks.length; i++) {
            childElements(blocks[i], 'error').forEach((e) => errors.push(blocks[i].getAttribute('type') + ': ' + (Blockly.Msg[e.textContent] || e.textContent)));
        }
    } catch (e) {
        // no annotations
    }
    return 'the program cannot run in the simulator: ' + (errors.length ? errors.join('; ') : Blockly.Msg[result.message] || result.message);
}

// ------------------------------------------------------------------------------------------------ the test's checks (in units)

interface Shape {
    id: string;
    kind: string;
    polygon: number[][];
    x?: number;
    y?: number;
    r?: number;
    box: number[];
}

function bbox(points: number[][], margin = 0): number[] {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    return [Math.min(...xs) - margin, Math.min(...ys) - margin, Math.max(...xs) + margin, Math.max(...ys) + margin];
}

function shapeOf(item: SIM.SimItem): Shape {
    if (item.kind === 'rect') {
        const [x0, y0, w, h] = [u(item.x), u(item.y), item.w * SIM.UNITS_PER_CM, item.h * SIM.UNITS_PER_CM];
        const polygon = [
            [x0, y0],
            [x0 + w, y0],
            [x0 + w, y0 + h],
            [x0, y0 + h],
        ];
        return { id: item.id, kind: item.kind, polygon: polygon, box: bbox(polygon) };
    }
    if (item.kind === 'circle') {
        const [x, y, r] = [u(item.x), u(item.y), item.r * SIM.UNITS_PER_CM];
        const polygon = [];
        for (let k = 0; k < 48; k++) {
            polygon.push([x + r * Math.cos((2 * Math.PI * k) / 48), y + r * Math.sin((2 * Math.PI * k) / 48)]);
        }
        return { id: item.id, kind: item.kind, polygon: polygon, x: x, y: y, r: r, box: bbox(polygon, r * 0.02) };
    }
    const polygon = item.points.map((p) => [u(p[0]), u(p[1])]);
    return { id: item.id, kind: item.kind, polygon: polygon, box: bbox(polygon) };
}

function closestOnSegment(p: number[], a: number[], b: number[]): number[] {
    const d = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
    if (d === 0) {
        return a;
    }
    const t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / d;
    return t < 0 ? a : t > 1 ? b : [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

function pointInPolygon(x: number, y: number, poly: number[][]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [ax, ay] = poly[i];
        const [bx, by] = poly[j];
        if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) {
            inside = !inside;
        }
    }
    return inside;
}

/** 0 inside the polygon, else the distance to its outline */
function polygonDistance(x: number, y: number, poly: number[][]): number {
    if (pointInPolygon(x, y, poly)) {
        return 0;
    }
    let best = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const q = closestOnSegment([x, y], poly[j], poly[i]);
        best = Math.min(best, Math.hypot(x - q[0], y - q[1]));
    }
    return best;
}

function cross(o: number[], a: number[], b: number[]): number {
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function segmentsCross(a: number[], b: number[], c: number[], d: number[]): boolean {
    const d1 = cross(c, d, a);
    const d2 = cross(c, d, b);
    const d3 = cross(a, b, c);
    const d4 = cross(a, b, d);
    if (d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0 && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0) {
        return true;
    }
    const on = (p: number[], q: number[], r: number[], cr: number) =>
        cr === 0 && Math.min(p[0], q[0]) <= r[0] && r[0] <= Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1]);
    return on(c, d, a, d1) || on(c, d, b, d2) || on(a, b, c, d3) || on(a, b, d, d4);
}

/** does the robot's outline touch a shape? */
function touches(shape: Shape, poly: number[][], box: number[]): boolean {
    const s = shape.box;
    if (!(box[0] <= s[2] && s[0] <= box[2] && box[1] <= s[3] && s[1] <= box[3])) {
        return false;
    }
    if (shape.kind === 'circle') {
        return polygonDistance(shape.x, shape.y, poly) <= shape.r;
    }
    const sp = shape.polygon;
    for (let i = 0; i < poly.length; i++) {
        for (let j = 0; j < sp.length; j++) {
            if (segmentsCross(poly[(i + poly.length - 1) % poly.length], poly[i], sp[(j + sp.length - 1) % sp.length], sp[j])) {
                return true;
            }
        }
    }
    return pointInPolygon(poly[0][0], poly[0][1], sp) || pointInPolygon(sp[0][0], sp[0][1], poly);
}

/** the robot's outline at a pose of the world (cm, degrees), in units */
function outlineAt(x: number, y: number, heading: number): number[][] {
    return SIM.footprint(x, y, heading).map((p) => [u(p[0]), u(p[1])]);
}

/** where the robot may be: within the tolerance of its outline at any pose of the recorded path */
class Corridor {
    private static readonly CELL = 15; // units
    private outlines: number[][][];
    private cells: { [key: string]: number[] } = {};
    private last = 0; // the robot moves along the path: look near the last match first

    constructor(path: number[][], private tolerance: number) {
        this.outlines = path.map((p) => outlineAt(p[0], p[1], p[2]));
        this.outlines.forEach((poly, k) => {
            const box = bbox(poly, tolerance);
            for (let i = Math.floor(box[0] / Corridor.CELL); i <= Math.floor(box[2] / Corridor.CELL); i++) {
                for (let j = Math.floor(box[1] / Corridor.CELL); j <= Math.floor(box[3] / Corridor.CELL); j++) {
                    (this.cells[i + ',' + j] = this.cells[i + ',' + j] || []).push(k);
                }
            }
        });
    }

    private near(k: number, x: number, y: number): boolean {
        return polygonDistance(x, y, this.outlines[k]) <= this.tolerance + 1e-9;
    }

    contains(x: number, y: number): boolean {
        const n = this.outlines.length;
        for (let k = Math.max(0, this.last - 4); k < Math.min(n, this.last + 16); k++) {
            if (this.near(k, x, y)) {
                this.last = k;
                return true;
            }
        }
        for (const k of this.cells[Math.floor(x / Corridor.CELL) + ',' + Math.floor(y / Corridor.CELL)] || []) {
            if (this.near(k, x, y)) {
                this.last = k;
                return true;
            }
        }
        return false;
    }

    /** the first of the outline's corners and edge middles that is outside, or null */
    outside(poly: number[][]): number[] {
        const n = poly.length;
        const points = poly.concat(poly.map((p, i) => [(p[0] + poly[(i + 1) % n][0]) / 2, (p[1] + poly[(i + 1) % n][1]) / 2]));
        return points.filter((p) => !this.contains(p[0], p[1]))[0] || null;
    }
}

// ------------------------------------------------------------------------------------------------ running

export interface RunOptions {
    /** a recording: the test's recorded path isn't checked, so the run can become the new one */
    record?: boolean;
    /** asked between pieces of the run: true stops it (the promise is rejected with "cancelled") */
    cancelled?: () => boolean;
}

/** runs the interpreter for one frame: at most OPS_PER_FRAME operations (its time limit, Interpreter.run, counts operations here) */
function runFrame(interpreter: Interpreter): number {
    const RealDate = Date;
    let ops = 0;
    const OpsDate: any = function () {
        return { getTime: () => ops++ };
    };
    OpsDate.now = () => ops;
    (window as any).Date = OpsDate;
    try {
        return interpreter.run(OPS_PER_FRAME);
    } finally {
        (window as any).Date = RealDate;
    }
}

/** the simulator's Edison, offscreen: no microphone is asked for, no sound plays, and nothing of it gets onto the simulator's page */
function createRobot(id: number, configuration: any, interpreter: Interpreter, listener: SelectionListener): any {
    const media: any = navigator.mediaDevices;
    const own = media && Object.getOwnPropertyDescriptor(media, 'getUserMedia');
    if (media) {
        media.getUserMedia = () => new Promise(() => {}); // VolumeMeterSensor asks for the microphone
    }
    let robot: any;
    try {
        robot = new RobotEdison(id, JSON.parse(JSON.stringify(configuration || {})), interpreter, 'test', listener);
    } finally {
        if (media) {
            if (own) {
                Object.defineProperty(media, 'getUserMedia', own);
            } else {
                delete media.getUserMedia;
            }
        }
    }
    robot.removeMouseEvents();
    $('#brick' + id).remove(); // EdisonChassis adds its picture to the simulator's robot window
    robot.webAudio && robot.webAudio.context && robot.webAudio.context.close();
    return robot;
}

let nextRobotId = 9000000;

/** the name of an item of the world, for the reports (in English, as NepoTest's) */
function nameOf(world: SIM.SimWorld, id: string): string {
    const item = world.items.filter((i) => i.id === id)[0];
    return item ? '"' + SIM.itemName(world, item, (kind) => KIND_WORDS[kind] || kind) + '"' : '"' + id + '"';
}

/** what a check of a test checks, in words */
export function describeCheck(check: any, world: SIM.SimWorld): string {
    const item = check.item ? nameOf(world, check.item) : null;
    switch (check.check) {
        case 'reaches':
            return 'the robot reaches ' + (item || 'a goal area');
        case 'never_touches':
            return 'the robot never touches ' + (item || 'a fail area');
        case 'ends_in':
            return 'at the end, the robot is completely in ' + item;
        case 'never_bumps':
            return 'the robot never bumps into ' + (item || 'anything');
        case 'path':
            return 'the robot stays on its recorded path ± ' + (typeof check.tolerance_cm === 'number' ? check.tolerance_cm : SIM.DEFAULT_TOLERANCE_CM) + ' cm';
        default:
            return BEHAVIOUR.describe(check);
    }
}

/** a check during a run: decided (passed true or false) as soon as it can be, the others at the end */
interface CheckState {
    spec: any;
    text: string;
    passed: boolean;
    t: number;
    item: string;
    point: number[];
    message: string;
    corridor?: Corridor;
    skipped?: boolean; // a path check without a path, or while it is recorded: it checks nothing
    factsAt?: number; // the end of its facts (a behaviour check: soon after it went wrong); else t
    verdict?: BEHAVIOUR.Verdict; // a behaviour or variable check: what judge found
    why?: VERDICT.Explanation; // a failed check: why (nepoTest.simVerdict)
}

class Run {
    private listener = new SelectionListener();
    private interpreter: Interpreter;
    private robot: any;
    private world: SIM.SimWorld;
    private obstacles: any[];
    private shapes: { [id: string]: Shape } = {};
    private checks: CheckState[];
    private until: Shape = null;
    private touchingUntil = false;
    private ground: any;
    private udCtx: CanvasRenderingContext2D;
    private now = 0;
    private renderUntil = 0;
    private terminated = false;
    private toneUntil: number = null;
    private covered: { [id: string]: boolean } = {};
    private lastBlock: string = null;
    private start: SIM.SimStart;
    private heading: number;
    private theta: number;
    private path: number[][] = [];
    private leds: any[][] = [];
    private bumps = 0;
    private bump: string = undefined; // what the robot bumped into in this frame (null: the wall)
    private touching: string[] = []; // the areas it touches
    private checked: string = null;
    private recorder: PROGRAM.Recorder;
    outcome: { result: string; t: number } = null;
    error: any = null;

    constructor(private test: any, compiled: any, private uCtx: CanvasRenderingContext2D, private options: RunOptions, model: PROGRAM.ProgramModel) {
        const sim = test.simulation;
        const world: SIM.SimWorld = sim.world;
        this.world = world;
        const [bw, bh] = SIM.backgroundSize(world);
        this.ground = new Ground(10, 10, bw, bh);
        this.obstacles = world.items.filter((i) => i.role === 'obstacle' && isShape(i)).map((i) => simObject(i, SimObjectType.Obstacle, this.listener));
        world.items.filter((i) => i.kind !== 'line' && isShape(i)).forEach((i) => (this.shapes[i.id] = shapeOf(i)));
        this.checks = (sim.checks || []).map((c: any) => this.checkState(c));
        this.until = sim.until ? this.shapes[sim.until] || null : null;
        const ud = document.createElement('canvas'); // the simulator's trail canvas: no trail is drawn
        ud.width = uCtx.canvas.width;
        ud.height = uCtx.canvas.height;
        this.udCtx = ud.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D;

        const program = JSON.parse(compiled.javaScriptProgram);
        PROGRAM.scanDecisions(program.ops || [], model); // before the interpreter's State turns the jumps' labels into indexes
        this.interpreter = new Interpreter(program, new RobotSimBehaviour(), () => (this.terminated = true), [], 'test', false);
        const state = (this.interpreter as any).state;
        const getOp = state.getOp.bind(state);
        const covered = this.covered;
        const run = this;
        state.getOp = function () {
            const op = getOp(); // the blocks an operation begins: coverage, and where an error happened
            if (op && op['+']) {
                op['+'].forEach((id: string) => {
                    covered[id] = true;
                    run.lastBlock = id;
                });
            }
            return op;
        };
        this.recorder = new PROGRAM.Recorder(model, state, this.interpreter.getRobotBehaviour(), () => this.now);
        this.robot = createRobot(nextRobotId++, compiled.configuration, this.interpreter, this.listener);
        this.start = SIM.startOf(world, sim.start);
        const theta = (-this.start.heading * Math.PI) / 180;
        this.robot.pose = new Pose(u(this.start.x), u(this.start.y), theta);
        this.robot.initialPose = new Pose(u(this.start.x), u(this.start.y), theta);
        this.robot.chassis.transformNewPose(this.robot.pose, this.robot.chassis);
        this.heading = this.start.heading;
        this.theta = this.robot.pose.theta;
        const behaviour = this.interpreter.getRobotBehaviour();
        const self = this;
        this.robot.webAudio = {
            // WebAudio without sound: a tone blocks the program as long as it would play
            updateAction(myRobot: any, dt: number, running: boolean) {
                const tone = behaviour.getActionState('tone', true);
                if (tone) {
                    const ms = tone.frequency && tone.duration > 0 ? tone.duration : tone.file !== undefined ? TONE_FILE_MS[tone.file] || 0 : 0;
                    self.toneUntil = self.now + ms;
                }
                if (self.toneUntil !== null && self.now >= self.toneUntil) {
                    self.toneUntil = null;
                    behaviour.setBlocking(false);
                }
            },
        };
    }

    private checkState(spec: any): CheckState {
        const state: CheckState = { spec: spec, text: describeCheck(spec, this.world), passed: null, t: null, item: null, point: null, message: null };
        if (spec.check === 'path') {
            if (this.options.record) {
                state.skipped = true;
                state.message = 'not checked: the path is recorded in this run';
            } else if (!spec.path || !spec.path.length) {
                state.skipped = true;
                state.message = 'not checked: no path recorded yet (select the test in the Simulation tab and press "Record path")';
            } else {
                const tolerance = typeof spec.tolerance_cm === 'number' ? spec.tolerance_cm : SIM.DEFAULT_TOLERANCE_CM;
                state.corridor = new Corridor(spec.path, tolerance * SIM.UNITS_PER_CM);
            }
        }
        return state;
    }

    /** the shapes a check is about: its item, or all goal areas ("reaches any goal area") or fail areas ("never touches any fail area") */
    private targets(check: CheckState): Shape[] {
        if (check.spec.item) {
            return this.shapes[check.spec.item] ? [this.shapes[check.spec.item]] : [];
        }
        const role = check.spec.check === 'reaches' ? 'goal' : 'fail';
        return this.world.items.filter((i) => i.role === role && this.shapes[i.id]).map((i) => this.shapes[i.id]);
    }

    private settle(check: CheckState, passed: boolean, item: string = null, point: number[] = null): void {
        check.passed = passed;
        check.t = this.time();
        check.item = item;
        check.point = point;
    }

    private time(): number {
        return Math.round(this.now * 10) / 10;
    }

    private given(): void {
        const events = this.test.world || [];
        const now = this.now;
        let volume = 0;
        events.forEach((e) => e.event === 'clap' && e.at <= now && (volume = Math.max(volume, Math.pow(METER_AVERAGING, Math.floor((now - e.at) / METER_BUFFER_MS)))));
        this.robot.soundSensor.sound = { volume: volume }; // VolumeMeterSensor reads its meter's volume
        const keys = this.robot.buttons.keys;
        Object.keys(keys).forEach((name) => {
            keys[name].value = events.some((e) => e.event === 'key' && String(e.port).toLowerCase() === name && e.at <= now && now < e.at + KEY_MS);
        });
    }

    private outline(): number[][] {
        const c = this.robot.chassis;
        return [c.frontLeft, c.frontRight, c.backRight, c.backLeft].map((p) => [p.rx, p.ry]);
    }

    /** one frame of SimulationRoberta.render: the interpreter, then SimulationScene.update (the robot's actions, then its sensors) */
    private frame(running: boolean): void {
        if (running && !this.terminated && this.renderUntil <= this.now) {
            try {
                this.renderUntil = this.now + runFrame(this.interpreter);
            } catch (e) {
                // the innermost block running (an expression too), as the record knows it; else the last block that began
                this.error = { kind: 'runtime_error', message: String((e && e.message) || e), block_id: this.recorder.innermostOpen() || this.lastBlock };
                this.end('error');
                return;
            }
        }
        const robot = this.robot;
        const chassis = robot.chassis;
        this.given();
        robot.updateActions(robot, FRAME_MS / 1000, running);
        this.bump = undefined;
        if (
            ((chassis.frontLeft.bumped || chassis.wheelFrontLeft.bumped) && chassis.left.speed > 0) ||
            (chassis.backLeft.bumped && chassis.left.speed < 0) ||
            ((chassis.frontRight.bumped || chassis.wheelFrontRight.bumped) && chassis.right.speed > 0) ||
            (chassis.backRight.bumped && chassis.right.speed < 0)
        ) {
            this.bumps++; // ChassisDiffDrive.updateAction turned a wheel back
            running && this.bumped();
        }
        const personal = this.obstacles.concat([chassis, this.ground]);
        robot.updateSensors(running, FRAME_MS / 1000, this.uCtx, this.udCtx, personal, [], []);
        let d = robot.pose.theta - this.theta;
        d = ((((d + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
        this.heading -= (d * 180) / Math.PI;
        this.theta = robot.pose.theta;
        this.now += FRAME_MS;
        const leds = [robot.leds.colorL != null, robot.leds.colorR != null];
        const last = this.leds[this.leds.length - 1];
        if (last ? last[1] !== leds[0] || last[2] !== leds[1] : leds[0] || leds[1]) {
            this.leds.push([Math.round(this.now * 10) / 10, leds[0], leds[1]]);
        }
    }

    /** the robot bumped: into the nearest obstacle (none: the wall); the "never bumps into" checks of that obstacle fail */
    private bumped(): void {
        const poly = this.outline();
        let into: string = null;
        let best = BUMP_MARGIN;
        for (const item of this.world.items) {
            const shape = item.role === 'obstacle' && this.shapes[item.id];
            const distance = shape ? shapeDistance(shape, poly) : Infinity;
            if (distance <= best) {
                best = distance;
                into = item.id;
            }
        }
        this.bump = into;
        this.checks.filter((c) => c.spec.check === 'never_bumps' && c.passed === null && (!c.spec.item || c.spec.item === into)).forEach((c) => this.settle(c, false, into));
    }

    private pose(): number[] {
        return [cm(this.robot.pose.x), cm(this.robot.pose.y), this.heading];
    }

    private sample(force = false): void {
        const [x, y, h] = this.pose();
        const last = this.path[this.path.length - 1];
        if (force || !last || Math.hypot(x - last[1], y - last[2]) >= SAMPLE_CM || Math.abs(h - last[3]) >= SAMPLE_DEG) {
            const entry = [Math.round(this.now * 10) / 10, SIM.round2(x), SIM.round2(y), Math.round(h * 10) / 10];
            if (last && last[0] === entry[0]) {
                this.path[this.path.length - 1] = entry;
            } else {
                this.path.push(entry);
            }
        }
    }

    /** after a frame in which the robot moved: the checks of areas and of the recorded path, and the area the run ends at */
    private check(): void {
        const c = this.robot.chassis;
        const key = [c.frontLeft.rx, c.frontLeft.ry, c.backRight.rx, c.backRight.ry].join();
        if (key === this.checked) {
            return; // nothing changed: what the robot touches stays as it was
        }
        this.checked = key;
        this.sample();
        const poly = this.outline();
        const box = bbox(poly);
        this.touching = this.world.items.filter((i) => SIM.isArea(i) && this.shapes[i.id] && touches(this.shapes[i.id], poly, box)).map((i) => i.id);
        for (const check of this.checks) {
            if (check.passed !== null || check.skipped) {
                continue;
            }
            const kind = check.spec.check;
            if (kind === 'reaches' || kind === 'never_touches') {
                const hit = this.targets(check).filter((s) => touches(s, poly, box))[0];
                hit && this.settle(check, kind === 'reaches', hit.id);
            } else if (kind === 'path') {
                const point = check.corridor.outside(poly);
                point && this.settle(check, false, null, [SIM.round2(cm(point[0])), SIM.round2(cm(point[1]))]);
            }
        }
        if (this.until) {
            const touching = touches(this.until, poly, box);
            if (touching && !this.touchingUntil) {
                this.end('until'); // it touches the area anew (if it started on it, it has to leave it first)
            }
            this.touchingUntil = touching;
        }
    }

    /** the frame for the record: what the robot does now */
    private record(): void {
        const chassis = this.robot.chassis;
        this.recorder.endFrame(
            {
                t: this.now,
                pose: this.pose(),
                speeds: [chassis.left.speed / SIM.UNITS_PER_CM, chassis.right.speed / SIM.UNITS_PER_CM],
                leds: [this.robot.leds.colorL != null, this.robot.leds.colorR != null],
                tone: this.toneUntil !== null,
                bump: this.bump,
                touching: this.touching,
            },
            this.interpreter
        );
    }

    private end(result: string): void {
        if (!this.outcome) {
            this.sample(true);
            this.outcome = { result: result, t: this.time() };
        }
    }

    /** the whole run, in pieces (the browser can draw in between) */
    run(): Promise<void> {
        const maxTime = this.test.max_time_ms || DEFAULT_MAX_TIME_MS;
        this.frame(false); // the simulator's frames before the program starts: the sensors have values
        this.now = 0;
        this.robot.time = 0;
        this.sample(true);
        if (this.until) {
            const poly = this.outline();
            this.touchingUntil = touches(this.until, poly, bbox(poly));
        }
        this.recorder.begin({ t: 0, pose: this.pose(), speeds: [0, 0], leds: [false, false], tone: false, bump: undefined, touching: [] });
        const piece = (resolve: () => void, reject: (e: Error) => void) => {
            if (this.options.cancelled && this.options.cancelled()) {
                reject(new Error('cancelled'));
                return;
            }
            const until = performance.now() + CHUNK_MS;
            while (!this.outcome && performance.now() < until) {
                this.frame(true); // in the frame in which the program ends, the simulator still moves the robot; then it stops
                if (this.outcome) {
                    break;
                }
                this.check();
                this.record();
                if (!this.outcome && this.terminated) {
                    this.end('finished');
                } else if (!this.outcome && this.now >= maxTime) {
                    this.end('time_limit');
                }
            }
            this.outcome ? resolve() : setTimeout(() => piece(resolve, reject), 0);
        };
        return new Promise(piece);
    }

    /** the checks still open at the end: "reaches" failed, "never ..." held, "ends in" is checked now; after a runtime error, they aren't decided */
    private decideRest(): void {
        const outcome = this.outcome;
        const poly = this.outline();
        const at = seconds(outcome.t);
        const ended =
            outcome.result === 'until'
                ? ': the run ended when the robot touched ' + nameOf(this.world, this.test.simulation.until) + ' after ' + at + ' s'
                : outcome.result === 'time_limit'
                ? ' within ' + seconds(this.test.max_time_ms || DEFAULT_MAX_TIME_MS) + ' s'
                : ': the program ended after ' + at + ' s';
        const variables = this.variables();
        for (const check of this.checks) {
            const kind = check.spec.check;
            if (check.skipped) {
                continue;
            }
            if (BEHAVIOUR.KINDS.indexOf(kind) >= 0) {
                const verdict = BEHAVIOUR.judge(check.spec, this.recorder, this.test.world || [], variables, outcome.t);
                if (this.error && verdict.passed !== false) {
                    check.message = 'not decided: the program failed after ' + at + ' s'; // a failure before the error counts
                } else {
                    [check.passed, check.t, check.point, check.message, check.factsAt] = [verdict.passed, verdict.t, verdict.point, verdict.message, verdict.factsAt];
                    check.verdict = verdict;
                }
                continue;
            }
            if (check.passed === null && this.error) {
                check.message = 'not decided: the program failed after ' + at + ' s';
                continue;
            }
            if (kind === 'reaches') {
                if (check.passed) {
                    check.message = 'the robot reached ' + nameOf(this.world, check.item) + ' after ' + seconds(check.t) + ' s';
                } else {
                    this.settle(check, false);
                    check.message = 'the robot did not reach ' + (check.spec.item ? nameOf(this.world, check.spec.item) : 'a goal area') + ended;
                }
            } else if (kind === 'never_touches') {
                check.passed === null && this.settle(check, true);
                check.message = check.passed ? 'the robot never touched ' + (check.spec.item ? nameOf(this.world, check.spec.item) : 'a fail area') : 'the robot touched ' + nameOf(this.world, check.item) + ' after ' + seconds(check.t) + ' s';
            } else if (kind === 'never_bumps') {
                check.passed === null && this.settle(check, true);
                check.message = check.passed
                    ? 'the robot never bumped into ' + (check.spec.item ? nameOf(this.world, check.spec.item) : 'anything')
                    : 'the robot bumped into ' + (check.item ? nameOf(this.world, check.item) : 'the wall') + ' after ' + seconds(check.t) + ' s';
            } else if (kind === 'path') {
                check.passed === null && this.settle(check, true);
                const tolerance = typeof check.spec.tolerance_cm === 'number' ? check.spec.tolerance_cm : SIM.DEFAULT_TOLERANCE_CM;
                check.message = check.passed ? 'the robot stayed on its recorded path' : 'the robot left its recorded path (by more than ' + tolerance + ' cm) after ' + seconds(check.t) + ' s';
            } else if (kind === 'ends_in') {
                const shape = this.shapes[check.spec.item];
                this.settle(check, !!shape && inside(shape, poly), check.spec.item);
                check.message = (check.passed ? 'at the end, the robot was completely in ' : 'at the end (after ' + at + ' s), the robot was not completely in ') + nameOf(this.world, check.spec.item);
            }
        }
    }

    /** why each failed check failed (nepoTest.simVerdict); a failed check of where the robot goes points to the first failed check of what it does */
    private explain(): void {
        const name = (id: string) => nameOf(this.world, id);
        for (const check of this.checks) {
            if (check.passed === false && check.verdict) {
                try {
                    check.why = VERDICT.explain(check.spec, check.verdict, this.recorder, this.test.world || [], name) || undefined;
                } catch (e) {
                    this.recorder.failure = this.recorder.failure || 'why: ' + String((e && e.message) || e); // the facts are there anyway
                }
            }
        }
        // a check of what it does that went wrong by then; not one that failed because of the world (it bumped: "right, but not enough")
        const behaviour = (t: number) => this.checks.filter((c) => c.passed === false && c.verdict && c.verdict.evidence && c.verdict.evidence.from <= t && c.spec.check !== 'variable' && !(c.why && c.why.kind === 'not_enough'))[0];
        this.checks
            .filter((c) => c.passed === false && !c.verdict)
            .forEach((c) => {
                const other = behaviour(c.t === null ? Infinity : c.t);
                other && (c.why = VERDICT.seeAlso(other.text));
            });
    }

    /** the program's variables now (their values, not the interpreter's bindings) */
    private variables(): { [name: string]: any } {
        const variables = {};
        const bindings = this.interpreter.getVariables() || {};
        Object.keys(bindings).forEach((name) => (variables[name] = bindings[name][0]));
        return variables;
    }

    report(source: string): any {
        const test = this.test;
        const outcome = this.outcome;
        this.decideRest();
        this.explain();
        const failures: any[] = [];
        const factsAt: { [t: string]: PROGRAM.Facts } = {};
        const factsOf = (t: number) => factsAt[t] || (factsAt[t] = PROGRAM.facts(this.recorder, t === null || t === undefined ? outcome.t : t));
        if (outcome.result === 'error') {
            this.error.block_type = blockType(source, this.error.block_id);
            failures.push({ expect: 'error', expected: null, actual: this.error, message: 'the program failed: ' + this.error.message, facts: factsOf(outcome.t) });
        }
        for (const check of this.checks) {
            if (check.passed === false) {
                failures.push({
                    expect: 'simulation',
                    expected: check.text,
                    actual: { t: check.t, item: check.item, point: check.point },
                    message: (check.spec.rule ? 'rule: ' : '') + check.message,
                    described: true,
                    check_block_id: check.spec.block_id,
                    facts: factsOf(check.factsAt !== undefined ? check.factsAt : check.t),
                    why: check.why,
                });
            }
        }
        const failedRule = this.checks.some((c) => c.spec.rule && c.passed === false);
        const failedOwn = !!this.error || this.checks.some((c) => !c.spec.rule && c.passed === false);
        let result = failedRule || failedOwn ? 'failed' : 'passed';
        let expectedFailure = false;
        if (test.should === 'fail' && !failedRule) {
            // it should fail by its own checks; a rule of the world must hold anyway
            if (failedOwn) {
                result = 'passed';
                expectedFailure = true;
            } else {
                result = 'failed';
                failures.push({ expect: 'should', expected: 'fail', actual: 'passed', message: SHOULD_FAIL_MESSAGE, described: true });
            }
        }
        const failedArea = this.checks.filter((c) => c.passed === false && c.item)[0];
        const deviation = this.checks.filter((c) => c.passed === false && c.point)[0];
        const trace = PROGRAM.trace(this.recorder);
        BEHAVIOUR.addMotion(trace, BEHAVIOUR.moments(this.recorder));
        const report: any = {
            name: test.name,
            block_id: test.block_id,
            world_block_id: test.simulation.world_block_id,
            kind: 'simulation',
            outcome: result,
            failures: failures,
            error: this.error,
            time_ms: Math.round(outcome.t),
            variables: this.variables(),
            covered_blocks: Object.keys(this.covered).filter((id) => id.indexOf('nepoTest') !== 0),
            status: outcome.result === 'error' ? 'error' : outcome.result === 'until' ? 'simulation' : outcome.result,
            checks: this.checks.map((c) => ({
                block_id: c.spec.block_id,
                check: c.spec.check,
                text: c.text,
                rule: !!c.spec.rule,
                passed: c.passed,
                t: c.t,
                item: c.item,
                point: c.point,
                message: c.message,
                facts: c.passed === false ? factsOf(c.factsAt !== undefined ? c.factsAt : c.t) : undefined,
                why: c.why,
            })),
            trace: trace,
            simulation: {
                result: outcome.result,
                t: outcome.t,
                item: failedArea ? failedArea.item : null,
                point: deviation ? deviation.point : null,
                path: this.path,
                leds: this.leds,
                start: [this.start.x, this.start.y, this.start.heading],
                recorded: !!this.options.record,
                bumps: this.bumps,
            },
        };
        if (expectedFailure) {
            report.expected_failure = true;
        }
        if (this.recorder.failure) {
            report.record_failure = this.recorder.failure; // the record is incomplete (the run itself isn't affected)
        }
        return report;
    }
}

/** how far a shape is from the robot's outline (units; 0: they touch) */
function shapeDistance(shape: Shape, poly: number[][]): number {
    if (touches(shape, poly, bbox(poly))) {
        return 0;
    }
    if (shape.kind === 'circle') {
        return polygonDistance(shape.x, shape.y, poly) - shape.r;
    }
    let best = Infinity;
    poly.forEach((p) => (best = Math.min(best, polygonDistance(p[0], p[1], shape.polygon))));
    shape.polygon.forEach((q) => (best = Math.min(best, polygonDistance(q[0], q[1], poly))));
    return best;
}

/** is the whole outline inside the shape? (the shapes are convex: its corners are enough) */
function inside(shape: Shape, poly: number[][]): boolean {
    if (shape.kind === 'circle') {
        return poly.every((p) => Math.hypot(p[0] - shape.x, p[1] - shape.y) <= shape.r);
    }
    return poly.every((p) => pointInPolygon(p[0], p[1], shape.polygon));
}

function blockType(source: string, id: string): string {
    if (!id) {
        return null;
    }
    const blocks = new DOMParser().parseFromString(source, 'text/xml').getElementsByTagName('block');
    for (let i = 0; i < blocks.length; i++) {
        if (blocks[i].getAttribute('id') === id) {
            return blocks[i].getAttribute('type');
        }
    }
    return null;
}

export const SHOULD_FAIL_MESSAGE = 'the test should fail, but it passed';

function errorReport(test: any, message: string): any {
    return {
        name: test.name,
        block_id: test.block_id,
        world_block_id: test.simulation && test.simulation.world_block_id,
        kind: 'simulation',
        outcome: 'error',
        failures: [],
        error: { kind: 'test_error', message: message },
    };
}

const floors: { key: string; canvas: Promise<HTMLCanvasElement> }[] = [];

/** the floor picture of a world; the last few are kept (the tests of a world share theirs: the robot doesn't draw on it) */
function floorFor(world: SIM.SimWorld): Promise<HTMLCanvasElement> {
    const key = SIM.floorKey(world);
    const known = floors.filter((f) => f.key === key)[0];
    if (known) {
        return known.canvas;
    }
    const canvas = floorCanvas(world);
    floors.push({ key: key, canvas: canvas });
    floors.length > 4 && floors.shift();
    canvas.then(null, () => floors.splice(floors.map((f) => f.key).indexOf(key), 1));
    return canvas;
}

/**
 * runs a test of a simulation world (NepoTest JSON, as nepotest/blocks.py makes it from the test block) on the simulator, for the program in
 * the Program tab (its block_set XML). Resolves with the report; a program that can't run gives a report with outcome "error", a test that is
 * skipped one with outcome "skipped".
 */
export function runTest(test: any, programXml: string, options: RunOptions = {}): Promise<any> {
    if (test.skip) {
        return Promise.resolve({
            name: test.name,
            block_id: test.block_id,
            world_block_id: test.simulation.world_block_id,
            kind: 'simulation',
            outcome: 'skipped',
            failures: [],
            error: null,
            message: 'skipped',
        });
    }
    let source: string;
    try {
        source = programFor(programXml, test);
    } catch (e) {
        return Promise.resolve(errorReport(test, e.message));
    }
    return Promise.all([compile(source), floorFor(test.simulation.world)]).then(function ([result, floor]: [any, HTMLCanvasElement]) {
        if (result.rc !== 'ok') {
            return errorReport(test, compileProblem(result));
        }
        const model = new PROGRAM.ProgramModel(source);
        const run = new Run(test, result, floor.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D, options, model);
        return run.run().then(() => run.report(source));
    });
}
