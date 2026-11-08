"""Builds the study's source of truth (this folder) from the phase 5 corpus (../phase5/corpus/versions.json: the versions and what the levels
said about them), the reference tests (reference_tests.py) and their results (results.json, by verify.py). Writes:

- truth.json: everything, for analysis (levels, functions, versions with their code, the reference tests, which test each version passes);
- functions/<function>/<version>.xml: the function alone (a block_set with its definition), as the study injects it into a learner's program;
- programs/<function>/<version>.xml: the level's whole program with this version, as a Lab export, with the reference tests in its Tests tab;
- tests/<function>.json: the reference tests (the AI assistant's test format, after resolving);
- TRUTH.md: all of it to read.

These files are the source of truth: they are committed and used as they are. Build again only on purpose (a new version or test), then run
verify.py, which checks the committed programs, and build once more to take its results in.

python build.py   (needs the Lab and one Chrome of phase 5 for the Tests-tab blocks: PHASE5_PORTS=9333)
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
P5 = os.path.join(HERE, '..', 'phase5')
sys.path.insert(0, P5)
import browser  # noqa: E402
import corpus  # noqa: E402
from corpus_doc import own_function  # noqa: E402
from nepo import export  # noqa: E402

import rejudge  # noqa: E402
from reference_tests import reference_tests, IDS  # noqa: E402


def corpus_versions_reference(fn):
    return fn + '/A'

FUNCTIONS = corpus.CHAIN
MADE = '2026-11-08'  # first made 2026-11-07 on seven levels; made again for the six the study plays since the pilot study
# (2026-11-08, the pilot study: L5 taken out; L6 brings driveInTheDark as it is, its reference version, before its own avoidWalls: corpus.GIVEN.
# L1 taken out and brought back the same day as a new level, l1-straight-ahead: a straight line between walls, falling to the robot's right)
LEVELS = [
    ('l1', 'l1-straight-ahead.json', 'followLine'),
    ('l2', 'l2-curves.json', 'followLine'),
    ('l4', 'l4-beware-the-wall.json', 'stopAtWall'),
    ('l6', 'l6-tunnel-vision-reloaded.json', 'avoidWalls'),
    ('l7', 'l7-well-ill-be-forked.json', 'followInTheDark'),
    ('l8', 'l8-climax.json', 'followInTheDark'),
]
LEVEL_DIR = 'levels/01-first-steps'
# the study's starter code (2026-11-07): per function, the broken version a learner gets in each version of the study's code ("1", "2": one
# per run, chosen per program in the Lab's Edit menu). Each loses the level where its function is new; the two of a level are faults of a
# similar kind (a wrong action, a wrong condition, a wrong sensor or threshold), so neither run is harder by design, and none has an obvious fix
# that is an equivalent version which loses a later level. write_level_code.py puts them into the level files.
STARTERS = {
    # not A-one-turn: fixing the other of its two equal turns gives followLine/A-swapped, which beats L1 to L7 but can't finish L8
    'followLine': {'1': 'followLine/A-light-above', '2': 'followLine/B-straight-off'},
    'stopAtWall': {'1': 'stopAtWall/A-turns', '2': 'stopAtWall/C-slows'},
    # driveInTheDark: until 2026-11-08 'driveInTheDark/A-negated' and 'B-never-dark' at L5; now L6 gives it correct (corpus.GIVEN)
    'avoidWalls': {'1': 'avoidWalls/A-swapped', '2': 'avoidWalls/B-front-sensor'},
    'followInTheDark': {'1': 'followInTheDark/A-light-above', '2': 'followInTheDark/B-peach-is-black'},
}
RULE = ('Every correct version (and every equivalent one: broken by a fault, but the level still passes it) passes every reference test of its '
        'function; every broken version fails at least one.')


def kind(v):
    return v['kind'] if v['kind'] == 'correct' or v['ok'] else 'equivalent'


def function_xml(program_xml, fn):
    """the instance with the function's definition, alone in a block_set"""
    for inst in re.findall(r'<instance [^>]*>.*?</instance>', program_xml):
        if 'type="robProcedures_defnoreturn"' in inst and '<field name="NAME">%s</field>' % fn in inst.split('<statement', 1)[0]:
            head = program_xml[:program_xml.index('>') + 1]
            return head + re.sub(r'^<instance [^>]*>', '<instance x="40" y="40">', inst) + '</block_set>'
    raise ValueError('no definition of ' + fn)


