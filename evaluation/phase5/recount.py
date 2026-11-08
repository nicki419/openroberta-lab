"""Phase 5's rounds counted again on the levels the study plays since the pilot study (2026-11-08: L5 taken out, L1 a new level without a time
limit), with the corpus as it is now (corpus/versions.json) and the rule of the source of truth: every correct and every equivalent version
passes every test, every broken version fails the set. Nothing is generated again; the runs a round didn't have were added from its stored
tests (evaluate.py --missing).

- The versions a round evaluated as broken that are equivalent now are no longer broken: followLine/A-too-slow and C-too-slow lost only the
  old L1, by its time limit (20 s); the new L1 has none, and they beat it and L2. The requests that start from one of them drop out.
- Equivalent versions must pass (2026-11-08, the user: they stay part of the technique, even if it costs correctness). Until then phase 5
  left them out: evaluate.py didn't run them.
- The rounds were evaluated on the corpus of rounds 1 and 2 (corpus/versions-rounds-1-2.json), where the swapped followInTheDark versions were
  equivalent; since L8 belongs to followInTheDark (2026-11-07) they are broken, and the count now holds them to it.
- driveInTheDark is no longer code the learner fixes (L6 brings it correct: corpus.GIVEN): its requests are counted apart.

The measures are report.py's. Writes recount-study-levels.md and recount-study-levels.json beside this file.

python recount.py
"""
import glob
import json
import os

import corpus
import evaluate
from report import measure

HERE = os.path.dirname(os.path.abspath(__file__))
ROUNDS = [('round 1', 'results'), ('round 2', 'results-r2'), ('round 3', 'results-r3'), ('round 4', 'results-r4')]
VERSIONS = json.load(open(os.path.join(HERE, 'corpus', 'versions.json'), encoding='utf-8'))


def no_longer_broken():
    """the versions of the functions the learner fixes that a round evaluated as broken and that are equivalent in the corpus as it is now"""
    now = {v['id']: evaluate.kind(v) for v in VERSIONS if v['function'] not in corpus.GIVEN}
    out = set()
    for _, folder in ROUNDS:
        for f in glob.glob(os.path.join(HERE, folder, 'evaluated', '*.json')):
            for v in json.load(open(f, encoding='utf-8'))['versions']:
                if not v.get('added') and v['kind'] == 'broken' and now.get(v['id']) == 'equivalent':
                    out.add(v['id'])
    return out


def as_reported(ev):
    """the set as its round evaluated it (the versions the round had, with their kinds then)"""
    return dict(ev, versions=[v for v in ev['versions'] if not v.get('added')])


def first_count(ev, gone):
    """the first count on the study's levels (2026-11-08): the round's versions without those no longer broken, equivalent versions left out"""
    return dict(ev, versions=[v for v in ev['versions'] if not v.get('added') and v['id'] not in gone])


def now(ev):
    """the set held to the corpus as it is now: every version of its function, equivalent ones counted as correct"""
    vs = evaluate.usable(VERSIONS, ev['job']['function'])
    if ev['runs']:
        missing = [v['id'] for v in vs if v['id'] not in ev['runs']]
        assert not missing, '%s has no run of %s: run evaluate.py --missing' % (ev['id'], missing)
    return dict(ev, versions=[{'id': v['id'], 'kind': evaluate.kind(v)} for v in vs])


def pct(a, b):
    return round(100 * a / b) if b else None


def numbers(ms):
    n = len(ms)
    return {'requests': n,
            'broken versions caught': pct(sum(m['caught'] for m in ms), sum(m['broken'] for m in ms)),
            'good sets': pct(sum(1 for m in ms if m['good']), n),
            'sets with a false alarm': pct(sum(1 for m in ms if m['alarms']), n),
            'the seen fault caught': pct(sum(1 for m in ms if m['seen_caught']), n)}


