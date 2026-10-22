/**
 * The simulation window of the Tests tab: an editor for the world of one simulation test (nepoTest.sim), and the replay of its runs. The world
 * and the robot look and behave as in the Lab's simulator: its backgrounds and wall, its obstacles and coloured areas (rectangles, circles,
 * triangles, in its colours), its robot image with the line tracker, the light sensors, the infrared rays and the LEDs.
 *
 * - The robot is dragged to where it starts, and turned with its handle (in steps of 15 degrees; Shift: freely).
 * - Line and Curve draw a line to follow, like the background's track (click the points; a click on the last point again ends it, as
 *   does a double-click of any speed, a right click or Enter; a click on the first point closes it). Rectangle, Circle and Triangle draw an object (a click: the simulator's default size); what it is (obstacle,
 *   coloured area, goal, fail) and its colour are chosen with the buttons.
 * - Select moves things; handles resize them and move the points of lines and triangles. Delete removes, Ctrl+Z / Ctrl+Y undo and redo.
 * - The mouse wheel and the buttons zoom; dragging the empty floor moves the view. The view is kept with the test (data.view).
 * - The background is chosen from the simulator's; "from the simulator" takes over the simulator's current scene.
 * - Record runs the test and keeps the run as the recorded path; the tolerance widens it to the corridor the robot must stay in.
 * - Run runs the test; the run is replayed (play, or drag the time slider).
 * The editor knows nothing about Blockly or the test runner: the tests controller passes the data in and gets it back (EditorHost).
 */
import * as SIM from 'nepoTest.sim';
import * as SIMRUN from 'nepoTest.simRun';

export interface EditorHost {
    /** the data changed: an edit (save it, the program is unsaved), or only the view (quiet: save it quietly) */
    changed(data: SIM.SimData, quiet: boolean): void;
    record(): void;
    run(): void;
    /** the scene of the Lab's simulator as a world, or a message why there is none */
    simulatorScene(): SIM.SimWorld | string;
}

interface Run {
    path: number[][]; // [t, x, y, heading]
    leds: any[][]; // [t, left, right]
    result: string;
    t: number;
    item: string;
    point: number[];
    failure: string; // NepoTest's message (English), if it failed
    passed: boolean;
    expectedFailure: boolean; // it should fail, and it did: passed
    unexpectedPass: boolean; // it should fail, but it passed
    stale: boolean; // the world changed since
}

const SVGNS = 'http://www.w3.org/2000/svg';
const MIN_SCALE = 0.4;
const MAX_SCALE = 40;
const HANDLE_PX = 6;
const TOOLS = ['select', 'line', 'curve', 'rect', 'circle', 'triangle'];

const TEXT: { [lang: string]: { [key: string]: string } } = {
    en: {
        title: 'Simulation test',
        none: 'Select a simulation test, or take one from "Tests" in the toolbox.',
        select: 'Select and move',
        line: 'Line',
        curve: 'Curve',
        rect: 'Rectangle',
        circle: 'Circle',
        triangle: 'Triangle',
        obstacle: 'Obstacle',
        color: 'Coloured area (the sensors see it)',
        goal: 'Goal: touching it passes the test',
        fail: 'Fail: touching it fails the test',
        zoomIn: 'Zoom in',
        zoomOut: 'Zoom out',
        fit: 'Show everything',
        undo: 'Undo (Ctrl+Z)',
        redo: 'Redo (Ctrl+Y)',
        remove: 'Delete (Del)',
        wide: 'Wider window',
        fromSim: 'Take the scene of the simulator (background, obstacles, coloured areas, robot)',
        background: 'Background',
        peach: 'Peach (plain, 3 × 2 m)',
        simpleBackgroundEdison: 'Edison track',
        drawBackground: 'White',
        rescueBackground: 'Rescue',
        mathBackground: 'Math',
        hintSelect: 'Drag the robot to its start; turn it with its round handle (Shift: freely). Drag the floor to move the view, the wheel zooms.',
        hintLine: 'Click the points of the line. To end it, click its last point again (or double-click, right-click, Enter); click the first point to close it. Esc cancels.',
        hintShape: 'Drag to draw, or click for the simulator\'s size. Choose what it is with the buttons.',
        curved: 'curved',
        closed: 'closed',
        width: 'width',
        cm: 'cm',
        record: '● Record path',
        recordTitle: 'Run the test and keep the run as the path the robot must follow',
        clearRecord: 'Forget path',
        tolerance: 'allowed deviation',
        run: '▶ Run test',
        play: 'Replay',
        recorded: 'Path recorded: {0}',
        noPath: 'No path recorded: the robot may go anywhere (except into fail areas).',
        pathInfo: 'Recorded path: {0} s; the robot must stay within {1} cm of it.',
        working: 'Running…',
        loading: 'Starting the test runner (the first time, Python is downloaded: about 12 MB)…',
        passed: '✓ passed: {0}',
        failed: '✗ failed: {0}',
        expectedFailure: '✓ failed, as it should: {0}',
        goalReached: 'the robot reached the goal after {0} s',
        ended: 'the program ended after {0} s',
        returned: 'the function returned after {0} s',
        timeUp: 'the time was up after {0} s',
        stale: 'The world changed since this run.',
        noGoal: 'No goal area: the test passes if nothing goes wrong until the program ends or the time is up.',
        sensors: 'line tracker {0} ({1} %) · LLIGHT {2} % · RLIGHT {3} % · obstacle: {4}',
        black: 'black',
        white: 'white',
        noObstacle: 'none',
        left: 'left',
        front: 'front',
        right: 'right',
        imported: 'The scene of the simulator was taken over.',
    },
    de: {
        title: 'Simulationstest',
        none: 'Wähle einen Simulationstest aus, oder nimm einen aus "Tests" im Werkzeugkasten.',
        select: 'Auswählen und verschieben',
        line: 'Linie',
        curve: 'Kurve',
        rect: 'Rechteck',
        circle: 'Kreis',
        triangle: 'Dreieck',
        obstacle: 'Hindernis',
        color: 'Farbfläche (die Sensoren sehen sie)',
        goal: 'Ziel: wer es berührt, besteht den Test',
        fail: 'Fehler: wer es berührt, besteht den Test nicht',
        zoomIn: 'Vergrößern',
        zoomOut: 'Verkleinern',
        fit: 'Alles zeigen',
        undo: 'Rückgängig (Strg+Z)',
        redo: 'Wiederholen (Strg+Y)',
        remove: 'Löschen (Entf)',
        wide: 'Breiteres Fenster',
        fromSim: 'Die Szene der Simulation übernehmen (Hintergrund, Hindernisse, Farbflächen, Roboter)',
        background: 'Hintergrund',
        peach: 'Pfirsich (einfarbig, 3 × 2 m)',
        simpleBackgroundEdison: 'Edison-Strecke',
        drawBackground: 'Weiß',
        rescueBackground: 'Rescue',
        mathBackground: 'Mathe',
        hintSelect: 'Zieh den Roboter an seinen Start; dreh ihn am runden Griff (Umschalt: stufenlos). Zieh den Boden, um die Ansicht zu verschieben; das Mausrad zoomt.',
        hintLine: 'Klicke die Punkte der Linie. Ein zweiter Klick auf ihren letzten Punkt beendet sie (auch Doppelklick, Rechtsklick, Enter); ein Klick auf den ersten Punkt schließt sie. Esc bricht ab.',
        hintShape: 'Zum Zeichnen ziehen, oder klicken für die Größe der Simulation. Mit den Knöpfen wählst du, was es ist.',
        curved: 'gebogen',
        closed: 'geschlossen',
        width: 'Breite',
        cm: 'cm',
        record: '● Weg aufnehmen',
        recordTitle: 'Den Test ausführen und die Fahrt als Weg behalten, dem der Roboter folgen muss',
        clearRecord: 'Weg vergessen',
        tolerance: 'erlaubte Abweichung',
        run: '▶ Test ausführen',
        play: 'Abspielen',
        recorded: 'Weg aufgenommen: {0}',
        noPath: 'Kein Weg aufgenommen: der Roboter darf überall hin (außer in Fehlerbereiche).',
        pathInfo: 'Aufgenommener Weg: {0} s; der Roboter muss weniger als {1} cm davon abweichen.',
        working: 'Läuft…',
        loading: 'Der Testlauf startet (beim ersten Mal wird Python geladen: etwa 12 MB)…',
        passed: '✓ bestanden: {0}',
        failed: '✗ nicht bestanden: {0}',
        expectedFailure: '✓ gescheitert, wie es soll: {0}',
        goalReached: 'der Roboter hat das Ziel nach {0} s erreicht',
        ended: 'das Programm war nach {0} s zu Ende',
        returned: 'die Funktion war nach {0} s zu Ende',
        timeUp: 'die Zeit war nach {0} s um',
        stale: 'Die Welt hat sich seit dieser Fahrt geändert.',
        noGoal: 'Kein Zielbereich: der Test ist bestanden, wenn nichts schiefgeht, bis das Programm endet oder die Zeit um ist.',
        sensors: 'Linienfolger {0} ({1} %) · LLIGHT {2} % · RLIGHT {3} % · Hindernis: {4}',
        black: 'schwarz',
        white: 'weiß',
        noObstacle: 'keins',
        left: 'links',
        front: 'vorne',
        right: 'rechts',
        imported: 'Die Szene der Simulation wurde übernommen.',
    },
};

