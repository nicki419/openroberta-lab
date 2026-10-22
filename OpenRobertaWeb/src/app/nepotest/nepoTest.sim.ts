/**
 * The world of a simulation test (Tests tab): the data a simulation test block keeps (block.data, JSON), its geometry and its picture. The
 * world is the Lab's simulator's (simulation/simulationLogic): the tests' own plain peach floor (the default) or the simulator's backgrounds
 * with its wall around them, the simulator's objects (obstacles and coloured areas as rectangles, circles and triangles), the same robot
 * image and sizes. The test runs on the simulator itself
 * (nepoTest.simRun); the editor (nepoTest.simEditor) draws and replays with what is here. NepoTest/nepotest/simulation.py checks the data.
 *
 *   {version: 2,
 *    world: {background, start: {x, y, heading}, items: [line | rect | circle | triangle]},
 *    reference: {path: [[x, y, heading], ...], time_ms, result}   a recorded run (optional)
 *    tolerance_cm: 2                                               how far the robot may leave the recorded path
 *    view: {x, y, scale}}                                          the editor's zoom (scale: pixels per cm) and centre
 * Units are cm from the background's top left corner; x points right and y down; angles are degrees counterclockwise (0 points right).
 * The simulator works in units of 1/3 cm, with the background at (10, 10): u = 10 + 3 * cm.
 * items: {id, kind: 'line', points: [[x, y], ...], smooth, closed, width} (the test's addition, drawn like the background's track),
 * {id, kind: 'rect', role, x, y, w, h} (top left corner), {id, kind: 'circle', role, x, y, r}, {id, kind: 'triangle', role, points};
 * role obstacle | color (a coloured area, with color) | goal | fail; color: a hex colour.
 */

export interface SimItem {
    id: string;
    kind: string; // line | rect | circle | triangle
    role?: string; // obstacle | color | goal | fail
    color?: string;
    points?: number[][];
    smooth?: boolean;
    closed?: boolean;
    width?: number;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    r?: number;
}

export interface SimWorld {
    background: string;
    start: { x: number; y: number; heading: number };
    items: SimItem[];
}

export interface SimData {
    version: number;
    world: SimWorld;
    reference?: { path: number[][]; time_ms?: number; result?: string };
    tolerance_cm: number;
    view?: { x: number; y: number; scale: number };
}

// ------------------------------------------------------------------------------------------------ the simulator's constants

export const UNITS_PER_CM = 3;
export const BORDER = 10; // units: the wall around the background (simulation.scene.ts)
export const PEACH = 'peach'; // the tests' own floor: plain light peach, 3 x 2 m, without the simulator's wall
export const PEACH_COLOR = '#f7d1b3'; // the sensors read 83 % on it: a light floor
export const BACKGROUNDS: { [name: string]: number[] } = {
    peach: [900, 600],
    simpleBackgroundEdison: [260, 220],
    drawBackground: [700, 500],
    rescueBackground: [800, 540],
    mathBackground: [700, 500],
}; // peach and RobotEdison.imgList; sizes in units (for the simulator's: the pixels of the images)
export const DEFAULT_BACKGROUND = PEACH;
const OBJECT_BACKGROUND = 'simpleBackgroundEdison'; // on the peach floor, a clicked object gets the size it has on the simulator's default
export const BACKGROUND_PATH = '/css/img/simBackgrounds/';
export const ROBOT_IMAGE = '/css/img/simulator/edison.png';
export const WALL_IMAGE = BACKGROUND_PATH + 'wallPattern.png';
// EdisonChassis (units, robot frame: x ahead of the axle, y to the robot's right)
export const CHASSIS = { x: -5.5, y: -11.25, w: 24, h: 22.5 };
export const OUTLINE = [
    [18.5, -11.25],
    [18.5, 11.25],
    [-5.5, 11.25],
    [-5.5, -11.25],
]; // front left, front right, back right, back left
export const LINE_SENSOR = [15, 0];
export const LIGHT_SENSORS = [
    [16.5, -4.5],
    [16.5, 4.5],
]; // LLIGHT, RLIGHT
export const IR_SENSORS = [
    [17, -8],
    [18, 0],
    [17, 8],
]; // LEFT, FRONT, RIGHT
export const IR_MAX_CM = 3;
export const IR_MAX_LENGTH = 9; // units
export const IR_RAYS = [-Math.PI / 8, -Math.PI / 16, 0, Math.PI / 16, Math.PI / 8];
export const LED_POINT = [16.5, 4.5]; // EdisonLeds; the left one at -y
export const OBSTACLE_COLOR = '#33B8CA';
export const COLOR_AREA_COLOR = '#FBED00';
export const PALETTE = ['#000000', '#0056a6', '#00642f', '#532115', '#585858', '#b30006', '#f7e307', '#FBED00', '#ffffff']; // RobotBase.colorRange, the default area colour, white
// the test's own things
export const LINE_WIDTH_CM = 4.44 / UNITS_PER_CM; // the black core of simpleBackgroundEdison's track
export const LINE_BAND = 16; // units: its white band
export const DEFAULT_TOLERANCE_CM = 2;
export const ROLES = ['obstacle', 'color', 'goal', 'fail'];

