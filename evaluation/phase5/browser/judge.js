// Phase 5: plays programs on levels, headless, and decides each attempt as the level player does (levels.player referee): a fail area loses
// (fail_area), bumping into an obstacle or wall that loses on a hit loses (fail_hit), a goal area wins (win), a soft goal area wins once the robot
// stands still on it long enough (win_soft), the time limit loses (time_limit); a level without a limit is played for MAX_MS (no_result).
// The run is the Tests tab's (nepoTest.ai runTests on nepoTest.simRun); the outcome is decided from its path and its bumps. Filled by judge.py:
// JOBS = [{key, level: <level JSON>, xml: <block_set XML>}].
const JOBS = __JOBS__;
const MAX_MS = __MAX_MS__;
const SIM = require('nepoTest.sim');
const SIMRUN = require('nepoTest.simRun');
const AI = require('nepoTest.ai');
const STILL_CM = 0.3;
const STILL_DEG = 1;
const DEFAULT_STILL_S = 3;

function areas(world, role) {
    return world.items.filter((i) => i.role === role && i.kind !== 'line').map((i) => ({ item: i, shape: SIMRUN.shapeOf(i) }));
}

function touching(list, x, y, h) {
    const poly = SIM.footprint(x, y, h).map((p) => [SIM.BORDER + p[0] * SIM.UNITS_PER_CM, SIM.BORDER + p[1] * SIM.UNITS_PER_CM]); // as nepoTest.simRun u()
    const box = SIMRUN.bbox(poly);
    return list.filter((a) => SIMRUN.touches(a.shape, poly, box));
}

async function judge(job) {
    const level = job.level;
    const world = level.world;
    const limit = level.timeLimit > 0 ? level.timeLimit * 1000 : MAX_MS;
    const goals = areas(world, 'goal');
    const hard = goals.filter((a) => !a.item.soft);
    const test = { name: 'level', start: world.starts[0].id, max_time_ms: limit, world: [], globals: {}, checks: [{ check: 'never_bumps' }] };
    if (hard.length === 1 && !goals.some((a) => a.item.soft)) {
        test.until = hard[0].item.id; // the run ends at the goal
    }
    const data = SIM.parseData(JSON.stringify({ version: SIM.DATA_VERSION, world: world }));
    const t0 = Date.now();
    const ran = await AI.runTests([{ name: level.title, existing: false, data: data, tests: [test] }], job.xml);
    const rep = ran[0].report;
    const sim = rep.simulation || {};
    const path = sim.path || [];
    const end = sim.t || limit;
    // the first bump into something that loses on a hit (every obstacle and tunnel of these levels does)
    const bump = (rep.checks || []).filter((c) => c.check === 'never_bumps' && c.passed === false)[0];
    const bumpT = bump ? bump.t : Infinity;
    const fails = areas(world, 'fail');
    let outcome = null;
    let at = null;
    let still = null;
    for (let i = 0; i < path.length && !outcome; i++) {
        const [t, x, y, h] = path[i];
        if (t > bumpT) {
            break;
        }
        if (touching(fails, x, y, h).length) {
            outcome = 'fail_area';
            at = t;
            break;
        }
        const on = touching(goals, x, y, h);
        if (on.some((a) => !a.item.soft)) {
            outcome = 'win';
            at = t;
            break;
        }
        const soft = on.filter((a) => a.item.soft);
        if (soft.length) {
            const need = Math.min(...soft.map((a) => a.item.soft.still || DEFAULT_STILL_S)) * 1000;
            const turned = still ? Math.abs((((h - still.h) % 360) + 540) % 360 - 180) : Infinity;
            if (!still || Math.hypot(x - still.x, y - still.y) > STILL_CM || turned > STILL_DEG) {
                still = { x: x, y: y, h: h, since: t, need: need };
            }
            const next = i + 1 < path.length ? path[i + 1][0] : end; // no new pose until then: it stood (almost) still
            if (Math.min(next, bumpT) - still.since >= need) {
                outcome = 'win_soft';
                at = still.since + need;
            }
        } else {
            still = null;
        }
    }
    if (!outcome && bumpT < Infinity) {
        outcome = 'fail_hit';
        at = bumpT;
    }
    if (!outcome) {
        outcome = level.timeLimit > 0 ? 'time_limit' : rep.outcome === 'error' ? 'error' : 'no_result';
        at = end;
    }
    return {
        key: job.key,
        level: level.title,
        outcome: outcome,
        won: outcome === 'win' || outcome === 'win_soft',
        at_s: Math.round((at || 0) / 100) / 10,
        ran_s: Math.round(end / 100) / 10,
        last: path.length ? path[path.length - 1] : null,
        error: rep.outcome === 'error' ? rep.message || rep.error : null,
        ms: Date.now() - t0,
    };
}

const out = [];
for (const job of JOBS) {
    try {
        out.push(await judge(job));
    } catch (e) {
        out.push({ key: job.key, level: job.level.title, outcome: 'error', won: false, error: String((e && e.stack) || e) });
    }
}
return { results: out, errs: window.__errs };
