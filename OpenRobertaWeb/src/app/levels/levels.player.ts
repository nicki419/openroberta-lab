/**
 * The levels of the Program tab's simulator (Edison): instead of the simulator's backgrounds, the learner plays the levels of the repository's
 * levels folder (level.model), a set at a time, in order. Beating a level unlocks the next; a beaten level can be played again, a locked one
 * can't be chosen.
 *
 * - The scene is the level's (ILevelHost, called by the simulator): its floor (peach with its lines: what the sensors read), its obstacles,
 *   walls and tunnels (red: bumping into them loses the level), its goal, soft goal and fail areas drawn on the visible layer only (the sensors
 *   don't see them), the robot at its start. The roofs of the tunnels are drawn above the robot (drawAbove), and the robot's light sensors,
 *   which look up, see the light under them (nepoTest.sim lightAt). Nothing can be moved or edited; the reset button restarts the level.
 * - Every run of the program is an attempt from the start. In every frame the referee looks at the robot's outline: touching a fail area,
 *   bumping into a red obstacle or running out of time (the simulator's time) loses; touching a goal area beats the level, as does standing
 *   still on a soft goal area for its seconds (the program ending on one counts as standing still). Then the program is stopped and a message
 *   says what happened.
 * - Above the scene: the set, the level (beaten ✓, locked 🔒), its title and instructions, the time left.
 * - "Try in simulator" in the Level designer plays a level of its own (tryLevel): no progress.
 * - A panel beside the scene (an element of #simDiv with the class levelSidePanel, such as the AI test assistant's) takes the scene's right:
 *   the scene is centred in the rest (insetRight; sidePanelChanged when it is shown or hidden).
 * - The progress (per set the level played and the levels beaten, per level the attempts) is saved with the program (nepoTest.suite), once
 *   the learner has played; loading a program brings its progress back (a program without one starts anew). A change of the progress is an
 *   unsaved change of the program (autosave saves it: levels.autosave).
 * - Events (onEvent) tell others what happens: a level is opened, an attempt begins and ends, a set is chosen.
 */
import * as GUISTATE_C from 'guiState.controller';
// @ts-ignore (Blockly has no type declarations)
import * as Blockly from 'blockly';
import * as $ from 'jquery';
import * as SIM from 'nepoTest.sim';
import * as SIMRUN from 'nepoTest.simRun';
import * as LEVEL from 'level.model';
import * as SUITE from 'nepoTest.suite';
import { SimulationRoberta } from 'simulation.roberta';
import { ILevelHost, SimulationScene } from 'simulation.scene';
import { Ground } from 'simulation.objects';
import { RobotBase, SelectionListener } from 'robot.base';

const GROUP = 'edison';
const BUMP_MARGIN = 3; // units: the robot bumped into the obstacle that is at most this far from its outline (as nepoTest.simRun)
const STILL_CM = 0.3; // standing still: it moves less than this ...
const STILL_DEG = 1; // ... and turns less than this, from where it began to stand still
const DEFAULT_STILL_S = 3;
const AREA_FILL = { goal: 'rgba(31, 143, 58, 0.35)', fail: 'rgba(208, 49, 45, 0.35)' };

/** what the learner has done: per set the level played and the levels beaten; per level its attempts and what the telemetry counts */
export interface Progress {
    version: number;
    set: string;
    sets: { [set: string]: { current: string; beaten: string[] } };
    levels: { [level: string]: LevelStats };
}

/** a level's attempts, and what the telemetry counts (levels.telemetry): time, the tests there were when it was first opened, test runs */
export interface LevelStats {
    attempts: number;
    activeMs?: number; // the level the current one, the page visible
    firstOpened?: number; // when (ms since 1970)
    testsAtStart?: string[]; // the ids of the tests then
    testRuns?: number;
    aiTestRuns?: number; // runs with tests of the AI test assistant
}

interface Attempt {
    n: number; // the how manieth attempt at the level
    decided: boolean;
    outcome: string; // win | fail_area | fail_hit | time_limit | program_ended | stopped | restarted | switched
    t: number; // the simulator's time it was decided at (s)
    still: { x: number; y: number; theta: number; since: number }; // where and since when it stands still on a soft goal area
}

