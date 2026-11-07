"""Phase 5, the plain pipeline (the comparison): one call that writes tests for the program and the learner's sentence, with the same model and
effort as the Lab's generate (DeepSeek, .env), the same knowledge (the context pack's NEPO, simulator and test format, checks and drawing), the
same facts (the program with short block ids, its EdPy, the run on a plain floor, the sentence) and the same checks of the format and repairs
(nepoTest.ai check, at most 2 repairs, with the server's repair message), but no analysis, no testing strategy (paths, classes, oracle, coverage),
no worked examples and none of the strategy's checks. For every request of the full pipeline (results/generated), the same version, sentence and
repeat; results/plain/<id>.json. Never prints the API key.

python baseline.py
"""
import glob
import json
import os
import queue
import re
import threading
import time
import urllib.request

import browser
import judge

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.environ.get('PHASE5_RESULTS', 'results')  # the folder of a round's results (2026-11-07: results-r2 after the tuning)
ROOT = judge.ROOT
PACK = os.path.join(ROOT, 'OpenRobertaServer', 'src', 'main', 'resources', 'ai')
OUT = os.path.join(HERE, RESULTS, 'plain')
REPAIRS = 2
MAX_TESTS = 6

ENV = dict(l.rstrip('\r\n').split('=', 1) for l in open(os.path.join(ROOT, '.env'), encoding='utf-8') if '=' in l and not l.startswith('#'))
URL = ENV['DEEPSEEK_URL'].strip().rstrip('/') + '/chat/completions'
MODEL = ENV['DEEPSEEK_MODEL'].strip()
EFFORT = ENV.get('DEEPSEEK_EFFORT_GENERATE', 'low').strip() or 'low'

INTRO = """# You write tests for a program of the Open Roberta Lab

Learners program the Edison robot with NEPO, a block language, and run their programs on the Lab's simulator. The Lab has a Tests tab, in which
learners keep simulation tests for their program: a simulation world (a floor with things on it and places to start), and tests that start the
robot there, run the whole program on the simulator and check what the robot did.

The learner writes what their program should do (the learner's sentence). Write simulation tests that check that the program does what the
sentence says, in the test JSON described under "Tests". You draw the world of each test yourself. Answer with one JSON object and nothing
else. Write the names and scenarios in plain, short English for a beginner, to the learner ("your program …")."""

PLAIN_JSON = """You write worlds, each with the things on its floor and its tests.

```json
{"worlds": [
  {"name": "A box on the line",
   "world": {"background": "peach",
             "starts": [{"id": "A", "name": "A", "x": 30, "y": 100, "heading": 0}],
             "items": [{"id": "l1", "kind": "line", "points": [[20, 100], [260, 100]], "width": 1.48},
                       {"id": "t1", "name": "Box", "kind": "rect", "role": "obstacle", "x": 150, "y": 95, "w": 10, "h": 10}]},
   "tests": [
     {"name": "Stops before the box",
      "scenario": "Given a box on the line, when the program runs for 30 s, then the robot stops in front of the box without bumping into it.",
      "start": "A",
      "until": null,
      "max_time_ms": 30000,
      "world": [],
      "globals": {},
      "checks": [{"check": "never_bumps", "item": "t1"},
                 {"check": "whenever", "when": "obstacle_ahead", "after_ms": 200, "does": "stands_still"}]}]}]}
```

"""


def system_prompt():
    tests = open(os.path.join(PACK, 'tests.md'), encoding='utf-8').read().replace('\r\n', '\n')
    sections = re.split(r'(?m)^(?=## )', tests)
    kept = []
    for s in sections:
        head = s.split('\n', 1)[0]
        if head.startswith('## How to choose the tests'):
            continue  # the testing strategy
        if head.startswith('## The test JSON'):
            world = s[s.index('A world:'):s.index('A test, what it is for')]  # the world and what a test runs; not what it is for
            s = '## The test JSON\n\n' + PLAIN_JSON + world.rstrip() + '\n\n'
        kept.append(s)
    parts = [INTRO, open(os.path.join(PACK, 'nepo-edison.md'), encoding='utf-8').read().strip(),
             open(os.path.join(PACK, 'simulator.md'), encoding='utf-8').read().strip(), ''.join(kept).strip()]
    text = '\n\n---\n\n'.join(p.replace('\r\n', '\n') for p in parts)
    # the few words of the shared files about the analysis and its fields
    for a, b in [(', by which\n  the analysis and the tests name it (`source_block_ids`) and by which "The program\'s decisions" say where each\n  decision is', ''),
                 ('The world must\n  make those go as planned, and list them in `planned_branch_ids`.', 'The world must\n  make those go as planned.')]:
        assert a in text, a
        text = text.replace(a, b)
    return text


def floor_text(floor):
    """as AiPrompts appendFloor"""
    if not floor or not isinstance(floor.get('moved_cm'), (int, float)) or not isinstance(floor.get('turned_deg'), (int, float)):
        return ''
    moved, turned = floor['moved_cm'], floor['turned_deg']
    moves = ('turns_left' if turned > 0 else 'turns_right') if abs(turned) >= 30 else ('straight' if moved >= 5 else 'stands')
    t = '## The program on a plain floor\n\nThe Lab ran it for %d s on a plain peach floor, bright, with nothing around and nothing happening: ' % round(
        floor.get('seconds', 3))
    if moves == 'straight':
        t += 'it drove straight on, %d cm.' % round(moved)
    elif moves == 'stands':
        t += 'it stood still.'
    else:
        t += 'it turned %s, %d° in all, ' % ('left' if moves == 'turns_left' else 'right', round(abs(turned)))
        t += 'on the spot.' if round(moved) < 5 else 'in a curve (its path %d cm).' % round(moved)
    return t + '\n\n'


