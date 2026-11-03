/**
 * The AI test assistant's calls to the Lab server (AiController: /rest/ai/infer, /rest/ai/generate, /rest/ai/fix; the browser never talks to
 * DeepSeek). A generated answer is checked before anyone sees it:
 * 1. made whole and checked against the learner's tests and the program (nepoTest.aiFormat checkAnswer);
 * 2. translated, as a suite of its own, by NepoTest's translator in the worker (blocks.py, as the Tests tab does): starts outside the floor or on an
 *    obstacle, and the rest of its rules;
 * 3. if something is wrong, the problems go back to the model with its answer (a repair), at most REPAIRS times; what is still wrong after that is
 *    left out;
 * 4. tests that mean the same as one of the learner's, or as another one of the answer, are left out (nepoTest.aiFormat dropDuplicates).
 * The tests the learner chooses run on the Lab's simulator before they are added (runTests, as the Tests tab runs them). For those that failed, the
 * model gets how they ran (resultText) and fixes them, or says the program is wrong (fix: checked as above).
 * Nothing is added to the Tests tab here: the caller adds what the learner chose (tests.controller addAiTests).
 */
import * as COMM from 'comm';
import * as RUNNER from 'nepoTest.runner';
import * as FORMAT from 'nepoTest.aiFormat';
import * as SIM from 'nepoTest.sim';
import * as SIMRUN from 'nepoTest.simRun';
import * as PROGRAM from 'nepoTest.simProgram';
import * as VERDICT from 'nepoTest.simVerdict';
import * as BLOCKS from 'nepoTest.blocks';

export const REPAIRS = 2;
const PATH_POINTS = 12; // where the robot was, for the model: at most this many times

/** what a call needs to know, besides its task (see OpenRobertaServer …/ai/AiPrompts). Nothing of the level: the model never gets it. */
export interface Request {
    levelId: string; // the level played: only logged, with the call
    program: { nepo: string; edpy: string };
    tests: FORMAT.AiTests; // the learner's tests (FORMAT.suiteToJson)
    said: string[]; // the learner's earlier sentences about the program
    fingerprint: string;
}

/** a call's result: the answer (checked by the server for its shape), or why there is none */
export interface Call {
    ok: boolean;
    answer: any;
    meta: any; // callId, model, promptVersion, latencyMs, attempts, tokens
    error: string; // the server's code: timeout, limit, busy, not_configured, bad_answer, … ; 'network' if the server didn't answer
    message: string;
}

/** a test the model left as it is (the task fix): it thinks the program is wrong */
export interface ProgramWrong {
    test: string;
    world: string;
    reason: string; // for the learner
}

/** the tests written for an intent (or fixed), checked; what was left out, and why */
export interface Generated {
    ok: boolean;
    worlds: FORMAT.Resolved[]; // the tests to offer (none if !ok)
    programWrong: ProgramWrong[]; // a fix: the failed tests it left as they are
    dropped: FORMAT.Problem[]; // the problems of the tests left out after the repairs
    duplicates: { world: string; test: string; same: string }[];
    repairs: number;
    calls: any[]; // the meta of each call (the first, then the repairs)
    answers: any[]; // the model's answers, in their order
    error: string;
    message: string;
}

/** a test of an answer and how it ran on the Lab's simulator (nepoTest.simRun's report; outcome passed, failed or error) */
export interface Ran {
    world: FORMAT.Resolved;
    test: FORMAT.AiTest;
    report: any;
}

/** POST /rest/ai/<kind> */
export function call(kind: string, data: any): Promise<Call> {
    return new Promise(function (resolve) {
        const request: any = COMM.json(
            '/ai/' + kind,
            data,
            function (result: any) {
                resolve({
                    ok: result.rc === 'ok',
                    answer: result.answer || null,
                    meta: result.meta || null,
                    error: result.rc === 'ok' ? null : result.aiError || 'server_error',
                    message: result.aiMessage || result.message || '',
                });
            },
            'AI ' + kind
        );
        request && request.fail && request.fail(() => resolve({ ok: false, answer: null, meta: null, error: 'network', message: 'the Lab server did not answer' }));
    });
}

