/**
 * What the robot does in a test of a simulation world, and the checks of its behaviour. nepoTest.simRun decides them when the run has ended,
 * from the run's record (nepoTest.simProgram):
 * - "does": from a time on, the robot always does something: drives forward or backward, turns left or right, stands still, has an LED on or
 *   off, plays a sound or is silent (DOES);
 * - "whenever": whenever a condition has held for the reaction time (it sees the line, an obstacle is ahead, a light sensor reads below 50 %,
 *   it hears a sound, a key is pressed, ...: CONDITIONS), the robot does something, for as long as the condition holds;
 * - "after": within a time after each event (a clap or a key press of the test's set-up, it starts or stops seeing the line, an obstacle
 *   appears: EVENTS), the robot does something, at some moment (an event too close to the end of the run to tell is left out);
 * - "variable": a global variable of the program at the end.
 * What the robot does is measured in every frame (1/60 s), from how it really moved in the simulator (its position and heading: a bump
 * counts as what it does to the robot), and from its LEDs and its sound. A robot that drives against an obstacle jitters (the simulator
 * turns the bumped wheel back for a frame, frame after frame): near a bump, the motion is measured over 100 ms (BUMP_FRAMES). A condition
 * is the simulator's sensor values: what the robot could sense, whether or not the program reads it. The program reads its sensors before
 * the robot moves in a frame, so the motion of a frame is compared with the condition at the end of the frame before.
 */
import * as PROGRAM from 'nepoTest.simProgram';

export const MOVING_CM_S = 1; // slower along its heading: it doesn't drive (the Edison at 10 % drives 3.5 cm/s)
export const TURNING_DEG_S = 10; // slower: it doesn't turn (a curve whose wheels differ by 4 % turns faster)
export const KINDS = ['does', 'whenever', 'after', 'variable'];
// after_ms when a check has none (NepoTest/nepotest/simulation.py): "does" gives the robot a moment to get going; "whenever": the program
// reacts in the frame after it sensed something (a program that waits in its loop needs more)
export const DEFAULT_REACTION_MS: { [kind: string]: number } = { does: 100, whenever: 0 };
const INSTEAD_MS = 500; // what the robot did instead: over the first half second of a failure
const FACTS_AFTER_MS = 500; // the facts of a failure end this long after its beginning (or with it)
const BUMP_FRAMES = 3; // near a bump: the motion from this many frames before to as many after (the jitter goes back and forth: it cancels out)

/** what the robot did in a frame (the first: where it started, nothing done yet) */
export interface Moment {
    t: number; // ms, the end of the frame
    dt: number; // ms
    x: number; // cm
    y: number;
    v: number; // cm/s along its heading (forward positive)
    w: number; // degrees/s, counterclockwise (left) positive
    leds: boolean[]; // left, right
    tone: boolean;
    sensors: { [key: string]: any }; // the simulator's sensor values at the end of the frame
}

export function moments(rec: PROGRAM.Recorder): Moment[] {
    const first = rec.initial || rec.frames[0];
    if (!first) {
        return [];
    }
    const frames = [first].concat(rec.frames.filter((f, i) => f.t > (i ? rec.frames[i - 1].t : first.t)));
    const bumped = (i: number) => i < frames.length && frames[i].bump !== undefined;
    const out: Moment[] = [{ t: first.t, dt: 0, x: first.x, y: first.y, v: 0, w: 0, leds: first.leds, tone: first.tone, sensors: first.sensors || {} }];
    for (let i = 1; i < frames.length; i++) {
        const f = frames[i];
        const k = bumped(i) || bumped(i + 1) ? Math.min(BUMP_FRAMES, i, frames.length - 1 - i) : 0;
        const a = frames[k ? i - k : i - 1]; // the motion from a to b
        const b = frames[k ? i + k : i];
        const h = (((a.h + b.h) / 2) * Math.PI) / 180; // y points down: heading h drives along (cos h, -sin h)
        const ahead = (b.x - a.x) * Math.cos(h) - (b.y - a.y) * Math.sin(h);
        const dt = b.t - a.t;
        out.push({
            t: f.t,
            dt: f.t - frames[i - 1].t,
            x: f.x,
            y: f.y,
            v: (ahead * 1000) / dt,
            w: ((b.h - a.h) * 1000) / dt,
            leds: f.leds,
            tone: f.tone,
            sensors: f.sensors || {},
        });
    }
    return out;
}