export const COLORS = {
    outside: '#f4f4f4',
    goal: '#1f8f3a',
    fail: '#d0312d',
    swept: '#2f6fbf',
    corridor: '#5aa9ff',
    path: '#e67e00',
};

export function round2(v: number): number {
    return Math.round(v * 100) / 100;
}

/** a new test's world: the plain peach floor, the robot in its middle, nothing on it (as simulation.py default_world) */
export function defaultWorld(): SimWorld {
    const [bw, bh] = BACKGROUNDS[DEFAULT_BACKGROUND];
    return { background: DEFAULT_BACKGROUND, start: { x: round2(bw / 2 / UNITS_PER_CM), y: round2(bh / 2 / UNITS_PER_CM), heading: 0 }, items: [] };
}

/** a new test: its world, seen around the robot (4 pixels per cm) */
export function defaultData(): SimData {
    const world = defaultWorld();
    return { version: 2, world: world, tolerance_cm: DEFAULT_TOLERANCE_CM, view: { x: world.start.x, y: world.start.y, scale: 4 } };
}

/** the simulator's size of a new object (simulation.scene.ts: a ninth of the background's width), in cm */
export function objectSize(world: SimWorld): number {
    return (world.background === PEACH ? BACKGROUNDS[OBJECT_BACKGROUND] : backgroundSize(world))[0] / 9 / UNITS_PER_CM;
}

/** a world of the first version (an unbounded plain floor; rect and ellipse by their centre, rotated; roles black and white), as simulation.py
 * migrate_v1: on the plain peach floor, as then */
function migrateV1(world: any): SimWorld {
    const items: SimItem[] = [];
    for (const item of (world && world.items) || []) {
        if (item.kind === 'rect' || item.kind === 'ellipse') {
            const role = item.role === 'black' || item.role === 'white' ? 'color' : item.role;
            const next: SimItem = { id: item.id, kind: item.kind === 'rect' ? 'rect' : 'circle', role: role };
            if (role === 'color') {
                next.color = item.role === 'black' ? '#000000' : '#ffffff';
            }
            if (item.kind === 'rect') {
                Object.assign(next, { x: item.x - item.w / 2, y: item.y - item.h / 2, w: item.w, h: item.h });
            } else {
                Object.assign(next, { x: item.x, y: item.y, r: (item.w + item.h) / 4 });
            }
            items.push(next);
        } else if (item.kind === 'line') {
            const line = Object.assign({}, item);
            delete line.width;
            items.push(line);
        }
    }
    return { background: PEACH, start: (world && world.start) || { x: 0, y: 0, heading: 0 }, items: items };
}

/** the data of a simulation test block; the simulator's default world if there is none (or it can't be read) */
export function parseData(text: string): SimData {
    let data: any = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch (e) {
        data = null;
    }
    if (!data || typeof data !== 'object' || !data.world || typeof data.world !== 'object') {
        return defaultData();
    }
    if (!data.version || data.version < 2) {
        data.world = migrateV1(data.world);
        delete data.reference; // recorded with another robot
        delete data.view;
        data.version = 2;
    }
    delete data.floor; // a picture of the floor for NepoTest's copy of the simulator (until 2026-10-22): the simulator draws its own
    data.world.background = BACKGROUNDS[data.world.background] ? data.world.background : DEFAULT_BACKGROUND;
    data.world.start = data.world.start || defaultWorld().start;
    data.world.items = Array.isArray(data.world.items) ? data.world.items : [];
    if (typeof data.tolerance_cm !== 'number') {
        data.tolerance_cm = DEFAULT_TOLERANCE_CM;
    }
    return data as SimData;
}

export function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

export function backgroundSize(world: SimWorld): number[] {
    return BACKGROUNDS[world.background] || BACKGROUNDS[DEFAULT_BACKGROUND];
}

// ------------------------------------------------------------------------------------------------ geometry

/** SIMATH.transform: a point of the robot frame (units) at a pose given in cm and degrees (counterclockwise); the result in cm */
export function robotPoint(x: number, y: number, heading: number, p: number[]): number[] {
    const theta = (-heading * Math.PI) / 180;
    const s = Math.sin(theta);
    const c = Math.cos(theta);
    return [x + (p[0] * c - p[1] * s) / UNITS_PER_CM, y + (p[0] * s + p[1] * c) / UNITS_PER_CM];
}

