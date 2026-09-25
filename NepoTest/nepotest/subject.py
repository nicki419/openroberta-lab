"""A NEPO program under test: converted by the Lab, run on the engine, observed in NEPO terms.

    subject = TestSubject.load('clap_counter.xml', lab='http://localhost:1999')    # or bundle='...bundle.json'
    result = subject.call('clampSpeed', 150)          # a NEPO function, in isolation
    result.returned == 100
    run = subject.run(World().clap(1000).clap(2000).clap(3000))
    run.finished, run.variables['claps'], run.actions, run.calls, run.coverage, run.error
"""

import os
import sys

from .engine import EdProgram, EdTestError, StepLimitExceeded
from .engine.program import instruction_position  # noqa: F401  (re-exported for tools)
from .lab import Bundle, LabClient
from .nepo import NepoProgram
from .observer import Observer, nepo_value
from .sourcemap import SourceMap
from .world import World



class ConversionError(Exception):
    """The Lab didn't convert the program, usually because of block errors (block_errors: [(block_id, type, key)])."""

    def __init__(self, bundle):
        self.bundle = bundle
        self.block_errors = []
        if bundle.annotated_xml:
            try:
                annotated = NepoProgram(bundle.annotated_xml)
                self.block_errors = [(b.id, b.type, e) for b, e in annotated.errors()]
            except Exception:
                pass
        detail = ', '.join('%s (block %s %s)' % (e, t, i) for i, t, e in self.block_errors) or bundle.message
        super(ConversionError, self).__init__('the Lab did not convert the program: %s' % detail)


class NepoError(Exception):
    """A runtime problem of the program, attributed to a block.

    kind: 'overflow', 'division_by_zero', 'index_out_of_range', 'negative_value', 'recursion', ... (engine error kinds)"""

    def __init__(self, kind, message, block_id=None, block_type=None, function=None, edpy_line=None):
        super(NepoError, self).__init__(message)
        self.kind, self.message = kind, message
        self.block_id, self.block_type, self.function, self.edpy_line = block_id, block_type, function, edpy_line

    def to_json(self):
        return {'kind': self.kind, 'message': self.message, 'block_id': self.block_id, 'block_type': self.block_type,
                'function': self.function, 'edpy_line': self.edpy_line}

    def __str__(self):
        where = ' in block %s (%s)' % (self.block_id, self.block_type) if self.block_id else ''
        if self.function:
            where += ' of function %s' % self.function
        return '%s%s' % (self.message, where)


class Coverage(object):
    def __init__(self, subject, covered):
        self.subject = subject
        self.coverable = subject.coverable_blocks()
        self.covered = set(covered) & self.coverable

    def merge(self, other):
        return Coverage(self.subject, self.covered | other.covered)

    @property
    def uncovered(self):
        return sorted(self.coverable - self.covered, key=lambda b: self.subject.source_map.start(b))

    @property
    def ratio(self):
        return len(self.covered) / float(len(self.coverable)) if self.coverable else 1.0

    def to_json(self):
        nepo = self.subject.nepo
        return {'blocks_total': len(self.coverable), 'blocks_covered': len(self.covered), 'ratio': round(self.ratio, 3),
                'uncovered': [{'block_id': b, 'type': self.subject.source_map.type_of(b), 'function': nepo.function_of(b)}
                              for b in self.uncovered]}


class Observation(object):
    """What a call or run did, in NEPO terms."""

    def __init__(self, subject, observer, error):
        self.subject = subject
        self.robot = observer.robot
        self.error = error
        self.actions = observer.actions()
        self.calls = [c.to_json() for c in observer.function_calls]
        self.sensor_reads = observer.sensor_reads()
        self.coverage = Coverage(subject, observer.covered_blocks())
        self.time_ms = self.robot.now

    def actions_of(self, block_type):
        return [a for a in self.actions if a['block'] == block_type]

    def format_actions(self):
        lines = []
        for a in self.actions:
            detail = ', '.join('%s=%r' % (k, v) for k, v in a.items() if k not in ('t', 'block', 'block_id', 'function'))
            where = ' [%s]' % a['function'] if a['function'] else ''
            lines.append('%9.1f ms  %s(%s)%s' % (a['t'], a['block'], detail, where))
        return '\n'.join(lines)


class CallResult(Observation):
    def __init__(self, subject, observer, returned, variables, error):
        super(CallResult, self).__init__(subject, observer, error)
        self._returned = returned
        self.variables = variables

    @property
    def returned(self):
        """the function's return value (NEPO: number, boolean, list); re-raises the NepoError if the call failed"""
        if self.error is not None:
            raise self.error
        return self._returned


class ProgramRun(Observation):
    """status: 'finished', 'time_limit' / 'step_limit' (still running when the budget ran out), or 'error'"""

    def __init__(self, subject, observer, status, variables, error):
        super(ProgramRun, self).__init__(subject, observer, error)
        self.status = status
        self.variables = variables

    finished = property(lambda self: self.status == 'finished')
    running = property(lambda self: self.status in ('time_limit', 'step_limit'))

    def __repr__(self):
        return 'ProgramRun(status=%r, time_ms=%.1f, variables=%r, error=%r)' % (self.status, self.time_ms, self.variables, self.error)


