/**
 * Simulation tests run on the Lab's own simulator. The program is compiled for the simulator (REST /projectWorkflow/sourceSimulation, as the
 * Program tab's simulation does), and the simulator's own code runs it in the test's world (nepoTest.sim): the stack machine's interpreter
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
 * - the test adds lines to follow (drawn on the floor picture the sensors see), goal and fail areas, and the recorded path.
 *
 * The report has the shape of NepoTest's reports (NepoTest/nepotest/spec.py), so the Tests tab shows both kinds of tests alike:
 *   {name, block_id, kind: 'simulation', outcome, failures, error, time_ms, variables, covered_blocks, status | returned,
 *    simulation: {result, t, item, point, path: [[t_ms, x, y, heading], ...], leds: [[t_ms, left, right], ...], recorded, goals, bumps}}
 * result: goal | fail_area | deviation | finished | returned | time_limit | error. Positions in cm, headings in degrees (not wrapped).
 * A test that should fail (`should: "fail"`) is turned round as in spec.py apply_should.
 */
import * as COMM from 'comm';
import * as GUISTATE_C from 'guiState.controller';
// @ts-ignore (Blockly has no type declarations)
import * as Blockly from 'blockly';
import * as SIM from 'nepoTest.sim';
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
const RESULT_VARIABLE = 'nepoTestReturned';
const CHUNK_MS = 30; // the browser gets a chance to draw after this much computing

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

/**
 * the program a test runs: the whole program, or a program whose start block calls the test's function (a function with a result stores it in
 * a variable of its own); the global variables of "given" start with their values instead of the declared ones
 */
