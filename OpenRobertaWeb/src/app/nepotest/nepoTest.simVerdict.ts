/**
 * Why a check of a simulation test failed, in NEPO terms: the block to blame. nepoTest.simRun asks for it when a check of what the robot
 * does (or of a variable) failed; the Tests tab and the Simulation window show it above the facts, the blocks as chips: "why (wrong
 * action): [curve forward 40 10] makes the robot drive forward, turning right (left wheel 40 %, right wheel 10 %), but whenever it sees the
 * line, it should turn left". It looks at the run's record (nepoTest.simProgram) where the check went wrong (the verdict's evidence,
 * nepoTest.simBehaviour) and tries these rules in turn:
 * - "decision missing": no block read the sensor the check is about, while it mattered or at all;
 * - "missed the moment": the program reads it, but not while the event lasted (a clap is heard for about 0.3 s, a key held for 0.2 s):
 *   a blocking block ran then (wait, drive 10 cm, a tone);
 * - "wrong decision": a decision read another port of the sensor (the obstacle to the left, not ahead); or it took the same part whether
 *   the check's condition held or not; or it took a part whose action the check doesn't want while another of its parts has one it wants;
 * - "right, but not enough": the action the check wants came, but too late (no action before it, or a blocking block held the program
 *   up); or the block in effect does what the check wants, but the robot didn't (it bumped into something);
 * - "wrong action": the block in effect makes the robot do something else, or no block made it do that, or its amount was done;
 * - "wrong value" (a variable check): its value at the end, the block that changed it last and when; and whether that block counted one
 *   sound or key press several times (the simulator's sensors are states: one clap is heard for about 0.3 s; the Edison reports it once).
 * What a block does is what its values really were (the record), as the simulator sets the wheels (nepoTest.simProgram wheelsAfter). A check
 * of where the robot goes (areas, bumps) that failed points to the test's first failed check of what it does (seeAlso).
 * The words are in English, as the reports.
 */
import * as PROGRAM from 'nepoTest.simProgram';
import * as BEHAVIOUR from 'nepoTest.simBehaviour';

type Part = PROGRAM.Part;

/** why a check failed: its kind (TITLES) and the words, with the blocks as chips */
export interface Explanation {
    kind: string;
    parts: Part[];
}

export const TITLES: { [kind: string]: string } = {
    decision_missing: 'decision missing',
    missed_moment: 'missed the moment',
    decision_wrong: 'wrong decision',
    not_enough: 'right, but not enough',
    action_wrong: 'wrong action',
    memory_wrong: 'wrong value',
    see_also: 'see another check',
};

const FRAME_MS = 1000 / 60;
// blocks during which the program reads nothing: they hold the interpreter until they are done
const BLOCKING = [
    'robControls_wait_time',
    'robActions_motorDiff_on_for',
    'robActions_motorDiff_curve_for',
    'robActions_motorDiff_turn_for',
    'robActions_motor_on_for',
    'robActions_play_tone',
    'mbedActions_play_note',
    'robActions_play_file',
];

