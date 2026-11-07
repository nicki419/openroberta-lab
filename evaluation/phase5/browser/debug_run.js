// debugging the judge: one level run's report, the goal and the footprint at the last pose
const level = __LEVEL__;
const xml = __XML__;
const SIM = require('nepoTest.sim');
const SIMRUN = require('nepoTest.simRun');
const AI = require('nepoTest.ai');
const world = level.world;
const goal = world.items.filter((i) => i.role === 'goal')[0];
const test = { name: 'level', start: world.starts[0].id, max_time_ms: 30000, world: [], globals: {}, checks: [{ check: 'never_bumps' }] };
if (!goal.soft) test.until = goal.id;
const data = SIM.parseData(JSON.stringify({ version: SIM.DATA_VERSION, world: world }));
const ran = await AI.runTests([{ name: 'x', existing: false, data: data, tests: [test] }], xml);
const rep = ran[0].report;
const sim = rep.simulation || {};
const last = (sim.path || []).slice(-1)[0];
const fp = last ? SIM.footprint(last[1], last[2], last[3]) : null;
const shape = SIMRUN.shapeOf(goal);
return {
    outcome: rep.outcome,
    keys: Object.keys(rep),
    simKeys: Object.keys(sim),
    result: sim.result,
    t: sim.t,
    item: sim.item,
    bumps: sim.bumps,
    pathLen: (sim.path || []).length,
    last: last,
    footprintCm: fp,
    goalBox: shape.box,
    goalCm: [goal.x, goal.y, goal.w, goal.h],
    checks: rep.checks,
    failures: (rep.failures || []).slice(0, 3),
    message: rep.message,
};
