// Phase 5, design B: the assistant's tests for a broken program, as a learner would get them. The program is loaded into the Program tab, and
// then exactly what levels.aiAssistant write() does runs: the program and its EdPy, the decisions, the run on a plain floor, analyze (checked,
// repaired), generate (one call per scenario, checked, repaired, duplicates out). Through the Lab: its server, its context pack, its efforts.
// Filled by generate.py: JOB = {name, exportXml, sentence}.
const JOB = __JOB__;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TELEMETRY = require('levels.telemetry');
const STRATEGY = require('nepoTest.aiStrategy');
const AI = require('nepoTest.ai');
const TESTS_C = require('tests.controller');
const ASSISTANT = require('levels.aiAssistant');
require('import.controller').loadProgramFromXML(JOB.name, JOB.exportXml);
await sleep(2500);
const loaded = TESTS_C.aiProgramXml();
if (loaded.indexOf('robProcedures_defnoreturn') < 0) {
    return { error: 'the program did not load' };
}
const t0 = Date.now();
const run = TELEMETRY.attemptSource(null, Date.now()); // a new key: the EdPy of this program
const source = await run.edpy;
const decisions = STRATEGY.indexOf(run.program, TESTS_C.aiBlockLabel);
decisions.floor = await AI.floorRun(TESTS_C.aiProgramXml());
const tests = TESTS_C.aiTests();
const request = { levelId: null, program: { nepo: decisions.nepo, edpy: source.edpy || '' }, tests: tests, said: [], fingerprint: ASSISTANT.fingerprint(run.program) };
const t1 = Date.now();
const analyzed = await AI.analyze(request, JOB.sentence, decisions);
const t2 = Date.now();
let result = null;
if (analyzed.ok && !analyzed.insufficient) {
    result = await AI.generate(request, JOB.sentence, TESTS_C.aiContext(), run.program, { index: decisions, analysis: analyzed.analysis });
}
const t3 = Date.now();
const metas = (analyzed.calls || []).concat((result && result.calls) || []);
return {
    learnerTests: tests.length,
    edpyError: source.error || null,
    floor: decisions.floor || null,
    decisions: STRATEGY.decisionsForLog(decisions),
    nepo: decisions.nepo,
    edpy: source.edpy || '',
    ms: { prepare: t1 - t0, analyze: t2 - t1, generate: t3 - t2, total: t3 - t0 },
    analyze: {
        ok: analyzed.ok,
        insufficient: !!analyzed.insufficient,
        error: analyzed.error || null,
        message: analyzed.message || null,
        repairs: analyzed.repairs,
        problems: (analyzed.problems || []).map(AI.problemText),
        analysis: analyzed.analysis || null,
    },
    generate: result && {
        ok: result.ok,
        error: result.error || null,
        message: result.message || null,
        repairs: result.repairs,
        dropped: (result.dropped || []).map(AI.problemText),
        unresolved: (result.unresolved || []).map(AI.problemText),
        duplicates: (result.duplicates || []).length,
        scenarios: result.scenarios || null, // per scenario's call: tests, dropped, repairs (2026-11-07: was scenarioCalls, which doesn't exist)
        plan: result.plan || null,
        status: result.status || null,
        worlds: result.worlds || [],
    },
    calls: metas.map((m) => ({ effort: m && m.effort, model: m && m.model, tokens: m && m.tokens, latencyMs: m && m.latencyMs, attempts: m && m.attempts })),
    errs: window.__errs,
};
