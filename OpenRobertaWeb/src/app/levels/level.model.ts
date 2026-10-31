/**
 * A level of the Program tab's simulator (Edison): a world drawn in the Level designer (levels.controller), kept as a file in the repository's
 * levels folder (a folder per set, a file per level, both in the order of their names; served by REST /levels). The learner's program drives
 * the robot from the level's start; touching a goal area beats the level, touching a soft goal area only if the robot stands still on it for
 * its seconds; touching a fail area, bumping into an obstacle that "loses the level", or running out of time loses it (levels.player).
 *
 *   {format: 'nepo-level', version: 1,
 *    title, instructions,            optional texts the learner sees
 *    timeLimit,                      optional: seconds of the simulator's time
 *    world: {background: 'peach', starts: [one start], items: [...]},     the world of the Tests tab (nepoTest.sim), with soft goal areas
 *    view: {x, y, scale}}            and obstacles or walls with failOnHit; the designer's zoom
 */
import * as SIM from 'nepoTest.sim';
import * as SIMRUN from 'nepoTest.simRun';

export const FORMAT = 'nepo-level';
export const VERSION = 1;
const LEVELS_URL = '/rest/levels';

export interface Level {
    format: string;
    version: number;
    title?: string;
    instructions?: string;
    timeLimit?: number; // seconds of the simulator's time; none: no limit
    world: SIM.SimWorld;
    view?: { x: number; y: number; scale: number };
}

/** a level of a set: its id is "set folder/file name" (progress refers to it) */
export interface LevelEntry {
    id: string;
    file: string;
    level: Level;
}

export interface LevelSet {
    id: string; // the folder's name
    name: string; // the folder's name without the number in front
    levels: LevelEntry[];
}

/** a new level: the plain peach floor, the start in its middle */
export function newLevel(): Level {
    const data = SIM.defaultData();
    return { format: FORMAT, version: VERSION, title: '', instructions: '', world: data.world, view: data.view };
}

/** a level from a file's JSON (or its text); throws an Error if it isn't one */
export function parseLevel(json: any): Level {
    const raw = typeof json === 'string' ? JSON.parse(json) : json;
    if (!raw || typeof raw !== 'object' || (raw.format && raw.format !== FORMAT)) {
        throw new Error('its format is not "' + FORMAT + '"');
    }
    if (!raw.world || typeof raw.world !== 'object') {
        throw new Error('it has no world');
    }
    if (raw.version > VERSION) {
        throw new Error('a newer level (version ' + raw.version + ')');
    }
    // the world as the Tests tab reads it (starts, items, the background), on the peach floor, with one start
    const data = SIM.parseData(JSON.stringify({ version: SIM.DATA_VERSION, world: raw.world, view: raw.view }));
    data.world.background = SIM.PEACH;
    data.world.starts = data.world.starts.slice(0, 1);
    const level: Level = { format: FORMAT, version: VERSION, title: text(raw.title), instructions: text(raw.instructions), world: data.world };
    const limit = Number(raw.timeLimit);
    if (limit > 0) {
        level.timeLimit = limit;
    }
    if (raw.view && typeof raw.view === 'object') {
        level.view = data.view;
    }
    return level;
}

function text(value: any): string {
    return typeof value === 'string' ? value : '';
}

/** the world of a level as the world editor (nepoTest.simEditor) shows it */
export function toSimData(level: Level): SIM.SimData {
    return SIM.clone({ version: SIM.DATA_VERSION, world: level.world, view: level.view });
}

/** a level's file: one item per line, so that the levels in git can be compared */
export function serialize(level: Level): string {
    const out: any = { format: FORMAT, version: VERSION, title: level.title || '', instructions: level.instructions || '' };
    level.timeLimit > 0 && (out.timeLimit = level.timeLimit);
    out.world = '\u0000';
    level.view && (out.view = '\u0001');
    const world = level.world;
    const worldText =
        '{"background": ' +
        JSON.stringify(world.background) +
        ',\n  "starts": ' +
        JSON.stringify(world.starts) +
        ',\n  "items": [' +
        world.items.map((item) => '\n    ' + JSON.stringify(item)).join(',') +
        (world.items.length ? '\n  ' : '') +
        ']}';
    return JSON.stringify(out, null, 1).replace('"\\u0000"', worldText).replace('"\\u0001"', JSON.stringify(level.view)) + '\n';
}

/** a file name for a level: its title in small letters, words joined by "-" */
export function fileName(level: Level): string {
    const slug = (level.title || '')
        .toLowerCase()
        .replace(/ä/g, 'ae')
        .replace(/ö/g, 'oe')
        .replace(/ü/g, 'ue')
        .replace(/ß/g, 'ss')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return (slug || 'level') + '.json';
}

/** the robot's outline at the level's start (units, as the simulator's chassis) */
export function startOutline(level: Level): number[][] {
    const s = level.world.starts[0];
    return SIM.footprint(s.x, s.y, s.heading).map((p) => [SIM.BORDER + p[0] * SIM.UNITS_PER_CM, SIM.BORDER + p[1] * SIM.UNITS_PER_CM]);
}

/** an area, an obstacle or a wall with a shape (a triangle has three points, a wall two at least) */
export function isSolid(item: SIM.SimItem): boolean {
    const points = (item.points || []).length;
    return item.kind === 'rect' || item.kind === 'circle' || (item.kind === 'triangle' && points === 3) || (SIM.isWall(item) && points >= 2);
}

/**
 * what is wrong with a level (keys of the designer's texts): no goal area; the robot starts outside the floor, or touches a goal area, a fail
 * area or an obstacle at its start
 */
export function levelProblems(level: Level): string[] {
    const problems: string[] = [];
    const world = level.world;
    if (!world.items.some((i) => i.role === 'goal' && i.kind !== 'line')) {
        problems.push('noGoal');
    }
    const poly = startOutline(level);
    const box = SIMRUN.bbox(poly);
    const [bw, bh] = SIM.backgroundSize(world);
    if (box[0] < SIM.BORDER || box[1] < SIM.BORDER || box[2] > SIM.BORDER + bw || box[3] > SIM.BORDER + bh) {
        problems.push('startOutside');
    }
    const touched = (role: string) => world.items.some((i) => i.role === role && isSolid(i) && SIMRUN.touches(SIMRUN.shapeOf(i), poly, box));
    touched('goal') && problems.push('startOnGoal');
    touched('fail') && problems.push('startOnFail');
    touched('obstacle') && problems.push('startOnObstacle');
    return problems;
}

/** the level sets of the server's levels folder; a level that can't be read is a problem ({file, message}) and left out */
export function fetchSets(): Promise<{ sets: LevelSet[]; problems: { file: string; message: string }[] }> {
    return fetch(LEVELS_URL, { credentials: 'same-origin' })
        .then((response) => {
            if (!response.ok) {
                throw new Error('the levels could not be loaded (' + response.status + ')');
            }
            return response.json();
        })
        .then((listing: any) => {
            const problems = (listing.problems || []).slice();
            const sets: LevelSet[] = [];
            for (const set of listing.sets || []) {
                const levels: LevelEntry[] = [];
                for (const entry of set.levels || []) {
                    try {
                        levels.push({ id: entry.id, file: entry.file, level: parseLevel(entry.level) });
                    } catch (e) {
                        problems.push({ file: entry.file, message: String((e && e.message) || e) });
                    }
                }
                levels.length && sets.push({ id: set.id, name: set.name, levels: levels });
            }
            return { sets: sets, problems: problems };
        });
}
