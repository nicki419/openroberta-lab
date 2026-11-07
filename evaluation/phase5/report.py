"""Phase 5: the measures of the evaluated requests (results/evaluated) and the generation (results/generated, results/plain), per pipeline,
function and sentence; writes results/report.json and prints the tables (Markdown).

The user's rule for a good set of tests (2026-11-06): every correct version passes every test; every broken version fails the set. So:
- a test is valid if it passes on every correct version; a test that fails on one is a false alarm;
- a broken version is caught if a valid test fails on it (a false alarm catches nothing: it fails on right programs too);
- a set is good if it has tests, no false alarm, and catches every broken version.
"""
import collections
import glob
import json
import os
import statistics as st

HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.join(HERE, 'results')
FUNCTIONS = ['followLine', 'stopAtWall', 'driveInTheDark', 'avoidWalls', 'followInTheDark']


def failed(outcome):
    return outcome != 'passed'


def measure(ev):
    vs = ev['versions']
    correct = [v['id'] for v in vs if v['kind'] == 'correct']
    broken = [v['id'] for v in vs if v['kind'] == 'broken']
    runs = ev['runs']
    names = []
    for vid in correct + broken:
        for t in (runs.get(vid) or {}).get('tests', []):
            k = (t['world'], t['test'])
            if k not in names:
                names.append(k)
    outcome = {(vid, (t['world'], t['test'])): t['outcome'] for vid in runs for t in runs[vid].get('tests', [])}
    valid = [n for n in names if all(not failed(outcome.get((c, n), 'missing')) for c in correct)]
    alarms = [n for n in names if n not in valid]
    caught = [b for b in broken if any(failed(outcome.get((b, n), 'missing')) for n in valid)]
    caught_any = [b for b in broken if any(failed(outcome.get((b, n), 'missing')) for n in names)]
    seen = ev['job']['version']
    return {
        'tests': len(names),
        'valid': len(valid),
        'alarms': len(alarms),
        'broken': len(broken),
        'caught': len(caught),
        'caught_any': len(caught_any),
        'caught_ids': caught,
        'seen_caught': seen in caught,
        'good': bool(names) and not alarms and len(caught) == len(broken),
        'faults_caught': {b: (b in caught) for b in broken},
    }


def gen_of(ev):
    sub = 'generated' if ev['job']['pipeline'] == 'full' else 'plain'
    f = os.path.join(R, sub, ev['id'] + '.json')
    return json.load(open(f, encoding='utf-8')) if os.path.exists(f) else {}


def pct(a, b):
    return '%d %%' % round(100 * a / b) if b else '-'


def summary(rows):
    n = len(rows)
    if not n:
        return None
    m = [r['m'] for r in rows]
    secs = [r['seconds'] for r in rows if r['seconds'] is not None]
    out_tokens = [r['out'] for r in rows if r['out'] is not None]
    return {
        'requests': n,
        'no tests': sum(1 for x in m if not x['tests']),
        'tests (mean)': round(st.mean(x['tests'] for x in m), 1),
        'sets with a false alarm': pct(sum(1 for x in m if x['alarms']), n),
        'false alarms / tests': pct(sum(x['alarms'] for x in m), sum(x['tests'] for x in m)),
        'faults caught (valid tests)': pct(sum(x['caught'] for x in m), sum(x['broken'] for x in m)),
        'faults failing any test': pct(sum(x['caught_any'] for x in m), sum(x['broken'] for x in m)),
        'the seen fault caught': pct(sum(1 for x in m if x['seen_caught']), n),
        'good sets (the rule)': pct(sum(1 for x in m if x['good']), n),
        'seconds (median)': round(st.median(secs)) if secs else None,
        'seconds (max)': round(max(secs)) if secs else None,
        'output tokens (median)': round(st.median(out_tokens)) if out_tokens else None,
    }


def table(title, groups):
    keys = None
    lines = ['### ' + title, '']
    for name, s in groups:
        if not s:
            continue
        if keys is None:
            keys = list(s.keys())
            lines.append('| | ' + ' | '.join(keys) + ' |')
            lines.append('|---' * (len(keys) + 1) + '|')
        lines.append('| %s | %s |' % (name, ' | '.join(str(s[k]) for k in keys)))
    return '\n'.join(lines) + '\n'


TECHNIQUE = [  # the technique a problem text belongs to (as admin/ai-evaluation-2026-11-05/e16-compliance/audit.py)
    ('branch coverage', r'no path targets it|no test plans it|is missing: list every decision|its branches must be exactly|is not an outcome|there is no outcome'),
    ('equivalence classes', r'input class .* no test stands for it|input_selection|equivalence_classes|input dimension'),
    ('oracle', r'oracle_basis|oracle\.|likely_intent|defensible expected behaviour|expected_response_hypothesis'),
    ('complete test', r'expected_results|postcondition'),
    ('not trivial', r'only never_bumps|only checks how the line follower steers|can\'t both hold|nothing to decide'),
    ('consolidation', r'tests, at most|scenarios, at most|take the same outcomes'),
    ('scenario', r'has no test: write one'),
]