def main():
    gone = no_longer_broken()
    equivalent = sorted(v['id'] for v in VERSIONS if evaluate.kind(v) == 'equivalent' and v['function'] not in corpus.GIVEN)
    swapped = ['followInTheDark/A-swapped', 'followInTheDark/B-swapped', 'followInTheDark/C-swapped']
    out = {'no_longer_broken': sorted(gone), 'equivalent': equivalent, 'given': sorted(corpus.GIVEN), 'rounds': {}}
    for name, folder in ROUNDS:
        evs = [json.load(open(f, encoding='utf-8')) for f in sorted(glob.glob(os.path.join(HERE, folder, 'evaluated', '*.json')))]
        for pipe in sorted({e['job']['pipeline'] for e in evs}):
            mine = [e for e in evs if e['job']['pipeline'] == pipe]
            study = [e for e in mine if e['job']['function'] not in corpus.GIVEN and e['job']['version'] not in gone]
            given = [e for e in mine if e['job']['function'] in corpus.GIVEN]
            final = {e['id']: measure(now(e)) for e in study}
            alarm_equivalent = sum(1 for e in study if e['runs'] and any(t['outcome'] != 'passed' for x in equivalent if x in e['runs']
                                                                           for t in e['runs'][x].get('tests', [])))
            fitd = [e for e in study if e['job']['function'] == 'followInTheDark' and e['runs']]
            r = {'7 levels (as reported)': numbers([measure(as_reported(e)) for e in mine]),
                 'study levels, equivalent versions left out (first count)': numbers([measure(first_count(e, gone)) for e in study]),
                 '... equivalent versions must pass, the swapped followInTheDark left out': numbers(
                     [measure(dict(now(e), versions=[v for v in now(e)['versions'] if v['id'] not in swapped])) for e in study]),
                 'study levels, equivalent versions must pass': numbers(list(final.values())),
                 'driveInTheDark (not study code now)': numbers([measure(now(e)) for e in given]),
                 'dropped as no longer broken': sum(1 for e in mine if e['job']['version'] in gone),
                 'sets that fail an equivalent version': alarm_equivalent,
                 'followInTheDark sets that catch every swapped version': '%d of %d' % (
                     sum(1 for e in fitd if all(x in final[e['id']]['caught_ids'] for x in swapped)), len(fitd)),
                 'by function, study levels': {fn: numbers([final[e['id']] for e in study if e['job']['function'] == fn]) for fn in corpus.STUDY_FUNCTIONS}}
            out['rounds']['%s, %s' % (name, pipe)] = r
    json.dump(out, open(os.path.join(HERE, 'recount-study-levels.json'), 'w', encoding='utf-8'), indent=1)

    keys = ['requests', 'broken versions caught', 'good sets', 'sets with a false alarm', 'the seen fault caught']
    cell = lambda x, k: '-' if x[k] is None else ('%d' % x[k] if k == 'requests' else '%d %%' % x[k])
    md = ['# Phase 5 on the study\'s levels (2026-11-08)', '',
          'Since the pilot study, the study plays six levels: L5 was taken out, and L1 is a new level without a time limit. This counts rounds 1 to 4 again (`recount.py`), from their '
          'stored tests: nothing was generated again, and the runs a round didn\'t have were added (`evaluate.py --missing`). Each set is held '
          'to the corpus as it is now (`corpus/versions.json`), with the rule of the source of truth:', '',
          '- **Equivalent versions must pass** (the user, 2026-11-08: they stay part of the technique, even if it costs correctness): %s. '
          'Broken by a fault, they still beat their levels, so a test that fails one is a false alarm. Until now phase 5 left them out.'
          % ', '.join('`%s`' % x for x in equivalent),
          '- **No longer broken:** %s lost only the old L1 (its time limit of 20 s); they beat the new L1 and L2. The requests that start from one of them drop out.'
          % ', '.join('`%s`' % g for g in sorted(gone)),
          '- **Broken now:** `followInTheDark/A-swapped`, `B-swapped`, `C-swapped`. The rounds were evaluated on the corpus of rounds 1 and 2, '
          'where they were equivalent; since L8 belongs to `followInTheDark` (2026-11-07), they lose a level of theirs.',
          '- **Not study code:** `driveInTheDark`. L6 brings it as it is, correct (`corpus.GIVEN`): its requests are counted apart.', '']
    rows = ('7 levels (as reported)', 'study levels, equivalent versions left out (first count)',
            '... equivalent versions must pass, the swapped followInTheDark left out', 'study levels, equivalent versions must pass',
            'driveInTheDark (not study code now)')
    for rname, r in out['rounds'].items():
        md += ['## %s' % rname, '', '| | ' + ' | '.join(keys) + ' |', '|---' * (len(keys) + 1) + '|']
        for label in rows:
            md.append('| %s | %s |' % (label, ' | '.join(cell(r[label], k) for k in keys)))
        md += ['', '%d requests dropped as no longer broken; %d sets fail an equivalent version; the `followInTheDark` sets that catch every '
                   'swapped version: %s.' % (r['dropped as no longer broken'], r['sets that fail an equivalent version'],
                                             r['followInTheDark sets that catch every swapped version']), '',
               '| function (study levels, equivalent versions must pass) | ' + ' | '.join(keys) + ' |', '|---' * (len(keys) + 1) + '|']
        for fn, x in r['by function, study levels'].items():
            md.append('| `%s` | %s |' % (fn, ' | '.join(cell(x, k) for k in keys)))
        md.append('')
    open(os.path.join(HERE, 'recount-study-levels.md'), 'w', encoding='utf-8', newline='\n').write('\n'.join(md) + '\n')
    print('\n'.join(md))


if __name__ == '__main__':
    main()
