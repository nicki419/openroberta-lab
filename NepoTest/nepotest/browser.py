"""The interface the Lab's test runner uses inside Pyodide (OpenRobertaWeb/src/app/nepotest/nepotest.worker.js).

All functions take and return JSON strings, so nothing but strings crosses the JS/Python boundary.

    translate_tests(tests_xml, program_xml)   -> {"spec", "problems"}          the Tests tab's "Code" view
    prepare(bundle_json, tests_xml)           -> {"spec", "problems", "tests", "conversion_errors"}
    run_one(index)                            -> the report of test `index` (spec.run_test)
    finish()                                  -> {"summary", "coverage"} over all tests run since prepare()
    simulate(bundle_json, tests_xml, block_id, record)
                                              -> {"report", "problems", "conversion_errors"}: one test on its own (the
                                                 simulation window's "record" and "run"); record=True ignores the
                                                 recorded path, so the run can become the new one

A prepared session is kept in this module, so a suite can be run test by test and the Lab can show the progress.
"""

import json

from . import simulation as SIM
from .blocks import translate, translate_one
from .lab import Bundle
from .nepo import NepoProgram
from .spec import run_test, validate_spec
from .subject import ConversionError, TestSubject

_session = {}
_subject_cache = {}  # the last converted program, for repeated simulate() calls


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


def _subject(bundle_json):
    if _subject_cache.get('json') != bundle_json:
        _subject_cache.clear()
        _subject_cache.update(json=bundle_json, subject=TestSubject(Bundle(json.loads(bundle_json))))
    return _subject_cache['subject']


def simulate(bundle_json, tests_xml, block_id, record=False):
    try:
        subject = _subject(bundle_json)
    except ConversionError as e:
        errors = [{'block_id': i, 'block_type': t, 'key': k} for i, t, k in e.block_errors]
        return json.dumps({'report': None, 'problems': [], 'conversion_errors': errors, 'message': str(e)})
    test, problems = translate_one(tests_xml, block_id, subject.nepo)
    if test is not None and not [p for p in problems if p['severity'] == 'error']:
        problems += [{'block_id': block_id, 'message': p, 'severity': 'error'}
                     for p in validate_spec({'format': 'nepotest', 'tests': [test]}, subject)]
    if test is None or [p for p in problems if p['severity'] == 'error']:
        return json.dumps({'report': None, 'problems': problems, 'conversion_errors': []})
    try:
        if record and 'simulation' in test:
            report, _ = SIM.run_simulation_test(subject, test, record=True)
        else:
            report, _ = run_test(subject, test)
    except Exception as e:  # a problem of the test, not of the program
        report = {'name': test.get('name'), 'block_id': test.get('block_id'), 'outcome': 'error', 'failures': [],
                  'error': {'kind': 'test_error', 'message': '%s: %s' % (type(e).__name__, e)}}
    return json.dumps({'report': report, 'problems': problems, 'conversion_errors': []})