// ------------------------------------------------------------------------------------------------ the words

interface Does {
    now: string;
    past: string;
    base: string;
    kind: string; // motion | leds | sound: what is said about what the robot did instead
    holds: (m: Moment) => boolean;
}

/** what a check says the robot does (in the reports' English: now, in the past, after "did not") */
export const DOES: { [name: string]: Does } = {
    drives_forward: { now: 'drives forward', past: 'drove forward', base: 'drive forward', kind: 'motion', holds: (m) => m.v >= MOVING_CM_S },
    drives_backward: { now: 'drives backward', past: 'drove backward', base: 'drive backward', kind: 'motion', holds: (m) => m.v <= -MOVING_CM_S },
    turns_left: { now: 'turns left', past: 'turned left', base: 'turn left', kind: 'motion', holds: (m) => m.w >= TURNING_DEG_S },
    turns_right: { now: 'turns right', past: 'turned right', base: 'turn right', kind: 'motion', holds: (m) => m.w <= -TURNING_DEG_S },
    stands_still: {
        now: 'stands still',
        past: 'stood still',
        base: 'stand still',
        kind: 'motion',
        holds: (m) => Math.abs(m.v) < MOVING_CM_S && Math.abs(m.w) < TURNING_DEG_S,
    },
    left_led_on: { now: 'has its left LED on', past: 'had its left LED on', base: 'have its left LED on', kind: 'leds', holds: (m) => m.leds[0] },
    left_led_off: { now: 'has its left LED off', past: 'had its left LED off', base: 'have its left LED off', kind: 'leds', holds: (m) => !m.leds[0] },
    right_led_on: { now: 'has its right LED on', past: 'had its right LED on', base: 'have its right LED on', kind: 'leds', holds: (m) => m.leds[1] },
    right_led_off: { now: 'has its right LED off', past: 'had its right LED off', base: 'have its right LED off', kind: 'leds', holds: (m) => !m.leds[1] },
    leds_on: { now: 'has both LEDs on', past: 'had both LEDs on', base: 'have both LEDs on', kind: 'leds', holds: (m) => m.leds[0] && m.leds[1] },
    leds_off: { now: 'has both LEDs off', past: 'had both LEDs off', base: 'have both LEDs off', kind: 'leds', holds: (m) => !m.leds[0] && !m.leds[1] },
    plays_sound: { now: 'plays a sound', past: 'played a sound', base: 'play a sound', kind: 'sound', holds: (m) => m.tone },
    silent: { now: 'is silent', past: 'was silent', base: 'stay silent', kind: 'sound', holds: (m) => !m.tone },
};

interface Condition {
    now: string; // {0}: the percent
    past: string;
    holds: (s: { [key: string]: any }, percent: number) => boolean;
}

const LIGHT = (port: string, below: boolean) => (s: { [key: string]: any }, percent: number) => {
    const v = s['infrared/' + port + '/light'];
    return typeof v === 'number' && (below ? v < percent : v > percent);
};