def suites(tests):
    """each function's reference tests as Tests-tab blocks (nepoTest.aiFormat suiteXml), made by the Lab itself"""
    src = ('const FORMAT = require("nepoTest.aiFormat"); const T = __T__; const out = {}; '
           'for (const fn of Object.keys(T)) { out[fn] = FORMAT.suiteXml(T[fn], "ref-" + fn); } return out;')
    browser.use(browser.PORTS[0])
    return browser.run_js(src.replace('__T__', json.dumps(tests)))


def with_suite(program_xml, suite_xml):
    """the program with the suite's instances added (as the Lab saves a program with its tests: nepoTest.suite merge)"""
    tops = ''.join(re.findall(r'<instance [^>]*>.*?</instance>', suite_xml))
    assert program_xml.endswith('</block_set>')
    return program_xml[:-len('</block_set>')] + tops + '</block_set>'


def main():
    corpus_versions = json.load(open(os.path.join(P5, 'corpus', 'versions.json'), encoding='utf-8'))
    tests = reference_tests()
    results = json.load(open(os.path.join(HERE, 'results.json'), encoding='utf-8')) if os.path.exists(os.path.join(HERE, 'results.json')) else {}
    suite = suites(tests)

    levels = []
    before = None  # the function the main loop called at the level before
    for lv, file, fn in LEVELS:
        d = json.load(open(os.path.join(HERE, '..', '..', LEVEL_DIR, file), encoding='utf-8'))
        have = corpus.CHAIN[:corpus.CHAIN.index(fn) + 1]
        new = fn if lv == corpus.LEVELS_OF[fn][0] else None
        given = [g for g in have if corpus.GIVEN.get(g) == lv]  # functions this level brings as they are (their reference version)
        levels.append({'level': lv, 'file': LEVEL_DIR + '/' + file, 'title': d['title'], 'time_limit_s': d.get('timeLimit'), 'function': fn,
                       'new_function': new, 'functions': list(reversed(have)), 'main_calls': fn,
                       'inject': ({'function': fn, 'main_call_before': before if before != fn else None, 'main_call_after': fn,
                                   'given': [{'function': g, 'version': corpus_versions_reference(g)} for g in given]} if new else None),
                       'starter': dict(STARTERS[fn]) if new else None})
        before = fn

    functions = []
    for fn in FUNCTIONS:
        i = FUNCTIONS.index(fn)
        functions.append({'name': fn, 'levels': corpus.LEVELS_OF[fn], 'given_in': corpus.GIVEN.get(fn), 'hands_over_to': FUNCTIONS[i - 1] if i else None,
                          'reference_version': fn + '/A',
                          'faults': [{'fault': f, 'why': why} for f, why, _ in corpus.FAULTS[fn]],
                          'tests': [t['ref'] for w in tests[fn] for t in w['tests']]})

    versions = []
    for v in corpus_versions:
        fn = v['function']
        prog = v['xml']
        r = results.get(v['id'])
        refs = {(w['name'], t['name']): t['ref'] for w in tests[fn] for t in w['tests']}
        passed = {refs[(t['world'], t['test'])]: t['passed'] for t in r['tests']} if r else None
        failures = {refs[(t['world'], t['test'])]: t['failed'] for t in r['tests'] if not t['passed']} if r else None
        k = kind(v)
        verdict = None
        if passed is not None:
            failed = [x for x, ok in passed.items() if not ok]
            verdict = ('ok' if not failed else 'false alarm') if k in ('correct', 'equivalent') else ('caught' if failed else 'missed')
        # the levels it is judged on, and the later levels the study plays (the runs of L1 and L5, taken out, don't count: corpus.REMOVED_LEVELS)
        judged = rejudge.levels_up_to(fn) if v['kind'] == 'correct' else corpus.LEVELS_OF[fn]
        own = {lv: run['outcome'] for lv, run in v['runs'].items() if lv in judged and (lv in corpus.STUDY_LEVELS or lv in corpus.LEVELS_OF[fn])}
        later = {lv[6:]: run['outcome'] for lv, run in v['runs'].items() if lv.startswith('later ') and lv[6:] in corpus.STUDY_LEVELS}
        versions.append({
            'id': v['id'], 'function': fn, 'variant': v['id'].split('/')[1], 'kind': k, 'of': v['of'], 'fault': v['fault'], 'why': v['why'],
            'pseudocode': own_function(prog, fn), 'levels': own, 'later_levels': later or None,
            'later_levels_ok': (all(o in ('win', 'win_soft') for o in later.values()) if k == 'correct' else None),
            'tests_passed': passed, 'tests_failed_why': failures, 'verdict': verdict,
            'function_xml': function_xml(prog, fn), 'program': prog,
        })

    truth = {'about': 'The source of truth of the study\'s levels: per level the function the learner fixes, its correct versions and the broken '
                      'ones (made by fixed faults), and reference tests that tell them apart. Made ' + MADE + ' from the phase 5 corpus '
                      '(evaluation/phase5) and the hand-written tests of reference_tests.py; see README.md.',
             'made': MADE, 'rule': RULE,
             'kinds': {'correct': 'beats its levels and every level before (the other functions in their reference version A)',
                       'broken': 'loses one of its levels',
                       'equivalent': 'broken by a fault, but still beats its levels: the level cannot tell it from a correct one, so neither can '
                                     'the tests'},
             'program_shape': 'main: forever: <the newest function>(); each function handles its situation or calls the function of the level '
                              'before (a priority chain: the simulator runs one motor block per frame)',
             'levels': levels, 'functions': functions, 'tests': tests, 'versions': versions, 'level_check': level_check(versions)}
    for lv in levels:
        for name, vid in (lv['starter'] or {}).items():
            v = [x for x in versions if x['id'] == vid]
            assert v and v[0]['kind'] == 'broken', 'starter %s of %s is not a broken version' % (vid, lv['level'])
            assert v[0]['levels'].get(lv['level']) not in ('win', 'win_soft'), 'starter %s beats %s' % (vid, lv['level'])
    json.dump(truth, open(os.path.join(HERE, 'truth.json'), 'w', encoding='utf-8', newline='\n'), indent=1, ensure_ascii=False)

    for v in versions:
        for sub, content in (('functions', v['function_xml']), ('programs', export(with_suite(v['program'], suite[v['function']])))):
            d = os.path.join(HERE, sub, v['function'])
            os.makedirs(d, exist_ok=True)
            open(os.path.join(d, v['variant'] + '.xml'), 'w', encoding='utf-8', newline='\n').write(content)
    os.makedirs(os.path.join(HERE, 'tests'), exist_ok=True)
    for fn in FUNCTIONS:
        json.dump(tests[fn], open(os.path.join(HERE, 'tests', fn + '.json'), 'w', encoding='utf-8', newline='\n'), indent=1, ensure_ascii=False)
    open(os.path.join(HERE, 'TRUTH.md'), 'w', encoding='utf-8', newline='\n').write(markdown(truth))
    print('wrote truth.json, functions/, programs/, tests/, TRUTH.md:', len(versions), 'versions,',
          sum(len(w['tests']) for ws in tests.values() for w in ws), 'tests')