interface AreaShape {
    item: SIM.SimItem;
    shape: SIMRUN.Shape;
}

let sets: LEVEL.LevelSet[] = [];
let loading = true;
let loadError: string = null;
let progress: Progress = newProgress();
let trial: LEVEL.Level = null; // a level of the Level designer ("Try in simulator")
let scene: SimulationScene = null;
let applied: string = null; // the key of the level the scene shows
let shapes: AreaShape[] = []; // the level's areas, obstacles and walls (units)
let lightWorld: SIM.SimWorld = null; // the world whose light the robot's light sensors see (its tunnels)
let roof: { key: string; img: HTMLImageElement; box: number[]; ready: boolean } = null; // the picture of the level's tunnel roofs
const ROOF_PIXELS = 4e6; // the roofs' picture has at most so many pixels ...
const ROOF_PX_PER_CM = 12; // ... and at most so many per cm
let attempt: Attempt = null;
let shownClock = '';
const images: { [key: string]: Promise<HTMLImageElement> } = {};
const listeners: ((kind: string, data: any) => void)[] = [];
const ui: { [name: string]: any } = {};

const TEXT: { [lang: string]: { [key: string]: string } } = {
    en: {
        set: 'Set',
        level: 'Level',
        loading: 'Loading the levels…',
        noLevels: 'There are no levels (the levels folder is empty).',
        loadError: 'The levels could not be loaded: {0}',
        trying: 'Trying a level of the Level designer',
        backToLevels: 'Back to the levels',
        untitled: 'Level {0}',
        timeLeft: '{0} s left',
        noTimeLimit: '',
        restart: 'Restart level',
        win: 'Level complete!',
        winGoal: 'The robot reached the goal.',
        winSoft: 'The robot stood still in the goal area.',
        nextLevel: 'Next level ▶',
        setComplete: 'You have beaten every level of this set.',
        fail_area: 'Level lost: the robot touched a red area.',
        fail_hit: 'Level lost: the robot bumped into a red obstacle.',
        time_limit: 'Level lost: the time is up ({0} s).',
        program_ended: 'The program ended, but the robot hasn\'t reached a goal.',
        tryAgain: 'Try again ↻',
        close: 'Close',
    },
    de: {
        set: 'Set',
        level: 'Level',
        loading: 'Die Level werden geladen…',
        noLevels: 'Es gibt keine Level (der Level-Ordner ist leer).',
        loadError: 'Die Level konnten nicht geladen werden: {0}',
        trying: 'Ein Level aus dem Level-Designer ausprobieren',
        backToLevels: 'Zurück zu den Leveln',
        untitled: 'Level {0}',
        timeLeft: 'noch {0} s',
        noTimeLimit: '',
        restart: 'Level neu starten',
        win: 'Level geschafft!',
        winGoal: 'Der Roboter hat das Ziel erreicht.',
        winSoft: 'Der Roboter hat im Zielbereich stillgestanden.',
        nextLevel: 'Nächstes Level ▶',
        setComplete: 'Du hast alle Level dieses Sets geschafft.',
        fail_area: 'Level verloren: der Roboter hat einen roten Bereich berührt.',
        fail_hit: 'Level verloren: der Roboter ist gegen ein rotes Hindernis gefahren.',
        time_limit: 'Level verloren: die Zeit ist um ({0} s).',
        program_ended: 'Das Programm ist zu Ende, aber der Roboter hat kein Ziel erreicht.',
        tryAgain: 'Nochmal ↻',
        close: 'Schließen',
    },
};

function text(key: string, ...args: any[]): string {
    const table = TEXT[GUISTATE_C.getLanguage()] || TEXT.en;
    let s = table[key] !== undefined ? table[key] : TEXT.en[key] || key;
    args.forEach((a, i) => (s = s.replace('{' + i + '}', String(a))));
    return s;
}

function html(tag: string, cls: string, parent: Element): any {
    const e = document.createElement(tag);
    cls && (e.className = cls);
    parent && parent.appendChild(e);
    return e;
}

function u(v: number): number {
    return SIM.BORDER + v * SIM.UNITS_PER_CM;
}

function newProgress(): Progress {
    return { version: 1, set: null, sets: {}, levels: {} };
}