/** what "whenever" can be about: the simulator's sensor values of the Edison (as the program reads them, nepoTest.simProgram SENSOR_NAMES) */
export const CONDITIONS: { [name: string]: Condition } = {
    line: { now: 'it sees the line', past: 'it saw the line', holds: (s) => s['infrared/line'] === true },
    no_line: { now: "it doesn't see the line", past: "it didn't see the line", holds: (s) => s['infrared/line'] === false },
    obstacle_ahead: { now: 'an obstacle is ahead', past: 'an obstacle was ahead', holds: (s) => s['infrared/FRONT/obstacle'] === true },
    obstacle_left: { now: 'an obstacle is to the left', past: 'an obstacle was to the left', holds: (s) => s['infrared/LEFT/obstacle'] === true },
    obstacle_right: { now: 'an obstacle is to the right', past: 'an obstacle was to the right', holds: (s) => s['infrared/RIGHT/obstacle'] === true },
    no_obstacle: {
        now: 'no obstacle is near',
        past: 'no obstacle was near',
        holds: (s) => ['FRONT', 'LEFT', 'RIGHT'].every((port) => s['infrared/' + port + '/obstacle'] !== true),
    },
    left_light_below: { now: 'the left light sensor reads below {0} %', past: 'the left light sensor read below {0} %', holds: LIGHT('LLIGHT', true) },
    left_light_above: { now: 'the left light sensor reads above {0} %', past: 'the left light sensor read above {0} %', holds: LIGHT('LLIGHT', false) },
    right_light_below: { now: 'the right light sensor reads below {0} %', past: 'the right light sensor read below {0} %', holds: LIGHT('RLIGHT', true) },
    right_light_above: { now: 'the right light sensor reads above {0} %', past: 'the right light sensor read above {0} %', holds: LIGHT('RLIGHT', false) },
    sound: { now: 'it hears a sound', past: 'it heard a sound', holds: (s) => s['sound/volume'] === true },
    play_key: { now: 'key ▶ is pressed', past: 'key ▶ was pressed', holds: (s) => s['buttons/play'] === true },
    rec_key: { now: 'key ● is pressed', past: 'key ● was pressed', holds: (s) => s['buttons/rec'] === true },
};

interface EventKind {
    each: string; // in the check: "within 500 ms after ..."
    every: string; // when it held: "... after every clap"
    one: string; // one of them: {0} its time
    late: string; // one of them, too close to the end of the run
    none: string;
}

/** what "after" can be about: the claps and key presses of the set-up, what the robot's sensors begin to see */
export const EVENTS: { [name: string]: EventKind } = {
    clap: {
        each: 'each clap',
        every: 'every clap',
        one: 'the clap at {0} s',
        late: 'the clap',
        none: 'there was no clap (put claps into the set-up of the test)',
    },
    key: {
        each: 'each key press',
        every: 'every key press',
        one: 'the key press at {0} s',
        late: 'the key press',
        none: 'no key was pressed (put key presses into the set-up of the test)',
    },
    line_start: {
        each: 'it starts seeing the line',
        every: 'every time it started seeing the line',
        one: 'it started seeing the line at {0} s',
        late: 'it started seeing the line',
        none: 'it never started seeing the line',
    },
    line_end: {
        each: 'it stops seeing the line',
        every: 'every time it stopped seeing the line',
        one: 'it stopped seeing the line at {0} s',
        late: 'it stopped seeing the line',
        none: 'it never stopped seeing the line',
    },
    obstacle: {
        each: 'an obstacle appears',
        every: 'every obstacle that appeared',
        one: 'an obstacle appeared at {0} s',
        late: 'the obstacle appeared',
        none: 'no obstacle appeared',
    },
};

const OPS: { [op: string]: string } = { EQ: '=', NEQ: '≠', LT: '<', LTE: '≤', GT: '>', GTE: '≥' };

/** seconds, with up to two decimals */
function s(ms: number): string {
    return (Math.round(ms / 10) / 100).toString();
}

function fill(text: string, value: any): string {
    return text.replace('{0}', String(value));
}

function show(v: any): string {
    return Array.isArray(v) ? '[' + v.map(show).join(', ') + ']' : String(v);
}

function reactionOf(check: any): number {
    return typeof check.after_ms === 'number' ? check.after_ms : DEFAULT_REACTION_MS[check.check] || 0;
}

function conditionWords(check: any, past = false): string {
    const c = CONDITIONS[check.when];
    return c ? fill(past ? c.past : c.now, check.percent) : String(check.when);
}

/** what a behaviour check (or a variable check) checks, in words */
export function describe(check: any): string {
    const does = DOES[check.does];
    const doing = does ? does.now : String(check.does);
    switch (check.check) {
        case 'does':
            return 'from ' + reactionOf(check) + ' ms on, the robot always ' + doing;
        case 'whenever':
            return 'whenever ' + conditionWords(check) + ', the robot ' + doing + ' (after ' + reactionOf(check) + ' ms)';
        case 'after':
            return 'within ' + check.within_ms + ' ms after ' + (EVENTS[check.event] ? EVENTS[check.event].each : check.event) + ', the robot ' + doing;
        case 'variable':
            return 'at the end, ' + check.variable + ' ' + (OPS[check.op] || check.op) + ' ' + show(check.value);
        default:
            return check.check;
    }
}