/** the robot's outline at a pose (cm): front left, front right, back right, back left */
export function footprint(x: number, y: number, heading: number): number[][] {
    return OUTLINE.map((p) => robotPoint(x, y, heading, p));
}

/** a line as cubic Bezier segments [p0, c1, c2, p1]: straight between the points, or a Catmull-Rom curve through them (as simulation.py) */
export function bezierSegments(points: number[][], smooth: boolean, closed: boolean): number[][][] {
    const n = points.length;
    const wrap = closed && n > 2;
    const segments: number[][][] = [];
    const count = wrap ? n : n - 1;
    for (let i = 0; i < count; i++) {
        const j = (i + 1) % n;
        const p0 = points[i];
        const p1 = points[j];
        if (!smooth) {
            segments.push([p0, p0, p1, p1]);
            continue;
        }
        const before = wrap || i > 0 ? points[(i - 1 + n) % n] : p0;
        const after = wrap || j + 1 < n ? points[(j + 1) % n] : p1;
        const c1 = [p0[0] + (p1[0] - before[0]) / 6, p0[1] + (p1[1] - before[1]) / 6];
        const c2 = [p1[0] - (after[0] - p0[0]) / 6, p1[1] - (after[1] - p0[1]) / 6];
        segments.push([p0, c1, c2, p1]);
    }
    return segments;
}

export function linePathD(item: SimItem): string {
    const segments = bezierSegments(item.points || [], !!item.smooth, !!item.closed);
    if (!segments.length) {
        return '';
    }
    let d = 'M' + n(segments[0][0][0]) + ' ' + n(segments[0][0][1]);
    for (const [, c1, c2, p1] of segments) {
        d += item.smooth ? ' C' + pt(c1) + ' ' + pt(c2) + ' ' + pt(p1) : ' L' + pt(p1);
    }
    return d + (item.closed && (item.points || []).length > 2 ? ' Z' : '');
}

export function distanceToSegment(px: number, py: number, a: number[], b: number[]): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / len2));
    return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

/** the straight pieces of a line (curves in 16 pieces per segment) */
export function linePolyline(item: SimItem): number[][] {
    const out: number[][] = [];
    for (const [p0, c1, c2, p1] of bezierSegments(item.points || [], !!item.smooth, !!item.closed)) {
        if (!out.length) {
            out.push(p0);
        }
        const pieces = item.smooth ? 16 : 1;
        for (let k = 1; k <= pieces; k++) {
            const t = k / pieces;
            const u = 1 - t;
            out.push([
                u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
                u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1],
            ]);
        }
    }
    return out;
}

