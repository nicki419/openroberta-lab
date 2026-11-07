"""Requests of the full pipeline whose program reached the assistant without its EdPy (the Lab's code generation failed: simultaneous requests,
see README.md) are made again: their result files (and those of their plain twin and evaluations) are removed; generate.py, baseline.py and
evaluate.py then make them again."""
import glob
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.join(HERE, 'results')
redo = []
for f in glob.glob(os.path.join(R, 'generated', '*.json')):
    r = json.load(open(f, encoding='utf-8'))
    if r.get('edpyError') or not r.get('edpy') or r.get('error'):
        redo.append(os.path.basename(f)[:-5])
for rid in redo:
    for path in [os.path.join(R, 'generated', rid + '.json'), os.path.join(R, 'evaluated', rid + '.json'),
                 os.path.join(R, 'plain', rid.replace('__full', '__plain') + '.json'), os.path.join(R, 'evaluated', rid.replace('__full', '__plain') + '.json')]:
        if os.path.exists(path):
            os.remove(path)
print('made again:', redo)