def level_check(versions):
    """check_levels.py's result per level: the combinations of correct versions played and won, the equivalent versions played and won, and
    the equivalent versions that lose (a version that has become broken since, e.g. by losing a level of its own, isn't counted)"""
    path = os.path.join(HERE, 'levels.json')
    if not os.path.exists(path):
        return None
    equivalent = {v['id'] for v in versions if v['kind'] == 'equivalent'}
    runs = json.load(open(path, encoding='utf-8'))
    out = {}
    for k, r in runs.items():
        level, what = k.split('|')
        c = out.setdefault(level, {'combinations': 0, 'combinations_won': 0, 'equivalents': 0, 'equivalents_won': 0, 'equivalents_lost': []})
        won = r['outcome'] in ('win', 'win_soft')
        if what.endswith(' (others A)'):
            vid = what[:-len(' (others A)')]
            if vid not in equivalent:
                continue
            c['equivalents'] += 1
            c['equivalents_won'] += won
            won or c['equivalents_lost'].append(vid)
        else:
            c['combinations'] += 1
            c['combinations_won'] += won
    return dict(sorted(out.items()))


def describe_check(c):
    if c['check'] in ('reaches', 'ends_in'):
        return '%s %s' % (c['check'], c['item'])
    if c['check'] == 'never_bumps':
        return 'never_bumps ' + (c.get('item') or 'anything')
    if c['check'] == 'does':
        return 'does %s from %d ms' % (c['does'], c.get('after_ms', 100))
    return json.dumps(c)