// ------------------------------------------------------------------------------------------------ setup

export function init(): void {
    SimulationRoberta.Instance.levelHost = host;
    SUITE.setLevelProgress(serializeProgress, loadProgress);
    build();
    GUISTATE_C.addLanguageListener(() => renderBar());
    LEVEL.fetchSets().then(
        (listing) => {
            sets = listing.sets;
            loading = false;
            listing.problems.forEach((p) => console.warn('level ' + p.file + ' is ignored: ' + p.message));
            levelChanged();
        },
        (e) => {
            loading = false;
            loadError = String((e && e.message) || e);
            levelChanged();
        }
    );
}

/** the progress to save with the program (JSON), once the learner has played (else null: the program stays as it is) */
function serializeProgress(): string {
    return Object.keys(progress.levels).length ? JSON.stringify(progress) : null;
}

/** the progress of a loaded program (null: none, the levels start anew) */
function loadProgress(json: string): void {
    let loaded: Progress = null;
    try {
        const p = json ? JSON.parse(json) : null;
        if (p && typeof p === 'object' && p.sets && typeof p.sets === 'object') {
            loaded = newProgress();
            loaded.set = typeof p.set === 'string' ? p.set : null;
            Object.keys(p.sets).forEach((id) => {
                const s = p.sets[id] || {};
                loaded.sets[id] = { current: typeof s.current === 'string' ? s.current : null, beaten: Array.isArray(s.beaten) ? s.beaten.filter((b: any) => typeof b === 'string') : [] };
            });
            if (p.levels && typeof p.levels === 'object') {
                Object.keys(p.levels).forEach((id) => {
                    const s = p.levels[id];
                    s && typeof s === 'object' && (loaded.levels[id] = Object.assign({}, s, { attempts: Number(s.attempts) || 0 }));
                });
            }
        }
    } catch (e) {
        console.warn('the progress in the levels is not readable: they start anew', e);
    }
    changeLevel(() => (progress = loaded || newProgress()));
}

/** the progress changed: an unsaved change of the program (once there is progress to save) */
function progressChanged(): void {
    !trial && serializeProgress() && GUISTATE_C.setProgramSaved(false);
}

/** the progress (a copy) */
export function getProgress(): Progress {
    return JSON.parse(JSON.stringify(progress));
}

/** the level played, if it is one of the sets (not one tried from the Level designer) */
export function currentLevel(): { id: string; set: string; index: number } {
    const c = current();
    return c.id ? { id: c.id, set: c.set.id, index: c.index } : null;
}

/** a level's stats in the progress (to count in them; saved with the program) */
export function levelStats(id: string): LevelStats {
    return progress.levels[id] || (progress.levels[id] = { attempts: 0 });
}

/** tells what happens: level_opened, attempt_started, attempt_ended, set_selected (the telemetry listens) */
export function onEvent(listener: (kind: string, data: any) => void): void {
    listeners.push(listener);
}

function emit(kind: string, data: any): void {
    if (trial) {
        return; // a level of the Level designer: nothing is counted
    }
    listeners.forEach((listener) => {
        try {
            listener(kind, data);
        } catch (e) {
            console.error(e);
        }
    });
}