// ------------------------------------------------------------------------------------------------ deciding a check

/** what a check found: passed true, false, or null (nothing to check); t and point: the first failure; factsAt: where its facts end */
export interface Verdict {
    passed: boolean;
    t: number;
    point: number[];
    message: string;
    factsAt: number;
}

interface Stretch {
    from: number;
    to: number;
    moments: Moment[];
}

function round2(v: number): number {
    return Math.round(v * 100) / 100;
}

/** how often and how long: "from 0.3 to 1.5 s", or "4 times, 1.2 s in total; the first from 0.3 to 0.5 s" */
function stretchWords(stretches: Stretch[]): string {
    const first = stretches[0];
    const span = 'from ' + s(first.from) + ' to ' + s(first.to) + ' s';
    if (stretches.length === 1) {
        return span;
    }
    const total = stretches.reduce((sum, x) => sum + x.to - x.from, 0);
    return stretches.length + ' times, ' + s(total) + ' s in total; the first ' + span;
}

/** what the robot did in these frames, as far as a check of this kind is concerned: "it drove forward, turning right" (on average; if
 * that would be what the check wanted, in the first of them) */
function insteadWords(does: Does, ms: Moment[]): string {
    const kind = does.kind;
    if (kind === 'motion') {
        const time = ms.reduce((sum, m) => sum + m.dt, 0) || 1;
        const average = Object.assign({}, ms[0], {
            v: ms.reduce((sum, m) => sum + m.v * m.dt, 0) / time,
            w: ms.reduce((sum, m) => sum + m.w * m.dt, 0) / time,
        });
        return motionWords(does.holds(average) ? ms[0] : average);
    }
    if (kind === 'leds') {
        const leds = ms[ms.length - 1].leds;
        return leds[0] && leds[1]
            ? 'both its LEDs were on'
            : leds[0]
            ? 'its left LED was on, its right one off'
            : leds[1]
            ? 'its right LED was on, its left one off'
            : 'both its LEDs were off';
    }
    return ms.some((m) => m.tone) ? 'it played a sound' : 'it was silent';
}

function motionWords(m: Moment): string {
    const [v, w] = [m.v, m.w];
    const turn = w >= TURNING_DEG_S ? 'left' : w <= -TURNING_DEG_S ? 'right' : null;
    if (Math.abs(v) < MOVING_CM_S) {
        return turn ? 'it turned ' + turn + ' on the spot' : 'it stood still';
    }
    return (
        'it drove ' +
        (v > 0 ? 'forward' : 'backward') +
        (turn ? ', turning ' + turn : ', straight') +
        ' (' +
        round2(Math.abs(v)) +
        ' cm/s' +
        (turn ? ', ' + Math.round(Math.abs(w)) + '°/s' : '') +
        ')'
    );
}

/**
 * "does" and "whenever": in every frame after the condition (none: the run's start) has held for after_ms, until it ends, the robot must do
 * what the check says
 */