// the readings (nepoTest.simProgram, sensor/port/mode, in lower case) a check is about: its condition ("whenever") or its event ("after")
const LINE = ['infrared/line', 'infrared/light'];
const OBSTACLES = ['infrared/front/obstacle', 'infrared/left/obstacle', 'infrared/right/obstacle'];
const SENSES: { [name: string]: string[] } = {
    line: LINE,
    no_line: LINE,
    line_start: LINE,
    line_end: LINE,
    obstacle_ahead: [OBSTACLES[0]],
    obstacle_left: [OBSTACLES[1]],
    obstacle_right: [OBSTACLES[2]],
    no_obstacle: OBSTACLES,
    obstacle: OBSTACLES,
    left_light_below: ['infrared/llight/light'],
    left_light_above: ['infrared/llight/light'],
    right_light_below: ['infrared/rlight/light'],
    right_light_above: ['infrared/rlight/light'],
    sound: ['sound/volume'],
    clap: ['sound/volume'],
    play_key: ['buttons/play'],
    rec_key: ['buttons/rec'],
};
const NOUNS: { [key: string]: string } = {
    'infrared/line': 'the line tracker',
    'infrared/light': 'the line tracker',
    'infrared/front/obstacle': 'the obstacle sensor ahead',
    'infrared/left/obstacle': 'the obstacle sensor to the left',
    'infrared/right/obstacle': 'the obstacle sensor to the right',
    'infrared/llight/light': 'the left light sensor',
    'infrared/rlight/light': 'the right light sensor',
    'sound/volume': 'the sound sensor',
    'buttons/play': 'key ▶',
    'buttons/rec': 'key ●',
};
// how an event of "after" lasts in the simulator's sensors (its condition, nepoTest.simBehaviour CONDITIONS)
const EVENT_CONDITIONS: { [event: string]: string } = { clap: 'sound', line_start: 'line', line_end: 'no_line' };
const LASTS: { [event: string]: string } = { clap: 'heard', key: 'held', line_start: 'seen', line_end: 'not seen', obstacle: 'seen' };
const STATES: { [event: string]: string } = {
    clap: 'it heard a sound',
    key: 'the key was pressed',
    line_start: 'it saw the line',
    line_end: "it didn't see the line",
    obstacle: 'an obstacle was near',
};
const ONE: { [key: string]: string } = { 'sound/volume': 'one clap', 'buttons/play': 'one key press', 'buttons/rec': 'one key press' };
const NOTES: { [key: string]: string } = {
    'sound/volume': ' (the simulator hears a clap for about 0.3 s; the Edison itself reports a clap once)',
    'buttons/play': ' (a key press of the set-up is held for 0.2 s)',
    'buttons/rec': ' (a key press of the set-up is held for 0.2 s)',
};
const SETTERS = ['variables_set', 'robGlobalVariables_set', 'robMath_change'];

const s = BEHAVIOUR.s;
const show = PROGRAM.show;

function chip(block: string): Part[] {
    return block ? [{ block: block }] : ['a block'];
}

/** words and chips in a row (a chip: chip(id), or [] for nothing) */
function words(...items: (string | Part[])[]): Part[] {
    const all: Part[] = [];
    items.forEach((x) => (typeof x === 'string' ? x && all.push(x) : all.push(...x)));
    return all;
}

function lower(key: string): string {
    return String(key).toLowerCase();
}

/** a sensor value of the simulator (keys in any case) */
function valueIn(sensors: { [key: string]: any }, key: string): any {
    if (!sensors) {
        return undefined;
    }
    if (key in sensors) {
        return sensors[key];
    }
    const k = Object.keys(sensors).filter((x) => lower(x) === lower(key))[0];
    return k ? sensors[k] : undefined;
}

function nounOf(keys: string[]): string {
    const nouns = keys.map((k) => NOUNS[lower(k)] || PROGRAM.keyName(k)).filter((n, i, all) => all.indexOf(n) === i);
    return nouns.length === 3 && keys.every((k) => OBSTACLES.indexOf(lower(k)) >= 0) ? 'the obstacle sensors' : nouns.join(' or ');
}

/** "drive forward, turning right (left wheel 40 %, right wheel 10 %)": what wheel speeds make the robot do */
export function wheelWords(wheels: number[]): string {
    const m = PROGRAM.motionOf(wheels);
    const speeds = '(left wheel ' + show(wheels[0]) + ' %, right wheel ' + show(wheels[1]) + ' %)';
    const turn = m.w >= BEHAVIOUR.TURNING_DEG_S ? 'left' : m.w <= -BEHAVIOUR.TURNING_DEG_S ? 'right' : null;
    if (Math.abs(m.v) < BEHAVIOUR.MOVING_CM_S) {
        return turn ? 'turn ' + turn + ' on the spot ' + speeds : 'stand still' + (wheels[0] || wheels[1] ? ' ' + speeds : '');
    }
    return 'drive ' + (m.v > 0 ? 'forward' : 'backward') + (turn ? ', turning ' + turn : wheels[0] !== wheels[1] ? ', almost straight' : '') + ' ' + speeds;
}

/** what the block in effect does, after its chip: "makes the robot drive forward ...", "switches the left LED off" */
function clause(t: PROGRAM.InEffect): string {
    const e = t.effect;
    if (!e) {
        return '';
    }
    if (e.actuator === 'motors') {
        return 'makes the robot ' + wheelWords(t.wheels);
    }
    if (/^led /.test(e.actuator)) {
        return 'switches the ' + (/lled$/.test(e.actuator) ? 'left' : 'right') + ' LED ' + (e.args.on ? 'on' : 'off');
    }
    return e.args.frequency !== undefined ? 'plays a tone (' + show(e.args.frequency) + ' Hz, ' + show(e.args.duration) + ' ms)' : 'plays a sound file';
}