def technique(text):
    import re
    for name, pat in TECHNIQUE:
        if re.search(pat, text):
            return name
    return 'world and format'


def compliance():
    """the full pipeline on the corpus: how often the Lab sent an answer back, and what was still wrong after the repairs"""
    rows = [json.load(open(f, encoding='utf-8')) for f in sorted(glob.glob(os.path.join(R, 'generated', '*.json')))]
    n = len(rows)
    if not n:
        return ''
    a_rep = sum(1 for r in rows if (r.get('analyze') or {}).get('repairs'))
    g_rep = sum(1 for r in rows if (r.get('generate') or {}).get('repairs'))
    dropped = collections.Counter()
    unresolved = collections.Counter()
    for r in rows:
        g = r.get('generate') or {}
        for p in g.get('dropped') or []:
            dropped[technique(p)] += 1
        for p in g.get('unresolved') or []:
            unresolved[technique(p)] += 1
    kept = sum(sum(len(w['tests']) for w in (r.get('generate') or {}).get('worlds') or []) for r in rows)
    lines = ['### The techniques, full pipeline (%d requests)' % n, '',
             '- analyses sent back for a repair: %d of %d; requests whose generate answers were sent back: %d of %d' % (a_rep, n, g_rep, n),
             '- tests kept: %d; problems of the tests left out after the repairs: %s' % (kept, dict(dropped) or 'none'),
             '- problems of whole answers still there after the repairs (they leave no test out): %s' % (dict(unresolved) or 'none'), '']
    return '\n'.join(lines)


def main():
    rows = []
    for f in sorted(glob.glob(os.path.join(R, 'evaluated', '*.json'))):
        ev = json.load(open(f, encoding='utf-8'))
        g = gen_of(ev)
        calls = g.get('calls') or []
        out = sum(((c.get('tokens') or {}).get('out') or 0) for c in calls) if calls else None
        rows.append({'id': ev['id'], 'job': ev['job'], 'm': measure(ev), 'seconds': (g.get('ms') or {}).get('total', 0) / 1000 if g.get('ms') else None,
                     'out': out, 'repairs': ((g.get('analyze') or {}).get('repairs', 0) or 0) + ((g.get('generate') or {}).get('repairs', 0) or 0)})
    pipes = sorted({r['job']['pipeline'] for r in rows})
    text = []
    text.append(table('By pipeline', [(p, summary([r for r in rows if r['job']['pipeline'] == p])) for p in pipes]))
    for p in pipes:
        text.append(table('By function, ' + p, [(fn, summary([r for r in rows if r['job']['pipeline'] == p and r['job']['function'] == fn])) for fn in FUNCTIONS]))
        text.append(table('By sentence, ' + p, [(k, summary([r for r in rows if r['job']['pipeline'] == p and r['job']['sentenceKind'] == k])) for k in ('precise', 'vague')]))
    # paired: the same version, sentence and repeat in both pipelines
    by = collections.defaultdict(dict)
    for r in rows:
        by[(r['job']['version'], r['job']['sentenceKind'], r['job']['repeat'])][r['job']['pipeline']] = r['m']
    pairs = [(v['full'], v['plain']) for v in by.values() if 'full' in v and 'plain' in v]
    if pairs:
        better = sum(1 for a, b in pairs if a['caught'] > b['caught'])
        worse = sum(1 for a, b in pairs if a['caught'] < b['caught'])
        fewer_alarms = sum(1 for a, b in pairs if a['alarms'] < b['alarms'])
        more_alarms = sum(1 for a, b in pairs if a['alarms'] > b['alarms'])
        text.append('### Paired (the same broken version, sentence and repeat)\n\n%d pairs: the full pipeline caught more faults in %d, fewer in %d, as many in %d; '
                    'it had fewer false alarms in %d, more in %d.\n' % (len(pairs), better, worse, len(pairs) - better - worse, fewer_alarms, more_alarms))
    # the faults: how often each kind is caught
    faults = collections.defaultdict(lambda: collections.Counter())
    for r in rows:
        for b, c in r['m']['faults_caught'].items():
            kind = b.split('/')[0] + ' ' + b.split('-', 1)[1] if '-' in b else b
            faults[(r['job']['pipeline'], kind)]['caught' if c else 'missed'] += 1
    lines = ['### Faults caught, by kind', '', '| fault | ' + ' | '.join(pipes) + ' |', '|---' * (len(pipes) + 1) + '|']
    for kind in sorted({k for _, k in faults}):
        lines.append('| %s | %s |' % (kind, ' | '.join(pct(faults[(p, kind)]['caught'], sum(faults[(p, kind)].values())) for p in pipes)))
    text.append('\n'.join(lines) + '\n')
    text.append(compliance())
    report = '\n'.join(text)
    print(report)
    json.dump({'rows': [{'id': r['id'], 'job': r['job'], 'measures': {k: v for k, v in r['m'].items() if k not in ('faults_caught',)}, 'seconds': r['seconds'],
                         'out': r['out'], 'repairs': r['repairs']} for r in rows], 'tables': report},
              open(os.path.join(R, 'report.json'), 'w', encoding='utf-8'), indent=1)


if __name__ == '__main__':
    main()