function holdsWhile(check: any, ms: Moment[], condition: (m: Moment) => boolean): Verdict {
    const does = DOES[check.does];
    const reaction = reactionOf(check);
    let since: number = null; // when the condition began to hold
    let checkedMs = 0;
    let times = 0; // how often the condition held long enough
    let inside = false;
    let open: Stretch = null;
    const failures: Stretch[] = [];
    for (let i = 1; i < ms.length; i++) {
        const before = ms[i - 1]; // what the program sensed before this frame
        const m = ms[i];
        since = condition(before) ? (since === null ? before.t : since) : null;
        const subject = since !== null && before.t - since >= reaction - 1e-6;
        subject && !inside && times++;
        inside = subject;
        if (!subject || does.holds(m)) {
            open = null;
            subject && (checkedMs += m.dt);
            continue;
        }
        checkedMs += m.dt;
        if (!open) {
            open = { from: before.t, to: m.t, moments: [] };
            failures.push(open);
        }
        open.to = m.t;
        open.moments.push(m);
    }
    const end = ms.length ? ms[ms.length - 1].t : 0;
    if (!checkedMs) {
        const message =
            check.check === 'does'
                ? 'not checked: the run ended before ' + s(reaction) + ' s'
                : 'not checked: "' + conditionWords(check) + '" never held' + (reaction ? ' for ' + s(reaction) + ' s' : '');
        return { passed: null, t: null, point: null, message: message, factsAt: end };
    }
    if (!failures.length) {
        const message =
            check.check === 'does'
                ? 'the robot ' + does.past + ' from ' + s(reaction) + ' s to the end'
                : 'whenever ' +
                  conditionWords(check, true) +
                  ' (' +
                  (times === 1 ? 'once' : times + ' times') +
                  ', ' +
                  s(checkedMs) +
                  ' s checked), the robot ' +
                  does.past;
        return { passed: true, t: null, point: null, message: message, factsAt: end };
    }
    const first = failures[0];
    const at = first.moments[0];
    const instead = insteadWords(
        does,
        first.moments.filter((m) => m.t <= first.from + INSTEAD_MS)
    );
    const message =
        (check.check === 'does' ? '' : conditionWords(check, true) + ', but ') +
        'the robot did not ' +
        does.base +
        ': ' +
        instead +
        ', ' +
        stretchWords(failures);
    return { passed: false, t: at.t, point: [round2(at.x), round2(at.y)], message: message, factsAt: Math.min(first.to, first.from + FACTS_AFTER_MS) };
}

/** when the events of an "after" check happened (ms): the set-up's claps and key presses, or the changes of the robot's sensors */
function eventTimes(event: string, ms: Moment[], setup: any[], end: number): number[] {
    if (event === 'clap' || event === 'key') {
        return (setup || [])
            .filter((e) => e.event === event && e.at < end)
            .map((e) => e.at)
            .sort((a, b) => a - b);
    }
    const holds =
        event === 'obstacle'
            ? (m: Moment) => !CONDITIONS.no_obstacle.holds(m.sensors, 0)
            : (m: Moment) => (event === 'line_start' ? CONDITIONS.line : CONDITIONS.no_line).holds(m.sensors, 0);
    const times: number[] = [];
    for (let i = 1; i < ms.length; i++) {
        holds(ms[i]) && !holds(ms[i - 1]) && times.push(ms[i].t);
    }
    return times;
}

/**
 * "after": after each event, within within_ms, there is a frame in which the robot does what the check says. An event after which the run
 * ended too soon to tell (it didn't react, and the time wasn't over) is left out.
 */
function reactsAfter(check: any, ms: Moment[], setup: any[]): Verdict {
    const does = DOES[check.does];
    const kind = EVENTS[check.event];
    const end = ms.length ? ms[ms.length - 1].t : 0;
    const within = check.within_ms;
    const missed: number[] = [];
    let slowest = 0;
    let late = 0; // events too close to the end
    const times = eventTimes(check.event, ms, setup, end).filter((t) => {
        const hit = ms.filter((m, i) => i > 0 && m.t > t + 1e-6 && m.t <= t + within + 1e-6 && does.holds(m))[0];
        if (hit) {
            slowest = Math.max(slowest, hit.t - t);
        } else if (t + within > end + 1e-6) {
            late++;
            return false;
        } else {
            missed.push(t);
        }
        return true;
    });
    if (!times.length) {
        const message = late ? 'the run ended less than ' + s(within) + ' s after ' + kind.late : kind.none;
        return { passed: null, t: null, point: null, message: 'not checked: ' + message, factsAt: end };
    }
    if (!missed.length) {
        return {
            passed: true,
            t: null,
            point: null,
            message:
                'the robot ' +
                does.past +
                ' within ' +
                s(slowest) +
                ' s after ' +
                (times.length === 1 ? fill(kind.one, s(times[0])) : kind.every + ' (' + times.length + '×)'),
            factsAt: end,
        };
    }
    const t = missed[0];
    const until = t + within;
    const at = ms.filter((m) => m.t <= until + 1e-6).pop() || ms[0];
    const message =
        'the robot did not ' +
        does.base +
        ' within ' +
        s(within) +
        ' s after ' +
        fill(kind.one, s(t)) +
        (times.length > 1 ? ' (it missed ' + missed.length + ' of ' + times.length + ')' : '');
    return { passed: false, t: Math.round(until * 10) / 10, point: [round2(at.x), round2(at.y)], message: message, factsAt: until };
}