const host: ILevelHost = {
    active: function (robotType: string): boolean {
        return robotType === GROUP;
    },
    sceneReady: function (readyScene: SimulationScene, run: boolean): void {
        const active = !!SimulationRoberta.Instance.level();
        $('#simDiv').toggleClass('nepoLevels', active);
        $('#simResetPose').attr('data-bs-original-title', active ? text('restart') : Blockly.Msg.MENU_SIM_POSE_TOOLTIP);
        if (!active) {
            if (applied) {
                readyScene.rcjList = []; // the level's areas
                applied = null;
            }
            readyScene.robots.forEach((robot) => ((robot as any).ambientLight = null));
            return;
        }
        scene = readyScene;
        scene.robots.forEach((robot) => (robot as any).removeMouseEvents()); // the robot can't be moved
        scene.robots.forEach((robot) => ((robot as any).ambientLight = ambientLight));
        renderBar();
        if (applied !== levelKey()) {
            applyLevel().then(() => run && beginAttempt());
        } else if (run) {
            beginAttempt();
        } else {
            applyLevel(); // the scene was set up anew (the simulator opened)
        }
    },
    frame: referee,
    stopped: function (): void {
        attempt && !attempt.decided && decide('stopped', null, false);
    },
    ended: function (): void {
        if (!attempt || attempt.decided) {
            return;
        }
        // the robot can't move any more: on a soft goal area, it stands still long enough
        decide(touched('goal').some((s) => !!s.item.soft) ? 'win_soft' : 'program_ended', null, false);
    },
    restart: function (): void {
        if (SimulationRoberta.Instance.isInterpreterRunning() && attempt && !attempt.decided) {
            decide('restarted', null, true);
        }
        placeRobot();
        hideMessage();
        attempt = null;
        renderClock(0);
    },
    insetRight: function (): number {
        let width = 0;
        $('#simDiv > .levelSidePanel:visible').each((i, e) => {
            width = Math.max(width, (e as HTMLElement).offsetWidth);
        });
        return width;
    },
    drawAbove: function (ctx: CanvasRenderingContext2D): void {
        if (roof && roof.ready && applied === roof.key) {
            const [x, y, w, h] = roof.box;
            ctx.drawImage(roof.img, u(x), u(y), w * SIM.UNITS_PER_CM, h * SIM.UNITS_PER_CM);
        }
    },
};

/** the light (%) the robot's light sensors see at a point of the scene (units): less under a tunnel's roof */
function ambientLight(x: number, y: number): number {
    return lightWorld ? SIM.lightAt(lightWorld, (x - SIM.BORDER) / SIM.UNITS_PER_CM, (y - SIM.BORDER) / SIM.UNITS_PER_CM) : SIM.AMBIENT_LIGHT;
}

/** the picture of the level's tunnel roofs (drawn above the robot); none if it has no tunnels */
function makeRoof(world: SIM.SimWorld, key: string): void {
    const tunnels = world.items.filter((i) => SIM.isTunnel(i) && (i.points || []).length >= 2);
    if (!tunnels.length) {
        roof = null;
        return;
    }
    const boxes = tunnels.map((t) => SIM.tunnelGeometry(t).box);
    const area = (Math.max(...boxes.map((b) => b[2])) - Math.min(...boxes.map((b) => b[0])) + 2) * (Math.max(...boxes.map((b) => b[3])) - Math.min(...boxes.map((b) => b[1])) + 2);
    const image = SIM.roofImage(world, Math.min(ROOF_PX_PER_CM, Math.sqrt(ROOF_PIXELS / Math.max(1, area))));
    const img = new Image();
    const made = { key: key, img: img, box: image.box, ready: false };
    img.onload = () => (made.ready = true);
    img.onerror = () => console.error('the roofs of the tunnels could not be drawn');
    img.src = image.url;
    roof = made;
}

/** a panel beside the scene was shown or hidden: the scene is centred anew */
export function sidePanelChanged(): void {
    scene && SimulationRoberta.Instance.level() && scene.centerBackground(false);
}

// ------------------------------------------------------------------------------------------------ the level played

interface Current {
    id: string; // set/level, or null for a level of the Level designer
    set: LEVEL.LevelSet;
    index: number;
    level: LEVEL.Level;
}

function currentSet(): LEVEL.LevelSet {
    return sets.filter((s) => s.id === progress.set)[0] || sets[0] || null;
}

function setProgress(set: LEVEL.LevelSet): { current: string; beaten: string[] } {
    if (!progress.sets[set.id]) {
        progress.sets[set.id] = { current: null, beaten: [] };
    }
    return progress.sets[set.id];
}

function isBeaten(set: LEVEL.LevelSet, id: string): boolean {
    return setProgress(set).beaten.indexOf(id) >= 0;
}

/** the levels of a set that can be played: those beaten and the first one not beaten (no skipping ahead) */
function playable(set: LEVEL.LevelSet): number {
    const first = set.levels.findIndex((l) => !isBeaten(set, l.id));
    return first < 0 ? set.levels.length - 1 : first;
}

