/**
 * The AI test assistant's calls to the Lab server (AiController: /rest/ai/infer, /rest/ai/analyze, /rest/ai/generate, /rest/ai/fix; the browser never
 * talks to DeepSeek). Writing tests is a chain of two calls (docs/tests: AnalysisAgent, then TestGenerationAgent), each answer checked before the next
 * step uses it:
 * - analyze: the program's decisions (found in its blocks: nepoTest.aiStrategy indexOf), the paths that target their outcomes, the inputs of each path,
 *   the scenarios; checked against the program's decisions and the learner's sentence (nepoTest.aiStrategy checkAnalysis), repaired at most REPAIRS
 *   times; an analysis still wrong after that isn't used.
 * - generate, from the checked analysis: an answer is checked before anyone sees it:
 *   1. made whole and checked against the learner's tests and the program (nepoTest.aiFormat checkAnswer), and against the analysis and the testing
 *      strategy (nepoTest.aiStrategy checkTests: paths, input classes, expected results, postconditions, oracle, a positive check, the coverage of
 *      every outcome and class; no boundaries);
 *   2. translated, as a suite of its own, by NepoTest's translator in the worker (blocks.py, as the Tests tab does): starts outside the floor or on an
 *      obstacle, and the rest of its rules;
 *   3. if something is wrong, the problems go back to the model with its answer (a repair), at most REPAIRS times; tests still wrong after that are
 *      left out;
 *   4. tests that mean the same as one of the learner's, or as another one of the answer, are left out (nepoTest.aiFormat dropDuplicates);
 *   5. the coverage plan is computed from the tests that are left (nepoTest.aiStrategy planOf).
 * The tests the learner chooses run on the Lab's simulator before they are added (runTests, as the Tests tab runs them). For those that failed or
 * weren't checked, the model gets how they ran (resultText) and fixes their inputs, or says the program is wrong, or that a test may expect more than
 * the learner said (fix: checked as above, and a fixed test must expect exactly what it did: nepoTest.aiStrategy frozenProblems).
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
import * as STRATEGY from 'nepoTest.aiStrategy';

export const REPAIRS = 2;
/** a text for the learner that speaks of them instead of to them */
export const SPEAKS_OF_LEARNER = /\bthe learner/i;
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

/** a test the model left as it is (the task fix): it thinks the program is wrong (program_wrong), or that the test may expect too much (doubtful) */
export interface ProgramWrong {
    test: string;
    world: string;
    reason: string; // for the learner
}

/** what the tests are written from: the program's decisions and the checked analysis */
export interface Strategy {
    index: STRATEGY.Index;
    analysis: any;
    maxTests?: number; // one generate call of several: its share of STRATEGY.MAX_TESTS
    only?: string[]; // … and the scenarios it writes (the analysis is their part)
    whole?: any; // … and the whole analysis (the classes a test may name)
}

/** at most so many generate calls at once (the server's AiService.GENERATE_AT_ONCE) */
export const GENERATE_AT_ONCE = 6;

/** one generate call of a scenario: what it wrote, and what went wrong (for the telemetry) */
export interface ScenarioCall {
    scenario: string;
    ok: boolean;
    error: string;
    tests: number; // offered after its checks and repairs
    dropped: number;
    repairs: number;
    calls: number;
    maxTests: number;
}

/** the analysis of the program (the task analyze), checked */
export interface Analyzed {
    ok: boolean;
    analysis: any; // the checked answer (null if !ok)
    insufficient: boolean; // analysis_status insufficient_evidence: nothing to test yet
    problems: FORMAT.Problem[]; // still wrong after the repairs (then ok is false)
    repairs: number;
    calls: any[];
    answers: any[];
    error: string;
    message: string;
}