function inTriangle(p: number[], a: number[], b: number[], c: number[]): boolean {
    const d1 = (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
    const d2 = (p[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (p[1] - c[1]);
    const d3 = (p[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (p[1] - a[1]);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(neg && pos);
}

/** is a world point on an item (within `slack` cm)? */
export function hits(item: SimItem, x: number, y: number, slack: number): boolean {
    if (item.kind === 'line') {
        const poly = linePolyline(item);
        const half = LINE_BAND / UNITS_PER_CM / 2 + slack;
        for (let i = 1; i < poly.length; i++) {
            if (distanceToSegment(x, y, poly[i - 1], poly[i]) <= half) {
                return true;
            }
        }
        return false;
    }
    if (item.kind === 'rect') {
        return x >= item.x - slack && x <= item.x + item.w + slack && y >= item.y - slack && y <= item.y + item.h + slack;
    }
    if (item.kind === 'circle') {
        return Math.hypot(x - item.x, y - item.y) <= item.r + slack;
    }
    const [a, b, c] = item.points;
    return inTriangle([x, y], a, b, c) || [0, 1, 2].some((i) => distanceToSegment(x, y, item.points[i], item.points[(i + 1) % 3]) <= slack);
}

/** [minX, minY, maxX, maxY] of the floor with its wall (cm) */
export function groundBounds(world: SimWorld): number[] {
    const [bw, bh] = backgroundSize(world);
    const b = BORDER / UNITS_PER_CM;
    return [-b, -b, bw / UNITS_PER_CM + b, bh / UNITS_PER_CM + b];
}

// ------------------------------------------------------------------------------------------------ images

const images: { [url: string]: HTMLImageElement } = {};
const loading: { [url: string]: Promise<HTMLImageElement> } = {};

/** an image (cached); resolves when it is loaded */
export function loadImage(url: string): Promise<HTMLImageElement> {
    if (!loading[url]) {
        loading[url] = new Promise(function (resolve, reject) {
            const img = new Image();
            img.onload = function () {
                images[url] = img;
                resolve(img);
            };
            img.onerror = function () {
                delete loading[url];
                reject(new Error('could not load ' + url));
            };
            img.src = url;
        });
    }
    return loading[url];
}

export function backgroundUrl(name: string): string {
    return BACKGROUND_PATH + name + '.svg';
}

// ------------------------------------------------------------------------------------------------ the floor the sensors see

/** what the floor picture (nepoTest.simRun floorCanvas) is made from: the background, the coloured areas and the lines */
export function floorKey(world: SimWorld): string {
    const parts = world.items.filter((i) => i.kind === 'line' || i.role === 'color');
    return '2|' + world.background + '|' + JSON.stringify(parts.map((i) => [i.kind, i.color, i.points, i.smooth, i.closed, i.width, i.x, i.y, i.w, i.h, i.r]));
}

function u(v: number): number {
    return BORDER + v * UNITS_PER_CM;
}

/** draws the test's lines on the simulator's floor picture (units): like the background's track, a black core on a white band */
export function drawLines(ctx: CanvasRenderingContext2D, world: SimWorld): void {
    const lines = world.items.filter((i) => i.kind === 'line' && (i.points || []).length >= 2);
    const stroke = (item: SimItem) => {
        const segments = bezierSegments(item.points, !!item.smooth, !!item.closed);
        ctx.beginPath();
        ctx.moveTo(u(segments[0][0][0]), u(segments[0][0][1]));
        for (const [, c1, c2, p1] of segments) {
            ctx.bezierCurveTo(u(c1[0]), u(c1[1]), u(c2[0]), u(c2[1]), u(p1[0]), u(p1[1]));
        }
        if (item.closed && item.points.length > 2) {
            ctx.closePath();
        }
        ctx.stroke();
    };
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = LINE_BAND;
    lines.forEach(stroke);
    ctx.strokeStyle = '#000000';
    lines.forEach((item) => {
        ctx.lineWidth = (item.width || LINE_WIDTH_CM) * UNITS_PER_CM;
        stroke(item);
    });
}

/** R + G + B per pixel of a canvas */
export function pixelSums(canvas: HTMLCanvasElement): Uint16Array {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const sums = new Uint16Array(canvas.width * canvas.height);
    for (let i = 0, j = 0; j < sums.length; i += 4, j++) {
        sums[j] = data[i] + data[i + 1] + data[i + 2];
    }
    return sums;
}

/** LineSensor.updateSensor (for the editor's readout): the light (0..100, unrounded) of the 5 pixels of a 3 x 3 cross at a point (units) */
export function sampleFloor(sums: Uint16Array, width: number, height: number, px: number, py: number): number {
    const x0 = Math.round(px - 1.5);
    const y0 = Math.round(py - 1.5);
    let total = 0;
    for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [1, 1],
        [2, 1],
        [1, 2],
    ]) {
        const x = x0 + dx;
        const y = y0 + dy;
        if (x >= 0 && x < width && y >= 0 && y < height) {
            total += sums[y * width + x];
        }
    }
    return total / 5 / 3 / 2.55;
}

// ------------------------------------------------------------------------------------------------ the robot's sensors, for the picture

function intersection(l1: number[], l2: number[]): number[] {
    const d = (l1[0] - l1[2]) * (l2[1] - l2[3]) - (l1[1] - l1[3]) * (l2[0] - l2[2]);
    if (d === 0) {
        return null;
    }
    const a = l1[0] * l1[3] - l1[1] * l1[2];
    const b = l2[0] * l2[3] - l2[1] * l2[2];
    const xi = ((l2[0] - l2[2]) * a - (l1[0] - l1[2]) * b) / d;
    const yi = ((l2[1] - l2[3]) * a - (l1[1] - l1[3]) * b) / d;
    const aligned = (l: number[]) =>
        !(xi < Math.min(l[0], l[2]) - 0.01 || xi > Math.max(l[0], l[2]) + 0.01 || yi < Math.min(l[1], l[3]) - 0.01 || yi > Math.max(l[1], l[3]) + 0.01);
    return aligned(l1) && aligned(l2) ? [xi, yi] : null;
}

function circleHits(line: number[], cx: number, cy: number, r: number): number[][] {
    const [ax, ay, bx, by] = line;
    const bax = bx - ax;
    const bay = by - ay;
    const a = bax * bax + bay * bay;
    if (a === 0) {
        return [];
    }
    const pBy2 = (bax * (cx - ax) + bay * (cy - ay)) / a;
    const q = ((cx - ax) * (cx - ax) + (cy - ay) * (cy - ay) - r * r) / a;
    const disc = pBy2 * pBy2 - q;
    if (disc < 0) {
        return [];
    }
    const root = Math.sqrt(disc);
    const len = Math.hypot(bax, bay);
    const onLine = (p: number[]) => Math.abs(Math.hypot(p[0] - ax, p[1] - ay) + Math.hypot(p[0] - bx, p[1] - by) - len) <= 2;
    return [
        [ax - bax * (-pBy2 + root), ay - bay * (-pBy2 + root)],
        [ax - bax * (-pBy2 - root), ay - bay * (-pBy2 - root)],
    ].filter(onLine);
}

/** DistanceSensor: the rays of the three infrared sensors at a pose (units, from the sensor to where they end) and what each sensor sees */
export function infrared(world: SimWorld, x: number, y: number, heading: number): { rays: number[][]; hits: number[][]; seen: boolean[] } {
    const [bw, bh] = backgroundSize(world);
    const lines: number[][] = [
        [BORDER, BORDER, BORDER, BORDER + bh],
        [BORDER, BORDER, BORDER + bw, BORDER],
        [BORDER + bw, BORDER + bh, BORDER, BORDER + bh],
        [BORDER + bw, BORDER + bh, BORDER + bw, BORDER],
    ];
    const circles: number[][] = [];
    for (const item of world.items) {
        if (item.role !== 'obstacle') {
            continue;
        }
        if (item.kind === 'rect') {
            const [x0, y0, w, h] = [u(item.x), u(item.y), item.w * UNITS_PER_CM, item.h * UNITS_PER_CM];
            lines.push([x0, y0, x0, y0 + h], [x0, y0, x0 + w, y0], [x0 + w, y0 + h, x0, y0 + h], [x0 + w, y0 + h, x0 + w, y0]);
        } else if (item.kind === 'circle') {
            circles.push([u(item.x), u(item.y), item.r * UNITS_PER_CM]);
        } else {
            const p = item.points.map((q) => [u(q[0]), u(q[1])]);
            lines.push([p[0][0], p[0][1], p[1][0], p[1][1]], [p[1][0], p[1][1], p[2][0], p[2][1]], [p[0][0], p[0][1], p[2][0], p[2][1]]);
        }
    }
    const theta = (-heading * Math.PI) / 180;
    const ux = u(x);
    const uy = u(y);
    const rays: number[][] = [];
    const hitList: number[][] = [];
    const seen: boolean[] = [];
    for (const [sx, sy] of IR_SENSORS) {
        const rx = sx * Math.cos(theta) - sy * Math.sin(theta) + ux;
        const ry = sx * Math.sin(theta) + sy * Math.cos(theta) + uy;
        let best = IR_MAX_LENGTH;
        let bestPoint: number[] = null;
        for (const angle of IR_RAYS) {
            const ray = [rx, ry, rx + IR_MAX_LENGTH * Math.cos(theta + angle), ry + IR_MAX_LENGTH * Math.sin(theta + angle)];
            let end = [ray[2], ray[3]];
            let endDist = IR_MAX_LENGTH;
            const found: number[][] = lines.map((l) => intersection(ray, l)).filter((p) => p);
            for (const c of circles) {
                const cs = circleHits(ray, c[0], c[1], c[2]);
                if (cs.length) {
                    found.push(cs.reduce((m, p) => (Math.hypot(p[0] - rx, p[1] - ry) < Math.hypot(m[0] - rx, m[1] - ry) ? p : m)));
                }
            }
            for (const p of found) {
                const d = Math.hypot(p[0] - rx, p[1] - ry);
                if (d < endDist) {
                    endDist = d;
                    end = p;
                }
                if (d < best) {
                    best = d;
                    bestPoint = p;
                }
            }
            rays.push([rx, ry, end[0], end[1]]);
        }
        hitList.push(bestPoint ? [rx, ry, bestPoint[0], bestPoint[1]] : null);
        seen.push(best / UNITS_PER_CM < IR_MAX_CM);
    }
    return { rays: rays, hits: hitList, seen: seen };
}

// ------------------------------------------------------------------------------------------------ the picture (SVG, in cm)

function n(v: number): string {
    return String(Math.round(v * 1000) / 1000);
}

function pt(p: number[]): string {
    return n(p[0]) + ' ' + n(p[1]);
}

export function escapeXml(text: string): string {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** the patterns and filters the picture uses (ids get a prefix, so several pictures can be on one page) */
export function defs(prefix: string): string {
    const hatch = (id: string, color: string) =>
        '<pattern id="' +
        prefix +
        id +
        '" patternUnits="userSpaceOnUse" width="2" height="2" patternTransform="rotate(45)">' +
        '<rect width="2" height="2" fill="' +
        color +
        '" fill-opacity="0.18"/><line x1="0" y1="0" x2="0" y2="2" stroke="' +
        color +
        '" stroke-width="0.7" stroke-opacity="0.55"/></pattern>';
    const wall = BORDER / UNITS_PER_CM;
    return (
        '<defs>' +
        hatch('goal', COLORS.goal) +
        hatch('fail', COLORS.fail) +
        '<pattern id="' +
        prefix +
        'wall" patternUnits="userSpaceOnUse" x="' +
        n(-wall) +
        '" y="' +
        n(-wall) +
        '" width="' +
        n(wall) +
        '" height="' +
        n(wall) +
        '"><image href="' +
        WALL_IMAGE +
        '" width="' +
        n(wall) +
        '" height="' +
        n(wall) +
        '" preserveAspectRatio="none"/></pattern>' +
        // canvas shadows are in screen pixels: the editor sets the filters' sizes for its zoom (shadowSizes)
        '<filter id="' +
        prefix +
        'obstacleShadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="1.667" dy="1.667" stdDeviation="0.833" flood-color="#3e3e3e" flood-opacity="1"/></filter>' +
        '<filter id="' +
        prefix +
        'robotShadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="0.833" flood-color="#000000" flood-opacity="1"/></filter>' +
        '<radialGradient id="' +
        prefix +
        'led" cx="0.5" cy="0.5" r="0.3333"><stop offset="0" stop-color="#ff0000" stop-opacity="1"/><stop offset="1" stop-color="#ff0000" stop-opacity="0"/></radialGradient>' +
        '</defs>'
    );
}

/** canvas shadows have a size in screen pixels: the filter sizes in cm for a zoom (pixels per cm) */
export function shadowSizes(svg: Element, prefix: string, scale: number): void {
    const o = svg.querySelector('#' + prefix + 'obstacleShadow feDropShadow');
    o && o.setAttribute('dx', n(5 / scale));
    o && o.setAttribute('dy', n(5 / scale));
    o && o.setAttribute('stdDeviation', n(2.5 / scale));
    const r = svg.querySelector('#' + prefix + 'robotShadow feDropShadow');
    r && r.setAttribute('stdDeviation', n(2.5 / scale));
}

function shapeSvg(item: SimItem, attrs: string): string {
    if (item.kind === 'rect') {
        return '<rect x="' + n(item.x) + '" y="' + n(item.y) + '" width="' + n(item.w) + '" height="' + n(item.h) + '" ' + attrs + '/>';
    }
    if (item.kind === 'circle') {
        return '<circle cx="' + n(item.x) + '" cy="' + n(item.y) + '" r="' + n(item.r) + '" ' + attrs + '/>';
    }
    return '<polygon points="' + item.points.map(pt).join(' ') + '" ' + attrs + '/>';
}

/** the floor: the plain peach floor, or the simulator's background image with the wall around it */
export function groundSvg(world: SimWorld, prefix: string): string {
    const [bw, bh] = backgroundSize(world);
    const w = bw / UNITS_PER_CM;
    const h = bh / UNITS_PER_CM;
    const b = BORDER / UNITS_PER_CM;
    if (world.background === PEACH) {
        return '<rect x="0" y="0" width="' + n(w) + '" height="' + n(h) + '" fill="' + PEACH_COLOR + '"/>';
    }
    return (
        '<image href="' +
        backgroundUrl(world.background) +
        '" x="0" y="0" width="' +
        n(w) +
        '" height="' +
        n(h) +
        '" preserveAspectRatio="none"/>' +
        '<rect x="' +
        n(-b / 2) +
        '" y="' +
        n(-b / 2) +
        '" width="' +
        n(w + b) +
        '" height="' +
        n(h + b) +
        '" fill="none" stroke="url(#' +
        prefix +
        'wall)" stroke-width="' +
        n(b) +
        '"/>'
    );
}

/** what lies on the floor, in the simulator's order: coloured areas, the lines (bands, then cores), obstacles; then goal and fail areas */
export function worldSvg(world: SimWorld, prefix: string): string {
    const items = world.items;
    const id = (item: SimItem) => ' data-item="' + escapeXml(item.id) + '"';
    let svg = '';
    for (const item of items) {
        if (item.kind !== 'line' && item.role === 'color') {
            svg += shapeSvg(item, 'fill="' + escapeXml(item.color || COLOR_AREA_COLOR) + '"' + id(item));
        }
    }
    const lines = items.filter((i) => i.kind === 'line' && (i.points || []).length >= 2);
    for (const item of lines) {
        svg += '<path d="' + linePathD(item) + '" fill="none" stroke="#ffffff" stroke-width="' + n(LINE_BAND / UNITS_PER_CM) + '" stroke-linejoin="round"' + id(item) + '/>';
    }
    for (const item of lines) {
        svg += '<path d="' + linePathD(item) + '" fill="none" stroke="#000000" stroke-width="' + n(item.width || LINE_WIDTH_CM) + '" stroke-linejoin="round"' + id(item) + '/>';
    }
    for (const item of items) {
        if (item.kind !== 'line' && item.role === 'obstacle') {
            svg += shapeSvg(item, 'fill="' + escapeXml(item.color || OBSTACLE_COLOR) + '" filter="url(#' + prefix + 'obstacleShadow)"' + id(item));
        }
    }
    for (const item of items) {
        if (item.kind !== 'line' && (item.role === 'goal' || item.role === 'fail')) {
            const color = item.role === 'goal' ? COLORS.goal : COLORS.fail;
            svg += shapeSvg(item, 'fill="url(#' + prefix + item.role + ')" stroke="' + color + '" stroke-width="0.35" stroke-dasharray="1.2 0.8"' + id(item));
        }
    }
    return svg;
}

/** the recorded path: the area the robot covered (its outline at every pose), widened by the tolerance, and the paths of its corners */
export function referenceSvg(data: SimData): string {
    const path = (data.reference && data.reference.path) || [];
    if (!path.length) {
        return '';
    }
    const outlines = path.map((p) => footprint(p[0], p[1], p[2]));
    const d = outlines.map((o) => 'M' + o.map(pt).join('L') + 'Z').join('');
    let svg = '';
    const tol = Math.max(0, data.tolerance_cm || 0);
    if (tol > 0) {
        svg += '<path d="' + d + '" fill="' + COLORS.corridor + '" stroke="' + COLORS.corridor + '" stroke-width="' + n(2 * tol) + '" stroke-linejoin="round" opacity="0.28"/>';
    }
    svg += '<path d="' + d + '" fill="' + COLORS.swept + '" opacity="0.22"/>';
    for (let c = 0; c < 4; c++) {
        svg += '<polyline points="' + outlines.map((o) => pt(o[c])).join(' ') + '" fill="none" stroke="' + COLORS.swept + '" stroke-width="0.12" opacity="0.9"/>';
    }
    return svg;
}

/**
 * the Edison as the simulator draws it, in its own frame and in units (x ahead of the axle, y to its right): EdisonChassis (the image with a
 * shadow), the line tracker and the light sensors filled with the brightness they see (LineSensor.draw), the LEDs (EdisonLeds).
 * light: [line tracker, LLIGHT, RLIGHT] in %; leds: [left, right].
 */
export function robotSvg(prefix: string, light?: number[], leds?: boolean[]): string {
    const sensor = (p: number[], value: number) => {
        const g = Math.round(((value || 0) / 100) * 255);
        return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="1.5" fill="rgb(' + g + ',' + g + ',' + g + ')" stroke="#000000" stroke-width="0.1"/>';
    };
    const led = (y: number) => '<circle cx="' + LED_POINT[0] + '" cy="' + y + '" r="11.25" fill="url(#' + prefix + 'led)"/>';
    return (
        '<image href="' +
        ROBOT_IMAGE +
        '" x="' +
        CHASSIS.x +
        '" y="' +
        CHASSIS.y +
        '" width="' +
        CHASSIS.w +
        '" height="' +
        CHASSIS.h +
        '" preserveAspectRatio="none" filter="url(#' +
        prefix +
        'robotShadow)"/>' +
        sensor(LINE_SENSOR, light ? light[0] : 0) +
        sensor(LIGHT_SENSORS[0], light ? light[1] : 0) +
        sensor(LIGHT_SENSORS[1], light ? light[2] : 0) +
        (leds && leds[0] ? led(-LED_POINT[1]) : '') +
        (leds && leds[1] ? led(LED_POINT[1]) : '')
    );
}

/** the transform of a robot group: from its frame in units to the world in cm */
export function robotTransform(x: number, y: number, heading: number): string {
    return 'translate(' + n(x) + ' ' + n(y) + ') rotate(' + n(-heading) + ') scale(' + n(1 / UNITS_PER_CM) + ')';
}

/** DistanceSensor.draw: the rays (dashed grey) and the line to the nearest obstacle (black), in the world's cm */
export function infraredSvg(world: SimWorld, x: number, y: number, heading: number, scale: number): string {
    const ir = infrared(world, x, y, heading);
    const c = (v: number) => n((v - BORDER) / UNITS_PER_CM);
    let svg = '';
    for (const r of ir.rays) {
        svg += '<line x1="' + c(r[0]) + '" y1="' + c(r[1]) + '" x2="' + c(r[2]) + '" y2="' + c(r[3]) + '" stroke="#555555" stroke-width="' + n(0.5 / UNITS_PER_CM) + '"/>';
    }
    for (const h of ir.hits) {
        if (h) {
            svg += '<line x1="' + c(h[0]) + '" y1="' + c(h[1]) + '" x2="' + c(h[2]) + '" y2="' + c(h[3]) + '" stroke="#000000" stroke-width="' + n(1 / UNITS_PER_CM) + '"/>';
        }
    }
    return svg;
}

// ------------------------------------------------------------------------------------------------ the small picture of the block

/** what the small picture shows (units): the whole background; on the large peach floor, what is on it, the robot and its path */
function thumbnailBox(data: SimData, floor: HTMLCanvasElement): number[] {
    if (data.world.background !== PEACH) {
        return [0, 0, floor.width, floor.height];
    }
    const points: number[][] = footprint(data.world.start.x, data.world.start.y, data.world.start.heading);
    for (const item of data.world.items) {
        if (item.points) {
            points.push(...item.points);
        } else if (item.kind === 'circle') {
            points.push([item.x - item.r, item.y - item.r], [item.x + item.r, item.y + item.r]);
        } else {
            points.push([item.x, item.y], [item.x + item.w, item.y + item.h]);
        }
    }
    ((data.reference && data.reference.path) || []).forEach((p) => points.push([p[0], p[1]]));
    const xs = points.map((p) => u(p[0]));
    const ys = points.map((p) => u(p[1]));
    const margin = 10 * UNITS_PER_CM;
    let [x0, y0, x1, y1] = [Math.min(...xs) - margin, Math.min(...ys) - margin, Math.max(...xs) + margin, Math.max(...ys) + margin];
    const minW = 60 * UNITS_PER_CM; // at least 60 x 50 cm, so a lone robot isn't huge
    const minH = 50 * UNITS_PER_CM;
    if (x1 - x0 < minW) {
        [x0, x1] = [(x0 + x1 - minW) / 2, (x0 + x1 + minW) / 2];
    }
    if (y1 - y0 < minH) {
        [y0, y1] = [(y0 + y1 - minH) / 2, (y0 + y1 + minH) / 2];
    }
    return [Math.max(0, x0), Math.max(0, y0), Math.min(floor.width, x1), Math.min(floor.height, y1)];
}

/** a small picture of a world (for the test block), as a PNG data URL: the floor (nepoTest.simRun floorCanvas), the objects and the robot */
export function thumbnail(data: SimData, width: number, height: number, floor: HTMLCanvasElement): Promise<string> {
    const world = data.world;
    return loadImage(ROBOT_IMAGE).then(function (robot) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const [x0, y0, x1, y1] = thumbnailBox(data, floor);
        const s = Math.min(width / (x1 - x0), height / (y1 - y0));
        ctx.fillStyle = COLORS.outside;
        ctx.fillRect(0, 0, width, height);
        ctx.translate((width - (x1 - x0) * s) / 2 - x0 * s, (height - (y1 - y0) * s) / 2 - y0 * s);
        ctx.scale(s, s);
        ctx.drawImage(floor, 0, 0);
        const shape = (item: SimItem) => {
            ctx.beginPath();
            if (item.kind === 'rect') {
                ctx.rect(u(item.x), u(item.y), item.w * UNITS_PER_CM, item.h * UNITS_PER_CM);
            } else if (item.kind === 'circle') {
                ctx.arc(u(item.x), u(item.y), item.r * UNITS_PER_CM, 0, 2 * Math.PI);
            } else {
                ctx.moveTo(u(item.points[0][0]), u(item.points[0][1]));
                ctx.lineTo(u(item.points[1][0]), u(item.points[1][1]));
                ctx.lineTo(u(item.points[2][0]), u(item.points[2][1]));
                ctx.closePath();
            }
        };
        for (const item of world.items) {
            if (item.kind === 'line' || item.role === 'color') {
                continue;
            }
            shape(item);
            if (item.role === 'obstacle') {
                ctx.fillStyle = item.color || OBSTACLE_COLOR;
                ctx.fill();
            } else {
                ctx.fillStyle = item.role === 'goal' ? 'rgba(31, 143, 58, 0.35)' : 'rgba(208, 49, 45, 0.35)';
                ctx.fill();
                ctx.lineWidth = 2;
                ctx.strokeStyle = item.role === 'goal' ? COLORS.goal : COLORS.fail;
                ctx.stroke();
            }
        }
        const path = (data.reference && data.reference.path) || [];
        if (path.length) {
            ctx.beginPath();
            path.forEach((p, i) => (i ? ctx.lineTo(u(p[0]), u(p[1])) : ctx.moveTo(u(p[0]), u(p[1]))));
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(47, 111, 191, 0.8)';
            ctx.stroke();
        }
        const st = world.start;
        ctx.translate(u(st.x), u(st.y));
        ctx.rotate((-st.heading * Math.PI) / 180);
        ctx.drawImage(robot, CHASSIS.x, CHASSIS.y, CHASSIS.w, CHASSIS.h);
        return canvas.toDataURL('image/png');
    });
}
