"""Judges the corpus again on the levels the study plays now, from the runs verify.py stored (no level is played again): verify.py's rule, with
corpus.LEVELS_OF and LEVEL_ORDER as they are. A correct version must beat its levels and every level before; a broken version must lose one of
its levels, else it is equivalent (every test should pass it, as in the source of truth). Made 2026-11-08, when the pilot study took L1 and L5 out: without L1,
followLine/A-too-slow and C-too-slow lose no level of theirs.

python rejudge.py [corpus file]        prints what changes (versions.json: the corpus phase 5 uses)
python rejudge.py --write [file]       writes it into the file
python rejudge.py --play l1 --write    plays the versions a level judges on it again first (a level changed: L1, a new level since 2026-11-08):
                                       every correct version (it must beat every level up to its own) and the versions of the level's
                                       function; their runs on that level are replaced (the Lab and phase 5's Chromes must run)
"""
import json
import os
import sys

import corpus

HERE = os.path.dirname(os.path.abspath(__file__))
WON = ('win', 'win_soft')


def levels_up_to(fn):
    last = corpus.LEVELS_OF[fn][-1]
    return corpus.LEVEL_ORDER[:corpus.LEVEL_ORDER.index(last) + 1]


def judge(v):
    """{ok, equivalent?} of a version from its stored runs"""
    runs = v['runs']
    if v['kind'] == 'correct':
        return {'ok': all(runs[lv]['outcome'] in WON for lv in levels_up_to(v['function']))}
    ok = any(runs[lv]['outcome'] not in WON for lv in corpus.LEVELS_OF[v['function']])
    return {'ok': ok, 'equivalent': not ok}


def changes(versions):
    """[(id, kind, ok before, ok now)] of the versions whose verdict changes (a version without a run on one of the levels is skipped: an
    older corpus file, decided on other levels)"""
    out = []
    for v in versions:
        try:
            now = judge(v)
        except KeyError as e:
            print('%-36s %-8s not judged: no run on %s' % (v['id'], v['kind'], e))
            continue
        if now['ok'] != v['ok']:
            out.append((v['id'], v['kind'], v['ok'], now['ok']))
    return out


def no_longer_broken(path):
    """the ids of the broken versions of a corpus file that are equivalent on the levels the study plays now"""
    vs = json.load(open(path, encoding='utf-8'))
    return {vid for vid, kind, before, now in changes(vs) if kind == 'broken' and before and not now}


def play(vs, level):
    """plays every version the level judges on it (judge.py) and replaces its run there"""
    import judge
    lv = judge.levels()[level]
    mine = [v for v in vs if (v['kind'] == 'correct' and level in levels_up_to(v['function'])) or level in corpus.LEVELS_OF[v['function']]]
    jobs = [{'key': v['id'], 'level': lv, 'xml': v['xml']} for v in mine]
    print(len(jobs), 'versions to play on', level, flush=True)
    results = {}
    for i in range(0, len(jobs), 24):
        for r in judge.judge(jobs[i:i + 24]):
            results[r['key']] = r
    for v in mine:
        r = results[v['id']]
        v['runs'][level] = {'outcome': r['outcome'], 'at_s': r.get('at_s'), 'error': r.get('error')}
        print('  %-36s %s at %s s' % (v['id'], r['outcome'], r.get('at_s')), flush=True)


def main(args):
    write = '--write' in args
    level = args[args.index('--play') + 1] if '--play' in args else None
    args = [a for i, a in enumerate(args) if a not in ('--write', '--play') and (i == 0 or args[i - 1] != '--play')]
    path = os.path.join(HERE, 'corpus', args[0] if args else 'versions.json')
    vs = json.load(open(path, encoding='utf-8'))
    if level:
        play(vs, level)
    found = changes(vs)
    for vid, kind, before, now in found:
        print('%-36s %-8s %s -> %s' % (vid, kind, before, now))
    print(len(found), 'versions change' + ('' if not write else ', written'))
    if write:
        for v in vs:
            v.update(judge(v))
            v['judged_on'] = levels_up_to(v['function']) if v['kind'] == 'correct' else corpus.LEVELS_OF[v['function']]
        json.dump(vs, open(path, 'w', encoding='utf-8'), indent=1)


if __name__ == '__main__':
    main(sys.argv[1:])
