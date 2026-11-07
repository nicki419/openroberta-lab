"""Phase 5: two rounds compared (results/ before the tuning of 2026-11-07, results-r2/ after it), per pipeline, for the versions the tuning looked
at and for the kept-out ones (the last broken version chosen per function: generate.chosen), with sign tests on the requests paired by version,
sentence and repeat. Prints Markdown; python compare.py [results results-r2] > results-r2/compare.md
"""
import glob
import json
import os
import sys
from math import comb

import generate
from report import measure

HERE = os.path.dirname(os.path.abspath(__file__))
FUNCTIONS = ['followLine', 'stopAtWall', 'driveInTheDark', 'avoidWalls', 'followInTheDark']


def rows(folder):
    out = {}
    for f in glob.glob(os.path.join(HERE, folder, 'evaluated', '*.json')):
        ev = json.load(open(f, encoding='utf-8'))
        j = ev['job']
        out[(j['pipeline'], j['version'], j['sentenceKind'], j['repeat'])] = measure(ev)
    return out


def sign_p(a, b):
    """two-sided sign test: a pairs one way, b the other"""
    n = a + b
    if not n:
        return 1.0
    return min(1.0, 2 * sum(comb(n, i) for i in range(min(a, b) + 1)) / 2 ** n)


def summary(ms):
    n = len(ms)
    if not n:
        return None
    pct = lambda a, b: '%d %%' % round(100 * a / b) if b else '-'
    return [n, pct(sum(1 for m in ms if m['alarms']), n), pct(sum(m['caught'] for m in ms), sum(m['broken'] for m in ms)),
            pct(sum(1 for m in ms if m['seen_caught']), n), pct(sum(1 for m in ms if m['good']), n)]


def main(a, b):
    # the corpus as decided on the levels of rounds 1 and 2 (versions.json is decided on the levels loosened on 2026-11-07)
    versions = json.load(open(os.path.join(HERE, 'corpus', 'versions-rounds-1-2.json'), encoding='utf-8'))
    held = {generate.chosen(versions, fn)[-1]['id'] for fn in FUNCTIONS}
    ra, rb = rows(a), rows(b)
    print('### %s against %s\n' % (a, b))
    print('| pipeline | versions | round | requests | sets with a false alarm | broken versions caught | the one it got, caught | good sets |')
    print('|---|---|---|---|---|---|---|---|')
    for p in ('full', 'plain'):
        for label, keep in (('tuned on', lambda v: v not in held), ('kept out', lambda v: v in held), ('all', lambda v: True)):
            for name, r in ((a, ra), (b, rb)):
                s = summary([m for k, m in r.items() if k[0] == p and keep(k[1])])
                if s:
                    print('| %s | %s | %s | %s |' % (p, label, name, ' | '.join(str(x) for x in s)))
    print()
    print('### Paired requests (the same version, sentence and repeat)\n')
    for p in ('full', 'plain'):
        keys = [k for k in ra if k[0] == p and k in rb]
        fewer = sum(1 for k in keys if rb[k]['alarms'] < ra[k]['alarms'])
        more = sum(1 for k in keys if rb[k]['alarms'] > ra[k]['alarms'])
        better = sum(1 for k in keys if rb[k]['caught'] > ra[k]['caught'])
        worse = sum(1 for k in keys if rb[k]['caught'] < ra[k]['caught'])
        print('- %s, %s against %s (%d pairs): fewer false alarms in %d, more in %d (sign test p = %.3f); more broken versions caught in %d, '
              'fewer in %d (p = %.3f).' % (p, b, a, len(keys), fewer, more, sign_p(fewer, more), better, worse, sign_p(better, worse)))
    for name, r in ((a, ra), (b, rb)):
        keys = [k for k in r if k[0] == 'full' and ('plain',) + k[1:] in r]
        fp = lambda k: ('plain',) + k[1:]
        fewer = sum(1 for k in keys if r[k]['alarms'] < r[fp(k)]['alarms'])
        more = sum(1 for k in keys if r[k]['alarms'] > r[fp(k)]['alarms'])
        better = sum(1 for k in keys if r[k]['caught'] > r[fp(k)]['caught'])
        worse = sum(1 for k in keys if r[k]['caught'] < r[fp(k)]['caught'])
        print('- %s, full against plain (%d pairs): fewer false alarms in %d, more in %d (p = %.3f); more broken versions caught in %d, '
              'fewer in %d (p = %.3f).' % (name, len(keys), fewer, more, sign_p(fewer, more), better, worse, sign_p(better, worse)))
    print()
    print('### By function, full pipeline\n')
    print('| function | round | requests | sets with a false alarm | broken versions caught | the one it got, caught | good sets |')
    print('|---|---|---|---|---|---|---|')
    for fn in FUNCTIONS:
        for name, r in ((a, ra), (b, rb)):
            s = summary([m for k, m in r.items() if k[0] == 'full' and k[1].split('/')[0] == fn])
            print('| %s | %s | %s |' % (fn, name, ' | '.join(str(x) for x in s)))


if __name__ == '__main__':
    args = sys.argv[1:] or ['results', 'results-r2']
    main(args[0], args[1])