export function programFor(programXml: string, test: any): string {
    if (!test.call && !test.globals) {
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
    Object.keys(test.globals || {}).forEach(function (name) {
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
    if (test.call) {
        const definition = blocks.filter(
            (b) => (b.getAttribute('type') === 'robProcedures_defnoreturn' || b.getAttribute('type') === 'robProcedures_defreturn') && field(b, 'NAME') === test.call
        )[0];
        if (!definition) {
            throw new Error('the program has no function "' + test.call + '"');
        }
        const st = childElements(definition)
            .filter((c) => c.localName === 'statement' && c.getAttribute('name') === 'ST')
            .concat(childElements(definition, 'repetitions').reduce((all, r) => all.concat(childElements(r, 'statement').filter((s) => s.getAttribute('name') === 'ST')), []))[0];
        const params = st ? childElements(st, 'block').map((p) => ({ name: field(p, 'VAR'), type: field(p, 'TYPE') || 'Number' })) : [];
        const args = test.args || [];
        const mutation = x.el(
            'mutation',
            { name: test.call },
            params.map((p) => x.el('arg', { name: p.name, type: p.type }))
        );
        const values = params.map((p, i) => x.value('ARG' + i, x.literal(args[i], p.type)));
        let statement: Element;
        if (definition.getAttribute('type') === 'robProcedures_defreturn') {
            const returnType = childElements(definition, 'mutation')[0].getAttribute('return_type') || 'Number';
            mutation.setAttribute('output_type', returnType);
            const call = x.block('robProcedures_callreturn', [mutation, ...values]);
            statement = x.block('variables_set', [x.el('mutation', { datatype: returnType }), x.field('VAR', RESULT_VARIABLE), x.value('VALUE', call)]);
            declareGlobal(x, start, RESULT_VARIABLE, returnType);
        } else {
            statement = x.block('robProcedures_callnoreturn', [mutation, ...values]);
        }
        for (const next of childElements(start, 'next')) {
            start.removeChild(next);
        }
        while (start.nextSibling) {
            start.parentNode.removeChild(start.nextSibling); // the main program: blocks after the start block in its instance
        }
        start.parentNode.appendChild(statement);
    }
    return new XMLSerializer().serializeToString(doc);
}

function declareGlobal(x: XmlBuilder, start: Element, name: string, type: string): void {
    childElements(start, 'mutation').forEach((m) => m.setAttribute('declare', 'true'));
    let st = childElements(start, 'statement').filter((s) => s.getAttribute('name') === 'ST')[0];
    if (!st) {
        st = x.el('statement', { name: 'ST' });
        start.appendChild(st);
    }
    const last = childElements(st, 'block').pop();
    last && childElements(last, 'mutation').forEach((m) => m.setAttribute('next', 'true'));
    const initial = x.literal(/^Array_/.test(type) ? [type === 'Array_Boolean' ? false : 0] : type === 'Boolean' ? false : 0, type);
    const declaration = x.block('robGlobalVariables_declare', [
        x.el('mutation', { next: 'false', declaration_type: type }),
        x.field('VAR', name),
        x.field('TYPE', type),
        x.value('VALUE', initial),
    ]);
    declaration.setAttribute('deletable', 'false');
    declaration.setAttribute('movable', 'false');
    st.appendChild(declaration);
}

// ------------------------------------------------------------------------------------------------ compiling

const compiled: { key: string; result: Promise<any> }[] = [];

/** the program compiled for the simulator (the answer of sourceSimulation); the last few are kept */
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
    compiled.length > 6 && compiled.shift();
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
    /** a recording: the recorded path isn't checked, so the run can become the new one */
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

class Run {
    private listener = new SelectionListener();
    private interpreter: Interpreter;
    private robot: any;
    private obstacles: any[];
    private ground: any;
    private udCtx: CanvasRenderingContext2D;
    private goals: Shape[];
    private fails: Shape[];
    private corridor: Corridor;
    private tolerance: number;
    private now = 0;
    private renderUntil = 0;
    private terminated = false;
    private toneUntil: number = null;
    private covered: { [id: string]: boolean } = {};
    private lastBlock: string = null;
    private heading: number;
    private theta: number;
    private path: number[][] = [];
    private leds: any[][] = [];
    private bumps = 0;
    private checked: string = null;
    outcome: { result: string; t: number; item: string; point: number[] } = null;
    error: any = null;

    constructor(private test: any, compiled: any, private uCtx: CanvasRenderingContext2D, private options: RunOptions) {
        const sim = test.simulation;
        const world: SIM.SimWorld = sim.world;
        const [bw, bh] = SIM.backgroundSize(world);
        this.ground = new Ground(10, 10, bw, bh);
        this.obstacles = world.items.filter((i) => i.role === 'obstacle' && isShape(i)).map((i) => simObject(i, SimObjectType.Obstacle, this.listener));
        this.goals = world.items.filter((i) => i.role === 'goal' && isShape(i)).map(shapeOf);
        this.fails = world.items.filter((i) => i.role === 'fail' && isShape(i)).map(shapeOf);
        const path = sim.reference && sim.reference.path;
        this.tolerance = typeof sim.tolerance_cm === 'number' ? sim.tolerance_cm : SIM.DEFAULT_TOLERANCE_CM;
        this.corridor = !options.record && path && path.length ? new Corridor(path, this.tolerance * SIM.UNITS_PER_CM) : null;
        const ud = document.createElement('canvas'); // the simulator's trail canvas: no trail is drawn
        ud.width = uCtx.canvas.width;
        ud.height = uCtx.canvas.height;
        this.udCtx = ud.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D;

        this.interpreter = new Interpreter(JSON.parse(compiled.javaScriptProgram), new RobotSimBehaviour(), () => (this.terminated = true), [], 'test', false);
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
        this.robot = createRobot(nextRobotId++, compiled.configuration, this.interpreter, this.listener);
        const theta = (-world.start.heading * Math.PI) / 180;
        this.robot.pose = new Pose(u(world.start.x), u(world.start.y), theta);
        this.robot.initialPose = new Pose(u(world.start.x), u(world.start.y), theta);
        this.robot.chassis.transformNewPose(this.robot.pose, this.robot.chassis);
        this.heading = world.start.heading;
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

    /** one frame of SimulationRoberta.render: the interpreter, then SimulationScene.update (the robot's actions, then its sensors) */
    private frame(running: boolean): void {
        if (running && !this.terminated && this.renderUntil <= this.now) {
            try {
                this.renderUntil = this.now + runFrame(this.interpreter);
            } catch (e) {
                this.error = { kind: 'runtime_error', message: String((e && e.message) || e), block_id: this.lastBlock };
                this.decide('error');
                return;
            }
        }
        const robot = this.robot;
        const chassis = robot.chassis;
        this.given();
        robot.updateActions(robot, FRAME_MS / 1000, running);
        if (
            ((chassis.frontLeft.bumped || chassis.wheelFrontLeft.bumped) && chassis.left.speed > 0) ||
            (chassis.backLeft.bumped && chassis.left.speed < 0) ||
            ((chassis.frontRight.bumped || chassis.wheelFrontRight.bumped) && chassis.right.speed > 0) ||
            (chassis.backRight.bumped && chassis.right.speed < 0)
        ) {
            this.bumps++; // ChassisDiffDrive.updateAction turned a wheel back
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

    /** the test's checks after a frame in which the robot moved: fail areas, the recorded path, goal areas */
    private check(): void {
        const c = this.robot.chassis;
        const key = [c.frontLeft.rx, c.frontLeft.ry, c.backRight.rx, c.backRight.ry].join();
        if (key === this.checked) {
            return;
        }
        this.checked = key;
        this.sample();
        const poly = [c.frontLeft, c.frontRight, c.backRight, c.backLeft].map((p) => [p.rx, p.ry]);
        const box = bbox(poly);
        const fail = this.fails.filter((s) => touches(s, poly, box))[0];
        if (fail) {
            return this.decide('fail_area', fail.id);
        }
        const point = this.corridor && this.corridor.outside(poly);
        if (point) {
            return this.decide('deviation', null, [SIM.round2(cm(point[0])), SIM.round2(cm(point[1]))]);
        }
        const goal = this.goals.filter((s) => touches(s, poly, box))[0];
        if (goal) {
            return this.decide('goal', goal.id);
        }
    }

    private decide(result: string, item: string = null, point: number[] = null): void {
        this.sample(true);
        this.outcome = { result: result, t: Math.round(this.now * 10) / 10, item: item, point: point };
    }

    /** the whole run, in pieces (the browser can draw in between) */
    run(): Promise<void> {
        const maxTime = this.test.max_time_ms || DEFAULT_MAX_TIME_MS;
        this.frame(false); // the simulator's frames before the program starts: the sensors have values
        this.now = 0;
        this.robot.time = 0;
        this.sample(true);
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
                if (!this.outcome && this.terminated) {
                    this.decide(this.test.call ? 'returned' : 'finished');
                } else if (!this.outcome && this.now >= maxTime) {
                    this.decide('time_limit');
                }
            }
            this.outcome ? resolve() : setTimeout(() => piece(resolve, reject), 0);
        };
        return new Promise(piece);
    }

    report(source: string): any {
        const test = this.test;
        const outcome = this.outcome;
        const isCall = !!test.call;
        const failures: any[] = [];
        const fail = (message: string) => failures.push({ expect: 'simulation', expected: null, actual: outcome, message: message, described: true });
        const at = seconds(outcome.t);
        if (outcome.result === 'fail_area') {
            fail('the robot touched a fail area after ' + at + ' s');
        } else if (outcome.result === 'deviation') {
            fail('the robot left the recorded path (by more than ' + this.tolerance + ' cm) after ' + at + ' s');
        } else if (outcome.result === 'error') {
            this.error.block_type = blockType(source, this.error.block_id);
            failures.push({ expect: 'error', expected: null, actual: this.error, message: 'the program failed: ' + this.error.message });
        } else if (outcome.result !== 'goal' && this.goals.length) {
            if (outcome.result === 'time_limit') {
                fail('the robot did not reach a goal area within ' + seconds(test.max_time_ms || DEFAULT_MAX_TIME_MS) + ' s');
            } else {
                fail('the robot did not reach a goal area: the ' + (isCall ? 'function' : 'program') + ' ended after ' + at + ' s');
            }
        }
        const variables = {};
        const bindings = this.interpreter.getVariables() || {};
        Object.keys(bindings).forEach((name) => name !== RESULT_VARIABLE && (variables[name] = bindings[name][0]));
        const report: any = {
            name: test.name,
            block_id: test.block_id,
            kind: 'simulation',
            outcome: failures.length ? 'failed' : 'passed',
            failures: failures,
            error: this.error,
            time_ms: Math.round(outcome.t),
            variables: variables,
            covered_blocks: Object.keys(this.covered).filter((id) => id.indexOf('nepoTest') !== 0),
            simulation: {
                result: outcome.result,
                t: outcome.t,
                item: outcome.item,
                point: outcome.point,
                path: this.path,
                leds: this.leds,
                recorded: !!this.options.record,
                goals: this.goals.length,
                bumps: this.bumps,
            },
        };
        if (isCall) {
            report.returned = outcome.result === 'returned' && bindings[RESULT_VARIABLE] ? bindings[RESULT_VARIABLE][0] : null;
        } else {
            report.status = outcome.result === 'error' ? 'error' : ['finished', 'time_limit'].indexOf(outcome.result) >= 0 ? outcome.result : 'simulation';
        }
        return report;
    }
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

/**
 * a test that should fail (test.should: "fail", the block's "this test should fail"), as spec.py apply_should: it passes if its checks fail
 * (the failures stay, with expected_failure), and fails if they pass. A test error stays an error.
 */
export function applyShould(report: any, test: any): any {
    if (test.should !== 'fail' || (report.outcome !== 'passed' && report.outcome !== 'failed')) {
        return report;
    }
    if (report.outcome === 'failed') {
        report.outcome = 'passed';
        report.expected_failure = true;
    } else {
        report.outcome = 'failed';
        report.failures = [{ expect: 'should', expected: 'fail', actual: 'passed', message: SHOULD_FAIL_MESSAGE, described: true }];
    }
    return report;
}

function errorReport(test: any, message: string): any {
    return { name: test.name, block_id: test.block_id, kind: 'simulation', outcome: 'error', failures: [], error: { kind: 'test_error', message: message } };
}

/**
 * runs a simulation test (NepoTest JSON, as nepotest/blocks.py makes it from the test block) on the simulator, for the program in the Program
 * tab (its block_set XML). Resolves with the report; a program that can't run gives a report with outcome "error".
 */
export function runTest(test: any, programXml: string, options: RunOptions = {}): Promise<any> {
    let source: string;
    try {
        source = programFor(programXml, test);
    } catch (e) {
        return Promise.resolve(errorReport(test, e.message));
    }
    return Promise.all([compile(source), floorCanvas(test.simulation.world)]).then(function ([result, floor]: [any, HTMLCanvasElement]) {
        if (result.rc !== 'ok') {
            return errorReport(test, compileProblem(result));
        }
        const run = new Run(test, result, floor.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D, options);
        return run.run().then(() => applyShould(run.report(source), test));
    });
}