class TestSubject(object):
    __test__ = False  # not a pytest test class

    def __init__(self, bundle):
        if sys.version_info < (3, 11):
            raise RuntimeError('nepotest needs CPython 3.11+ (it maps runtime positions to blocks with code.co_positions())')
        if not bundle.ok:
            raise ConversionError(bundle)
        self.bundle = bundle
        self.nepo = NepoProgram(bundle.xml)
        self.name = bundle.data.get('program_name', 'program')
        self.edprogram = EdProgram(bundle.edpy, filename='<nepo %s>' % self.name, instrument=True)
        self.source_map = SourceMap(bundle.edpy, bundle.source_map)
        self._enclosing = self._compute_enclosing_statements()

    # ------------------------------------------------------------------ construction

    @classmethod
    def from_bundle(cls, path):
        return cls(Bundle.load(path))

    @classmethod
    def from_lab(cls, xml_text, lab='http://localhost:1999', program_name='program'):
        client = lab if isinstance(lab, LabClient) else LabClient(lab)
        return cls(client.convert(xml_text, program_name))

    @classmethod
    def load(cls, program_path, lab=None, bundle=None):
        """program_path: a NEPO export XML. Uses `bundle` (a JSON file) if it exists and matches the XML; otherwise converts
        with the Lab at `lab` (default: $NEPOTEST_LAB or http://localhost:1999) and, if `bundle` is given, saves it there."""
        with open(program_path, encoding='utf-8') as f:
            xml_text = f.read()
        if bundle and os.path.exists(bundle):
            cached = Bundle.load(bundle)
            if cached.matches(xml_text) and (lab is None or not os.environ.get('NEPOTEST_RECONVERT')):
                return cls(cached)
        client = lab if isinstance(lab, LabClient) else LabClient(lab or os.environ.get('NEPOTEST_LAB', 'http://localhost:1999'))
        converted = client.convert(xml_text, os.path.splitext(os.path.basename(program_path))[0])
        if bundle and converted.ok:
            converted.save(bundle)
        return cls(converted)

    # ------------------------------------------------------------------ static information

    def describe(self):
        d = self.nepo.describe()
        d['edpy_lines'] = len(self.bundle.edpy.splitlines())
        d['coverable_blocks'] = len(self.coverable_blocks())
        return d

    def coverable_blocks(self):
        generated = set(b.id for b in self.nepo.generated_blocks())
        return set(b for b in self.source_map.blocks if b in generated and self.source_map.type_of(b) not in ('text_comment',))

    def enclosing_statement(self, block_id):
        return self._enclosing.get(block_id)

    def _compute_enclosing_statements(self):
        spans = []
        for k, (line, end_line, col, end_col) in enumerate(self.edprogram.statements):
            spans.append((self.source_map.offset(line, col), self.source_map.offset(end_line, end_col), k))
        result = {}
        for block_id in self.source_map.blocks:
            s = self.source_map.start(block_id)
            best = None
            for (a, b, k) in spans:
                if a is not None and b is not None and a <= s < b and (best is None or b - a < best[0]):
                    best = (b - a, k)
            if best is not None:
                result[block_id] = best[1]
        return result

    # ------------------------------------------------------------------ running

    def call(self, function, *args, **kwargs):
        """Calls NEPO function `function` with NEPO values, after the program's setup and declarations (its main
        program doesn't run). Options: globals={name: value} (set before the call), world=World(...),
        max_steps=100000, max_time_ms=60000, robot_options={...} (see engine Robot)."""
        world = kwargs.pop('world', None) or World()
        globals_ = kwargs.pop('globals', None) or {}
        max_steps = kwargs.pop('max_steps', 100000)
        max_time_ms = kwargs.pop('max_time_ms', 60000)
        robot = world.build_robot(**kwargs.pop('robot_options', {}))
        if kwargs:
            raise TypeError('unexpected arguments %r' % sorted(kwargs))
        observer = Observer(self, robot)
        session = self.edprogram.load(robot, listeners=[observer])
        for name, value in globals_.items():
            session[name] = value
        returned, error = None, None
        try:
            returned = nepo_value(session.call(function, *args, max_steps=max_steps, max_time_ms=max_time_ms))
        except StepLimitExceeded as e:
            error = NepoError('step_limit', e.message, *self._block_of(e), edpy_line=e.line)
        except EdTestError as e:
            error = self._nepo_error(e)
        return CallResult(self, observer, returned, dict((k, nepo_value(v)) for k, v in session.vars.items()), error)

    def run(self, world=None, max_time_ms=60000, max_steps=2000000, overflow='raise', robot_options=None):
        """Runs the whole program against `world`."""
        robot = (world or World()).build_robot(**(robot_options or {}))
        observer = Observer(self, robot)
        observer.main_ran = True
        error, status, variables = None, 'error', {}
        holder = {}

        class Keep(object):
            def on_prelude_done(self, namespace):
                holder['ns'] = namespace

        try:
            result = self.edprogram.run(robot, max_time_ms=max_time_ms, max_steps=max_steps, overflow=overflow, listeners=[observer, Keep()])
            status, variables = result.status, result.vars
        except EdTestError as e:
            error = self._nepo_error(e)
            if 'ns' in holder:
                variables = self.edprogram._variables(holder['ns'])
        return ProgramRun(self, observer, status, dict((k, nepo_value(v)) for k, v in variables.items()), error)

    def _block_of(self, err):
        """(block_id, block_type, function) of the innermost block at the innermost program position of an error"""
        for pos in reversed(getattr(err, 'positions', []) or []):
            blocks = self.source_map.at_position(pos)
            if blocks:
                return blocks[0], self.source_map.type_of(blocks[0]), self.nepo.function_of(blocks[0])
        return None, None, None

    def _nepo_error(self, err):
        return NepoError(err.kind or 'error', err.message, *self._block_of(err), edpy_line=err.line)

    def check_with_edpy(self):
        """Level 0: does the reference EdPy compiler accept the generated program? (needs EDPY_HOME/EDPY_PYTHON)"""
        from .engine import edpy_check
        return edpy_check.check_source(self.bundle.edpy)
