"""Declarative tests for NEPO programs (JSON), and their runner. Made for learners' test editors and AI test generators:
a test file is data, can be validated before it runs (validate_spec, schema/nepo-tests.schema.json), and never executes
code of its own. See docs/ai/nepo-unit-testing.md for the full reference.

    {"format": "nepotest", "version": 1, "program": "clap_counter.xml", "bundle": "clap_counter.bundle.json",
     "tests": [
       {"name": "speed is clamped", "call": "clampSpeed", "args": [150], "expect": {"returns": 100}},
       {"name": "three claps", "world": [{"event": "clap", "at": 1000}, ...], "max_time_ms": 10000,
        "expect": {"status": "finished", "variables": {"claps": 3},
                   "actions": [{"block": "robActions_motorDiff_on_for", "power": 100, "distance_cm": 10}]}}]}
"""

import json
import os

from .world import EVENTS, World

EXPECT_KEYS = ('returns', 'status', 'finished_within_ms', 'variables', 'actions', 'actions_exactly', 'no_actions',
               'action_count', 'calls', 'error', 'covers')
TEST_KEYS = ('name', 'description', 'call', 'args', 'globals', 'world', 'max_time_ms', 'max_steps', 'expect', 'origin', 'block_id')
STATUS_VALUES = ('finished', 'running', 'time_limit', 'step_limit')


# ---------------------------------------------------------------------- validation

def validate_spec(spec, subject=None):
    """[problem] for a test file (dict); empty if it's valid. With a subject, function and variable names are checked too."""
    problems = []
    if not isinstance(spec, dict) or spec.get('format') != 'nepotest':
        return ['not a nepotest file: "format" must be "nepotest"']
    if not isinstance(spec.get('tests'), list) or not spec['tests']:
        problems.append('"tests" must be a non-empty list')
        return problems
    names = set()
    for i, test in enumerate(spec['tests']):
        where = 'tests[%d]' % i
        if not isinstance(test, dict):
            problems.append('%s must be an object' % where)
            continue
        for key in test:
            if key not in TEST_KEYS:
                problems.append('%s: unknown key %r' % (where, key))
        name = test.get('name')
        if not isinstance(name, str) or not name:
            problems.append('%s: "name" is required' % where)
        elif name in names:
            problems.append('%s: duplicate name %r' % (where, name))
        names.add(name)
        expect = test.get('expect')
        if not isinstance(expect, dict) or not expect:
            problems.append('%s: "expect" must be a non-empty object' % where)
            expect = {}
        for key in expect:
            if key not in EXPECT_KEYS:
                problems.append('%s.expect: unknown key %r (known: %s)' % (where, key, ', '.join(EXPECT_KEYS)))
        is_call = 'call' in test
        if is_call and 'status' in expect:
            problems.append('%s.expect.status only applies to program runs, not to calls' % where)
        if not is_call and ('returns' in expect or 'args' in test or 'globals' in test):
            problems.append('%s: "returns", "args" and "globals" need "call"' % where)
        if expect.get('status') is not None and expect['status'] not in STATUS_VALUES:
            problems.append('%s.expect.status must be one of %s' % (where, ', '.join(STATUS_VALUES)))
        try:
            World(test.get('world') or [])
        except (ValueError, TypeError, AttributeError) as e:
            problems.append('%s.world: %s (events: %s)' % (where, e, ', '.join(EVENTS)))
        if subject is not None:
            if is_call and test['call'] not in subject.nepo.functions:
                problems.append('%s: the program has no function %r (it has: %s)' % (where, test['call'], ', '.join(subject.nepo.functions) or 'none'))
            elif is_call and len(test.get('args', [])) != len(subject.nepo.functions[test['call']].params):
                problems.append('%s: %s takes %d arguments' % (where, test['call'], len(subject.nepo.functions[test['call']].params)))
            declared = set(v.name for v in subject.nepo.variables)
            for var in list((test.get('globals') or {})) + list((expect.get('variables') or {})):
                if var not in declared:
                    problems.append('%s: the program has no variable %r (it has: %s)' % (where, var, ', '.join(sorted(declared)) or 'none'))
    return problems


