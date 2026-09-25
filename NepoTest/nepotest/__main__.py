"""Command line: python -m nepotest <command> ...  (run from the NepoTest directory, or with it on PYTHONPATH)

    convert  PROGRAM.xml [-o BUNDLE.json] [--lab URL]    convert with the Lab, save EdPy + source map
    describe PROGRAM.xml|BUNDLE.json                      the program summary with test hints (JSON)
    run      TESTS.json [--lab URL] [--json RESULTS.json] run a test file; exit code 0 if all tests passed
    validate TESTS.json                                    check a test file without running it

--lab defaults to $NEPOTEST_LAB or http://localhost:1999. `run` uses the test file's bundle if it matches the program.
"""

import argparse
import json
import os
import sys

from .lab import Bundle, LabClient
from .nepo import NepoProgram
from .spec import load_spec, run_spec, subject_for, validate_spec


def main(argv=None):
    parser = argparse.ArgumentParser(prog='python -m nepotest', description='unit tests for NEPO programs of the Edison V2')
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('convert')
    p.add_argument('program')
    p.add_argument('-o', '--output')
    p.add_argument('--lab')
    p = sub.add_parser('describe')
    p.add_argument('program')
    p = sub.add_parser('run')
    p.add_argument('tests')
    p.add_argument('--lab')
    p.add_argument('--json', dest='json_out')
    p = sub.add_parser('validate')
    p.add_argument('tests')
    args = parser.parse_args(argv)
    lab_url = getattr(args, 'lab', None) or os.environ.get('NEPOTEST_LAB', 'http://localhost:1999')

    if args.command == 'convert':
        with open(args.program, encoding='utf-8') as f:
            bundle = LabClient(lab_url).convert(f.read(), os.path.splitext(os.path.basename(args.program))[0])
        if not bundle.ok:
            print('the Lab did not convert the program: %s' % bundle.message, file=sys.stderr)
            return 2
        out = args.output or os.path.splitext(args.program)[0] + '.bundle.json'
        bundle.save(out)
        print('saved %s (%d lines of EdPy, %d blocks in the source map)' % (out, len(bundle.edpy.splitlines()), len(bundle.source_map['blocks'])))
        return 0
    if args.command == 'describe':
        if args.program.endswith('.json'):
            program = NepoProgram(Bundle.load(args.program).xml)
        else:
            program = NepoProgram.from_file(args.program)
        print(json.dumps(program.describe(), indent=1))
        return 0
    spec = load_spec(args.tests)
    problems = validate_spec(spec)
    if args.command == 'validate' or problems:
        for problem in problems:
            print('invalid: %s' % problem, file=sys.stderr)
        if args.command == 'validate' and not problems:
            print('valid (%d tests)' % len(spec['tests']))
        return 1 if problems else 0
    subject = subject_for(spec, lab_url)
    problems = validate_spec(spec, subject)
    if problems:
        for problem in problems:
            print('invalid: %s' % problem, file=sys.stderr)
        return 1
    results = run_spec(spec, subject)
    for t in results['tests']:
        print('%-7s %s' % (t['outcome'].upper(), t['name']))
        for f in t['failures']:
            print('        %s: expected %s, got %s%s' % (f['expect'], json.dumps(f['expected']), json.dumps(f['actual'])[:300],
                                                       ' (%s)' % f['message'] if f['message'] else ''))
        if t['outcome'] == 'error':
            print('        %s' % t['error']['message'])
    c = results['coverage']
    s = results['summary']
    print('%d passed, %d failed, %d errors; block coverage %d/%d' % (s['passed'], s['failed'], s['error'],
                                                                     c['blocks_covered'] if c else 0, c['blocks_total'] if c else 0))
    if args.json_out:
        with open(args.json_out, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=1)
    return 0 if s['failed'] == 0 and s['error'] == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
