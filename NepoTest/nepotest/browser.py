"""The interface the Lab's test runner uses inside Pyodide (OpenRobertaWeb/src/app/nepotest/nepotest.worker.js).

All functions take and return JSON strings, so nothing but strings crosses the JS/Python boundary.

    translate_tests(tests_xml, program_xml)   -> {"spec", "problems"}          the Tests tab's "Code" view
    prepare(bundle_json, tests_xml)           -> {"spec", "problems", "tests", "conversion_errors"}
    run_one(index)                            -> the report of test `index` (spec.run_test)
    finish(simulation_reports_json)           -> {"summary", "coverage"} over all tests run since prepare(), and the
                                                 simulation tests the Lab ran on its simulator (their reports, a JSON
                                                 list: they count, and so do the blocks they covered)
    simulation_test(tests_xml, block_id, program_xml)
                                              -> {"test", "problems"}: one test on its own, as JSON (the Simulation
                                                 tab's "record" and "run")

Simulation tests run on the Lab's simulator (OpenRobertaWeb/src/app/nepotest/nepoTest.simRun.ts), not here: the Lab
asks for the tests (prepare), runs the other tests here one by one (run_one), runs the simulation tests itself, and
hands their reports to finish().

A prepared session is kept in this module, so a suite can be run test by test and the Lab can show the progress.
"""

import json

from .blocks import translate, translate_one
from .lab import Bundle
from .nepo import NepoProgram
from .spec import run_test, validate_spec
from .subject import ConversionError, Coverage, TestSubject

_session = {}


def _program(program_xml):
    if not program_xml:
        return None
    try:
        return NepoProgram(program_xml)
    except Exception:
        return None


def translate_tests(tests_xml, program_xml=None):
    spec, problems = translate(tests_xml, _program(program_xml))
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
        if coverage is not None:
            _session['coverage'] = coverage if _session['coverage'] is None else _session['coverage'].merge(coverage)
    except Exception as e:  # a problem of the test, not of the program
        report = {'name': test.get('name'), 'block_id': test.get('block_id'), 'outcome': 'error', 'failures': [],
                  'error': {'kind': 'test_error', 'message': '%s: %s' % (type(e).__name__, e)}}
    _session['reports'].append(report)
    return json.dumps(report)


def finish(simulation_reports_json='[]'):
    simulated = json.loads(simulation_reports_json or '[]')
    reports = _session.get('reports', []) + simulated
    counts = dict((o, sum(1 for r in reports if r['outcome'] == o)) for o in ('passed', 'failed', 'error'))
    coverage = _session.get('coverage')
    covered = set(b for r in simulated for b in r.get('covered_blocks') or [])
    if covered and _session.get('subject') is not None:
        more = Coverage(_session['subject'], covered)
        coverage = more if coverage is None else coverage.merge(more)
    return json.dumps({'summary': counts, 'coverage': coverage.to_json() if coverage is not None else None})


def simulation_test(tests_xml, block_id, program_xml=None):
    test, problems = translate_one(tests_xml, block_id, _program(program_xml))
    if test is not None and not [p for p in problems if p['severity'] == 'error']:
        problems += [{'block_id': block_id, 'message': p, 'severity': 'error'}
                     for p in validate_spec({'format': 'nepotest', 'tests': [test]})]
    return json.dumps({'test': test, 'problems': problems})