function current(): Current {
    if (trial) {
        return { id: null, set: null, index: 0, level: trial };
    }
    const set = currentSet();
    if (!set) {
        return { id: null, set: null, index: 0, level: LEVEL.newLevel() }; // no levels: the empty floor
    }
    const p = setProgress(set);
    let index = set.levels.findIndex((l) => l.id === p.current);
    if (index < 0 || index > playable(set)) {
        index = playable(set);
    }
    return { id: set.levels[index].id, set: set, index: index, level: set.levels[index].level };
}

/** what the scene shows: the level and its floor */
function levelKey(): string {
    const c = current();
    return (c.id || 'trial') + '|' + JSON.stringify(c.level.world);
}

/** another level is played (chosen, tried): a run of the one before stops, then the bar and the scene follow */
function changeLevel(change: () => void): void {
    attempt && !attempt.decided && decide('switched', null, false);
    SimulationRoberta.Instance.isInterpreterRunning() && SimulationRoberta.Instance.stopProgram();
    change();
    levelChanged();
}

/** the level played changed (chosen, loaded, tried): the bar and the scene follow */
function levelChanged(): void {
    const c = current();
    if (c.id) {
        progress.sets[c.set.id].current = c.id;
        progress.set = c.set.id;
    }
    hideMessage();
    attempt = null;
    renderBar();
    scene && SimulationRoberta.Instance.level() && applyLevel();
    c.id && emit('level_opened', { level: c.id, set: c.set.id, index: c.index });
}

export function selectLevel(id: string): void {
    const set = currentSet();
    const index = set ? set.levels.findIndex((l) => l.id === id) : -1;
    if (index < 0 || index > playable(set)) {
        return; // locked
    }
    changeLevel(() => (setProgress(set).current = id));
    progressChanged();
}

export function selectSet(id: string): void {
    if (!sets.some((s) => s.id === id) || progress.set === id) {
        return;
    }
    changeLevel(() => {
        progress.set = id;
        emit('set_selected', { set: id });
    });
    progressChanged();
}

/** "Try in simulator" (Level designer): plays a level of its own in the Program tab's simulator; false if the robot isn't an Edison */
export function tryLevel(level: LEVEL.Level): boolean {
    if (GUISTATE_C.getRobotGroup() !== GROUP) {
        return false;
    }
    changeLevel(() => (trial = level));
    $('#tabProgram').tabWrapShow();
    setTimeout(function () {
        if (!$('#simButton').hasClass('rightActive')) {
            $('#simButton').clickWrap(); // the simulator opens with the level
        }
    }, 300);
    return true;
}

function endTrial(): void {
    changeLevel(() => (trial = null));
}

// ------------------------------------------------------------------------------------------------ the scene

/** the floor: the peach floor (the level's size) with the level's lines (what the sensors read); an image, as the scene draws it with its src */
function floorImage(level: LEVEL.Level): Promise<HTMLImageElement> {
    const key = JSON.stringify([SIM.backgroundSize(level.world), level.world.items.filter((i) => SIM.isPath(i))]);
    if (!images[key]) {
        images[key] = new Promise(function (resolve, reject) {
            const [bw, bh] = SIM.backgroundSize(level.world);
            const canvas = document.createElement('canvas');
            canvas.width = bw;
            canvas.height = bh;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = SIM.PEACH_COLOR;
            ctx.fillRect(0, 0, bw, bh);
            ctx.translate(-SIM.BORDER, -SIM.BORDER); // the lines are drawn in the scene's units, with the floor at (BORDER, BORDER)
            SIM.drawLines(ctx, level.world);
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('the floor could not be drawn'));
            img.src = canvas.toDataURL('image/png');
        });
    }
    return images[key];
}

