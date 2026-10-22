/**
 * The world of a simulation test (Tests tab): the data a simulation test block keeps (block.data, JSON), the geometry, and its picture (SVG).
 * NepoTest/nepotest/simulation.py computes with the same world and the same geometry (keep both in sync): units are cm, x points right and y
 * down, angles are degrees counterclockwise as seen from above (0 points right). Curves are the same Bezier segments here and there.
 *
 *   {version: 1,
 *    world: {start: {x, y, heading}, items: [line | rect | ellipse], settings: {ambient_light, obstacle_range_cm}},
 *    reference: {path: [[x, y, heading], ...], time_ms, result}   a recorded run (optional)
 *    tolerance_cm: 2                                               how far the robot may leave the recorded path
 *    view: {x, y, scale}}                                          the editor's zoom (scale: pixels per cm) and centre
 * items: {id, kind: 'line', points: [[x, y], ...], smooth, closed, width} or {id, kind: 'rect' | 'ellipse', role, x, y, w, h, rot}
 * with role black | white (floor markings), obstacle, goal, fail.
 */

export interface SimItem {
    id: string;
    kind: string; // line | rect | ellipse
    role?: string; // rect, ellipse: black | white | obstacle | goal | fail
    points?: number[][];
    smooth?: boolean;
    closed?: boolean;
    width?: number;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    rot?: number;
}

export interface SimWorld {
    start: { x: number; y: number; heading: number };
    items: SimItem[];
    settings?: { ambient_light?: number; obstacle_range_cm?: number };
}

export interface SimData {
    version: number;
    world: SimWorld;
    reference?: { path: number[][]; time_ms?: number; result?: string };
    tolerance_cm: number;
    view?: { x: number; y: number; scale: number };
}

// the robot (simulation.py): cm in the robot's frame, "ahead" of the wheel axle's centre and to the "left"
export const LENGTH_CM = 8.0;
export const WIDTH_CM = 6.5;
export const BACK_CM = 1.8;
export const FRONT_CM = LENGTH_CM - BACK_CM;
export const LINE_SENSOR_AHEAD_CM = 5.0;
export const LINE_WIDTH_CM = 1.5;
export const LINE_RIM_CM = 0.5;
export const DEFAULT_TOLERANCE_CM = 2;
export const ROLES = ['black', 'white', 'obstacle', 'goal', 'fail'];

export const COLORS = {
    background: '#ffe5d0', // light peach
    grid: '#efc4a5',
    grid10: '#e3a983',
    black: '#141414',
    white: '#ffffff',
    whiteEdge: '#d9c2b0',
    obstacle: '#8a6244',
    obstacleEdge: '#4d3423',
    goal: '#1f8f3a',
    fail: '#d0312d',
    swept: '#2f6fbf',
    corridor: '#5aa9ff',
    path: '#e67e00',
};

export function defaultData(): SimData {
    return { version: 1, world: { start: { x: 20, y: 30, heading: 0 }, items: [] }, tolerance_cm: DEFAULT_TOLERANCE_CM };
}

/** the data of a simulation test block; a fresh world if there is none (or it can't be read) */
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
    data.version = data.version || 1;
    data.world.start = data.world.start || { x: 20, y: 30, heading: 0 };
    data.world.items = Array.isArray(data.world.items) ? data.world.items : [];
    if (typeof data.tolerance_cm !== 'number') {
        data.tolerance_cm = DEFAULT_TOLERANCE_CM;
    }
    return data as SimData;
}

export function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

// ------------------------------------------------------------------------------------------------ geometry

/** the point `ahead` cm in front of and `left` cm to the left of a pose */
export function toWorld(x: number, y: number, heading: number, ahead: number, left: number): number[] {
    const r = (heading * Math.PI) / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
    return [x + ahead * c - left * s, y - ahead * s - left * c];
}