/** what is the program meant to do? answer: {intent, confidence, ask, same_as_declined, not_covered} */
export function infer(request: Request, declined: string): Promise<Call> {
    return call('infer', Object.assign({}, request, { declined: declined || null }));
}

/**
 * scenario tests for the intent (and the learner's sentence, if they wrote one), checked and repaired
 *
 * @param ctx what the answer is checked against (tests.controller aiContext)
 * @param programXml the program (for the translator's name checks)
 */
export function generate(request: Request, intent: string, sentence: string, ctx: FORMAT.Context, programXml: string): Promise<Generated> {
    return written('generate', Object.assign({}, request, { intent: intent, sentence: sentence || null }), ctx, programXml, null);
}

/**
 * the failed tests fixed, or left as they are because the program is wrong (programWrong); checked and repaired as generate's
 *
 * @param failed the tests that failed, with their runs
 * @param kept the tests of the answer that passed (and those the learner keeps anyway)
 * @param ctx what the answer is checked against: the learner's tests, and the worlds of the answer as existing worlds (the fixed tests may keep
 *        theirs: base "existing"), with the tests kept in them
 * @param label the label of a block of the program (for the blocks of the runs: "[curve forward 40 10]")
 */
export function fix(
    request: Request,
    intent: string,
    sentence: string,
    failed: Ran[],
    kept: { test: string; world: string }[],
    ctx: FORMAT.Context,
    programXml: string,
    label: (block: string) => string
): Promise<Generated> {
    const worlds: FORMAT.AiWorld[] = [];
    failed.forEach((r) => {
        let w = worlds.filter((x) => x.name === r.world.name)[0];
        if (!w) {
            w = { name: r.world.name, world: r.world.data.world, tests: [] };
            worlds.push(w);
        }
        w.tests.push(r.test);
    });
    const data = Object.assign({}, request, {
        intent: intent,
        sentence: sentence || null,
        fix: { tests: { worlds: worlds }, results: failed.map((r) => resultText(r, label)), kept: kept },
    });
    return written('fix', data, ctx, programXml, failed.map((r) => r.test.name));
}

/**
 * a call that writes tests (generate, fix), its answer checked, repaired at most REPAIRS times, the rest left out, the duplicates out
 *
 * @param fixing the names of the failed tests (fix), else null
 */
async function written(kind: string, data: any, ctx: FORMAT.Context, programXml: string, fixing: string[]): Promise<Generated> {
    const out: Generated = { ok: false, worlds: [], programWrong: [], dropped: [], duplicates: [], repairs: 0, calls: [], answers: [], error: null, message: '' };
    let result = await call(kind, data);
    let checked: { worlds: FORMAT.Resolved[]; problems: FORMAT.Problem[]; programWrong: ProgramWrong[] } = null;
    for (let round = 0; ; round++) {
        result.meta && out.calls.push(result.meta);
        if (!result.ok) {
            if (!checked) {
                out.error = result.error;
                out.message = result.message;
                return out;
            }
            break; // a repair failed: the last answer, without what is wrong in it
        }
        out.answers.push(result.answer);
        checked = await checkWritten(result.answer, ctx, programXml, prefixOf(result.meta, round), fixing);
        if (!checked.problems.length || round >= REPAIRS) {
            break;
        }
        out.repairs++;
        result = await call(kind, Object.assign({}, data, { repair: { answer: result.answer, problems: checked.problems.map(problemText) } }));
    }
    const good = FORMAT.without(checked.worlds, checked.problems);
    out.dropped = checked.problems;
    out.programWrong = checked.programWrong;
    const unique = FORMAT.dropDuplicates(good, ctx.existing);
    out.duplicates = unique.duplicates;
    out.worlds = unique.worlds;
    out.ok = true;
    return out;
}