/** the level's things in the scene, and the robot at its start */
function applyLevel(): Promise<void> {
    const key = levelKey();
    const level = current().level;
    return floorImage(level).then((img) => {
        if (!scene || key !== levelKey() || !SimulationRoberta.Instance.level()) {
            return; // something else meanwhile
        }
        const s: any = scene;
        s.imgBackgroundList = [img];
        s.currentBackground = 0;
        s.backgroundImg = img;
        s.ground = new Ground(SIM.BORDER, SIM.BORDER, img.width, img.height);
        const listener = new SelectionListener(); // the level's things are never selected
        const items = level.world.items;
        s.obstacleList = [].concat(
            ...items
                .filter((i) => i.role === 'obstacle' && LEVEL.isSolid(i))
                .map((i) => SIMRUN.obstaclesOf(i, listener, scene, i.failOnHit ? SIM.FAIL_OBSTACLE_COLOR : undefined))
        );
        s.colorAreaList = [];
        s.markerList = [];
        s.rcjList = [new LevelAreas(items.filter((i) => (i.role === 'goal' || i.role === 'fail') && LEVEL.isSolid(i)))];
        shapes = items.filter((i) => LEVEL.isSolid(i) && i.role !== 'color').map((i) => ({ item: i, shape: SIMRUN.shapeOf(i) }));
        lightWorld = level.world;
        scene.robots.forEach((robot) => ((robot as any).ambientLight = ambientLight));
        if (!roof || roof.key !== key) {
            makeRoof(level.world, key);
        }
        scene.centerBackground(true);
        placeRobot();
        applied = key;
        renderClock(0);
    });
}

/** the robot at the level's start, its trail gone */
function placeRobot(): void {
    if (!scene) {
        return;
    }
    const start = current().level.world.starts[0];
    const pose = { x: u(start.x), y: u(start.y), theta: (-start.heading * Math.PI) / 180 };
    scene.setRobotPoses([[pose, pose]]);
    scene.resetPoseAndDrawings();
    const robot: any = scene.robots[0];
    robot && robot.chassis && robot.chassis.transformNewPose(robot.pose, robot.chassis);
}

/**
 * the level's goal, soft goal and fail areas, on the scene's visible layer of the competition's labels (rcjLayer): never on the floor the
 * sensors read; nothing can be done with them
 */
class LevelAreas {
    constructor(private items: SIM.SimItem[]) {}

    draw(ctx: CanvasRenderingContext2D, uCtx: CanvasRenderingContext2D): void {
        for (const item of this.items) {
            ctx.save();
            ctx.beginPath();
            if (item.kind === 'rect') {
                ctx.rect(u(item.x), u(item.y), item.w * SIM.UNITS_PER_CM, item.h * SIM.UNITS_PER_CM);
            } else if (item.kind === 'circle') {
                ctx.arc(u(item.x), u(item.y), item.r * SIM.UNITS_PER_CM, 0, 2 * Math.PI);
            } else {
                ctx.moveTo(u(item.points[0][0]), u(item.points[0][1]));
                item.points.slice(1).forEach((p) => ctx.lineTo(u(p[0]), u(p[1])));
                ctx.closePath();
            }
            ctx.globalAlpha = SIM.isSoft(item) ? SIM.SOFT_OPACITY : 1;
            ctx.fillStyle = item.role === 'goal' ? AREA_FILL.goal : AREA_FILL.fail;
            ctx.fill();
            ctx.setLineDash([6, 4]);
            ctx.lineWidth = 2;
            ctx.strokeStyle = item.role === 'goal' ? SIM.COLORS.goal : SIM.COLORS.fail;
            ctx.stroke();
            ctx.restore();
        }
    }

    destroy(): void {}

    removeMouseEvents(): void {}

    addMouseEvents(): void {}
}

// ------------------------------------------------------------------------------------------------ the referee

function beginAttempt(): void {
    placeRobot();
    hideMessage();
    const c = current();
    let n = 1;
    if (c.id) {
        const stats = levelStats(c.id);
        n = ++stats.attempts;
    }
    attempt = { n: n, decided: false, outcome: null, t: 0, still: null };
    renderClock(0);
    progressChanged();
    c.id && emit('attempt_started', { level: c.id, set: c.set.id, attempt: n });
}

function outline(): number[][] {
    const robot: any = scene && scene.robots[0];
    const c = robot && robot.chassis;
    return c ? [c.frontLeft, c.frontRight, c.backRight, c.backLeft].map((p: any) => [p.rx, p.ry]) : [];
}

/** the areas of a role the robot touches */
function touched(role: string): AreaShape[] {
    const poly = outline();
    if (!poly.length) {
        return [];
    }
    const box = SIMRUN.bbox(poly);
    return shapes.filter((s) => s.item.role === role && s.item.kind !== 'line' && SIMRUN.touches(s.shape, poly, box));
}

