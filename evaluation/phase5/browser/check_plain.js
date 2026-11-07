// Phase 5, the plain pipeline: an answer checked as generate's format is checked (nepoTest.ai check: the format, then NepoTest's translator),
// without the testing strategy's checks. Filled by baseline.py: JOB = {answer, xml}.
const JOB = __JOB__;
const AI = require('nepoTest.ai');
const FORMAT = require('nepoTest.aiFormat');
const ctx = { existing: { worlds: [] }, variables: [], names: [] };
const checked = await AI.check(JOB.answer, ctx, JOB.xml, 'aiplain');
const good = FORMAT.without(checked.worlds, checked.problems);
const unique = FORMAT.dropDuplicates(good, ctx.existing);
return { problems: checked.problems.map(AI.problemText), worlds: unique.worlds, duplicates: unique.duplicates.length, errs: window.__errs };
