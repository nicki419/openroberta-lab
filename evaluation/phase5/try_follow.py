"""A first try: line followers on L1 and L2."""
import browser
import judge
from nepo import *

L = judge.levels()
cands = {
    'bool 10/40': [if_((on_line(), [curve(10, 40)]), otherwise=[curve(40, 10)])],
    'bool 20/50': [if_((on_line(), [curve(20, 50)]), otherwise=[curve(50, 20)])],
    'bool 0/40': [if_((on_line(), [curve(0, 40)]), otherwise=[curve(40, 0)])],
    'pct<50 10/40': [if_((compare(light('LINETRACKER'), 'LT', 50), [curve(10, 40)]), otherwise=[curve(40, 10)])],
    'three 15/45': [if_((compare(light('LINETRACKER'), 'LT', 30), [curve(15, 45)]), (compare(light('LINETRACKER'), 'GT', 70), [curve(45, 15)]),
                        otherwise=[drive(40)])],
}
browser.boot()
jobs = []
for name, body in cands.items():
    xml = program([('followLine', body)])
    for lv in ('l1', 'l2'):
        jobs.append({'key': name + ' ' + lv, 'level': L[lv], 'xml': xml})
for r in judge.judge(jobs):
    print('%-22s %-10s at %5s s  ran %5s s  last %s %s' % (r['key'], r['outcome'], r.get('at_s'), r.get('ran_s'), r.get('last'), r.get('error') or ''))
