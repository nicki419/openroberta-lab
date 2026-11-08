// Phase 5, round 4: the Lab's checks of round 4 on given worlds and tests (no model, no run): the tunnels (overlap, bends), the starts, a goal
// after a tunnel's exit, a reaction without arrival. Filled by check_rules.py: CASES = [{id, worlds: <FORMAT.Resolved[]>}].
const CASES = __CASES__;
const FORMAT = require('nepoTest.aiFormat');
const STRATEGY = require('nepoTest.aiStrategy');
const out = [];
for (const c of CASES) {
    const worlds = [];
    for (const w of c.worlds || []) {
        const world = w.data && w.data.world;
        if (!world) {
            continue;
        }
        worlds.push({
            name: w.name,
            world: FORMAT.tunnelProblems(world).concat(FORMAT.startProblems(world)),
            tests: (w.tests || []).map((t) => ({ name: t.name, problems: FORMAT.exitProblems(world, t).concat(STRATEGY.arrivalProblems(t, world)) })),
        });
    }
    out.push({ id: c.id, worlds: worlds });
}
return { results: out, errs: window.__errs };