/** an answer of generate or fix checked (check); a fix's program_wrong too: it names failed tests, each once, none of them also fixed */
async function checkWritten(
    answer: any,
    ctx: FORMAT.Context,
    programXml: string,
    prefix: string,
    fixing: string[]
): Promise<{ worlds: FORMAT.Resolved[]; problems: FORMAT.Problem[]; programWrong: ProgramWrong[] }> {
    if (!fixing) {
        return Object.assign(await check(answer, ctx, programXml, prefix), { programWrong: [] });
    }
    const wrong: ProgramWrong[] = [];
    const problems: FORMAT.Problem[] = [];
    const fixed: string[] = [];
    (answer.worlds || []).forEach((w: any) =>
        ((w && w.tests) || []).forEach((t: any) => {
            const test = String((t && t.name) || '').trim();
            fixed.push(test);
            fixing.indexOf(test) < 0 && problems.push({ world: String(w.name || ''), test: test, message: 'it is not one of the failed tests: fix them under their names, and add no new tests' });
        })
    );
    (answer.program_wrong || []).forEach((p: any) => {
        const test = String(p.test || '').trim();
        const add = (message: string) => problems.push({ world: String(p.world || ''), test: test, message: 'program_wrong: ' + message });
        if (fixing.indexOf(test) < 0) {
            add('there is no failed test "' + test + '"');
        } else if (wrong.some((x) => x.test === test)) {
            add('the test is named twice');
        } else if (fixed.indexOf(test) >= 0) {
            add('the test is fixed too: either fix it or name it in program_wrong');
        } else {
            wrong.push({ test: test, world: String(p.world || ''), reason: String(p.reason || '').trim() });
        }
    });
    if (!fixed.length) {
        return { worlds: [], problems: problems, programWrong: wrong };
    }
    const checked = await check(answer, ctx, programXml, prefix);
    return { worlds: checked.worlds, problems: checked.problems.concat(problems), programWrong: wrong };
}