/** the icons of the tool buttons (24 x 24) */
const ICONS: { [name: string]: string } = {
    select: '<path d="M6 3 L6 19 L10 15 L13 21 L15.5 20 L12.5 14 L18 14 Z" fill="currentColor"/>',
    line: '<polyline points="3,19 10,8 15,15 21,5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>',
    curve: '<path d="M3 18 C7 2, 13 24, 21 6" fill="none" stroke="currentColor" stroke-width="2.4"/>',
    rect: '<rect x="4" y="6" width="16" height="12" fill="none" stroke="currentColor" stroke-width="2.2"/>',
    circle: '<circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="2.2"/>',
    triangle: '<polygon points="12,4 21,19 3,19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>',
    zoomIn: '<circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M14.5 14.5 L20 20 M7 10 H13 M10 7 V13" stroke="currentColor" stroke-width="2"/>',
    zoomOut: '<circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M14.5 14.5 L20 20 M7 10 H13" stroke="currentColor" stroke-width="2"/>',
    fit: '<path d="M4 9 V4 H9 M15 4 H20 V9 M20 15 V20 H15 M9 20 H4 V15" fill="none" stroke="currentColor" stroke-width="2"/>',
    undo: '<path d="M9 5 L4 10 L9 15 M4 10 H14 A5 5 0 0 1 14 20 H10" fill="none" stroke="currentColor" stroke-width="2"/>',
    redo: '<path d="M15 5 L20 10 L15 15 M20 10 H10 A5 5 0 0 0 10 20 H14" fill="none" stroke="currentColor" stroke-width="2"/>',
    remove: '<path d="M5 7 H19 M10 7 V4 H14 V7 M7 7 L8 20 H16 L17 7" fill="none" stroke="currentColor" stroke-width="2"/>',
    wide: '<path d="M3 12 H21 M7 8 L3 12 L7 16 M17 8 L21 12 L17 16" fill="none" stroke="currentColor" stroke-width="2"/>',
    fromSim: '<rect x="3" y="4" width="18" height="13" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 9 V22 M8 18 L12 22 L16 18" fill="none" stroke="currentColor" stroke-width="2"/>',
};

const ROLE_SWATCH: { [role: string]: string } = {
    obstacle: '<rect x="4" y="4" width="16" height="16" fill="' + SIM.OBSTACLE_COLOR + '"/><rect x="6" y="6" width="16" height="16" fill="none"/>',
    color: '<rect x="4" y="4" width="16" height="16" fill="' + SIM.COLOR_AREA_COLOR + '" stroke="#999" stroke-width="0.8"/>',
    goal: '<rect x="4" y="4" width="16" height="16" fill="#cfe9d5" stroke="' + SIM.COLORS.goal + '" stroke-width="2" stroke-dasharray="3 2"/><path d="M8 12 L11 15 L16 9" fill="none" stroke="' + SIM.COLORS.goal + '" stroke-width="2"/>',
    fail: '<rect x="4" y="4" width="16" height="16" fill="#f6d2d1" stroke="' + SIM.COLORS.fail + '" stroke-width="2" stroke-dasharray="3 2"/><path d="M9 9 L15 15 M15 9 L9 15" stroke="' + SIM.COLORS.fail + '" stroke-width="2"/>',
};

function el(tag: string, attrs?: { [name: string]: any }, parent?: Element): any {
    const e = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, String(attrs[k])));
    parent && parent.appendChild(e);
    return e;
}

function html(tag: string, cls?: string, parent?: Element): any {
    const e = document.createElement(tag);
    if (cls) {
        e.className = cls;
    }
    parent && parent.appendChild(e);
    return e;
}

function seconds(ms: number): string {
    return String(Math.round(ms / 100) / 10);
}

function round(v: number): number {
    return Math.round(v * 100) / 100;
}

let nextId = 1;
function newId(prefix: string): string {
    return prefix + Date.now().toString(36) + (nextId++).toString(36);
}

export class SimEditor {
    private host: EditorHost;
    private lang = 'en';
    private root: HTMLElement;
    private body: HTMLElement;
    private title: HTMLElement;
    private none: HTMLElement;
    private hint: HTMLElement;
    private props: HTMLElement;
    private palette: HTMLElement;
    private status: HTMLElement;
    private pathInfo: HTMLElement;
    private sensorInfo: HTMLElement;
    private canvas: HTMLElement;
    private backgroundSelect: HTMLSelectElement;
    private svg: any;
    private layers: { [name: string]: any } = {};
    private buttons: { [name: string]: HTMLElement } = {};
    private tolerance: HTMLInputElement;
    private toleranceLabel: HTMLElement;
    private timeSlider: HTMLInputElement;
    private timeLabel: HTMLElement;
    private scaleBar: HTMLElement;
    private snapshotBefore: string = null;

    private data: SIM.SimData = null;
    private blockId: string = null;
    private name = '';
    private tool = 'select';
    private role = 'obstacle';
    private color: string = null; // the colour new objects get (null: the simulator's default for their role)
    private selected: string = null; // an item id, or 'robot'
    private drag: any = null;
    private drawing: SIM.SimItem = null;
    private history: { [blockId: string]: { undo: string[]; redo: string[] } } = {};
    private runs: { [blockId: string]: Run } = {};
    private replayT = 0;
    private playing = false;
    private frame = 0;
    private viewTimer: any = null;
    private floorTimer: any = null;
    private floorSums: { key: string; sums: Uint16Array; w: number; h: number } = null;
    private busy = false;
    private finishedAt = -Infinity; // when the last line was finished
    private lastDown: { t: number; x: number; y: number } = null; // for double clicks: the handles under the pointer are redrawn after each click,
    // so the browser's dblclick (which needs the same element twice) doesn't always come
    private needsFit = false; // fit the view as soon as the window has a size
    private resizeFrame = 0;

    constructor(root: HTMLElement, host: EditorHost) {
        this.root = root;
        this.host = host;
        this.build();
    }

    // -------------------------------------------------------------------------------------------- the window

    private text(key: string, ...args: any[]): string {
        const table = TEXT[this.lang] || TEXT.en;
        let s = table[key] !== undefined ? table[key] : TEXT.en[key] || key;
        args.forEach((a, i) => (s = s.replace('{' + i + '}', String(a))));
        return s;
    }