/** what a decision did, in words: said "yes" (an if), stopped waiting (a wait), repeated (a while loop) */
function partWords(kind: string, yes: boolean): string {
    if (kind === 'wait') {
        return yes ? 'stopped waiting' : 'kept waiting';
    }
    if (kind === 'while') {
        return yes ? 'repeated' : 'ended the loop';
    }
    return 'said "' + (yes ? 'yes' : 'no') + '"';
}

class Case {
    private readonly does: any;
    private readonly senses: string[];
    private readonly holds: (sensors: { [key: string]: any }) => boolean;
    private readonly ev: BEHAVIOUR.Evidence;

    constructor(private check: any, verdict: BEHAVIOUR.Verdict, private rec: PROGRAM.Recorder, private setup: any[], private name: (item: string) => string) {
        this.does = BEHAVIOUR.DOES[check.does];
        this.ev = verdict.evidence;
        if (check.check === 'whenever') {
            const condition = BEHAVIOUR.CONDITIONS[check.when];
            this.senses = SENSES[check.when] || [];
            this.holds = condition ? (x) => condition.holds(x, check.percent) : () => false;
        } else if (check.check === 'after' && check.event === 'key') {
            const ports = (setup || []).filter((e) => e.event === 'key').map((e) => lower(e.port));
            this.senses = ports.filter((p, i) => ports.indexOf(p) === i).map((p) => 'buttons/' + p);
            this.holds = (x) => this.senses.some((k) => valueIn(x, k) === true);
        } else if (check.check === 'after') {
            const condition = BEHAVIOUR.CONDITIONS[EVENT_CONDITIONS[check.event]];
            this.senses = SENSES[check.event] || [];
            this.holds = condition ? (x) => condition.holds(x, 0) : (x) => !BEHAVIOUR.CONDITIONS.no_obstacle.holds(x, 0);
        } else {
            this.senses = [];
            this.holds = () => true;
        }
    }

    explain(): Explanation {
        if (!this.does || !this.ev) {
            return null;
        }
        return this.missingRead() || this.late() || this.decision() || this.action();
    }

    // ------------------------------------------------------------------ the words of the check

    /** "it saw the line", "the clap at 0.3 s", "from 0.1 s on" */
    private when(): string {
        const c = this.check;
        if (c.check === 'whenever') {
            return BEHAVIOUR.conditionWords(c, true);
        }
        if (c.check === 'after') {
            const kind = BEHAVIOUR.EVENTS[c.event];
            return kind ? kind.one.replace('{0}', s(this.ev.event)) : String(c.event);
        }
        return 'from ' + s(BEHAVIOUR.reactionOf(c)) + ' s on';
    }

    /** what the check wants: "whenever it sees the line, it should turn left" */
    private wants(): string {
        const c = this.check;
        const base = this.does.base;
        if (c.check === 'whenever') {
            return 'whenever ' + BEHAVIOUR.conditionWords(c) + ', it should ' + base;
        }
        if (c.check === 'after') {
            return 'within ' + s(c.within_ms) + ' s after ' + this.when() + ', it should ' + base;
        }
        return 'from ' + s(BEHAVIOUR.reactionOf(c)) + ' s on, it should always ' + base;
    }

    private relevant(key: string): boolean {
        return this.senses.indexOf(lower(key)) >= 0;
    }

    /** another port of a sensor the check is about (the obstacle to the left, the right light sensor) */
    private related(key: string): boolean {
        const [sensor, , mode] = lower(key).split('/');
        return !this.relevant(key) && this.senses.some((k) => k.split('/')[0] === sensor && k.split('/').length === 3 && k.split('/')[2] === mode);
    }

    private readWords(reads: { [key: string]: PROGRAM.Read }, keys: string[]): string {
        return keys
            .map(
                (k) =>
                    PROGRAM.keyName(k) +
                    ': ' +
                    reads[k].values.map((v) => show(v[0]) + (reads[k].values.length > 1 || v[1] > 1 ? ' ' + v[1] + '×' : '')).join(', ')
            )
            .join('; ');
    }

    // ------------------------------------------------------------------ the block in effect