/** an answer's problems: those of its format, then those NepoTest's translator finds in its tests (errors only) */
export async function check(answer: any, ctx: FORMAT.Context, programXml: string, prefix: string): Promise<{ worlds: FORMAT.Resolved[]; problems: FORMAT.Problem[] }> {
    const checked = FORMAT.checkAnswer(answer, ctx);
    const translatable = FORMAT.without(checked.worlds, checked.problems);
    if (!translatable.length) {
        return checked;
    }
    try {
        const translated = await RUNNER.translate(FORMAT.suiteXml(translatable, prefix), programXml);
        for (const p of translated.problems || []) {
            if (p.severity !== 'error') {
                continue;
            }
            const where = placeOf(p.block_id, prefix, translatable);
            checked.problems.push({ world: where.world, test: where.test, message: String(p.message).replace(/^test "[^"]*": /, '') });
        }
    } catch (e) {
        console.warn('the AI tests could not be translated: only their format was checked', e);
    }
    return checked;
}

/** the world and test of a block of FORMAT.suiteXml (its id: prefix-world[-test[-part]]) */
function placeOf(blockId: string, prefix: string, worlds: FORMAT.Resolved[]): { world: string; test: string } {
    const parts = String(blockId || '').startsWith(prefix + '-') ? blockId.substring(prefix.length + 1).split('-') : [];
    const world = worlds[Number(parts[0]) - 1];
    const test = world && parts.length > 1 && parts[1] !== 'run' ? world.tests[Number(parts[1]) - 1] : null;
    return { world: world ? world.name : '', test: test ? test.name : null };
}

/** a problem as the model reads it */
export function problemText(p: FORMAT.Problem): string {
    return (p.test ? 'test "' + p.test + '"' : p.world ? 'world "' + p.world + '"' : 'the answer') + (p.test && p.world ? ' (world "' + p.world + '")' : '') + ': ' + p.message;
}

/** the ids of the blocks of a call's tests: "ai" and the call's id (short) */
export function prefixOf(meta: any, round: number): string {
    const id = meta && meta.callId ? String(meta.callId).replace(/[^a-z0-9]/gi, '').substring(0, 8) : Date.now().toString(36);
    return 'ai' + id + (round ? 'r' + round : '');
}

// ------------------------------------------------------------------------------------------------ running the tests

/**
 * runs the tests of an answer on the Lab's simulator, one after the other, for the program of the Program tab: translated by NepoTest's translator,
 * then run by nepoTest.simRun, as the Tests tab runs them. A test the translator leaves out, or the runner can't run, gets a report with outcome
 * "error". Rejected with "cancelled" once options.cancelled() is true.
 *
 * @param onTest before each test: its number (from 0), how many there are, the test
 */
export async function runTests(
    worlds: FORMAT.Resolved[],
    programXml: string,
    options: { cancelled?: () => boolean; onTest?: (index: number, count: number, test: FORMAT.AiTest) => void } = {}
): Promise<Ran[]> {
    const prefix = 'airun';
    const translated = await RUNNER.translate(FORMAT.suiteXml(worlds, prefix), programXml);
    const specs: any[] = (translated.spec && translated.spec.tests) || [];
    const all: { world: FORMAT.Resolved; test: FORMAT.AiTest; id: string }[] = [];
    worlds.forEach((w, i) => w.tests.forEach((t, j) => all.push({ world: w, test: t, id: prefix + '-' + (i + 1) + '-' + (j + 1) })));
    const out: Ran[] = [];
    for (let i = 0; i < all.length; i++) {
        if (options.cancelled && options.cancelled()) {
            throw new Error('cancelled');
        }
        const one = all[i];
        options.onTest && options.onTest(i, all.length, one.test);
        const spec = specs.filter((s) => s.block_id === one.id)[0];
        let report: any;
        if (!spec) {
            const problem = (translated.problems || []).filter((p: any) => p.severity === 'error' && String(p.block_id || '').indexOf(one.id) === 0)[0];
            report = errorReport(one.test, problem ? String(problem.message) : 'the test could not be translated');
        } else {
            report = await SIMRUN.runTest(spec, programXml, { cancelled: options.cancelled }).then(null, function (e) {
                if (e.message === 'cancelled') {
                    throw e;
                }
                return errorReport(one.test, e.message);
            });
        }
        out.push({ world: one.world, test: one.test, report: report });
    }
    return out;
}

function errorReport(test: FORMAT.AiTest, message: string): any {
    return { name: test.name, outcome: 'error', failures: [], error: { kind: 'test_error', message: message } };
}

/** did the test pass? */
export function passed(ran: Ran): boolean {
    return !!ran.report && ran.report.outcome === 'passed';
}

/** the failed checks of a run, each with why (if there is a why): for the learner */
export function failuresOf(ran: Ran): { text: string; why: VERDICT.Explanation }[] {
    const report = ran.report || {};
    const out: { text: string; why: VERDICT.Explanation }[] = [];
    if (report.error) {
        out.push({ text: report.error.kind === 'runtime_error' ? 'the program failed: ' + report.error.message : report.error.message, why: null });
    }
    (report.checks || []).filter((c: any) => c.passed === false).forEach((c: any) => out.push({ text: c.message || c.text, why: c.why || null }));
    return out;
}

/** words and blocks as text: a block as "[its label]" */
export function partsText(parts: PROGRAM.Part[], label: (block: string) => string): string {
    return parts.map((p) => (typeof p === 'string' ? p : '[' + label(p.block) + ']')).join('');
}

/**
 * how a test ran, for the model (the task fix): the end of the run, the start, where the robot was over time, each check with what happened, why a
 * failed one failed and the facts of the second before it, a runtime error
 */
export function resultText(ran: Ran, label: (block: string) => string): string {
    const report = ran.report || {};
    const world = ran.world.data.world;
    const lines: string[] = ['test "' + ran.test.name + '" (world "' + ran.world.name + '"): ' + (report.outcome === 'error' ? 'it could not run' : report.outcome)];
    const sim = report.simulation;
    const s = (ms: number) => (Math.round(ms / 100) / 10).toFixed(1).replace(/\.0$/, '') + ' s';
    const pose = (x: number, y: number, h: number) => '(' + Math.round(x) + ', ' + Math.round(y) + ') facing ' + Math.round(h) + '°';
    const name = (id: string) => {
        const item = world.items.filter((i) => i.id === id)[0];
        return item ? SIM.quotedName(world, item, BLOCKS.kindWord) + ' (' + id + ')' : id;
    };
    if (sim) {
        const ended: { [result: string]: string } = {
            finished: 'the program ended',
            until: 'the robot touched ' + (ran.test.until ? name(ran.test.until) : 'the area of until'),
            time_limit: 'the time was up (max_time_ms ' + ran.test.max_time_ms + ')',
            error: 'the program failed',
        };
        lines.push('The run ended after ' + s(sim.t) + ': ' + (ended[sim.result] || sim.result) + '.');
        const path: number[][] = sim.path || [];
        const start = sim.start || (path[0] ? path[0].slice(1) : null);
        const last = path[path.length - 1];
        if (start && last) {
            let distance = 0;
            path.forEach((p, i) => i && (distance += Math.hypot(p[1] - path[i - 1][1], p[2] - path[i - 1][2])));
            lines.push('The robot started at ' + pose(start[0], start[1], start[2]) + ' and ended at ' + pose(last[1], last[2], last[3]) + ', after ' + Math.round(distance) + ' cm.');
            const step = Math.max(1000, Math.ceil(sim.t / PATH_POINTS / 1000) * 1000);
            const at: { from: number; to: number; pose: string }[] = []; // one entry while it stays at the same place
            for (let t = 0; t <= sim.t; t += step) {
                const p = path.filter((q) => q[0] <= t).pop() || path[0];
                const here = pose(p[1], p[2], p[3]);
                const last = at[at.length - 1];
                last && last.pose === here ? (last.to = t) : at.push({ from: t, to: t, pose: here });
            }
            lines.push('Where it was: ' + at.map((a) => (a.from === a.to ? s(a.from) : s(a.from) + ' to ' + s(a.to)) + ' ' + a.pose).join('; ') + '.');
        }
        sim.bumps && lines.push('It bumped into something in ' + sim.bumps + ' frames (1/60 s each).');
    }
    if (report.error) {
        const where = report.error.block_id ? ' in [' + label(report.error.block_id) + ']' : '';
        lines.push((report.error.kind === 'runtime_error' ? 'The program failed' + where + ': ' : 'It could not run: ') + report.error.message);
    }
    if ((report.checks || []).length) {
        lines.push('Checks:');
        for (const c of report.checks) {
            const verdict = c.passed === true ? 'passed' : c.passed === false ? 'failed' : 'not checked';
            const what = c.message && c.text && c.message !== c.text ? c.text + ': ' + c.message : c.message || c.text;
            lines.push('- ' + verdict + ': ' + what);
            if (c.passed === false && c.why) {
                lines.push('  why (' + (VERDICT.TITLES[c.why.kind] || c.why.kind) + '): ' + partsText(c.why.parts, label));
            }
            if (c.passed === false && c.facts) {
                const facts = PROGRAM.factLines(c.facts, name)
                    .map((l) => l.label + ': ' + partsText(l.parts, label))
                    .join('. ');
                lines.push('  from ' + s(c.facts.from) + ' to ' + s(c.facts.to) + ': ' + facts + '.');
            }
        }
    }
    return lines.join('\n');
}
