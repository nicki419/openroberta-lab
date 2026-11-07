// Phase 5: generated tests run on a version of the program (nepoTest.ai runTests, as the assistant's check run). Filled by evaluate.py:
// JOBS = [{key, worlds: <FORMAT.Resolved[]>, xml: <block_set XML>}].
const JOBS = __JOBS__;
const AI = require('nepoTest.ai');
const out = [];
for (const job of JOBS) {
    try {
        const ran = await AI.runTests(job.worlds, job.xml);
        out.push({
            key: job.key,
            tests: ran.map((r) => ({
                world: r.world.name,
                test: r.test.name,
                outcome: r.report ? r.report.outcome : 'error',
                failed: AI.failuresOf(r).map((f) => String(f.text).substring(0, 240)),
            })),
        });
    } catch (e) {
        out.push({ key: job.key, error: String((e && e.stack) || e).substring(0, 600) });
    }
}
return { results: out, errs: window.__errs };