/** the robot bumped (ChassisDiffDrive turned a wheel back, as nepoTest.simRun): into the nearest obstacle or wall, if one is that near */
function bumpedInto(robot: any): SIM.SimItem {
    const c = robot.chassis;
    const bumped =
        ((c.frontLeft.bumped || c.wheelFrontLeft.bumped) && c.left.speed > 0) ||
        (c.backLeft.bumped && c.left.speed < 0) ||
        ((c.frontRight.bumped || c.wheelFrontRight.bumped) && c.right.speed > 0) ||
        (c.backRight.bumped && c.right.speed < 0);
    if (!bumped) {
        return null;
    }
    const poly = outline();
    let best = BUMP_MARGIN;
    let into: SIM.SimItem = null;
    for (const s of shapes.filter((x) => x.item.role === 'obstacle')) {
        const distance = SIMRUN.shapeDistance(s.shape, poly);
        if (distance <= best) {
            best = distance;
            into = s.item;
        }
    }
    return into;
}

/** a frame of a run: is the level beaten or lost? */
function referee(robot: RobotBase, dt: number, running: boolean): void {
    if (!running || !attempt || attempt.decided || !scene) {
        return;
    }
    const level = current().level;
    const t = robot.time;
    if (touched('fail').length) {
        return decide('fail_area', null, true);
    }
    const into = bumpedInto(robot);
    if (into && into.failOnHit) {
        return decide('fail_hit', into, true);
    }
    const goals = touched('goal');
    if (goals.some((s) => !s.item.soft)) {
        return decide('win', null, true);
    }
    const soft = goals.filter((s) => !!s.item.soft);
    if (soft.length) {
        const pose = (robot as any).pose;
        const still = attempt.still;
        const turned = still ? Math.abs((((pose.theta - still.theta) * 180) / Math.PI + 540) % 360 - 180) : Infinity;
        if (!still || Math.hypot(pose.x - still.x, pose.y - still.y) > STILL_CM * SIM.UNITS_PER_CM || turned > STILL_DEG) {
            attempt.still = { x: pose.x, y: pose.y, theta: pose.theta, since: t };
        } else if (t - still.since >= Math.min(...soft.map((s) => s.item.soft.still || DEFAULT_STILL_S))) {
            return decide('win_soft', null, true);
        }
    } else {
        attempt.still = null;
    }
    if (level.timeLimit > 0 && t >= level.timeLimit) {
        return decide('time_limit', null, true);
    }
    renderClock(t);
}

/** the attempt is decided: the program stops (unless it has already), the learner is told, a win unlocks the next level */
function decide(outcome: string, item: SIM.SimItem, stop: boolean): void {
    const c = current();
    const robot: any = scene && scene.robots[0];
    attempt.decided = true;
    attempt.outcome = outcome;
    attempt.t = robot ? robot.time : 0;
    const won = outcome === 'win' || outcome === 'win_soft';
    if (won && c.set) {
        const p = setProgress(c.set);
        p.beaten.indexOf(c.id) < 0 && p.beaten.push(c.id);
        progressChanged();
    }
    if (['stopped', 'restarted', 'switched'].indexOf(outcome) < 0) {
        showMessage(outcome, c);
    }
    renderBar();
    c.id && emit('attempt_ended', { level: c.id, set: c.set.id, attempt: attempt.n, outcome: outcome, t: attempt.t, item: item ? item.id : null });
    stop && SimulationRoberta.Instance.isInterpreterRunning() && SimulationRoberta.Instance.stopProgram();
}

// ------------------------------------------------------------------------------------------------ the bar and the messages

function build(): void {
    const simDiv = document.getElementById('simDiv');
    ui.bar = html('div', '', simDiv);
    ui.bar.id = 'levelBar';
    const row = html('div', 'levelBarRow', ui.bar);
    ui.setLabel = html('label', 'levelBarLabel', row);
    ui.setText = html('span', '', ui.setLabel);
    ui.set = html('select', 'levelSet', ui.setLabel);
    ui.set.addEventListener('change', () => selectSet(ui.set.value));
    ui.levelLabel = html('label', 'levelBarLabel', row);
    ui.levelText = html('span', '', ui.levelLabel);
    ui.level = html('select', 'levelSelect', ui.levelLabel);
    ui.level.addEventListener('change', () => selectLevel(ui.level.value));
    ui.trying = html('span', 'levelTrying', row);
    ui.back = html('button', 'btn btn-default levelBack', row);
    ui.back.type = 'button';
    ui.back.addEventListener('click', endTrial);
    ui.clock = html('span', 'levelClock', row);
    ui.title = html('div', 'levelTitle', ui.bar);
    ui.instructions = html('div', 'levelInstructions', ui.bar);
    ui.message = html('div', '', simDiv);
    ui.message.id = 'levelMessage';
    ui.message.style.display = 'none';
}