# ---------------------------------------------------------------------- matching

def _value_matches(expected, actual):
    if isinstance(expected, dict) and 'not' in expected:
        return not _value_matches(expected['not'], actual)
    if isinstance(expected, dict) and ('min' in expected or 'max' in expected):
        return isinstance(actual, (int, float)) and not isinstance(actual, bool) and \
            expected.get('min', actual) <= actual <= expected.get('max', actual)
    if isinstance(expected, dict) and 'approx' in expected:
        return isinstance(actual, (int, float)) and abs(actual - expected['approx']) <= expected.get('tol', 1e-6)
    if isinstance(expected, bool) or isinstance(actual, bool):
        return expected is actual or (isinstance(expected, bool) and isinstance(actual, bool) and expected == actual)
    if isinstance(expected, (int, float)) and isinstance(actual, (int, float)):
        return abs(expected - actual) < 1e-9
    return expected == actual


def matches(matcher, item):
    return all(k in item and _value_matches(v, item[k]) for k, v in matcher.items())


def _in_order(matchers, items):
    """index of the first matcher that can't be found (in order, gaps allowed), or None"""
    pos = 0
    for i, m in enumerate(matchers):
        while pos < len(items) and not matches(m, items[pos]):
            pos += 1
        if pos == len(items):
            return i
        pos += 1
    return None


def _compact(items, limit=12):
    shown = [dict((k, v) for k, v in a.items() if k not in ('block_id',)) for a in items[:limit]]
    return shown + (['... %d more' % (len(items) - limit)] if len(items) > limit else [])


def check_expectations(expect, test, result, is_call):
    failures = []

    def fail(key, expected, actual, message=None):
        failures.append({'expect': key, 'expected': expected, 'actual': actual, 'message': message})

    error_expected = expect.get('error')
    if result.error is not None:
        e = result.error.to_json()
        if error_expected is None:
            fail('error', None, e, 'the program failed: %s' % result.error)
        elif error_expected == 'any':
            pass
        elif isinstance(error_expected, str) and error_expected != e['kind']:
            fail('error', error_expected, e)
        elif isinstance(error_expected, dict) and not matches(error_expected, e):
            fail('error', error_expected, e)
    elif error_expected is not None:
        fail('error', error_expected, None, 'the program did not fail')
    if 'returns' in expect and result.error is None and not _value_matches(expect['returns'], result._returned):
        fail('returns', expect['returns'], result._returned)
    if not is_call:
        status = expect.get('status')
        if status == 'running' and not result.running:
            fail('status', 'running', result.status)
        elif status in ('finished', 'time_limit', 'step_limit') and result.status != status:
            fail('status', status, result.status)
        if 'finished_within_ms' in expect and not (result.finished and result.time_ms <= expect['finished_within_ms']):
            fail('finished_within_ms', expect['finished_within_ms'], {'status': result.status, 'time_ms': result.time_ms})
    for name, value in (expect.get('variables') or {}).items():
        if name not in result.variables or not _value_matches(value, result.variables[name]):
            fail('variables.%s' % name, value, result.variables.get(name))
    if 'actions' in expect:
        missing = _in_order(expect['actions'], result.actions)
        if missing is not None:
            fail('actions[%d]' % missing, expect['actions'][missing], _compact(result.actions),
                 'not found in this order among the actions')
    if 'actions_exactly' in expect:
        exp = expect['actions_exactly']
        if len(exp) != len(result.actions) or not all(matches(m, a) for m, a in zip(exp, result.actions)):
            fail('actions_exactly', exp, _compact(result.actions, 40))
    for i, m in enumerate(expect.get('no_actions') or []):
        hits = [a for a in result.actions if matches(m, a)]
        if hits:
            fail('no_actions[%d]' % i, m, _compact(hits), 'this action happened')
    counts = expect.get('action_count') or {}
    if isinstance(counts, dict):  # {"<block type>": n}
        counts = [{'match': {'block': block_type}, 'count': n} for block_type, n in counts.items()]
    for i, c in enumerate(counts):  # [{"match": matcher, "count": n}]
        actual = sum(1 for a in result.actions if matches(c['match'], a))
        if not _value_matches(c['count'], actual):
            fail('action_count[%d]' % i, c, actual, 'actions matching %s happened %d times' % (json.dumps(c['match']), actual))
    if 'calls' in expect:
        calls = [dict(c, **({'returns': c['returned']} if c['completed'] else {})) for c in result.calls]
        missing = _in_order(expect['calls'], calls)
        if missing is not None:
            fail('calls[%d]' % missing, expect['calls'][missing], _compact(calls), 'not found in this order among the function calls')
    for block_id in expect.get('covers') or []:
        if block_id not in result.coverage.covered:
            fail('covers', block_id, None, 'block %s was not executed' % block_id)
    return failures