def markdown(t):
    md = ['# The study\'s source of truth', '',
          'Made %s by `build.py` from the phase 5 corpus and the reference tests (`reference_tests.py`), checked by `verify.py`. **The rule:** %s' % (
              t['made'], t['rule']), '',
          'A level\'s program is its function and the functions of the levels before; the main loop calls the newest, and each function handles '
          'its situation or calls the one before:', '', '```', 'main:', '  forever:', '    <the newest function>()', '```', '',
          '| level | title | function | new code | the main loop calls |', '|---|---|---|---|---|']
    first = {f['name']: f['levels'][0] for f in t['functions']}
    for lv in t['levels']:
        given = ', '.join('`%s` (`%s`, as it is)' % (g['function'], g['version']) for g in ((lv['inject'] or {}).get('given') or []))
        md.append('| %s | %s | `%s` | %s | `%s()` |' % (lv['level'].upper(), lv['title'], lv['function'],
                                                      ('yes' + (', with ' + given if given else '')) if lv['new_function']
                                                      else 'no (the function of %s)' % first[lv['function']].upper(),
                                                      lv['main_calls']))
    md += ['', '**Since the pilot study (2026-11-08)** the study plays six levels. L5 (a straight tunnel; L6 has a bent one) was taken out: L6 '
               'brings `driveInTheDark` as it is, correct, before its own `avoidWalls`, so the learner never fixes `driveInTheDark`: its versions '
               'are not study code, and they keep their judgement on L5. L1 is a new level, "Straight Ahead": a straight line between walls that '
               'falls to the robot\'s right (so a line follower must steer right), no time limit. The slow line followers beat it and L2: they are '
               'equivalent now (the old L1 had a time limit of 20 s), and the reference test of that time limit is gone.']
    md += ['', '### The starter code', '',
           "The broken version a learner gets where a function is new, in each version of the study's code (one per run, chosen per program in the "
           "Lab's Edit menu; `write_level_code.py` puts them into the level files):", '',
           '| level | function | version 1 | version 2 |', '|---|---|---|---|']
    why = {v['id']: v['why'] for v in t['versions']}
    for lv in t['levels']:
        if lv['starter']:
            md.append('| %s | `%s` | `%s`: %s | `%s`: %s |' % (lv['level'].upper(), lv['function'], lv['starter']['1'], why[lv['starter']['1']],
                                                            lv['starter']['2'], why[lv['starter']['2']]))
    check = t.get('level_check')
    if check:
        md += ['', '### Every combination of correct fixes beats the levels', '',
               "Each level played with every combination of the correct versions of its program's functions, and with each equivalent version in "
               "place of its function's reference version (`check_levels.py`, `levels.json`):", '',
               '| level | combinations of correct versions: won | equivalent versions: won | equivalent versions that lose |', '|---|---|---|---|'] + [
                   '| %s | %d of %d | %d of %d | %s |' % (k.upper(), c['combinations_won'], c['combinations'], c['equivalents_won'], c['equivalents'],
                                                         ', '.join('`%s`' % x for x in c['equivalents_lost']) or '-') for k, c in check.items()]
    md += ['']
    summary = ['| function | correct | broken | equivalent | tests | false alarms | broken versions caught |', '|---|---|---|---|---|---|---|']
    for f in t['functions']:
        vs = [v for v in t['versions'] if v['function'] == f['name']]
        n = lambda k: sum(1 for v in vs if v['kind'] == k)
        summary.append('| `%s` | %d | %d | %d | %d | %d | %d of %d |' % (
            f['name'], n('correct'), n('broken'), n('equivalent'), len(f['tests']), sum(1 for v in vs if v['verdict'] == 'false alarm'),
            sum(1 for v in vs if v['verdict'] == 'caught'), n('broken')))
    md += ['## Summary', ''] + summary + ['']
    for f in t['functions']:
        fn = f['name']
        vs = [v for v in t['versions'] if v['function'] == fn]
        if f.get('given_in'):
            md += ['## %s (judged on %s, which the study no longer plays; %s brings its reference version)' % (
                fn, ', '.join(l.upper() for l in f['levels']), f['given_in'].upper()), '']
        else:
            md += ['## %s (%s)' % (fn, ', '.join(l.upper() for l in f['levels'])), '']
        md += ['Hands over to `%s`.' % f['hands_over_to'] if f['hands_over_to'] else 'The first function: it hands over to nothing.', '']
        md += ['### Reference tests', '']
        worlds = t['tests'][fn]
        for w in worlds:
            for x in w['tests']:
                md += ['- **`%s`**: %s (world "%s", start %s, %s; checks: %s; there for: %s)' % (
                    x['ref'], x['scenario'], w['name'], x['start'],
                    ('until it touches %s, at most %d s' % (x['until'], x['max_time_ms'] // 1000)) if x['until'] else '%d s' % (x['max_time_ms'] // 1000),
                    ', '.join(describe_check(c) for c in x['checks']), ', '.join(x['targets']))]
        refs = [x['ref'] for w in worlds for x in w['tests']]
        md += ['', '### Versions and results', '',
               '| version | kind | fault | levels | ' + ' | '.join('`%s`' % r.split(':')[1] for r in refs) + ' | verdict |',
               '|---|---|---|---|' + '---|' * len(refs) + '---|']
        for v in sorted(vs, key=lambda v: ({'correct': 0, 'equivalent': 1, 'broken': 2}[v['kind']], v['id'])):
            levels = ', '.join('%s %s' % (k.upper(), o) for k, o in v['levels'].items())
            if v['kind'] == 'correct' and not v['later_levels_ok']:
                levels += '; later: ' + ', '.join('%s %s' % (k.upper(), o) for k, o in v['later_levels'].items() if o not in ('win', 'win_soft'))
            cells = [('pass' if v['tests_passed'][r] else '**fail**') if (v['tests_passed'] or {}).get(r) is not None else '-' for r in refs]
            md.append('| `%s` | %s | %s | %s | %s | %s |' % (v['id'], v['kind'], v['fault'] or '', levels, ' | '.join(cells), v['verdict'] or '-'))
        md += ['', '### The code', '']
        for v in sorted(vs, key=lambda v: ({'correct': 0, 'equivalent': 1, 'broken': 2}[v['kind']], v['id'])):
            head = '**`%s`** (%s)' % (v['id'], v['kind'])
            if v['why']:
                head += ': %s' % v['why']
            md += [head, '', '```'] + v['pseudocode'] + ['```', '']
    return '\n'.join(md) + '\n'


if __name__ == '__main__':
    main()