function renderBar(): void {
    if (!ui.bar) {
        return;
    }
    const c = current();
    const status = loading ? text('loading') : loadError ? text('loadError', loadError) : !sets.length ? text('noLevels') : '';
    ui.setText.textContent = text('set') + ' ';
    ui.levelText.textContent = text('level') + ' ';
    ui.set.innerHTML = '';
    sets.forEach((set) => {
        const o = html('option', '', ui.set);
        o.value = set.id;
        o.textContent = set.name;
    });
    c.set && (ui.set.value = c.set.id);
    ui.level.innerHTML = '';
    if (c.set) {
        const limit = playable(c.set);
        c.set.levels.forEach((entry, i) => {
            const o = html('option', '', ui.level);
            o.value = entry.id;
            o.disabled = i > limit;
            o.textContent = (i > limit ? '🔒 ' : isBeaten(c.set, entry.id) ? '✓ ' : '') + (i + 1) + '. ' + (entry.level.title || text('untitled', i + 1));
        });
        ui.level.value = c.id;
    }
    const playing = !trial && !!c.set;
    ui.setLabel.style.display = playing && sets.length > 1 ? '' : 'none';
    ui.levelLabel.style.display = playing ? '' : 'none';
    ui.trying.style.display = trial ? '' : 'none';
    ui.trying.textContent = text('trying');
    ui.back.style.display = trial ? '' : 'none';
    ui.back.textContent = text('backToLevels');
    ui.title.textContent = status || c.level.title || (c.set ? text('untitled', c.index + 1) : '');
    ui.instructions.textContent = status ? '' : c.level.instructions || '';
    ui.instructions.style.display = !status && c.level.instructions ? '' : 'none';
    shownClock = null;
    renderClock(attempt && attempt.decided ? attempt.t : 0);
}

/** the time left (if the level has a limit) */
function renderClock(t: number): void {
    if (!ui.clock) {
        return;
    }
    const limit = current().level.timeLimit;
    const shown = limit > 0 ? text('timeLeft', Math.max(0, limit - t).toFixed(1)) : '';
    if (shown !== shownClock) {
        shownClock = shown;
        ui.clock.textContent = shown ? '⏱ ' + shown : '';
    }
}

function showMessage(outcome: string, c: Current): void {
    const box = ui.message;
    box.innerHTML = '';
    const won = outcome === 'win' || outcome === 'win_soft';
    box.className = won ? 'won' : 'lost';
    html('div', 'levelMessageTitle', box).textContent = won ? text('win') : '';
    const level = c.level;
    html('div', 'levelMessageText', box).textContent = won
        ? text(outcome === 'win' ? 'winGoal' : 'winSoft')
        : outcome === 'time_limit'
        ? text('time_limit', level.timeLimit)
        : text(outcome);
    const buttons = html('div', 'levelMessageButtons', box);
    const button = (label: string, cls: string, action: () => void) => {
        const b = html('button', 'btn ' + cls, buttons);
        b.type = 'button';
        b.textContent = label;
        b.addEventListener('click', (e: Event) => {
            e.preventDefault();
            action();
        });
    };
    if (won && c.set) {
        const next = c.set.levels[c.index + 1];
        if (next) {
            button(text('nextLevel'), 'btn-primary', () => selectLevel(next.id));
        } else {
            html('div', 'levelMessageText', box).textContent = text('setComplete');
        }
    }
    if (!won) {
        button(text('tryAgain'), 'btn-primary', () => host.restart());
    }
    button(text('close'), 'btn-default', hideMessage);
    box.style.display = '';
}

function hideMessage(): void {
    ui.message && (ui.message.style.display = 'none');
}
