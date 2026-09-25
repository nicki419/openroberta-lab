"""The interface the Lab's test runner uses inside Pyodide (OpenRobertaWeb/src/app/nepotest/nepotest.worker.js).

All functions take and return JSON strings, so nothing but strings crosses the JS/Python boundary.

    translate_tests(tests_xml, program_xml)   -> {"spec", "problems"}          the Tests tab's "Code" view
    prepare(bundle_json, tests_xml)           -> {"spec", "problems", "tests", "conversion_errors"}
    run_one(index)                            -> the report of test `index` (spec.run_test)
    finish()                                  -> {"summary", "coverage"} over all tests run since prepare()

A prepared session is kept in this module, so a suite can be run test by test and the Lab can show the progress.
"""

import json

from .blocks import translate
from .lab import Bundle
from .nepo import NepoProgram
from .spec import run_test, validate_spec
from .subject import ConversionError, TestSubject

_session = {}


def translate_tests(tests_xml, program_xml=None):
    program = None
    if program_xml:
        try:
            program = NepoProgram(program_xml)
        except Exception:
            program = None
    spec, problems = translate(tests_xml, program)
    return json.dumps({'spec': spec, 'problems': problems})


def prepare(bundle_json, tests_xml):
    _session.clear()
    bundle = Bundle(json.loads(bundle_json))
    try:
        subject = TestSubject(bundle)
    except ConversionError as e:
        errors = [{'block_id': i, 'block_type': t, 'key': k} for i, t, k in e.block_errors]
        return json.dumps({'spec': None, 'problems': [], 'tests': [], 'conversion_errors': errors, 'message': str(e)})
    spec, problems = translate(tests_xml, subject.nepo)
    if not [p for p in problems if p['severity'] == 'error']:
        problems += [{'block_id': None, 'message': p, 'severity': 'error'} for p in validate_spec(spec, subject)]
    _session.update(subject=subject, spec=spec, coverage=None, reports=[])
    return json.dumps({'spec': spec, 'problems': problems, 'tests': [t['name'] for t in spec['tests']], 'conversion_errors': []})


def run_one(index):
    subject, spec = _session['subject'], _session['spec']
    test = spec['tests'][index]
    try:
        report, coverage = run_test(subject, test, spec.get('defaults'))
        _session['coverage'] = coverage if _session['coverage'] is None else _session['coverage'].merge(coverage)
    except Exception as e:  # a problem of the test, not of the program
        report = {'name': test.get('name'), 'block_id': test.get('block_id'), 'outcome': 'error', 'failures': [],
                  'error': {'kind': 'test_error', 'message': '%s: %s' % (type(e).__name__, e)}}
    _session['reports'].append(report)
    return json.dumps(report)


def finish():
    reports = _session.get('reports', [])
    counts = dict((o, sum(1 for r in reports if r['outcome'] == o)) for o in ('passed', 'failed', 'error'))
    coverage = _session.get('coverage')
    return json.dumps({'summary': counts, 'coverage': coverage.to_json() if coverage is not None else None})