    private actuator(): string {
        const c = String(this.check.does);
        if (this.does.kind === 'motion') {
            return 'motors';
        }
        if (this.does.kind === 'sound') {
            return 'sound';
        }
        if (/^left_/.test(c) || /^right_/.test(c)) {
            return /^left_/.test(c) ? 'led lled' : 'led rled';
        }
        const f = PROGRAM.frameAt(this.rec, this.ev.at);
        return f && f.leds[0] !== /_on$/.test(c) ? 'led lled' : 'led rled'; // both LEDs: the one that is wrong
    }

    /** does what the block in effect does what the check wants? (sound: whether it plays then) */
    private wanted(t: PROGRAM.InEffect, at: number): boolean {
        const c = String(this.check.does);
        if (this.does.kind === 'motion') {
            return this.does.holds(PROGRAM.motionOf(t.wheels)); // DOES's motion words need only v and w
        }
        if (this.does.kind === 'leds') {
            const on = !!(t.effect && t.effect.args.on);
            return /_on$/.test(c) ? on : !on;
        }
        const f = PROGRAM.frameAt(this.rec, at);
        const playing = !!t.effect && !!f && f.tone;
        return c === 'plays_sound' ? playing : !playing;
    }

    /** the ifs a block is in: "(it ran because [if] said "yes")" */
    private because(block: string): Part[] {
        const branch = block && this.rec.model.branchOf(block);
        return branch ? words(' (it ran because ', chip(branch.block), ' said "' + (branch.part === 'no' ? 'no' : 'yes') + '")') : [];
    }

    /** a blocking block that ran in these frames (the one that ran longest), and from when to when it ran */
    private blocking(frames: PROGRAM.Frame[]): { block: string; from: number; to: number } {
        const counts: { [id: string]: number } = {};
        frames.forEach((f) => f.running && BLOCKING.indexOf(this.rec.model.type(f.running)) >= 0 && (counts[f.running] = (counts[f.running] || 0) + 1));
        const block = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
        if (!block) {
            return null;
        }
        const all = this.rec.frames;
        let i = all.indexOf(frames.filter((f) => f.running === block)[0]);
        let j = i;
        while (i > 0 && all[i - 1].running === block && all[i].began.indexOf(block) < 0) {
            i--; // back to where it began (in a loop it begins again in the frame its last time ends)
        }
        while (j < all.length - 1 && all[j + 1].running === block && all[j + 1].began.indexOf(block) < 0) {
            j++;
        }
        return { block: block, from: i > 0 ? all[i - 1].t : 0, to: all[j].t };
    }

    // ------------------------------------------------------------------ the rules

    /** decision missing, missed the moment, or a decision about another port: the program didn't read what the check is about then */
    private missingRead(): Explanation {
        if (!this.senses.length) {
            return null;
        }
        const ev = this.ev;
        const frames = PROGRAM.framesBetween(this.rec, ev.from, ev.to);
        const reads = PROGRAM.readsIn(frames);
        const keys = Object.keys(reads);
        if (keys.some((k) => this.relevant(k))) {
            return null;
        }
        const noun = nounOf(this.senses);
        const related = keys.filter((k) => this.related(k));
        if (related.length) {
            return {
                kind: 'decision_wrong',
                parts: words(
                    chip(reads[related[0]].block),
                    ' reads ' + nounOf(related) + ' (' + this.readWords(reads, related) + '), but the check is about ' + noun
                ),
            };
        }
        const next = this.rec.frames.filter((f) => f.t > ev.from && Object.keys(f.reads).some((k) => this.relevant(k)))[0];
        const everRead = !!next || this.rec.frames.some((f) => Object.keys(f.reads).some((k) => this.relevant(k)));
        const blocking = this.blocking(frames);
        const after = this.check.check === 'after';
        if (everRead && blocking) {
            const lasted = this.lasted();
            const again = next ? ' again only at ' + s(next.t) + ' s' + (lasted !== null && next.t > lasted ? ', when it was over' : '') : ' never again';
            const what = after
                ? this.when() + (lasted !== null ? ' (' + LASTS[this.check.event] + ' until ' + s(lasted) + ' s) came while ' : ' came while ')
                : 'while ' + this.when() + ' (from ' + s(ev.from) + ' s), ';
            return {
                kind: 'missed_moment',
                parts: words(what, chip(blocking.block), ' ran (from ' + s(blocking.from) + ' to ' + s(blocking.to) + ' s): the program read ' + noun + again),
            };
        }
        if (everRead) {
            const running = frames.map((f) => f.running).filter((id) => !!id)[0];
            const what = (after ? 'within ' + s(this.check.within_ms) + ' s after ' : 'while ') + this.when() + ', no block read ' + noun;
            return { kind: 'decision_missing', parts: running ? words(what + ': ', chip(running), ' ran') : words(what) };
        }
        const target = PROGRAM.inEffectAt(this.rec, this.actuator(), ev.at);
        const notice = after
            ? 'notice ' + (BEHAVIOUR.EVENTS[this.check.event] ? BEHAVIOUR.EVENTS[this.check.event].each : 'it')
            : 'tell when ' + BEHAVIOUR.conditionWords(this.check);
        return {
            kind: 'decision_missing',
            parts: words(
                'no block of the program reads ' + noun + ': it cannot ' + notice,
                target.effect ? words('; meanwhile ', chip(target.effect.block), ' ' + clause(target)) : []
            ),
        };
    }

