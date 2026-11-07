"""The headless Chrome that phase 5 drives: the Lab at localhost:1999 in a Chrome with remote debugging on port 9333 (see README.md). Uses the
CDP driver cdp.mjs and boot.sh beside this file."""
import json
import os
import shutil
import subprocess
import threading

HERE = os.path.dirname(os.path.abspath(__file__))
B = os.path.join(HERE, 'browser')
# Git Bash: on Windows, subprocess finds C:\Windows\System32\bash.exe (WSL) before the PATH
BASH = shutil.which('bash') or r'C:\Program Files\Gitinash.exe'
PORTS = [int(p) for p in os.environ.get('PHASE5_PORTS', '9333,9334,9335,9336').split(',')]  # the Chromes for work that can run side by side (chrome.sh <port>)
_local = threading.local()


def port():
    return getattr(_local, 'port', PORTS[0])


def use(p):
    """this thread drives the Chrome on port p"""
    _local.port = p


def _env():
    return dict(os.environ, CDP_PORT=str(port()))


def start(ports=PORTS):
    """starts the Chromes that aren't running, each with the Lab open"""
    for p in ports:
        subprocess.run([BASH, 'chrome.sh', str(p)], cwd=B, capture_output=True, timeout=60)
        use(p)
        boot()


def boot():
    """a fresh page of the Lab with the Edison chosen (and a new session after clear_cookies)"""
    subprocess.run([BASH, 'boot.sh'], cwd=B, capture_output=True, timeout=120, env=_env())


def new_session():
    """a new server session (the AI's limits are per session): the cookies cleared, the page opened again"""
    subprocess.run(['node', 'cdp.mjs', 'cookies'], cwd=B, capture_output=True, timeout=60, env=_env())
    boot()


def run_js(src, timeout=3600):
    """runs JS (the body of an async function) in the page; returns its JSON result"""
    name = '_run_%d_%d.js' % (port(), os.getpid())  # one file per process: two processes on one port can't swap their scripts
    open(os.path.join(B, name), 'w', encoding='utf-8').write(src)
    raw = subprocess.run(['node', 'cdp.mjs', 'eval', name], cwd=B, capture_output=True, text=True, encoding='utf-8', timeout=timeout, env=_env()).stdout
    i = raw.find('{')
    j = raw.rfind('}')
    if i < 0 or j < 0:
        raise RuntimeError('no result from the page: ' + raw[:2000])
    try:
        return json.loads(raw[i:j + 1])
    except ValueError:
        raise RuntimeError('no JSON from the page: ' + raw[:2000])


def fill(template, **values):
    src = open(os.path.join(B, template), encoding='utf-8').read()
    for k, v in values.items():
        src = src.replace('__%s__' % k, json.dumps(v))
    return src
