"""Runs the reference EdPy compiler (https://github.com/Bdanilko/EdPy, GPL-2.0) in check mode.

The compiler isn't part of this repository. Point these two environment variables at a local setup
(see docs/ai/edpy-reference.md section 2):

    EDPY_HOME     the directory that contains EdPy.py and en_lang.json (the `src` directory of the clone)
    EDPY_PYTHON   a Python 2.7 or 3.6 interpreter (newer Pythons can't run EdPy 1.2.11)

    result = edpy_check.check_source(source)
    result.ok, result.messages
"""

import json
import os
import subprocess
import tempfile
from collections import namedtuple

CheckResult = namedtuple('CheckResult', 'ok messages output')


def configured():
    home, python = os.environ.get('EDPY_HOME'), os.environ.get('EDPY_PYTHON')
    return bool(home and python and os.path.isfile(os.path.join(home, 'EdPy.py')) and os.path.isfile(python))


def check_file(path, timeout=60):
    if not configured():
        raise RuntimeError('EDPY_HOME and EDPY_PYTHON must point to the EdPy compiler and a Python 2.7/3.6 interpreter')
    home, python = os.environ['EDPY_HOME'], os.environ['EDPY_PYTHON']
    proc = subprocess.run([python, 'EdPy.py', '-c', 'en_lang.json', os.path.abspath(path)], cwd=home,
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout)
    output = proc.stdout.decode('utf-8', 'replace')
    for line in reversed(output.splitlines()):
        line = line.strip()
        if line.startswith('{'):
            try:
                data = json.loads(line)
            except ValueError:
                break
            return CheckResult(not data.get('error'), list(data.get('messages', [])), output)
    # EdPy sometimes crashes instead of answering (e.g. division by zero while folding, or any "internal error"
    # under Python 3, where its own logger fails). The robot service would reject such a program too.
    return CheckResult(False, ['compiler crashed: ' + (output.strip().splitlines() or [''])[-1]], output)


def check_source(source, timeout=60):
    fd, path = tempfile.mkstemp(suffix='.py')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as f:
            f.write(source)
        return check_file(path, timeout)
    finally:
        os.remove(path)