    /** when the event of an "after" check stopped (the clap was heard until ...), or null */
    private lasted(): number {
        if (this.check.check !== 'after') {
            return null;
        }
        let began = false;
        for (const f of this.rec.frames) {
            if (f.t <= this.ev.event) {
                continue;
            }
            const holds = this.holds(f.sensors);
            if (holds) {
                began = true;
            } else if (began) {
                return f.t;
            }
            if (!began && f.t > this.ev.event + 200) {
                return null;
            }
        }
        return null;
    }

    /** right, but too late: the action the check wants came after all (while the condition still held, after the event) */
    private late(): Explanation {
        const ev = this.ev;
        const c = this.check;
        if (this.does.kind === 'sound') {
            return null;
        }
        const actuator = this.actuator();
        const target = PROGRAM.inEffectAt(this.rec, actuator, ev.at);
        if (this.wanted(target, ev.at)) {
            return null;
        }
        if (c.check === 'does' && ev.from > BEHAVIOUR.reactionOf(c) + FRAME_MS * 1.5) {
            return null; // it did what it should at first: what it did then is the question
        }
        const limit = c.check === 'after' ? Infinity : (ev.until || ev.to) + FRAME_MS;
        for (const e of this.rec.effects) {
            if (e.actuator !== actuator || e.t <= ev.at - FRAME_MS / 2 || e.t > limit) {
                continue;
            }
            const then = PROGRAM.inEffectAt(this.rec, actuator, e.t + FRAME_MS);
            if (then.effect !== e || !this.wanted(then, e.t + FRAME_MS)) {
                continue;
            }
            const sensed = PROGRAM.frameAt(this.rec, e.t);
            if (c.check === 'whenever' && !(sensed && this.holds(sensed.sensors))) {
                return null; // it came when the condition no longer held: not a reaction to it
            }
            const start = c.check === 'after' ? ev.event : c.check === 'does' ? 0 : ev.from;
            const allowed = c.check === 'after' ? s(c.within_ms) + ' s' : BEHAVIOUR.reactionOf(c) + ' ms';
            const blocking = this.blocking(PROGRAM.framesBetween(this.rec, start, e.t));
            if (target.effect && !blocking) {
                return null; // another action ran until then, and nothing held the program up: which action ran is the question
            }
            const after = c.check === 'does' ? 'the start' : this.when() + (c.check === 'whenever' ? ' at ' + s(start) + ' s' : '');
            return {
                kind: 'not_enough',
                parts: words(
                    chip(e.block),
                    ' ' + clause(then) + ', but only from ' + s(e.t) + ' s: ' + s(e.t - start) + ' s after ' + after + ' (the check allows ' + allowed + ')',
                    blocking ? words(', because ', chip(blocking.block), ' ran until ' + s(blocking.to) + ' s') : []
                ),
            };
        }
        return null;
    }