/** the robot's outline at a pose: front left, front right, back right, back left */
export function footprint(x: number, y: number, heading: number): number[][] {
    const w = WIDTH_CM / 2;
    return [toWorld(x, y, heading, FRONT_CM, w), toWorld(x, y, heading, FRONT_CM, -w), toWorld(x, y, heading, -BACK_CM, -w), toWorld(x, y, heading, -BACK_CM, w)];
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

/** rotates a local offset (dx, dy) of a shape's centre by rot degrees (counterclockwise as seen from above) */
export function rotated(cx: number, cy: number, dx: number, dy: number, rot: number): number[] {
    const r = (rot * Math.PI) / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
    return [cx + dx * c + dy * s, cy - dx * s + dy * c];
}

/** a world point in the local frame of a shape (inverse of rotated) */
export function toLocal(item: SimItem, x: number, y: number): number[] {
    const r = (-(item.rot || 0) * Math.PI) / 180;
    const dx = x - item.x;
    const dy = y - item.y;
    return [dx * Math.cos(r) + dy * Math.sin(r), -dx * Math.sin(r) + dy * Math.cos(r)];
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

/** is a world point on an item (within `slack` cm)? */
export function hits(item: SimItem, x: number, y: number, slack: number): boolean {
    if (item.kind === 'line') {
        const poly = linePolyline(item);
        const half = (item.width || LINE_WIDTH_CM) / 2 + LINE_RIM_CM + slack;
        for (let i = 1; i < poly.length; i++) {
            if (distanceToSegment(x, y, poly[i - 1], poly[i]) <= half) {
                return true;
            }
        }
        return false;
    }
    const [lx, ly] = toLocal(item, x, y);
    const hw = item.w / 2 + slack;
    const hh = item.h / 2 + slack;
    if (item.kind === 'rect') {
        return Math.abs(lx) <= hw && Math.abs(ly) <= hh;
    }
    return (lx * lx) / (hw * hw) + (ly * ly) / (hh * hh) <= 1;
}

/** [minX, minY, maxX, maxY] of everything in a world (robot, items, recorded path) */
export function bounds(data: SimData): number[] {
    const pts: number[][] = footprint(data.world.start.x, data.world.start.y, data.world.start.heading);
    for (const item of data.world.items) {
        if (item.kind === 'line') {
            (item.points || []).forEach((p) => pts.push(p));
        } else {
            const r = Math.hypot(item.w, item.h) / 2;
            pts.push([item.x - r, item.y - r], [item.x + r, item.y + r]);
        }
    }
    ((data.reference && data.reference.path) || []).forEach((p) => pts.push([p[0], p[1]]));
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// ------------------------------------------------------------------------------------------------ the picture

function n(v: number): string {
    return String(Math.round(v * 100) / 100);
}

function pt(p: number[]): string {
    return n(p[0]) + ' ' + n(p[1]);
}

function points(poly: number[][]): string {
    return poly.map(pt).join(' ');
}

export function escapeXml(text: string): string {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** the pattern definitions zones use (ids get a prefix, so several pictures can be on one page) */
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
    return '<defs>' + hatch('goal', COLORS.goal) + hatch('fail', COLORS.fail) + '</defs>';
}

function shapeSvg(item: SimItem, attrs: string): string {
    const t = item.rot ? ' transform="rotate(' + n(-item.rot) + ' ' + n(item.x) + ' ' + n(item.y) + ')"' : '';
    if (item.kind === 'rect') {
        return '<rect x="' + n(item.x - item.w / 2) + '" y="' + n(item.y - item.h / 2) + '" width="' + n(item.w) + '" height="' + n(item.h) + '"' + t + ' ' + attrs + '/>';
    }
    return '<ellipse cx="' + n(item.x) + '" cy="' + n(item.y) + '" rx="' + n(item.w / 2) + '" ry="' + n(item.h / 2) + '"' + t + ' ' + attrs + '/>';
}

/** the floor and what's on it, in drawing order: floor shapes, line rims, line cores, obstacles, goal and fail areas */
export function worldSvg(world: SimWorld, prefix: string): string {
    const items = world.items;
    const id = (item: SimItem) => ' data-item="' + escapeXml(item.id) + '"';
    let svg = '';
    for (const item of items) {
        if (item.kind !== 'line' && (item.role === 'black' || item.role === 'white')) {
            const white = item.role === 'white';
            svg += shapeSvg(
                item,
                'fill="' + (white ? COLORS.white : COLORS.black) + '"' + (white ? ' stroke="' + COLORS.whiteEdge + '" stroke-width="0.15"' : '') + id(item)
            );
        }
    }
    const lines = items.filter((i) => i.kind === 'line' && (i.points || []).length >= 2);
    for (const item of lines) {
        const width = (item.width || LINE_WIDTH_CM) + 2 * LINE_RIM_CM;
        svg += '<path d="' + linePathD(item) + '" fill="none" stroke="' + COLORS.white + '" stroke-width="' + n(width) + '" stroke-linejoin="round"' + id(item) + '/>';
    }
    for (const item of lines) {
        svg +=
            '<path d="' + linePathD(item) + '" fill="none" stroke="' + COLORS.black + '" stroke-width="' + n(item.width || LINE_WIDTH_CM) + '" stroke-linejoin="round"' + id(item) + '/>';
    }
    for (const item of items) {
        if (item.kind !== 'line' && item.role === 'obstacle') {
            svg += shapeSvg(item, 'fill="' + COLORS.obstacle + '" stroke="' + COLORS.obstacleEdge + '" stroke-width="0.4"' + id(item));
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
        svg += '<polyline points="' + points(outlines.map((o) => o[c])) + '" fill="none" stroke="' + COLORS.swept + '" stroke-width="0.12" opacity="0.9"/>';
    }
    return svg;
}

/**
 * the Edison seen from above, in its own frame: x ahead of the wheel axle, y to the robot's right (the screen's y points down, so
 * the robot's left is -y). leds: [left, right] on/off.
 */
export function robotSvg(leds?: boolean[]): string {
    const w = WIDTH_CM / 2;
    const led = (y: number, on: boolean) => '<circle cx="' + n(FRONT_CM - 0.7) + '" cy="' + n(y) + '" r="0.45" fill="' + (on ? '#ff2a00' : '#7a2a10') + '"' + (on ? ' stroke="#ffb199" stroke-width="0.25"' : '') + '/>';
    return (
        '<rect x="' + n(-1.7) + '" y="' + n(-w) + '" width="3.4" height="1.0" rx="0.3" fill="#222"/>' +
        '<rect x="' + n(-1.7) + '" y="' + n(w - 1.0) + '" width="3.4" height="1.0" rx="0.3" fill="#222"/>' +
        '<rect x="' + n(-BACK_CM) + '" y="' + n(-w + 0.7) + '" width="' + n(LENGTH_CM) + '" height="' + n(WIDTH_CM - 1.4) + '" rx="1.1" fill="#3b3b3b" stroke="#111" stroke-width="0.15"/>' +
        '<rect x="' + n(-BACK_CM + 0.8) + '" y="' + n(-w + 1.4) + '" width="' + n(LENGTH_CM - 2.4) + '" height="' + n(WIDTH_CM - 2.8) + '" rx="0.6" fill="#ff7a00" opacity="0.9"/>' +
        '<path d="M' + n(FRONT_CM - 2.2) + ' -1 L' + n(FRONT_CM - 0.9) + ' 0 L' + n(FRONT_CM - 2.2) + ' 1 Z" fill="#fff"/>' +
        led(-1.6, !!(leds && leds[0])) +
        led(1.6, !!(leds && leds[1])) +
        '<circle cx="' + n(LINE_SENSOR_AHEAD_CM) + '" cy="0" r="0.35" fill="#00c8ff" stroke="#003b4d" stroke-width="0.1"/>'
    );
}

export function robotTransform(x: number, y: number, heading: number): string {
    return 'translate(' + n(x) + ' ' + n(y) + ') rotate(' + n(-heading) + ')';
}

/** a small picture of a world (for the test block), as a data URL */
export function thumbnail(data: SimData, width: number, height: number): string {
    const [x0, y0, x1, y1] = bounds(data);
    const margin = 4;
    let w = Math.max(50, x1 - x0 + 2 * margin);
    let h = Math.max(32, y1 - y0 + 2 * margin);
    if (w / h > width / height) {
        h = (w * height) / width;
    } else {
        w = (h * width) / height;
    }
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const s = data.world.start;
    const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="' +
        width +
        '" height="' +
        height +
        '" viewBox="' +
        [cx - w / 2, cy - h / 2, w, h].map(n).join(' ') +
        '">' +
        defs('t') +
        '<rect x="' +
        n(cx - w / 2) +
        '" y="' +
        n(cy - h / 2) +
        '" width="' +
        n(w) +
        '" height="' +
        n(h) +
        '" fill="' +
        COLORS.background +
        '"/>' +
        referenceSvg(data) +
        worldSvg(data.world, 't') +
        '<g transform="' +
        robotTransform(s.x, s.y, s.heading) +
        '">' +
        robotSvg() +
        '</g></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