# ---------------------------------------------------------------------- running

def run_test(subject, test, defaults=None):
    options = dict(defaults or {})
    options.update(dict((k, test[k]) for k in ('max_time_ms', 'max_steps') if k in test))
    world = World(test.get('world') or [])
    is_call = 'call' in test
    if is_call:
        result = subject.call(test['call'], *test.get('args', []), globals=test.get('globals'), world=world,
                              max_steps=options.get('max_steps', 100000), max_time_ms=options.get('max_time_ms', 60000))
    else:
        result = subject.run(world, max_time_ms=options.get('max_time_ms', 60000), max_steps=options.get('max_steps', 2000000))
    failures = check_expectations(test['expect'], test, result, is_call)
    report = {'name': test['name'], 'block_id': test.get('block_id'), 'outcome': 'failed' if failures else 'passed', 'failures': failures,
              'error': result.error.to_json() if result.error else None, 'time_ms': result.time_ms,
              'variables': result.variables, 'actions': result.actions, 'calls': result.calls,
              'covered_blocks': sorted(result.coverage.covered)}
    if is_call:
        report['returned'] = result._returned
    else:
        report['status'] = result.status
    return report, result.coverage


def run_spec(spec, subject):
    """Runs all tests of a validated test file against a TestSubject. Returns the results (JSON-able dict)."""
    reports, coverage = [], None
    for test in spec['tests']:
        try:
            report, cov = run_test(subject, test, spec.get('defaults'))
            coverage = cov if coverage is None else coverage.merge(cov)
        except Exception as e:  # a problem of the test, not of the program (e.g. wrong argument types)
            report = {'name': test.get('name'), 'block_id': test.get('block_id'), 'outcome': 'error', 'failures': [],
                      'error': {'kind': 'test_error', 'message': '%s: %s' % (type(e).__name__, e)}}
        reports.append(report)
    counts = dict((o, sum(1 for r in reports if r['outcome'] == o)) for o in ('passed', 'failed', 'error'))
    return {'format': 'nepotest-results', 'version': 1, 'program': spec.get('program'), 'summary': counts,
            'coverage': coverage.to_json() if coverage is not None else None, 'tests': reports}


def load_spec(path):
    with open(path, encoding='utf-8') as f:
        spec = json.load(f)
    spec['_dir'] = os.path.dirname(os.path.abspath(path))
    return spec


def subject_for(spec, lab=None):
    """the TestSubject of a test file: its program, converted by the Lab or taken from its bundle"""
    from .subject import TestSubject
    base = spec.get('_dir', '.')
    program = os.path.join(base, spec['program'])
    bundle = os.path.join(base, spec['bundle']) if spec.get('bundle') else None
    return TestSubject.load(program, lab=lab, bundle=bundle)