    /**
     * a wrong decision: it doesn't follow the check's condition, or it took the part whose action the check doesn't want while another of
     * its parts has one it wants (a check without a condition: the if the block in effect is in)
     */
    private decision(): Explanation {
        const ev = this.ev;
        const frames = PROGRAM.framesBetween(this.rec, ev.from, ev.to);
        const decisions = PROGRAM.decisionsIn(frames);
        const actuator = this.actuator();
        const target = PROGRAM.inEffectAt(this.rec, actuator, ev.at);
        const branch = target.effect && this.rec.model.branchOf(target.effect.block);
        const about = Object.keys(decisions)
            .map((k) => decisions[k])
            .filter((d) => (this.senses.length ? Object.keys(d.inputs).some((k) => this.relevant(k)) : branch && d.block === branch.block));
        if (!about.length) {
            return null;
        }
        const d = about.filter((x) => branch && x.block === branch.block)[0] || about[0];
        const reads = PROGRAM.readsIn(frames);
        const keys = Object.keys(reads).filter((k) => (this.senses.length ? this.relevant(k) : k in d.inputs));
        const read = keys.length ? this.readWords(reads, keys) : 'nothing';
        if (this.senses.length) {
            const tally = this.tally(d);
            const yesWhenHeld = tally.held[0] >= tally.held[1];
            if (tally.held[0] + tally.held[1] && tally.not[0] + tally.not[1] && yesWhenHeld === tally.not[0] >= tally.not[1]) {
                const condition = this.check.check === 'whenever' ? BEHAVIOUR.conditionWords(this.check) : STATES[this.check.event] || 'the event lasted';
                return {
                    kind: 'decision_wrong',
                    parts: words(chip(d.block), ' ' + partWords(d.kind, yesWhenHeld) + ' whether or not ' + condition + ' (it read ' + read + ')'),
                };
            }
        }
        if (d.kind !== 'if' || !target.effect) {
            return null;
        }
        const input = this.rec.model.inputWithin(target.effect.block, d.block);
        if (!input) {
            return null;
        }
        const yesInput = 'DO' + d.k;
        const inYes = input === yesInput;
        const model = this.rec.model;
        const inOther = (block: string) => {
            const where = model.inputWithin(block, d.block);
            return !!where && (inYes ? where !== yesInput : where === yesInput);
        };
        // the actions of the other part: as they ran, or (if they never ran) as they are written
        const ran = this.rec.effects.filter((e) => e.actuator === actuator && inOther(e.block));
        const written = Object.keys(model.blocks)
            .filter((id) => inOther(id) && !ran.some((e) => e.block === id))
            .map((id) => PROGRAM.blockEffect(model, id))
            .filter((e) => e && e.actuator === actuator);
        const other = ran.concat(written).filter((e) => this.wanted({ effect: e, wheels: PROGRAM.wheelsAfter(e), finished: false }, ev.at))[0];
        if (!other) {
            return null;
        }
        const otherEffect: PROGRAM.InEffect = { effect: other, wheels: PROGRAM.wheelsAfter(other), finished: false };
        return {
            kind: 'decision_wrong',
            parts: words(
                this.check.check === 'whenever'
                    ? 'when ' + this.when() + ' (at ' + s(ev.at) + ' s), '
                    : this.check.check === 'after'
                    ? 'after ' + this.when() + ', '
                    : 'at ' + s(ev.at) + ' s, ',
                chip(d.block),
                ' ' + partWords(d.kind, inYes) + ' (it read ' + read + '), so ',
                chip(target.effect.block),
                ' ' + clause(target) + '; its "' + (inYes ? 'no' : 'yes') + '" part has ',
                chip(other.block),
                ', which ' + clause(otherEffect)
            ),
        };
    }

    /** how a decision went in the whole run: [yes, no] when the check's condition held (the frame before), and when it didn't */
    private tally(d: PROGRAM.DecisionCount): { held: number[]; not: number[] } {
        const key = d.block + ':' + d.k;
        const held = [0, 0];
        const not = [0, 0];
        const frames = this.rec.frames;
        frames.forEach((f, j) => {
            const x = f.decisions[key];
            const before = j ? frames[j - 1] : this.rec.initial;
            if (x && before) {
                const counts = this.holds(before.sensors) ? held : not;
                counts[0] += x.yes;
                counts[1] += x.no;
            }
        });
        return { held: held, not: not };
    }