/** the tests written for an intent (or fixed), checked; what was left out, and why */
export interface Generated {
    ok: boolean;
    worlds: FORMAT.Resolved[]; // the tests to offer (none if !ok)
    programWrong: ProgramWrong[]; // a fix: the tests it left as they are, the program is wrong
    doubtful: ProgramWrong[]; // a fix: the tests it left as they are, they may expect more than the learner said
    dropped: FORMAT.Problem[]; // the problems of the tests left out after the repairs
    unresolved: FORMAT.Problem[]; // the answer's problems still there after the repairs (coverage, count): they leave no test out
    duplicates: { world: string; test: string; same: string }[];
    plan: STRATEGY.Plan; // generate: the coverage plan of the tests that are left (null for a fix)
    status: string; // generate: the answer's generation_status
    warnings: string[]; // generate: the answer's warnings and consolidation_notes
    repairs: number;
    calls: any[]; // the meta of each call (the first, then the repairs)
    answers: any[]; // the model's answers, in their order
    error: string;
    message: string;
    scenarios?: ScenarioCall[]; // generate: one call per scenario
    testedBy?: { id: string; by: string[] }[]; // generate: the scenarios the learner's tests test (no call)
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

/**
 * a call, made once more if its answer couldn't be read (bad_answer: not JSON, or not the shape asked for). Such an answer can't be repaired: there
 * is nothing to send back (2026-11-05: 1 of 3 generate answers at effort none was broken JSON, and the learner got an error)
 *
 * @param calls the meta of the call that couldn't be read is added here (the telemetry's calls), if given
 */
export async function callReadable(kind: string, data: any, calls?: any[]): Promise<Call> {
    const first = await call(kind, data);
    if (first.ok || first.error !== 'bad_answer') {
        return first;
    }
    calls && first.meta && calls.push(first.meta);
    return call(kind, data);
}

/** what is the program meant to do? answer: {intent, confidence, ask, same_as_declined, not_covered} */
export function infer(request: Request, declined: string): Promise<Call> {
    return callReadable('infer', Object.assign({}, request, { declined: declined || null }));
}

/** the program's decisions, the intent and the sentence: what analyze, generate and fix get besides the request */
function strategyData(request: Request, intent: string, sentence: string, index: STRATEGY.Index, analysis: any): any {
    const data: any = Object.assign({}, request, { intent: intent, sentence: sentence || null, decisions: STRATEGY.decisionsForModel(index), sensors: index.sensors || [] });
    analysis && (data.analysis = analysis);
    return data;
}

/**
 * the analysis of the program for the intent (and the learner's sentence): checked against the program's decisions, repaired at most REPAIRS times;
 * not ok if it is still wrong after that
 *
 * @param index the program's decisions (nepoTest.aiStrategy indexOf of the program the request has)
 */
export async function analyze(request: Request, intent: string, sentence: string, index: STRATEGY.Index): Promise<Analyzed> {
    const out: Analyzed = { ok: false, analysis: null, insufficient: false, problems: [], repairs: 0, calls: [], answers: [], error: null, message: '' };
    const data = strategyData(request, intent, sentence, index, null);
    let result = await callReadable('analyze', data, out.calls);
    for (let round = 0; ; round++) {
        result.meta && out.calls.push(result.meta);
        if (!result.ok) {
            out.error = result.error;
            out.message = result.message;
            return out;
        }
        out.answers.push(result.answer);
        out.problems = STRATEGY.checkAnalysis(result.answer, index, sentence, testNames(request.tests));
        if (!out.problems.length) {
            out.ok = true;
            out.analysis = result.answer;
            out.insufficient = result.answer.analysis_status === 'insufficient_evidence';
            return out;
        }
        if (round >= REPAIRS) {
            out.error = 'invalid_analysis';
            out.message = out.problems.length + ' problems after ' + REPAIRS + ' repairs';
            return out;
        }
        out.repairs++;
        result = await callReadable('analyze', Object.assign({}, data, { repair: { answer: result.answer, problems: out.problems.map(problemText) } }), out.calls);
    }
}

/** the names of the learner's tests */
function testNames(tests: FORMAT.AiTests): string[] {
    const names: string[] = [];
    ((tests && tests.worlds) || []).forEach((w) => ((w && w.tests) || []).forEach((t) => t && typeof t.name === 'string' && names.push(t.name)));
    return names;
}

/**
 * scenario tests for the intent (and the learner's sentence, if they wrote one), from the checked analysis: one call per scenario that the learner's
 * tests don't test yet (STRATEGY.scenariosToWrite), at most GENERATE_AT_ONCE at once, each checked against its part of the analysis and repaired
 * on its own, with its share of the tests (at least 2); then merged: worlds with the same name told apart, duplicates across the calls left out,
 * the coverage plan computed for the whole analysis, with the scenarios the learner's tests test deferred as "tested by" them. Not ok only if every
 * call failed. (2026-11-05: one call for all scenarios crammed unrelated ones into one world, repeated the learner's tests, and at effort low ran
 * into the token cap after 3 minutes.)
 *
 * @param ctx what the answer is checked against (tests.controller aiContext)
 * @param programXml the program (for the translator's name checks)
 */
export async function generate(request: Request, intent: string, sentence: string, ctx: FORMAT.Context, programXml: string, strategy: Strategy): Promise<Generated> {
    const todo = STRATEGY.scenariosToWrite(strategy.analysis);
    const data = strategyData(request, intent, sentence, strategy.index, strategy.analysis);
    const maxTests = Math.max(1, Math.floor(STRATEGY.MAX_TESTS / Math.max(1, todo.write.length)));
    const results: Generated[] = new Array(todo.write.length);
    const one = (i: number) => {
        const id = todo.write[i];
        const part: Strategy = { index: strategy.index, analysis: STRATEGY.analysisFor(strategy.analysis, [id]), maxTests: maxTests, only: [id], whole: strategy.analysis };
        return written('generate', Object.assign({}, data, { scenarios: [id], maxTests: maxTests, followsLine: !!strategy.index.lineTracker }), ctx, programXml, null, part, sentence);
    };
    let next = 0;
    const worker = async () => {
        while (next < todo.write.length) {
            const i = next++;
            results[i] = await one(i);
        }
    };
    await Promise.all(Array.from({ length: Math.min(GENERATE_AT_ONCE, todo.write.length) }, worker));
    // refused because too many ran at once (a server that allows fewer, or another page of the session): again, one after the other
    for (let i = 0; i < results.length; i++) {
        if (!results[i].ok && results[i].error === 'busy') {
            const calls = results[i].calls;
            results[i] = await one(i);
            results[i].calls = calls.concat(results[i].calls);
        }
    }
    return merged(results, todo, maxTests, strategy, ctx);
}

/** the answers of generate's calls as one (see generate) */
function merged(results: Generated[], todo: { write: string[]; tested: { id: string; by: string[] }[] }, maxTests: number, strategy: Strategy, ctx: FORMAT.Context): Generated {
    const out: Generated = {
        ok: !results.length || results.some((r) => r.ok),
        worlds: [],
        programWrong: [],
        doubtful: [],
        dropped: [],
        unresolved: [],
        duplicates: [],
        plan: null,
        status: null,
        warnings: [],
        repairs: 0,
        calls: [],
        answers: [],
        error: null,
        message: '',
        scenarios: [],
        testedBy: todo.tested,
    };
    const names: string[] = ctx.existing.worlds.map((w) => w.name);
    const deferredBranches: any[] = [];
    const deferredInputs: any[] = [];
    const deferredScenarios: any[] = [];
    results.forEach((r, i) => {
        out.scenarios.push({
            scenario: todo.write[i],
            ok: r.ok,
            error: r.error,
            tests: r.worlds.reduce((n, w) => n + w.tests.length, 0),
            dropped: r.dropped.length,
            repairs: r.repairs,
            calls: r.calls.length,
            maxTests: maxTests,
        });
        out.calls.push(...r.calls);
        out.answers.push(...r.answers);
        out.repairs += r.repairs;
        if (!r.ok) {
            out.error = out.error || r.error;
            out.message = out.message || r.message;
            return;
        }
        r.worlds.forEach((w) => {
            if (w.existing) {
                out.worlds.push(w); // tests added to one of the learner's worlds keep its name
                return;
            }
            let name = w.name;
            for (let n = 2; names.indexOf(name) >= 0; n++) {
                name = w.name + ' ' + n;
            }
            names.push(name);
            out.worlds.push(name === w.name ? w : Object.assign({}, w, { name: name }));
        });
        out.dropped.push(...r.dropped);
        out.unresolved.push(...r.unresolved);
        out.duplicates.push(...r.duplicates);
        r.warnings.forEach((w) => out.warnings.indexOf(w) < 0 && out.warnings.push(w));
        const last = r.answers[r.answers.length - 1] || {};
        const plan = last.coverage_plan || {};
        deferredBranches.push(...(Array.isArray(plan.deferred_branch_ids) ? plan.deferred_branch_ids : []));
        deferredInputs.push(...(Array.isArray(plan.deferred_inputs) ? plan.deferred_inputs : []));
        deferredScenarios.push(...(Array.isArray(last.deferred_scenarios) ? last.deferred_scenarios : []));
    });
    if (out.ok) {
        out.error = null;
        out.message = '';
    }
    const unique = FORMAT.dropDuplicates(out.worlds, ctx.existing); // across the calls
    out.duplicates.push(...unique.duplicates.filter((d) => !out.duplicates.some((x) => x.world === d.world && x.test === d.test)));
    out.worlds = unique.worlds;
    const planned: string[] = [];
    out.worlds.forEach((w) => w.tests.forEach((t) => (t.planned_branch_ids || []).forEach((b: string) => planned.indexOf(b) < 0 && planned.push(b))));
    const tested = STRATEGY.testedDeferrals(strategy.analysis, todo.tested, planned);
    const answer = {
        coverage_plan: { deferred_branch_ids: deferredBranches.concat(tested.branches), deferred_inputs: deferredInputs },
        deferred_scenarios: deferredScenarios.concat(tested.scenarios),
    };
    out.plan = STRATEGY.planOf(out.worlds, strategy.analysis, strategy.index, answer);
    const tests = out.worlds.reduce((n, w) => n + w.tests.length, 0);
    out.status = tests ? 'ready_for_review' : !todo.write.length || results.every((r) => !r.ok || r.status === 'no_valid_scenarios') ? 'no_valid_scenarios' : 'partial';
    const failed = results.filter((r) => !r.ok);
    if (!tests && failed.length) {
        // no tests, and a scenario's call failed: an error ("Try again"), not "no new tests"
        out.ok = false;
        out.error = failed[0].error;
        out.message = failed.length + ' of ' + results.length + ' calls failed: ' + failed[0].message;
    }
    return out;
}

/**
 * the failed (or unchecked) tests fixed, or left as they are because the program is wrong (programWrong) or they may expect too much (doubtful);
 * checked and repaired as generate's, and a fixed test must expect exactly what it did
 *
 * @param failed the tests that failed or weren't checked, with their runs
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
    label: (block: string) => string,
    strategy: Strategy
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
    const data = Object.assign(strategyData(request, intent, sentence, strategy.index, strategy.analysis), {
        fix: { tests: { worlds: worlds }, results: failed.map((r) => resultText(r, label, strategy.index)), kept: kept },
    });
    return written('fix', data, ctx, programXml, failed, strategy, sentence);
}

/**
 * a call that writes tests (generate, fix), its answer checked, repaired at most REPAIRS times, the rest left out, the duplicates out; generate's
 * coverage plan computed from the tests that are left
 *
 * @param fixing the failed tests and their runs (fix), else null
 */
async function written(kind: string, data: any, ctx: FORMAT.Context, programXml: string, fixing: Ran[], strategy: Strategy, sentence: string): Promise<Generated> {
    const out: Generated = {
        ok: false,
        worlds: [],
        programWrong: [],
        doubtful: [],
        dropped: [],
        unresolved: [],
        duplicates: [],
        plan: null,
        status: null,
        warnings: [],
        repairs: 0,
        calls: [],
        answers: [],
        error: null,
        message: '',
    };
    let result = await callReadable(kind, data, out.calls);
    let checked: { worlds: FORMAT.Resolved[]; problems: FORMAT.Problem[]; programWrong: ProgramWrong[]; doubtful: ProgramWrong[] } = null;
    let answer: any = null;
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
        answer = result.answer;
        out.answers.push(answer);
        checked = await checkWritten(answer, ctx, programXml, prefixOf(result.meta, round), fixing, strategy, sentence);
        if (!checked.problems.length || round >= REPAIRS) {
            break;
        }
        out.repairs++;
        result = await callReadable(kind, Object.assign({}, data, { repair: { answer: result.answer, problems: checked.problems.map(problemText) } }), out.calls);
    }
    const good = FORMAT.without(checked.worlds, checked.problems);
    out.dropped = checked.problems.filter((p) => !STRATEGY.isAnswerWide(p));
    out.unresolved = checked.problems.filter(STRATEGY.isAnswerWide);
    out.programWrong = checked.programWrong;
    out.doubtful = checked.doubtful;
    const unique = FORMAT.dropDuplicates(good, ctx.existing);
    out.duplicates = unique.duplicates;
    out.worlds = unique.worlds;
    if (!fixing) {
        out.plan = STRATEGY.planOf(out.worlds, strategy.analysis, strategy.index, answer);
        out.status = answer && answer.generation_status;
        out.warnings = [].concat(Array.isArray(answer.warnings) ? answer.warnings : [], Array.isArray(answer.consolidation_notes) ? answer.consolidation_notes : []).filter((w) => typeof w === 'string');
    }
    out.ok = true;
    return out;
}