    private build(): void {
        const root = this.root;
        root.innerHTML = '';
        root.classList.add('nepoSim');
        this.none = html('div', 'nepoSimNone', root);
        this.body = html('div', 'nepoSimBody', root);
        const head = html('div', 'nepoSimHead', this.body);
        this.title = html('span', 'nepoSimTitle', head);
        const toolbar = html('div', 'nepoSimToolbar', this.body);
        const group = () => html('div', 'nepoSimGroup', toolbar);
        let g = group();
        TOOLS.forEach((tool) => this.iconButton(g, tool, ICONS[tool], () => this.setTool(tool)));
        g = group();
        SIM.ROLES.forEach((role) => this.iconButton(g, role, ROLE_SWATCH[role], () => this.setRole(role)));
        g = group();
        this.iconButton(g, 'zoomOut', ICONS.zoomOut, () => this.zoomBy(1 / 1.4));
        this.iconButton(g, 'zoomIn', ICONS.zoomIn, () => this.zoomBy(1.4));
        this.iconButton(g, 'fit', ICONS.fit, () => this.fit());
        g = group();
        this.iconButton(g, 'undo', ICONS.undo, () => this.undo());
        this.iconButton(g, 'redo', ICONS.redo, () => this.redo());
        this.iconButton(g, 'remove', ICONS.remove, () => this.removeSelected());
        g = group();
        this.iconButton(g, 'fromSim', ICONS.fromSim, () => this.takeSimulatorScene());
        this.iconButton(g, 'wide', ICONS.wide, () => {
            document.getElementById('tests') && document.getElementById('tests').classList.toggle('nepoSimWide');
            window.dispatchEvent(new Event('resize'));
        });
        g = group();
        this.backgroundSelect = html('select', 'nepoSimBackground', g);
        this.backgroundSelect.addEventListener('change', () => this.setBackground(this.backgroundSelect.value));
        this.palette = html('div', 'nepoSimPalette', this.body);
        this.props = html('div', 'nepoSimProps', this.body);
        this.hint = html('div', 'nepoSimHint', this.body);
        this.canvas = html('div', 'nepoSimCanvas', this.body);
        this.buildSvg();
        this.scaleBar = html('div', 'nepoSimScale', this.canvas);
        this.sensorInfo = html('div', 'nepoSimSensors', this.body);

        const recordRow = html('div', 'nepoSimRow', this.body);
        this.buttons.record = this.textButton(recordRow, 'btn btn-default nepoSimRecord', () => !this.busy && this.host.record());
        this.buttons.clearRecord = this.textButton(recordRow, 'btn btn-default', () => this.clearRecording());
        const tol = html('label', 'nepoSimTolerance', recordRow);
        this.buttons.toleranceText = html('span', '', tol);
        this.tolerance = html('input', '', tol);
        this.tolerance.type = 'range';
        this.tolerance.min = '0';
        this.tolerance.max = '10';
        this.tolerance.step = '0.5';
        this.toleranceLabel = html('span', 'nepoSimToleranceValue', tol);
        this.tolerance.addEventListener('input', () => {
            this.data.tolerance_cm = Number(this.tolerance.value);
            this.toleranceLabel.textContent = this.tolerance.value + ' cm';
            this.renderReference();
        });
        this.tolerance.addEventListener('change', () => {
            const before = this.snapshotBefore;
            this.snapshotBefore = null;
            before ? this.commit(before) : this.afterEdit();
        });
        this.tolerance.addEventListener('pointerdown', () => (this.snapshotBefore = this.snapshot()));
        this.tolerance.addEventListener('keydown', () => (this.snapshotBefore = this.snapshot()));
        this.pathInfo = html('div', 'nepoSimPathInfo', this.body);

        const runRow = html('div', 'nepoSimRow', this.body);
        this.buttons.run = this.textButton(runRow, 'btn btn-primary', () => !this.busy && this.host.run());
        this.buttons.play = this.textButton(runRow, 'btn btn-default', () => this.togglePlay());
        this.timeSlider = html('input', 'nepoSimTime', runRow);
        this.timeSlider.type = 'range';
        this.timeSlider.min = '0';
        this.timeSlider.max = '1000';
        this.timeSlider.value = '0';
        this.timeSlider.addEventListener('input', () => {
            this.stopPlay();
            const run = this.currentRun();
            run && this.showTime((Number(this.timeSlider.value) / 1000) * this.runEnd(run));
        });
        this.timeLabel = html('span', 'nepoSimTimeLabel', runRow);
        this.status = html('div', 'nepoSimStatus', this.body);
        this.setLanguage(this.lang);
        this.show(null, null, '');
    }

    private iconButton(parent: HTMLElement, name: string, icon: string, action: () => void): HTMLElement {
        const b = html('button', 'nepoSimIcon', parent); // not "btn": the Lab's theme colours every .btn
        b.type = 'button';
        b.setAttribute('data-name', name);
        b.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20">' + icon + '</svg>';
        b.addEventListener('click', (e: Event) => {
            e.preventDefault();
            action();
        });
        this.buttons[name] = b;
        return b;
    }

    private textButton(parent: HTMLElement, cls: string, action: () => void): HTMLElement {
        const b = html('button', cls, parent);
        b.type = 'button';
        b.addEventListener('click', (e: Event) => {
            e.preventDefault();
            action();
        });
        return b;
    }

    setLanguage(lang: string): void {
        this.lang = lang;
        Object.keys(this.buttons).forEach((name) => {
            const b = this.buttons[name];
            if (b.classList.contains('nepoSimIcon')) {
                b.title = this.text(name);
            }
        });
        this.buttons.record.textContent = this.text('record');
        this.buttons.record.title = this.text('recordTitle');
        this.buttons.clearRecord.textContent = this.text('clearRecord');
        this.buttons.toleranceText.textContent = this.text('tolerance') + ' ';
        this.buttons.run.textContent = this.text('run');
        this.buttons.play.textContent = '▶ ' + this.text('play');
        this.none.textContent = this.text('none');
        this.backgroundSelect.title = this.text('background');
        this.backgroundSelect.innerHTML = '';
        Object.keys(SIM.BACKGROUNDS).forEach((name) => {
            const o = html('option', '', this.backgroundSelect);
            o.value = name;
            o.textContent = this.text(name);
        });
        this.data && (this.backgroundSelect.value = this.data.world.background);
        this.setTitle(this.name);
        this.updateHint();
        this.renderPalette();
        this.renderProps();
        this.renderPathInfo();
        this.renderStatus();
        this.renderSensors();
    }

    setTitle(name: string): void {
        this.name = name || '';
        this.title.textContent = this.text('title') + ': ' + this.name;
    }

    /** shows a test's world (null: no simulation test selected) */
    show(blockId: string, data: SIM.SimData, name: string): void {
        this.finishDrawing(false);
        this.stopPlay();
        this.blockId = blockId;
        this.data = data;
        this.selected = null;
        this.none.style.display = data ? 'none' : '';
        this.body.style.display = data ? '' : 'none';
        if (!data) {
            return;
        }
        this.setTitle(name);
        if (!this.history[blockId]) {
            this.history[blockId] = { undo: [], redo: [] };
        }
        this.tolerance.value = String(data.tolerance_cm);
        this.toleranceLabel.textContent = data.tolerance_cm + ' cm';
        this.backgroundSelect.value = data.world.background;
        this.setTool('select');
        if (data.view) {
            this.updateViewBox();
        } else if (this.visible()) {
            this.fit();
        } else {
            this.data.view = { x: data.world.start.x, y: data.world.start.y, scale: 4 };
            this.needsFit = true;
        }
        this.renderAll();
        const run = this.currentRun();
        this.replayT = run ? this.runEnd(run) : 0;
        this.renderRun();
        this.renderStatus();
        this.scheduleFloor(0);
    }

    currentBlockId(): string {
        return this.blockId;
    }

    /** the window became visible or changed its size */
    resize(): void {
        if (!this.data || !this.visible()) {
            return;
        }
        if (this.needsFit) {
            this.needsFit = false;
            this.fit();
        }
        this.updateViewBox();
        this.renderZoomed();
    }