    /** a wrong action (or none), or the right action that wasn't enough */
    private action(): Explanation {
        const ev = this.ev;
        const actuator = this.actuator();
        const target = PROGRAM.inEffectAt(this.rec, actuator, ev.at);
        const base = this.does.base;
        if (!target.effect) {
            const what =
                this.does.kind === 'leds'
                    ? 'switched the ' + (actuator === 'led lled' ? 'left' : 'right') + ' LED ' + (/_on$/.test(this.check.does) ? 'on' : 'off')
                    : 'made the robot ' + base;
            return { kind: 'action_wrong', parts: ['no block ' + what + ' (' + this.wants() + ')'] };
        }
        if (target.finished) {
            return {
                kind: 'action_wrong',
                parts: words(chip(target.effect.block), ' had finished: the motors were off, and no block started them again (' + this.wants() + ')'),
            };
        }
        if (!this.wanted(target, ev.at)) {
            return {
                kind: 'action_wrong',
                parts: words(chip(target.effect.block), ' ' + clause(target) + ', but ' + this.wants(), this.because(target.effect.block)),
            };
        }
        const frames = PROGRAM.framesBetween(this.rec, ev.from, ev.to);
        const bump = frames.filter((f) => f.bump !== undefined)[0];
        if (bump) {
            const into = bump.bump ? this.name(bump.bump) : 'the wall';
            return {
                kind: 'not_enough',
                parts: words(chip(target.effect.block), ' ' + clause(target) + ', as it should, but the robot bumped into ' + into + ' and could not'),
            };
        }
        const a = frames[0];
        const b = frames[frames.length - 1];
        const dt = a && b && b.t > a.t ? b.t - a.t : 0;
        const h = a && b ? (((a.h + b.h) / 2) * Math.PI) / 180 : 0;
        const moved = dt
            ? BEHAVIOUR.motionWords({ v: (((b.x - a.x) * Math.cos(h) - (b.y - a.y) * Math.sin(h)) * 1000) / dt, w: ((b.h - a.h) * 1000) / dt })
            : 'it did not';
        return { kind: 'not_enough', parts: words(chip(target.effect.block), ' ' + clause(target) + ', as it should, but ' + moved) };
    }
}

/** a variable check: the value at the end, which block made it, and whether it counted one sound or key press several times */
function wrongValue(check: any, rec: PROGRAM.Recorder): Explanation {
    const name = check.variable;
    const changes = rec.globals.filter((c) => c.name === name);
    if (!changes.length) {
        return null; // no such variable: the check's message says so
    }
    const later = changes.slice(1);
    if (!later.length) {
        const model = rec.model;
        const setters = Object.keys(model.blocks).filter((id) => {
            const b = model.blocks[id];
            const variable = b.type === 'robMath_change' ? model.child(id, 'VAR') : b;
            return SETTERS.indexOf(b.type) >= 0 && variable && variable.fields.VAR === name;
        });
        const ran = setters.filter((id) => rec.frames.some((f) => f.began.indexOf(id) >= 0));
        const stayed = name + ' stayed ' + show(changes[0].value) + ': ';
        if (!setters.length) {
            return { kind: 'memory_wrong', parts: [stayed + 'no block of the program changes it'] };
        }
        if (!ran.length) {
            const branch = model.branchOf(setters[0]);
            return {
                kind: 'memory_wrong',
                parts: words(
                    stayed,
                    chip(setters[0]),
                    ' never ran',
                    branch ? words(' (it is in the "' + branch.part + '" part of ', chip(branch.block), ')') : []
                ),
            };
        }
        return { kind: 'memory_wrong', parts: words(stayed, chip(ran[0]), ' ran, but kept it at ' + show(changes[0].value)) };
    }
    const last = later[later.length - 1];
    const values = changes.map((c) => show(c.value));
    const chain = values.length > 8 ? values.slice(0, 3).concat(['…'], values.slice(-2)) : values;
    const burst = countedTwice(rec, later);
    const when =
        burst &&
        (burst.ms < FRAME_MS
            ? ' at ' + s(burst.from) + ' s (in one frame of the simulator)'
            : ' from ' + s(burst.from) + ' to ' + s(burst.from + burst.ms) + ' s');
    return {
        kind: 'memory_wrong',
        parts: words(
            name + ' was ' + show(last.value) + ' at the end: ',
            chip(last.block),
            ' made it ' +
                show(last.value) +
                ' at ' +
                s(last.t) +
                ' s' +
                (later.length > 1 ? ' (it changed ' + later.length + ' times: ' + chain.join(' → ') + ')' : ''),
            burst
                ? words(
                      '. ',
                      burst.block === last.block ? 'It ' : words(chip(burst.block), ' '),
                      'ran ' + burst.n + ' times' + when + ', each time after ',
                      chip(burst.decision),
                      ', while ' +
                          nounOf([burst.key]) +
                          ' kept reading ' +
                          show(burst.value) +
                          ': it counted ' +
                          (ONE[lower(burst.key)] || 'one reading') +
                          ' ' +
                          burst.n +
                          ' times' +
                          (NOTES[lower(burst.key)] || '')
                  )
                : []
        ),
    };
}

