"""corpus/CORPUS.md: the corpus as pseudocode, function by function (each version's own function; the others are the reference), with what the
levels said about each version (verify.py)."""
import json
import os
import re

import corpus
import pseudo

HERE = os.path.dirname(os.path.abspath(__file__))


def own_function(xml, fn):
    lines = pseudo.pseudo(xml)
    out = []
    on = False
    for l in lines:
        if l.startswith('def '):
            on = l.startswith('def %s(' % fn)
        elif not l.startswith(' '):
            on = False
        if on:
            out.append(l)
    return out


def main():
    versions = json.load(open(os.path.join(HERE, 'corpus', 'versions.json'), encoding='utf-8'))
    md = ['# The phase 5 corpus', '',
          'Made by `corpus.py`, decided on the levels by `verify.py` (`versions.json`); the programs as Lab exports are in `programs/`. A level\'s '
          'program is its function and the functions of the levels before, each handing over to the one before; the main loop calls the newest:',
          '', '```', 'main:', '  forever:', '    <the newest function>()', '```', '',
          'A **correct** version beats its levels and every level before (the other functions in their reference version A). A **broken** version '
          'loses one of its levels; a fault that still beats its levels is **equivalent** and isn\'t used. "Later levels" plays a correct version with '
          'the later functions in their reference version.', '']
    for fn in corpus.CHAIN:
        md += ['## %s (%s)' % (fn, ', '.join(l.upper() for l in corpus.LEVELS_OF[fn])), '']
        for v in [x for x in versions if x['function'] == fn]:
            runs = v.get('runs', {})
            own = ', '.join('%s %s' % (k.upper(), r['outcome']) for k, r in runs.items() if not k.startswith('later '))
            if v['kind'] == 'correct':
                later = [k[6:].upper() + ' ' + r['outcome'] for k, r in runs.items() if k.startswith('later ') and r['outcome'] not in ('win', 'win_soft')]
                state = ('correct' if v['ok'] else 'NOT correct') + ('; later levels lost: ' + ', '.join(later) if later else '')
                md += ['### %s: %s' % (v['id'], state), '', own, '']
            else:
                state = 'broken' if v['ok'] else 'equivalent (still wins)'
                md += ['### %s: %s' % (v['id'], state), '', '%s. %s' % (v['why'][0].upper() + v['why'][1:], own), '']
            md += ['```'] + own_function(v['xml'], fn) + ['```', '']
    open(os.path.join(HERE, 'corpus', 'CORPUS.md'), 'w', encoding='utf-8', newline='\n').write('\n'.join(md))
    print('wrote corpus/CORPUS.md:', len(versions), 'versions')


if __name__ == '__main__':
    main()