    private visible(): boolean {
        const r = this.canvas.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

    setBusy(busy: boolean, message?: string): void {
        this.busy = busy;
        (this.buttons.record as HTMLButtonElement).disabled = busy;
        (this.buttons.run as HTMLButtonElement).disabled = busy;
        if (busy) {
            this.status.className = 'nepoSimStatus';
            this.status.textContent = message || this.text('working');
        } else {
            this.renderStatus();
        }
    }

    loadingText(): string {
        return this.text('loading');
    }

    showMessage(message: string, isError: boolean): void {
        this.status.className = 'nepoSimStatus' + (isError ? ' failed' : '');
        this.status.textContent = message;
    }

    // -------------------------------------------------------------------------------------------- the floor picture

    /** after an edit: the pixels of the floor picture (the one the simulator's sensors read in a run), for the sensors shown */
    private scheduleFloor(delay = 300): void {
        clearTimeout(this.floorTimer);
        this.floorTimer = setTimeout(() => this.refreshFloor(), delay);
    }

    private refreshFloor(): void {
        if (!this.data) {
            return;
        }
        const data = this.data;
        const key = SIM.floorKey(data.world);
        if (!this.floorSums || this.floorSums.key !== key) {
            SIMRUN.floorCanvas(data.world).then(
                (canvas) => {
                    if (this.data === data && SIM.floorKey(data.world) === key) {
                        this.floorSums = { key: key, sums: SIM.pixelSums(canvas), w: canvas.width, h: canvas.height };
                        this.renderSensorsOfRobots();
                    }
                },
                () => undefined
            );
        }
    }

    /** the light values (%) the robot's floor sensors see at a pose: [line tracker, LLIGHT, RLIGHT], unrounded; null while unknown */
    private lightAt(x: number, y: number, heading: number): number[] {
        const f = this.floorSums;
        if (!f || f.key !== SIM.floorKey(this.data.world)) {
            return null;
        }
        return [SIM.LINE_SENSOR, SIM.LIGHT_SENSORS[0], SIM.LIGHT_SENSORS[1]].map((p) => {
            const q = SIM.robotPoint(x, y, heading, p);
            return SIM.sampleFloor(f.sums, f.w, f.h, SIM.BORDER + q[0] * SIM.UNITS_PER_CM, SIM.BORDER + q[1] * SIM.UNITS_PER_CM);
        });
    }

    // -------------------------------------------------------------------------------------------- runs

    /** a run of a test (a report of NepoTest with "simulation"); recorded: it becomes the recorded path */
    showRun(blockId: string, report: any, recorded: boolean): void {
        const sim = report && report.simulation;
        if (!sim) {
            return;
        }
        const failure = (report.failures || [])[0];
        const run: Run = {
            path: sim.path || [],
            leds: sim.leds || [],
            result: sim.result,
            t: sim.t,
            item: sim.item,
            point: sim.point,
            passed: report.outcome === 'passed',
            expectedFailure: !!report.expected_failure,
            unexpectedPass: !!failure && failure.expect === 'should',
            failure: failure ? failure.message : report.error ? report.error.message : null,
            stale: false,
        };
        if (recorded && blockId === this.blockId) {
            const before = this.snapshot();
            this.data.reference = { path: run.path.map((p) => [p[1], p[2], p[3]]), time_ms: sim.t, result: sim.result };
            this.commit(before);
        }
        this.runs[blockId] = run;
        if (blockId === this.blockId) {
            this.stopPlay();
            this.replayT = this.runEnd(run);
            this.renderReference();
            this.renderRun();
            this.renderStatus(recorded);
            if (this.root.offsetParent) {
                this.startPlay(true); // only when the window is shown
            }
        }
    }

    /** what happened in a run, in the window's language (failures come from NepoTest, in English) */
    private describe(run: Run): string {
        if (run.failure && run.unexpectedPass) {
            return run.failure + ' (' + this.describe(Object.assign({}, run, { failure: null })) + ')';
        }
        if (run.failure) {
            return run.failure;
        }
        const t = seconds(run.t);
        const key = { goal: 'goalReached', time_limit: 'timeUp', step_limit: 'timeUp', returned: 'returned' }[run.result] || 'ended';
        return this.text(key, t);
    }

    private currentRun(): Run {
        return this.blockId ? this.runs[this.blockId] : null;
    }

    private runEnd(run: Run): number {
        return run.path.length ? run.path[run.path.length - 1][0] : 0;
    }

    private clearRecording(): void {
        if (!this.data || !this.data.reference) {
            return;
        }
        const before = this.snapshot();
        delete this.data.reference;
        this.commit(before);
    }

    private togglePlay(): void {
        this.playing ? this.stopPlay() : this.startPlay(false);
    }

    private startPlay(fromStart: boolean): void {
        const run = this.currentRun();
        if (!run || !run.path.length) {
            return;
        }
        const end = this.runEnd(run);
        if (fromStart || this.replayT >= end) {
            this.replayT = 0;
        }
        this.playing = true;
        this.buttons.play.textContent = '❚❚ ' + this.text('play');
        const speed = Math.max(1, end / 8000); // long runs play faster: at most about 8 s
        let last = performance.now();
        const step = (now: number) => {
            if (!this.playing) {
                return;
            }
            this.replayT = Math.min(end, this.replayT + (now - last) * speed);
            last = now;
            this.showTime(this.replayT);
            if (this.replayT >= end) {
                this.stopPlay();
                return;
            }
            this.frame = requestAnimationFrame(step);
        };
        this.frame = requestAnimationFrame(step);
    }

    private stopPlay(): void {
        this.playing = false;
        cancelAnimationFrame(this.frame);
        this.buttons.play && (this.buttons.play.textContent = '▶ ' + this.text('play'));
    }

    private replayPose(): number[] {
        const run = this.currentRun();
        return run && run.path.length ? this.poseAt(run, this.replayT) : null;
    }

    private showTime(t: number): void {
        const run = this.currentRun();
        if (!run) {
            return;
        }
        this.replayT = t;
        const end = this.runEnd(run) || 1;
        this.timeSlider.value = String(Math.round((1000 * t) / end));
        this.timeLabel.textContent = seconds(t) + ' / ' + seconds(end) + ' s';
        this.renderSensorsOfRobots();
    }

    private ledsAt(run: Run, t: number): boolean[] {
        let leds = [false, false];
        for (const l of run.leds) {
            if (l[0] <= t) {
                leds = [l[1], l[2]];
            }
        }
        return leds;
    }

    private poseAt(run: Run, t: number): number[] {
        const p = run.path;
        let lo = 0;
        let hi = p.length - 1;
        if (t <= p[0][0]) {
            return p[0].slice(1);
        }
        if (t >= p[hi][0]) {
            return p[hi].slice(1);
        }
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            p[mid][0] <= t ? (lo = mid) : (hi = mid);
        }
        const a = p[lo];
        const b = p[hi];
        const f = b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0]);
        return [a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2]), a[3] + f * (b[3] - a[3])];
    }

    // -------------------------------------------------------------------------------------------- editing state

    private snapshot(): string {
        const d = SIM.clone(this.data);
        delete d.view;
        return JSON.stringify(d);
    }

    /** an edit is done: remember the state before it (for undo) and tell the host */
    private commit(before: string): void {
        if (!this.data || before === null) {
            return;
        }
        if (before === this.snapshot()) {
            return;
        }
        const h = this.history[this.blockId];
        h.undo.push(before);
        if (h.undo.length > 100) {
            h.undo.shift();
        }
        h.redo = [];
        this.afterEdit();
    }

    private afterEdit(): void {
        const run = this.currentRun();
        if (run) {
            run.stale = true;
        }
        this.renderAll();
        this.host.changed(this.data, false);
        this.scheduleFloor();
    }

    private restore(state: string): void {
        const keep = { view: this.data.view };
        const next = JSON.parse(state);
        this.data = Object.assign(this.data, { reference: undefined }, next);
        if (!next.reference) {
            delete this.data.reference;
        }
        this.data.view = keep.view;
        this.tolerance.value = String(this.data.tolerance_cm);
        this.toleranceLabel.textContent = this.data.tolerance_cm + ' cm';
        this.backgroundSelect.value = this.data.world.background;
        this.selected = this.selected && (this.selected === 'robot' || this.item(this.selected)) ? this.selected : null;
        this.renderAll();
        this.host.changed(this.data, false);
        this.scheduleFloor();
    }

    private undo(): void {
        const h = this.blockId && this.history[this.blockId];
        if (!h || !h.undo.length) {
            return;
        }
        h.redo.push(this.snapshot());
        this.restore(h.undo.pop());
    }

    private redo(): void {
        const h = this.blockId && this.history[this.blockId];
        if (!h || !h.redo.length) {
            return;
        }
        h.undo.push(this.snapshot());
        this.restore(h.redo.pop());
    }

    private item(id: string): SIM.SimItem {
        return this.data ? this.data.world.items.filter((i) => i.id === id)[0] : null;
    }

    private removeSelected(): void {
        if (!this.selected || this.selected === 'robot') {
            return;
        }
        const before = this.snapshot();
        this.data.world.items = this.data.world.items.filter((i) => i.id !== this.selected);
        this.selected = null;
        this.commit(before);
    }

    private setTool(tool: string): void {
        this.finishDrawing(true);
        this.tool = tool;
        TOOLS.forEach((t) => this.buttons[t].classList.toggle('active', t === tool));
        this.canvas.setAttribute('data-tool', tool);
        this.updateHint();
        this.renderRoles();
    }

    private setRole(role: string): void {
        this.role = role;
        this.color = null;
        const item = this.selected && this.item(this.selected);
        if (item && item.kind !== 'line' && item.role !== role) {
            const before = this.snapshot();
            item.role = role;
            delete item.color; // the simulator's colour for the new role
            this.commit(before);
        }
        this.renderRoles();
    }

    private setColor(color: string): void {
        this.color = color;
        const item = this.selected && this.item(this.selected);
        if (item && (item.role === 'obstacle' || item.role === 'color')) {
            const before = this.snapshot();
            item.color = color;
            this.commit(before);
        }
        this.renderPalette();
    }

    private setBackground(name: string): void {
        if (!this.data || this.data.world.background === name || !SIM.BACKGROUNDS[name]) {
            return;
        }
        const before = this.snapshot();
        this.data.world.background = name;
        this.commit(before);
        this.fit();
    }

    /** takes over the scene of the Lab's simulator (as a single edit: undo brings the old world back) */
    private takeSimulatorScene(): void {
        if (!this.data) {
            return;
        }
        const scene = this.host.simulatorScene();
        if (typeof scene === 'string') {
            this.showMessage(scene, true);
            return;
        }
        const before = this.snapshot();
        const lines = this.data.world.items.filter((i) => i.kind === 'line' || i.role === 'goal' || i.role === 'fail');
        this.data.world = { background: scene.background, start: scene.start, items: scene.items.concat(lines) };
        this.backgroundSelect.value = scene.background;
        delete this.data.reference; // it was recorded in another world
        this.commit(before);
        this.fit();
        this.showMessage(this.text('imported'), false);
    }

    private renderRoles(): void {
        const item = this.selected && this.item(this.selected);
        const role = item && item.kind !== 'line' ? item.role : this.role;
        SIM.ROLES.forEach((r) => this.buttons[r].classList.toggle('active', r === role));
        this.renderPalette();
    }

    /** the simulator's colours, for obstacles and coloured areas */
    private renderPalette(): void {
        const p = this.palette;
        if (!p) {
            return;
        }
        p.innerHTML = '';
        const item = this.selected && this.selected !== 'robot' ? this.item(this.selected) : null;
        const role = item ? item.role : this.role;
        if (role !== 'obstacle' && role !== 'color') {
            p.style.display = 'none'; // also for lines: they are drawn like the background's track
            return;
        }
        p.style.display = '';
        const current = (item && item.kind !== 'line' ? item.color : this.color) || (role === 'obstacle' ? SIM.OBSTACLE_COLOR : SIM.COLOR_AREA_COLOR);
        const colors = (role === 'obstacle' ? [SIM.OBSTACLE_COLOR] : []).concat(SIM.PALETTE);
        colors.forEach((c) => {
            const b = html('button', 'nepoSimColor' + (c.toLowerCase() === current.toLowerCase() ? ' active' : ''), p);
            b.type = 'button';
            b.style.background = c;
            b.title = c;
            b.addEventListener('click', (e: Event) => {
                e.preventDefault();
                this.setColor(c);
            });
        });
    }

    private updateHint(): void {
        this.hint.textContent = this.text(this.tool === 'select' ? 'hintSelect' : this.tool === 'line' || this.tool === 'curve' ? 'hintLine' : 'hintShape');
    }

    // -------------------------------------------------------------------------------------------- properties

    private renderProps(): void {
        const props = this.props;
        props.innerHTML = '';
        const item = this.selected && this.selected !== 'robot' ? this.item(this.selected) : null;
        if (!item || item.kind !== 'line') {
            props.style.display = 'none';
            return;
        }
        props.style.display = '';
        const check = (key: string, label: string) => {
            const l = html('label', '', props);
            const c = html('input', '', l);
            c.type = 'checkbox';
            c.checked = !!(item as any)[key];
            l.appendChild(document.createTextNode(' ' + label));
            c.addEventListener('change', () => {
                const before = this.snapshot();
                (item as any)[key] = c.checked;
                this.commit(before);
            });
        };
        check('smooth', this.text('curved'));
        if ((item.points || []).length > 2) {
            check('closed', this.text('closed'));
        }
        const l = html('label', '', props);
        l.appendChild(document.createTextNode(this.text('width') + ' '));
        const w = html('input', 'nepoSimNumber', l);
        w.type = 'number';
        w.min = '0.5';
        w.max = '5';
        w.step = '0.1';
        w.value = String(round(item.width || SIM.LINE_WIDTH_CM));
        l.appendChild(document.createTextNode(' ' + this.text('cm')));
        w.addEventListener('change', () => {
            const v = Math.max(0.5, Math.min(5, Number(w.value) || SIM.LINE_WIDTH_CM));
            const before = this.snapshot();
            item.width = v;
            this.commit(before);
        });
    }

    private renderPathInfo(): void {
        if (!this.pathInfo || !this.data) {
            return;
        }
        const ref = this.data.reference;
        this.pathInfo.textContent = ref ? this.text('pathInfo', seconds(ref.time_ms || 0), this.data.tolerance_cm) : this.text('noPath');
        (this.buttons.clearRecord as HTMLButtonElement).disabled = !ref;
        (this.tolerance as HTMLInputElement).disabled = !ref;
    }

    private renderStatus(recorded?: boolean): void {
        if (!this.status || !this.data) {
            return;
        }
        const run = this.currentRun();
        const goals = this.data.world.items.some((i) => i.kind !== 'line' && i.role === 'goal');
        if (!run) {
            this.status.className = 'nepoSimStatus';
            this.status.textContent = goals ? '' : this.text('noGoal');
            (this.buttons.play as HTMLButtonElement).disabled = true;
            this.timeSlider.disabled = true;
            this.timeLabel.textContent = '';
            return;
        }
        (this.buttons.play as HTMLButtonElement).disabled = false;
        this.timeSlider.disabled = false;
        this.status.className = 'nepoSimStatus ' + (run.passed ? 'passed' : 'failed');
        this.status.textContent =
            (recorded
                ? this.text('recorded', this.describe(run))
                : this.text(run.expectedFailure ? 'expectedFailure' : run.passed ? 'passed' : 'failed', this.describe(run))) + (run.stale ? ' ' + this.text('stale') : '');
    }

    /** what the robot's sensors see where it is drawn (as the simulator's sensor values view) */
    private renderSensors(light?: number[], seen?: boolean[]): void {
        if (!this.sensorInfo) {
            return;
        }
        if (!light || !seen) {
            this.sensorInfo.textContent = '';
            return;
        }
        const obstacles = [this.text('left'), this.text('front'), this.text('right')].filter((_, i) => seen[i]);
        this.sensorInfo.textContent = this.text(
            'sensors',
            this.text(light[0] < 50 ? 'black' : 'white'),
            Math.round(light[0]),
            Math.round(light[1]),
            Math.round(light[2]),
            obstacles.length ? obstacles.join(', ') : this.text('noObstacle')
        );
    }

    // -------------------------------------------------------------------------------------------- the picture

    private buildSvg(): void {
        const svg = el('svg', { class: 'nepoSimSvg', tabindex: 0 });
        this.canvas.appendChild(svg);
        this.svg = svg;
        svg.innerHTML = SIM.defs('e');
        el('rect', { x: -5000, y: -5000, width: 10000, height: 10000, fill: SIM.COLORS.outside }, svg);
        ['ground', 'reference', 'world', 'runPath', 'infrared', 'robot', 'replayRobot', 'overlay'].forEach(
            (name) => (this.layers[name] = el('g', { class: 'nepoSim_' + name }, svg))
        );
        svg.addEventListener('pointerdown', (e: PointerEvent) => this.pointerDown(e));
        svg.addEventListener('pointermove', (e: PointerEvent) => this.pointerMove(e));
        svg.addEventListener('pointerup', (e: PointerEvent) => this.pointerUp(e));
        svg.addEventListener('pointercancel', (e: PointerEvent) => this.pointerUp(e));
        svg.addEventListener('dblclick', (e: MouseEvent) => this.doubleClick(e));
        svg.addEventListener('wheel', (e: WheelEvent) => this.wheel(e), { passive: false } as any);
        svg.addEventListener('keydown', (e: KeyboardEvent) => this.keyDown(e));
        svg.addEventListener('contextmenu', (e: Event) => e.preventDefault());
        if ((window as any).ResizeObserver) {
            new (window as any).ResizeObserver(() => {
                cancelAnimationFrame(this.resizeFrame);
                this.resizeFrame = requestAnimationFrame(() => this.resize()); // not inside the observer's callback: no resize loop
            }).observe(this.canvas);
        }
    }

    private renderAll(): void {
        if (!this.data) {
            return;
        }
        this.layers.ground.innerHTML = SIM.groundSvg(this.data.world, 'e');
        this.layers.world.innerHTML = SIM.worldSvg(this.data.world, 'e');
        this.renderReference();
        this.renderOverlay();
        this.renderProps();
        this.renderRoles();
        this.renderStatus();
        this.renderZoomed();
        this.renderSensorsOfRobots();
    }

    /** the robots: at the start (to edit) and, if a run is shown, where it is in the replay; both as the simulator draws them */
    private renderSensorsOfRobots(): void {
        if (!this.data) {
            return;
        }
        const world = this.data.world;
        const s = world.start;
        const run = this.currentRun();
        const replay = this.replayPose();
        const start = this.layers.robot;
        start.setAttribute('transform', SIM.robotTransform(s.x, s.y, s.heading));
        start.setAttribute('opacity', replay ? '0.45' : '1');
        const shown = replay || [s.x, s.y, s.heading];
        const light = this.lightAt(shown[0], shown[1], shown[2]);
        const ir = SIM.infrared(world, shown[0], shown[1], shown[2]);
        start.innerHTML = SIM.robotSvg('e', replay ? this.lightAt(s.x, s.y, s.heading) : light);
        this.layers.infrared.innerHTML = SIM.infraredSvg(world, shown[0], shown[1], shown[2], this.data.view ? this.data.view.scale : 4);
        const g = this.layers.replayRobot;
        if (replay) {
            g.setAttribute('transform', SIM.robotTransform(replay[0], replay[1], replay[2]));
            g.innerHTML = SIM.robotSvg('e', light, this.ledsAt(run, this.replayT));
            g.style.display = '';
        } else {
            g.innerHTML = '';
            g.style.display = 'none';
        }
        this.renderSensors(light, ir.seen);
    }

    private renderReference(): void {
        this.layers.reference.innerHTML = this.data ? SIM.referenceSvg(this.data) : '';
        this.renderPathInfo();
    }

    private renderRun(): void {
        const g = this.layers.runPath;
        g.innerHTML = '';
        const run = this.currentRun();
        if (!run || !run.path.length) {
            this.renderSensorsOfRobots();
            this.renderStatus();
            return;
        }
        el('polyline', { points: run.path.map((p) => p[1] + ' ' + p[2]).join(' '), fill: 'none', stroke: SIM.COLORS.path, 'stroke-width': this.px(2), 'stroke-linejoin': 'round', opacity: 0.9 }, g);
        const item = run.item && this.item(run.item);
        if (item && !run.passed) {
            this.outline(g, item, SIM.COLORS.fail, this.px(3));
        }
        if (run.point) {
            const r = this.px(7);
            el('path', { d: 'M' + (run.point[0] - r) + ' ' + (run.point[1] - r) + ' l' + 2 * r + ' ' + 2 * r + ' m0 ' + -2 * r + ' l' + -2 * r + ' ' + 2 * r, stroke: SIM.COLORS.fail, 'stroke-width': this.px(3) }, g);
        }
        this.showTime(this.replayT);
        this.renderStatus();
    }

    /** an outline of a shape (selection, the area a run ended in) */
    private outline(g: any, item: SIM.SimItem, color: string, width: number): any {
        let e: any;
        if (item.kind === 'rect') {
            e = el('rect', { x: item.x, y: item.y, width: item.w, height: item.h }, g);
        } else if (item.kind === 'circle') {
            e = el('circle', { cx: item.x, cy: item.y, r: item.r }, g);
        } else {
            e = el('polygon', { points: item.points.map((p) => p.join(' ')).join(' ') }, g);
        }
        e.setAttribute('fill', 'none');
        color ? e.setAttribute('stroke', color) : e.setAttribute('class', 'nepoSimSelection');
        e.setAttribute('stroke-width', width);
        return e;
    }

    /** selection, handles, the line being drawn */
    private renderOverlay(): void {
        const g = this.layers.overlay;
        g.innerHTML = '';
        if (!this.data) {
            return;
        }
        const r = this.px(HANDLE_PX);
        const handle = (x: number, y: number, kind: string, round?: boolean) =>
            round
                ? el('circle', { cx: x, cy: y, r: r, class: 'nepoSimHandle', 'data-handle': kind, 'stroke-width': this.px(1.5) }, g)
                : el('rect', { x: x - r, y: y - r, width: 2 * r, height: 2 * r, class: 'nepoSimHandle', 'data-handle': kind, 'stroke-width': this.px(1.5) }, g);
        const s = this.data.world.start;
        // the robot's turning handle is always there: the robot is always "selected" in a way, as it can't be deleted
        const tip = SIM.robotPoint(s.x, s.y, s.heading, [SIM.OUTLINE[0][0] + 9, 0]);
        const nose = SIM.robotPoint(s.x, s.y, s.heading, [SIM.OUTLINE[0][0], 0]);
        el('line', { x1: nose[0], y1: nose[1], x2: tip[0], y2: tip[1], stroke: '#1e5aa8', 'stroke-width': this.px(1.5) }, g);
        handle(tip[0], tip[1], 'robot-turn', true).classList.add('nepoSimRobotHandle');
        if (this.selected === 'robot') {
            el('polygon', { points: SIM.footprint(s.x, s.y, s.heading).map((p) => p.join(' ')).join(' '), class: 'nepoSimSelection', 'stroke-width': this.px(1.5) }, g);
        }
        const item = this.selected && this.selected !== 'robot' ? this.item(this.selected) : null;
        if (item && item.kind === 'line') {
            el('path', { d: SIM.linePathD(item), class: 'nepoSimSelection', 'stroke-width': this.px(1.5) }, g);
            (item.points || []).forEach((p, i) => handle(p[0], p[1], 'point:' + i, true));
        } else if (item) {
            this.outline(g, item, null, this.px(1.5));
            if (item.kind === 'rect') {
                [
                    [item.x, item.y],
                    [item.x + item.w, item.y],
                    [item.x + item.w, item.y + item.h],
                    [item.x, item.y + item.h],
                ].forEach((c, k) => handle(c[0], c[1], 'corner:' + k));
            } else if (item.kind === 'circle') {
                handle(item.x + item.r, item.y, 'radius', true);
            } else {
                item.points.forEach((p, i) => handle(p[0], p[1], 'point:' + i));
            }
        }
        const d = this.drawing;
        if (d) {
            el('path', { d: SIM.linePathD(d), fill: 'none', stroke: '#000000', 'stroke-width': d.width || SIM.LINE_WIDTH_CM, opacity: 0.6 }, g);
            d.points.slice(0, -1).forEach((p, i) => handle(p[0], p[1], i === 0 ? 'first' : 'drawn', true));
        }
    }

    /** what depends on the zoom: shadows (canvas shadows are in screen pixels), the scale bar, the run's path */
    private renderZoomed(): void {
        if (!this.data || !this.data.view) {
            return;
        }
        const scale = this.data.view.scale;
        SIM.shadowSizes(this.svg, 'e', scale);
        const lengths = [1, 5, 10, 20, 50, 100, 200];
        let cm = lengths[lengths.length - 1];
        for (const l of lengths) {
            if (l * scale >= 50) {
                cm = l;
                break;
            }
        }
        this.scaleBar.innerHTML = '<span style="width:' + Math.round(cm * scale) + 'px"></span>' + cm + ' cm';
    }

    /** a length in cm that is `pixels` on the screen */
    private px(pixels: number): number {
        return pixels / ((this.data && this.data.view && this.data.view.scale) || 4);
    }

    // -------------------------------------------------------------------------------------------- view

    private size(): number[] {
        const r = this.canvas.getBoundingClientRect();
        return [Math.max(50, r.width), Math.max(50, r.height)];
    }

    private updateViewBox(): void {
        const v = this.data.view;
        const [w, h] = this.size();
        this.svg.setAttribute('viewBox', [v.x - w / (2 * v.scale), v.y - h / (2 * v.scale), w / v.scale, h / v.scale].join(' '));
    }

    private setView(x: number, y: number, scale: number): void {
        this.data.view = { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, scale: Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round(scale * 1000) / 1000)) };
        this.updateViewBox();
        this.renderOverlay();
        this.renderZoomed();
        this.renderRun();
        clearTimeout(this.viewTimer);
        this.viewTimer = setTimeout(() => this.data && this.host.changed(this.data, true), 400);
    }

    /** shows the whole floor */
    private fit(): void {
        const [x0, y0, x1, y1] = SIM.groundBounds(this.data.world);
        const [w, h] = this.size();
        const margin = 2;
        const scale = Math.min(w / (x1 - x0 + 2 * margin), h / (y1 - y0 + 2 * margin));
        this.setView((x0 + x1) / 2, (y0 + y1) / 2, scale);
    }

    private zoomBy(factor: number, at?: number[]): void {
        const v = this.data.view;
        const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * factor));
        const p = at || [v.x, v.y];
        // keep the point under the cursor where it is
        this.setView(p[0] - ((p[0] - v.x) * v.scale) / scale, p[1] - ((p[1] - v.y) * v.scale) / scale, scale);
    }

    private wheel(e: WheelEvent): void {
        if (!this.data) {
            return;
        }
        e.preventDefault();
        this.zoomBy(Math.pow(1.0015, -e.deltaY), this.toWorldPoint(e));
    }

    private toWorldPoint(e: MouseEvent): number[] {
        const v = this.data.view;
        const r = this.svg.getBoundingClientRect();
        return [v.x + (e.clientX - r.left - r.width / 2) / v.scale, v.y + (e.clientY - r.top - r.height / 2) / v.scale];
    }

    // -------------------------------------------------------------------------------------------- pointer

    /** what is under a point: a handle, the robot, an item (topmost first), or nothing */
    private pick(e: PointerEvent | MouseEvent, p: number[]): any {
        const target = e.target as Element;
        const h = target && target.getAttribute && target.getAttribute('data-handle');
        if (h) {
            return { handle: h };
        }
        const local = this.robotLocal(p);
        if (local[0] >= SIM.CHASSIS.x && local[0] <= SIM.CHASSIS.x + SIM.CHASSIS.w && local[1] >= SIM.CHASSIS.y && local[1] <= SIM.CHASSIS.y + SIM.CHASSIS.h) {
            return { robot: true };
        }
        const slack = this.px(3);
        const order = (item: SIM.SimItem) => (item.role === 'goal' || item.role === 'fail' ? 3 : item.role === 'obstacle' ? 2 : item.kind === 'line' ? 1 : 0);
        const items = this.data.world.items
            .map((item, i) => ({ item: item, i: i }))
            .sort((a, b) => order(b.item) - order(a.item) || b.i - a.i)
            .map((x) => x.item);
        for (const item of items) {
            if (SIM.hits(item, p[0], p[1], slack)) {
                return { item: item };
            }
        }
        return {};
    }

    /** a world point (cm) in the robot frame at its start (units: x ahead, y to the right) */
    private robotLocal(p: number[]): number[] {
        const s = this.data.world.start;
        const theta = (-s.heading * Math.PI) / 180;
        const dx = (p[0] - s.x) * SIM.UNITS_PER_CM;
        const dy = (p[1] - s.y) * SIM.UNITS_PER_CM;
        return [dx * Math.cos(theta) + dy * Math.sin(theta), -dx * Math.sin(theta) + dy * Math.cos(theta)];
    }

    /** the simulator's default size of new objects (simulation.scene.ts: a ninth of the background's width) */
    private defaultSize(): number {
        return SIM.objectSize(this.data.world);
    }

    private newShape(kind: string, p: number[]): SIM.SimItem {
        const item: SIM.SimItem = { id: newId('s'), kind: kind, role: this.role };
        if (this.color && (this.role === 'obstacle' || this.role === 'color')) {
            item.color = this.color;
        }
        const size = this.defaultSize();
        if (kind === 'rect') {
            Object.assign(item, { x: round(p[0]), y: round(p[1]), w: 0, h: 0 });
        } else if (kind === 'circle') {
            Object.assign(item, { x: round(p[0]), y: round(p[1]), r: 0 });
        } else {
            const d = size / 2;
            item.points = [
                [round(p[0] - d), round(p[1] + d)],
                [round(p[0]), round(p[1] - d)],
                [round(p[0] + d), round(p[1] + d)],
            ];
        }
        return item;
    }

    private pointerDown(e: PointerEvent): void {
        if (this.data && e.button === 2 && this.drawing) {
            this.finishDrawing(true); // a right click ends the line
            return;
        }
        if (!this.data || (e.button !== 0 && e.button !== 1)) {
            return;
        }
        this.svg.focus();
        const p = this.toWorldPoint(e);
        if (e.button === 1) {
            e.preventDefault();
            this.beginDrag(e, { kind: 'pan', start: [e.clientX, e.clientY], view: Object.assign({}, this.data.view), moved: false });
            return;
        }
        const now = performance.now();
        const double = this.lastDown && now - this.lastDown.t < 400 && Math.hypot(e.clientX - this.lastDown.x, e.clientY - this.lastDown.y) < 6;
        this.lastDown = { t: now, x: e.clientX, y: e.clientY };
        if (this.tool === 'line' || this.tool === 'curve') {
            if (double && this.drawing) {
                this.finishDrawing(true);
                this.lastDown = null;
                return;
            }
            this.addLinePoint(p);
            return;
        }
        if (this.tool === 'rect' || this.tool === 'circle' || this.tool === 'triangle') {
            const item = this.newShape(this.tool, p);
            this.beginDrag(e, { kind: 'create', item: item, anchor: p, before: this.snapshot(), moved: false });
            this.data.world.items.push(item);
            return;
        }
        const hit = this.pick(e, p);
        const before = this.snapshot();
        if (hit.handle) {
            const h: string = hit.handle;
            if (h === 'robot-turn') {
                this.selected = 'robot';
                this.beginDrag(e, { kind: 'robot-turn', before: before });
            } else if (h.indexOf('point:') === 0) {
                this.beginDrag(e, { kind: 'point', index: Number(h.substring(6)), before: before });
            } else if (h.indexOf('corner:') === 0) {
                this.beginDrag(e, { kind: 'corner', corner: Number(h.substring(7)), original: SIM.clone(this.item(this.selected)), before: before });
            } else if (h === 'radius') {
                this.beginDrag(e, { kind: 'radius', before: before });
            }
        } else if (hit.robot) {
            this.selected = 'robot';
            const s = this.data.world.start;
            this.beginDrag(e, { kind: 'robot', start: p, origin: [s.x, s.y], before: before });
        } else if (hit.item) {
            this.selected = hit.item.id;
            this.beginDrag(e, { kind: 'move', start: p, original: SIM.clone(hit.item), before: before });
        } else {
            this.beginDrag(e, { kind: 'pan', start: [e.clientX, e.clientY], view: Object.assign({}, this.data.view), moved: false, deselect: true });
        }
        this.renderOverlay();
        this.renderProps();
        this.renderRoles();
    }

    private beginDrag(e: PointerEvent, drag: any): void {
        this.drag = drag;
        try {
            this.svg.setPointerCapture(e.pointerId);
        } catch (err) {
            // not supported: the drag still works while the pointer is over the canvas
        }
    }

    private pointerMove(e: PointerEvent): void {
        if (!this.data) {
            return;
        }
        if (this.drawing) {
            const p = this.toWorldPoint(e);
            this.drawing.points[this.drawing.points.length - 1] = [round(p[0]), round(p[1])];
            this.renderOverlay();
            return;
        }
        const d = this.drag;
        if (!d) {
            return;
        }
        const p = this.toWorldPoint(e);
        const s = this.data.world.start;
        if (d.kind === 'pan') {
            const dx = (e.clientX - d.start[0]) / d.view.scale;
            const dy = (e.clientY - d.start[1]) / d.view.scale;
            if (Math.abs(e.clientX - d.start[0]) + Math.abs(e.clientY - d.start[1]) > 3) {
                d.moved = true;
            }
            this.setView(d.view.x - dx, d.view.y - dy, d.view.scale);
            return;
        }
        if (d.kind === 'robot') {
            s.x = round(d.origin[0] + p[0] - d.start[0]);
            s.y = round(d.origin[1] + p[1] - d.start[1]);
        } else if (d.kind === 'robot-turn') {
            s.heading = this.angle(Math.atan2(-(p[1] - s.y), p[0] - s.x), e);
        } else if (d.kind === 'move') {
            const item = this.item(this.selected);
            const dx = p[0] - d.start[0];
            const dy = p[1] - d.start[1];
            if (item.points) {
                item.points = d.original.points.map((q: number[]) => [round(q[0] + dx), round(q[1] + dy)]);
            } else {
                item.x = round(d.original.x + dx);
                item.y = round(d.original.y + dy);
            }
        } else if (d.kind === 'point') {
            this.item(this.selected).points[d.index] = [round(p[0]), round(p[1])];
        } else if (d.kind === 'corner') {
            // the opposite corner stays where it is
            const o = d.original;
            const corners = [
                [o.x, o.y],
                [o.x + o.w, o.y],
                [o.x + o.w, o.y + o.h],
                [o.x, o.y + o.h],
            ];
            const fixed = corners[(d.corner + 2) % 4];
            this.setRect(this.item(this.selected), fixed, p);
        } else if (d.kind === 'radius') {
            const item = this.item(this.selected);
            item.r = round(Math.max(0.5, Math.hypot(p[0] - item.x, p[1] - item.y)));
        } else if (d.kind === 'create') {
            const item: SIM.SimItem = d.item;
            const a = d.anchor;
            if (Math.hypot(p[0] - a[0], p[1] - a[1]) > this.px(4)) {
                d.moved = true;
            }
            if (item.kind === 'rect') {
                this.setRect(item, a, p);
            } else if (item.kind === 'circle') {
                item.r = round(Math.hypot(p[0] - a[0], p[1] - a[1]));
            } else {
                const x0 = Math.min(a[0], p[0]);
                const x1 = Math.max(a[0], p[0]);
                const y0 = Math.min(a[1], p[1]);
                const y1 = Math.max(a[1], p[1]);
                item.points = [
                    [round(x0), round(y1)],
                    [round((x0 + x1) / 2), round(y0)],
                    [round(x1), round(y1)],
                ];
            }
        }
        d.changed = true;
        this.renderEdit();
    }

    private setRect(item: SIM.SimItem, a: number[], b: number[]): void {
        item.x = round(Math.min(a[0], b[0]));
        item.y = round(Math.min(a[1], b[1]));
        item.w = round(Math.max(0.5, Math.abs(b[0] - a[0])));
        item.h = round(Math.max(0.5, Math.abs(b[1] - a[1])));
    }

    /** a light re-render while dragging */
    private renderEdit(): void {
        this.layers.world.innerHTML = SIM.worldSvg(this.data.world, 'e');
        this.renderSensorsOfRobots();
        this.renderOverlay();
    }

    private pointerUp(e: PointerEvent): void {
        const d = this.drag;
        this.drag = null;
        if (!d || !this.data) {
            return;
        }
        if (d.kind === 'pan') {
            if (d.deselect && !d.moved) {
                this.selected = null;
                this.renderOverlay();
                this.renderProps();
                this.renderRoles();
            }
            return;
        }
        if (d.kind === 'create') {
            const item: SIM.SimItem = d.item;
            if (!d.moved) {
                // a click: the simulator's default size (RectangleSimulationObject w = h = width / 9, Circle r = width / 18)
                const size = this.defaultSize();
                if (item.kind === 'rect') {
                    Object.assign(item, { x: round(d.anchor[0] - size / 2), y: round(d.anchor[1] - size / 2), w: round(size), h: round(size) });
                } else if (item.kind === 'circle') {
                    item.r = round(size / 2);
                }
            }
            this.selected = item.id;
            this.setTool('select');
            this.commit(d.before);
            return;
        }
        if (d.changed) {
            this.commit(d.before);
        } else {
            this.renderOverlay();
        }
    }

    private doubleClick(e: MouseEvent): void {
        if (!this.data) {
            return;
        }
        if (this.drawing) {
            this.finishDrawing(true);
            return;
        }
        if (this.tool !== 'select' || performance.now() - this.finishedAt < 800) {
            return; // the browser's double-click that ended a line: it doesn't edit the new line
        }
        const p = this.toWorldPoint(e);
        const target = e.target as Element;
        const h = target && target.getAttribute && target.getAttribute('data-handle');
        const item = this.selected && this.item(this.selected);
        if (!item || item.kind !== 'line') {
            return;
        }
        const before = this.snapshot();
        if (h && h.indexOf('point:') === 0) {
            if (item.points.length > 2) {
                item.points.splice(Number(h.substring(6)), 1);
                if (item.points.length < 3) {
                    item.closed = false;
                }
            }
        } else if (SIM.hits(item, p[0], p[1], this.px(3))) {
            // a new point on the segment nearest to the click
            const segments = SIM.bezierSegments(item.points, !!item.smooth, !!item.closed);
            let best = 0;
            let bestD = Infinity;
            segments.forEach((seg, i) => {
                const dist = SIM.distanceToSegment(p[0], p[1], seg[0], seg[3]);
                if (dist < bestD) {
                    bestD = dist;
                    best = i;
                }
            });
            item.points.splice(best + 1, 0, [round(p[0]), round(p[1])]);
        }
        this.commit(before);
    }

    private addLinePoint(p: number[]): void {
        const q = [round(p[0]), round(p[1])];
        if (!this.drawing) {
            this.drawing = { id: newId('l'), kind: 'line', points: [q, q.slice()], smooth: this.tool === 'curve', closed: false };
            this.renderOverlay();
            return;
        }
        const pts = this.drawing.points;
        const first = pts[0];
        if (pts.length > 3 && Math.hypot(first[0] - p[0], first[1] - p[1]) <= this.px(10)) {
            pts.pop();
            this.drawing.closed = true;
            this.finishDrawing(true);
            return;
        }
        const last = pts[pts.length - 2];
        if (Math.hypot(last[0] - p[0], last[1] - p[1]) <= this.px(8)) {
            this.finishDrawing(true); // the last point again (also the second click of a double-click, however slow): the line ends here
            return;
        }
        pts[pts.length - 1] = q;
        pts.push(q.slice());
        this.renderOverlay();
    }

    /** ends drawing a line: keep it (if it has two points) or drop it */
    private finishDrawing(keep: boolean): void {
        const d = this.drawing;
        if (!d) {
            return;
        }
        this.drawing = null;
        this.finishedAt = performance.now();
        if (!d.closed) {
            d.points.pop(); // the point that follows the pointer
        }
        const pts: number[][] = [];
        d.points.forEach((p) => {
            if (!pts.length || Math.hypot(p[0] - pts[pts.length - 1][0], p[1] - pts[pts.length - 1][1]) > 0.3) {
                pts.push(p);
            }
        });
        d.points = pts;
        if (pts.length < 3) {
            d.closed = false;
        }
        if (keep && pts.length >= 2) {
            const before = this.snapshot();
            this.data.world.items.push(d);
            this.selected = d.id;
            this.setTool('select');
            this.commit(before);
        } else {
            this.renderOverlay();
        }
    }

    /** an angle (radians, counterclockwise) in degrees, in steps of 15 unless Shift is down */
    private angle(radians: number, e: MouseEvent): number {
        const deg = (radians * 180) / Math.PI;
        return e.shiftKey ? Math.round(deg * 10) / 10 : Math.round(deg / 15) * 15;
    }

    private keyDown(e: KeyboardEvent): void {
        if (!this.data) {
            return;
        }
        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && (e.key === 'z' || e.key === 'Z')) {
            e.shiftKey ? this.redo() : this.undo();
        } else if (ctrl && (e.key === 'y' || e.key === 'Y')) {
            this.redo();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            this.removeSelected();
        } else if (e.key === 'Escape') {
            if (this.drawing) {
                this.finishDrawing(false);
            } else {
                this.selected = null;
                this.renderOverlay();
                this.renderProps();
                this.renderRoles();
            }
        } else if (e.key === 'Enter') {
            this.finishDrawing(true);
        } else if (e.key.indexOf('Arrow') === 0 && this.selected) {
            const step = e.shiftKey ? 5 : 0.5;
            const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
            const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
            const before = this.snapshot();
            if (this.selected === 'robot') {
                this.data.world.start.x = round(this.data.world.start.x + dx);
                this.data.world.start.y = round(this.data.world.start.y + dy);
            } else {
                const item = this.item(this.selected);
                if (item.points) {
                    item.points = item.points.map((q) => [round(q[0] + dx), round(q[1] + dy)]);
                } else {
                    item.x = round(item.x + dx);
                    item.y = round(item.y + dy);
                }
            }
            this.commit(before);
        } else {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
    }
}