def user_message(full, sentence):
    return ('## The program\n\nThe learner\'s NEPO program (its blocks with short ids) and the EdPy the Lab generates from it:\n\nNEPO:\n```xml\n%s\n```\n\n'
            'EdPy:\n```python\n%s\n```\n\n%s## Task\n\nThe learner\'s sentence: "%s"\nWrite simulation tests that check that the program does what the '
            'sentence says: at most %d tests. Answer with one JSON object {"worlds": [...]} as described under "The test JSON".\n') % (
        full['nepo'], full['edpy'], floor_text(full.get('floor')), sentence, MAX_TESTS)


def repair_message(problems):
    """as AiPrompts repairMessages"""
    m = 'These problems were found in your answer:\n\n'
    for p in problems[:20]:
        p = re.sub(r'\s+', ' ', p).strip()
        m += '- ' + (p[:400] + ' …' if len(p) > 400 else p) + '\n'
    if len(problems) > 20:
        m += '- … and %d more problems like these\n' % (len(problems) - 20)
    return m + '\nAnswer again with the whole corrected answer.\n'


def chat(messages):
    body = {'model': MODEL, 'messages': messages, 'response_format': {'type': 'json_object'}, 'max_tokens': 32000, 'stream': False,
            'reasoning_effort': EFFORT}
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), method='POST')
    req.add_header('Authorization', 'Bearer ' + ENV['DEEPSEEK_API_KEY'].strip())
    req.add_header('Content-Type', 'application/json; charset=utf-8')
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=300) as r:
        data = json.loads(r.read().decode())
    msg = data['choices'][0]['message']
    u = data.get('usage') or {}
    tokens = {'in': u.get('prompt_tokens'), 'cached': u.get('prompt_cache_hit_tokens'), 'out': u.get('completion_tokens'),
              'reasoning': (u.get('completion_tokens_details') or {}).get('reasoning_tokens')}
    return msg.get('content') or '', tokens, int((time.time() - t0) * 1000)


def one(full, versions_xml, port_lock):
    job = dict(full['job'], pipeline='plain', id=full['job']['id'].replace('__full', '__plain'))
    system = system_prompt()
    messages = [{'role': 'system', 'content': system}, {'role': 'user', 'content': user_message(full, job['sentence'])}]
    calls = []
    started = time.time()
    repairs = 0
    answer = None
    checked = None
    for rnd in range(REPAIRS + 1):
        text, tokens, ms = chat(messages)
        calls.append({'tokens': tokens, 'latencyMs': ms})
        try:
            answer = json.loads(text)
        except ValueError:
            answer = None
        if answer is None:
            checked = {'problems': ['the answer is not JSON'], 'worlds': []}
        else:
            with port_lock:
                checked = browser.run_js(browser.fill('check_plain.js', JOB={'answer': answer, 'xml': versions_xml}))
        if not checked['problems'] or rnd == REPAIRS:
            break
        repairs += 1
        messages = messages + [{'role': 'assistant', 'content': text}, {'role': 'user', 'content': repair_message(checked['problems'])}]
    total = int((time.time() - started) * 1000)
    return {'job': job, 'ms': {'total': total, 'generate': total}, 'calls': calls,
            'generate': {'ok': answer is not None, 'repairs': repairs, 'dropped': checked['problems'], 'worlds': checked['worlds'],
                         'duplicates': checked.get('duplicates', 0)}}


def main():
    os.makedirs(OUT, exist_ok=True)
    versions = {v['id']: v for v in json.load(open(os.path.join(HERE, 'corpus', 'versions.json'), encoding='utf-8'))}
    work = queue.Queue()
    for f in sorted(glob.glob(os.path.join(HERE, RESULTS, 'generated', '*.json'))):
        full = json.load(open(f, encoding='utf-8'))
        if not full.get('nepo') or not full.get('job'):
            continue
        rid = full['job']['id'].replace('__full', '__plain')
        if not os.path.exists(os.path.join(OUT, rid + '.json')):
            work.put(full)
    print(work.qsize(), 'plain requests to make (effort %s)' % EFFORT, flush=True)
    locks = {p: threading.Lock() for p in browser.PORTS}

    def worker(i):
        p = browser.PORTS[i % len(browser.PORTS)]
        browser.use(p)
        while True:
            try:
                full = work.get_nowait()
            except queue.Empty:
                return
            try:
                r = one(full, versions[full['job']['version']]['xml'], locks[p])
            except Exception as e:
                print('  failed %s: %s' % (full['job']['id'], str(e)[:200]), flush=True)
                continue
            json.dump(r, open(os.path.join(OUT, r['job']['id'] + '.json'), 'w', encoding='utf-8'), indent=1)
            print('  %-62s %d tests, %ds, %d repairs' % (r['job']['id'], sum(len(w['tests']) for w in r['generate']['worlds']), r['ms']['total'] // 1000,
                                                       r['generate']['repairs']), flush=True)

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(6)]
    [t.start() for t in threads]
    [t.join() for t in threads]


if __name__ == '__main__':
    main()