function compare(actual: any, op: string, value: any): boolean {
    const same = JSON.stringify(actual) === JSON.stringify(value);
    switch (op) {
        case 'EQ':
            return same;
        case 'NEQ':
            return !same;
        default:
            if (typeof actual !== 'number' || typeof value !== 'number') {
                return false;
            }
            return op === 'LT' ? actual < value : op === 'LTE' ? actual <= value : op === 'GT' ? actual > value : actual >= value;
    }
}

/** "variable": the value of a global variable at the end, and when it got it (the facts of a failure: around then) */
function variableAtEnd(check: any, rec: PROGRAM.Recorder, variables: { [name: string]: any }, end: number): Verdict {
    const name = check.variable;
    if (!(name in variables)) {
        return { passed: false, t: end, point: null, message: 'the program has no global variable "' + name + '"', factsAt: end };
    }
    const actual = variables[name];
    if (compare(actual, check.op, check.value)) {
        return { passed: true, t: end, point: null, message: name + ' was ' + show(actual) + ' at the end', factsAt: end };
    }
    const changes = rec.globals.filter((c) => c.name === name);
    const last = changes[changes.length - 1];
    const became = changes.length > 1 ? '; it became ' + show(last.value) + ' at ' + s(last.t) + ' s' : '';
    return {
        passed: false,
        t: end,
        point: null,
        message: name + ' was ' + show(actual) + ' at the end (expected ' + name + ' ' + (OPS[check.op] || check.op) + ' ' + show(check.value) + became + ')',
        factsAt: changes.length > 1 ? Math.min(end, last.t + FACTS_AFTER_MS) : end,
    };
}

/**
 * decides a behaviour check or a variable check after the run: `setup` the test's world events (its claps and key presses), `variables` the
 * program's variables at the end, `end` when the run ended (ms)
 */
export function judge(check: any, rec: PROGRAM.Recorder, setup: any[], variables: { [name: string]: any }, end: number): Verdict {
    if (check.check === 'variable') {
        return variableAtEnd(check, rec, variables, end);
    }
    const ms = moments(rec);
    if (check.check === 'after') {
        return reactsAfter(check, ms, setup);
    }
    const condition = CONDITIONS[check.when];
    return holdsWhile(check, ms, check.check === 'does' ? () => true : (m) => condition.holds(m.sensors, check.percent));
}

// ------------------------------------------------------------------------------------------------ motion words for the trace

const MOTIONS = ['drives_forward', 'drives_backward', 'turns_left', 'turns_right', 'stands_still'];

/** gives each window of a trace (nepoTest.simProgram trace, in steps of `step` ms) what the robot did in it: `does`, e.g. [drives_forward, turns_left] */
export function addMotion(trace: any[], ms: Moment[], step = 100): void {
    const windows: { [t: string]: Moment[] } = {};
    ms.slice(1).forEach((m) => {
        const t = Math.ceil(m.t / step - 1e-9) * step;
        (windows[t] = windows[t] || []).push(m);
    });
    for (const w of trace) {
        const frames = windows[w.t] || [];
        const time = frames.reduce((sum, m) => sum + m.dt, 0);
        const average =
            time &&
            Object.assign({}, frames[frames.length - 1], {
                v: frames.reduce((sum, m) => sum + m.v * m.dt, 0) / time,
                w: frames.reduce((sum, m) => sum + m.w * m.dt, 0) / time,
            });
        w.does = average ? MOTIONS.filter((name) => DOES[name].holds(average)) : [];
    }
}
