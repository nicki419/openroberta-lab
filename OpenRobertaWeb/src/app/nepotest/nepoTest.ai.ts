/**
 * The AI test assistant's calls to the Lab server (AiController: /rest/ai/infer, /rest/ai/generate; the browser never talks to DeepSeek). A
 * generated answer is checked before anyone sees it:
 * 1. made whole and checked against the learner's tests and the program (nepoTest.aiFormat checkAnswer);
 * 2. translated, as a suite of its own, by NepoTest's translator in the worker (blocks.py, as the Tests tab does): starts outside the floor or on an
 *    obstacle, and the rest of its rules;
 * 3. if something is wrong, the problems go back to the model with its answer (a repair), at most REPAIRS times; what is still wrong after that is
 *    left out;
 * 4. tests that mean the same as one of the learner's, or as another one of the answer, are left out (nepoTest.aiFormat dropDuplicates).
 * Nothing is added to the Tests tab here: the caller adds what the learner chose (tests.controller addAiTests).
 */
import * as COMM from 'comm';
import * as RUNNER from 'nepoTest.runner';
import * as FORMAT from 'nepoTest.aiFormat';

export const REPAIRS = 2;

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

/** the tests written for an intent, checked; what was left out, and why */
export interface Generated {
    ok: boolean;
    worlds: FORMAT.Resolved[]; // the tests to offer (none if !ok)
    dropped: FORMAT.Problem[]; // the problems of the tests left out after the repairs
    duplicates: { world: string; test: string; same: string }[];
    repairs: number;
    calls: any[]; // the meta of each call (the first, then the repairs)
    answers: any[]; // the model's answers, in their order
    error: string;
    message: string;
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
export async function generate(request: Request, intent: string, sentence: string, ctx: FORMAT.Context, programXml: string): Promise<Generated> {
    const out: Generated = { ok: false, worlds: [], dropped: [], duplicates: [], repairs: 0, calls: [], answers: [], error: null, message: '' };
    const data: any = Object.assign({}, request, { intent: intent, sentence: sentence || null });
    let result = await call('generate', data);
    let checked: { worlds: FORMAT.Resolved[]; problems: FORMAT.Problem[] } = null;
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
        checked = await check(result.answer, ctx, programXml, prefixOf(result.meta, round));
        if (!checked.problems.length || round >= REPAIRS) {
            break;
        }
        out.repairs++;
        result = await call('generate', Object.assign({}, data, { repair: { answer: result.answer, problems: checked.problems.map(problemText) } }));
    }
    const good = FORMAT.without(checked.worlds, checked.problems);
    out.dropped = checked.problems;
    const unique = FORMAT.dropDuplicates(good, ctx.existing);
    out.duplicates = unique.duplicates;
    out.worlds = unique.worlds;
    out.ok = true;
    return out;
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