interface Burst {
    block: string;
    n: number;
    from: number;
    ms: number;
    key: string;
    value: any;
    decision: string;
}

/**
 * the assignments of a variable, one after the other by the same block, each after a decision that read a sensor which kept its value in
 * between: the longest such run (the program counted one sound several times), or null. A change of a frame in which the variable was
 * assigned several times (a loop that doesn't wait) is that many assignments.
 */
function countedTwice(rec: PROGRAM.Recorder, changes: PROGRAM.Change[]): Burst {
    const steps: PROGRAM.Change[] = [];
    changes.forEach((c) => {
        for (let k = 0; k < (c.times || 1); k++) {
            steps.push(c);
        }
    });
    let best: Burst = null;
    let run: Burst = null;
    for (let i = 1; i < steps.length; i++) {
        const a = steps[i - 1];
        const b = steps[i];
        const gate = a.block && a.block === b.block ? gateOf(rec, b) : null;
        const stayed =
            gate && rec.frames.filter((f) => f.t >= a.t - FRAME_MS - 0.05 && f.t <= b.t + 0.05).every((f) => same(valueIn(f.sensors, gate.key), gate.value));
        if (!stayed) {
            run = null;
            continue;
        }
        if (run && run.block === b.block && run.key === gate.key) {
            run.n++;
            run.ms = b.t - run.from;
        } else {
            run = { block: b.block, n: 2, from: a.t, ms: b.t - a.t, key: gate.key, value: gate.value, decision: gate.decision };
        }
        if (!best || run.n > best.n) {
            best = Object.assign({}, run);
        }
    }
    return best;
}

/** the decision that let a change happen (it said yes in that frame or the one before) and the reading it was based on, if the simulator has it */
function gateOf(rec: PROGRAM.Recorder, change: PROGRAM.Change): { key: string; value: any; decision: string } {
    const frames = rec.frames.filter((f) => f.t >= change.t - FRAME_MS - 0.05 && f.t <= change.t + 0.05);
    for (const f of frames.reverse()) {
        for (const k of Object.keys(f.decisions)) {
            const d = f.decisions[k];
            const key = d.yes ? Object.keys(d.inputs).filter((x) => valueIn(f.sensors, x) !== undefined)[0] : null;
            if (key) {
                return { key: key, value: valueIn(f.sensors, key), decision: d.block };
            }
        }
    }
    return null;
}

function same(a: any, b: any): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * why a check of what the robot does (or of a variable) failed: its verdict (nepoTest.simBehaviour judge), the run's record, the test's
 * set-up (claps, keys), what an item of the world is called; null if no rule applies (the facts have to do)
 */
export function explain(check: any, verdict: BEHAVIOUR.Verdict, rec: PROGRAM.Recorder, setup: any[], name: (item: string) => string): Explanation {
    if (!verdict || verdict.passed !== false) {
        return null;
    }
    if (check.check === 'variable') {
        return wrongValue(check, rec);
    }
    return new Case(check, verdict, rec, setup || [], name).explain();
}

/** a failed check of where the robot goes: it points to the test's first failed check of what the robot does */
export function seeAlso(text: string): Explanation {
    return { kind: 'see_also', parts: ['probably because "' + text + '" failed (see there)'] };
}

/** the explanation as an element: "why (wrong action): ..." with the blocks as chips (`chip` makes the element of a block) */
export function explanationElement(e: Explanation, className: string, chip: (block: string) => HTMLElement): HTMLElement {
    const div = document.createElement('div');
    div.className = className;
    const label = document.createElement('b');
    label.textContent = 'why (' + (TITLES[e.kind] || e.kind) + '): ';
    div.appendChild(label);
    PROGRAM.partsInto(div, e.parts, chip);
    return div;
}
