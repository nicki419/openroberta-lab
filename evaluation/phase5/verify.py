"""Decides the corpus on the levels (judge.py): a correct version must beat its levels and every level before (the other functions in their
reference version); a broken version must lose one of its levels (else its fault is equivalent there: every test should pass it, since 2026-11-08). Each correct version
is also played on the later levels, with the later functions in their reference version: is a learner's correct fix still right once the later
code calls it? Writes corpus/versions.json (with each program) and the programs as Lab exports in corpus/programs/."""
import json
import os
import sys

import corpus
import judge
from nepo import export

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'corpus')


def levels_up_to(fn):
    last = corpus.LEVELS_OF[fn][-1]
    return corpus.LEVEL_ORDER[:corpus.LEVEL_ORDER.index(last) + 1]


def main(only=None):
    L = judge.levels()
    versions = [v for v in corpus.versions() if not only or v['function'] in only]
    jobs = []
    for v in versions:
        fn = v['function']
        v['xml'] = corpus.program_for(fn, v['params'])
        own = corpus.LEVELS_OF[fn]
        play = levels_up_to(fn) if v['kind'] == 'correct' else own
        for lv in play:
            jobs.append({'key': v['id'] + '|' + lv, 'level': L[lv], 'xml': v['xml']})
        if v['kind'] == 'correct':  # the later levels, with the later functions in their reference version
            for later in corpus.CHAIN[corpus.CHAIN.index(fn) + 1:]:
                xml = corpus.program_for(fn, v['params'], upto=later)
                for lv in corpus.LEVELS_OF[later]:
                    jobs.append({'key': v['id'] + '|later ' + lv, 'level': L[lv], 'xml': xml})
    print(len(versions), 'versions,', len(jobs), 'runs', flush=True)
    results = {}
    for i in range(0, len(jobs), 24):
        for r in judge.judge(jobs[i:i + 24]):
            results[r['key']] = r
        print('  %d of %d runs' % (min(i + 24, len(jobs)), len(jobs)), flush=True)
    for v in versions:
        runs = {k.split('|', 1)[1]: {'outcome': r['outcome'], 'at_s': r.get('at_s'), 'error': r.get('error')} for k, r in results.items() if k.split('|')[0] == v['id']}
        v['runs'] = runs
        own = corpus.LEVELS_OF[v['function']]
        if v['kind'] == 'correct':
            v['ok'] = all(runs[lv]['outcome'] in ('win', 'win_soft') for lv in levels_up_to(v['function']))
            v['later_ok'] = all(r['outcome'] in ('win', 'win_soft') for k, r in runs.items() if k.startswith('later '))
        else:
            v['ok'] = any(runs[lv]['outcome'] not in ('win', 'win_soft') for lv in own)  # broken: it loses one of its levels
            v['equivalent'] = not v['ok']
    os.makedirs(os.path.join(OUT, 'programs'), exist_ok=True)
    path = os.path.join(OUT, 'versions.json')
    old = json.load(open(path, encoding='utf-8')) if (only and os.path.exists(path)) else []
    keep = [v for v in old if v['function'] not in (only or [])]
    json.dump(keep + versions, open(path, 'w', encoding='utf-8'), indent=1)
    for v in versions:
        open(os.path.join(OUT, 'programs', v['id'].replace('/', '__') + '.xml'), 'w', encoding='utf-8').write(export(v['xml']))
    for v in versions:
        mark = ('OK' if v['ok'] else 'NOT CORRECT') if v['kind'] == 'correct' else ('broken' if v['ok'] else 'equivalent (still wins)')
        later = '' if v['kind'] != 'correct' else ('  later levels: ok' if v['later_ok'] else '  later levels: ' + ', '.join(
            '%s %s' % (k[6:], r['outcome']) for k, r in v['runs'].items() if k.startswith('later ') and r['outcome'] not in ('win', 'win_soft')))
        print('%-40s %-24s %s%s' % (v['id'], mark, ', '.join('%s %s' % (k, r['outcome']) for k, r in v['runs'].items() if not k.startswith('later ')), later))


if __name__ == '__main__':
    main(sys.argv[1:] or None)