/**
 * an answer of generate or fix checked (check, and the testing strategy: nepoTest.aiStrategy checkTests); a fix's program_wrong and doubtful too:
 * they name failed tests, each once, none of them also fixed; and a fixed test expects what it did (frozenProblems)
 */
async function checkWritten(
    answer: any,
    ctx: FORMAT.Context,
    programXml: string,
    prefix: string,
    fixing: Ran[],
    strategy: Strategy,
    sentence: string
): Promise<{ worlds: FORMAT.Resolved[]; problems: FORMAT.Problem[]; programWrong: ProgramWrong[]; doubtful: ProgramWrong[] }> {
    if (!fixing) {
        const none = answer && answer.generation_status === 'no_valid_scenarios' && Array.isArray(answer.worlds) && !answer.worlds.length;
        const checked = none ? { worlds: [] as FORMAT.Resolved[], problems: [] as FORMAT.Problem[] } : await check(answer, ctx, programXml, prefix);
        const problems = checked.problems.concat(STRATEGY.checkTests(answer, checked.worlds, strategy.analysis, strategy.index, sentence, false, strategy.maxTests, strategy.only, strategy.whole));
        return { worlds: checked.worlds, problems: problems, programWrong: [], doubtful: [] };
    }
    const names = fixing.map((r) => r.test.name);
    const lists: { [key: string]: ProgramWrong[] } = { program_wrong: [], doubtful: [] };
    const problems: FORMAT.Problem[] = [];
    const fixed: string[] = [];
    (answer.worlds || []).forEach((w: any) =>
        ((w && w.tests) || []).forEach((t: any) => {
            const test = String((t && t.name) || '').trim();
            fixed.push(test);
            names.indexOf(test) < 0 && problems.push({ world: String(w.name || ''), test: test, message: 'it is not one of the tests to fix: fix them under their names, and add no new tests' });
        })
    );
    ['program_wrong', 'doubtful'].forEach((key) =>
        (answer[key] || []).forEach((p: any) => {
            const test = String(p.test || '').trim();
            const add = (message: string) => problems.push({ world: String(p.world || ''), test: test, message: key + ': ' + message });
            if (names.indexOf(test) < 0) {
                add('there is no test to fix named "' + test + '"');
            } else if (lists.program_wrong.concat(lists.doubtful).some((x) => x.test === test)) {
                add('the test is named twice');
            } else if (fixed.indexOf(test) >= 0) {
                add('the test is fixed too: either fix it or name it in ' + key);
            } else {
                const reason = String(p.reason || '').trim();
                lists[key].push({ test: test, world: String(p.world || ''), reason: reason });
                SPEAKS_OF_LEARNER.test(reason) && add('the reason speaks of "the learner": write it to them ("you said …", "your program …")'); // repaired; kept if it stays
            }
        })
    );
    if (!fixed.length) {
        return { worlds: [], problems: problems, programWrong: lists.program_wrong, doubtful: lists.doubtful };
    }
    const checked = await check(answer, ctx, programXml, prefix);
    STRATEGY.checkTests(answer, checked.worlds, strategy.analysis, strategy.index, sentence, true).forEach((p) => problems.push(p));
    checked.worlds.forEach((w) =>
        w.tests.forEach((t) => {
            const from = fixing.filter((r) => r.test.name === t.name)[0];
            from && STRATEGY.frozenProblems(t, w, from.test, from.world).forEach((m) => problems.push({ world: w.name, test: t.name, message: m }));
        })
    );
    return { worlds: checked.worlds, problems: checked.problems.concat(problems), programWrong: lists.program_wrong, doubtful: lists.doubtful };
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
 * how a test ran, for the model (the task fix): the end of the run, the start, where the robot was over time, which planned outcomes of the
 * program's decisions it took, each check with what happened, why a failed one failed and the facts of the second before it, a runtime error; a
 * test that passed but wasn't checked says why
 *
 * @param index the program's decisions (for the planned outcomes), or null
 */
export function resultText(ran: Ran, label: (block: string) => string, index?: STRATEGY.Index): string {
    const report = ran.report || {};
    const world = ran.world.data.world;
    const unchecked = index ? STRATEGY.notCheckedWhy(report, ran.test, index) : [];
    const outcome = report.outcome === 'error' ? 'it could not run' : unchecked.length ? 'not checked (its checks passed, but ' + unchecked.map((u) => u.text).join('; ') + ')' : report.outcome;
    const lines: string[] = ['test "' + ran.test.name + '" (world "' + ran.world.name + '"): ' + outcome];
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
    const planned = index ? STRATEGY.plannedText(report, ran.test, index) : null;
    planned && lines.push('Planned outcomes of the decisions: ' + planned + '.');
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
