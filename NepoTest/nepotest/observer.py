"""Watches a run of the generated EdPy and translates it back to NEPO.

The engine calls the observer before every statement (instrumented code) and at every Ed call (with the calling
frame). With the Lab's source map, the observer knows for each statement and each Ed call which block's code it is:
- block executions: a statement that starts the code of a block starts an execution of that block
- Ed calls are attributed to all blocks whose code contains the call site (for calls made inside a generated helper
  function such as _diffDrive, the call site of the helper, and the helper's arguments are kept: the NEPO values)
- NEPO functions (____name) are wrapped, so their calls, arguments and results are recorded
From that it derives the NEPO-level actions (decode_action) and the block coverage (coverage).
"""

from .engine.containers import EdList, TuneString
from .engine.program import instruction_position
from .nepo import ACTION_TYPES, FUNCTION_DEF_TYPES

NOT_COVERABLE = frozenset(['text_comment'])


def nepo_value(v):
    if isinstance(v, EdList):
        return v.to_list()
    if isinstance(v, TuneString):
        return v.text()
    return v


class Execution(object):
    """One execution of one block: when it started, which Ed calls (trace indices) and helper calls it made."""

    def __init__(self, index, t, block_id, block_type):
        self.index, self.t, self.block_id, self.type = index, t, block_id, block_type
        self.calls = []
        self.helpers = []  # (helper name, {param: NEPO value}), e.g. ('_diffDrive', {'direction': 1, 'speed': 150, 'distance': 10})


class FunctionCall(object):
    def __init__(self, name, args, t, depth):
        self.name, self.args, self.t, self.depth = name, args, t, depth
        self.returned = None
        self.t_end = None
        self.completed = False

    def to_json(self):
        return {'function': self.name, 'args': self.args, 'returned': self.returned, 't': self.t, 't_end': self.t_end,
                'completed': self.completed}


class Observer(object):
    def __init__(self, subject, robot):
        self.subject = subject
        self.robot = robot
        self.sm = subject.source_map
        self.filename = subject.edprogram.filename
        self.statements = []  # (start, end, block at start, starts that block?)
        for (line, end_line, col, end_col) in subject.edprogram.statements:
            s, e = self.sm.offset(line, col), self.sm.offset(end_line, end_col)
            spanning = self.sm.blocks_spanning(s, e)
            b = spanning[0] if spanning else None
            starts = b is not None and self.sm.start(b) == s and self.sm.type_of(b) not in FUNCTION_DEF_TYPES
            self.statements.append((s, e, b, starts))
        self.executed = set()
        self.executions = []
        self.current = {}
        self.call_blocks = {}
        self.function_calls = []
        self._depth = 0
        self.main_ran = False

    # ------------------------------------------------------------------ engine listener interface

    def on_statement(self, index):
        self.executed.add(index)
        _, _, block_id, starts = self.statements[index]
        if starts:
            ex = Execution(len(self.executions), self.robot.now, block_id, self.sm.type_of(block_id))
            self.executions.append(ex)
            self.current[block_id] = ex

    def on_ed_call(self, index, frame):
        helper = None
        blocks = []
        f = frame
        while f is not None:
            code = f.f_code
            if code.co_filename == self.filename:
                blocks = self.sm.at_position(instruction_position(code, f.f_lasti))
                if blocks:
                    break
                if code.co_name != '<module>' and not code.co_name.startswith('____'):
                    params = code.co_varnames[:code.co_argcount]
                    helper = (code.co_name, dict((p, nepo_value(f.f_locals.get(p))) for p in params))
            f = f.f_back
        self.call_blocks[index] = blocks
        for b in blocks:
            ex = self.current.get(b)
            if ex is not None:
                ex.calls.append(index)
                if helper is not None:
                    ex.helpers.append(helper)

    def on_prelude_done(self, namespace):
        for name in list(namespace):
            if name.startswith('____') and callable(namespace[name]):
                namespace[name] = self._wrap(name[4:], namespace[name])

    def _wrap(self, nepo_name, fn):
        observer = self

        def nepo_function(*args):
            call = FunctionCall(nepo_name, [nepo_value(a) for a in args], observer.robot.now, observer._depth)
            observer.function_calls.append(call)
            observer._depth += 1
            try:
                result = fn(*args)
            finally:
                observer._depth -= 1
                call.t_end = observer.robot.now
            call.returned = nepo_value(result)
            call.completed = True
            return result

        nepo_function.__name__ = fn.__name__
        return nepo_function

    # ------------------------------------------------------------------ results

    def actions(self):
        """NEPO-level actions: one dict per execution of an action block, in execution order."""
        result = []
        trace = self.robot.trace
        for ex in self.executions:
            if ex.type in ACTION_TYPES:
                result.append(decode_action(ex, self.subject.nepo.block(ex.block_id), trace, self.subject.nepo))
        return result

    def sensor_reads(self):
        """{block id: {'type', 'reads', 'values'}} for sensor blocks that read the robot"""
        reads = {}
        for index, blocks in self.call_blocks.items():
            for b in blocks:
                t = self.sm.type_of(b)
                if t and (t.startswith('robSensors_') or t == 'edisonCommunication_ir_receiveBlock'):
                    r = reads.setdefault(b, {'type': t, 'reads': 0, 'values': {}})
                    r['reads'] += 1
                    v = self.robot.trace[index].result
                    r['values'][str(v)] = r['values'].get(str(v), 0) + 1
                    break
        return reads

    def covered_blocks(self):
        covered = set()
        for index in self.executed:
            s, e, b, _ = self.statements[index]
            for block_id in self.sm.blocks_spanning(s, e):
                if self.sm.type_of(block_id) not in FUNCTION_DEF_TYPES:
                    covered.add(block_id)
        for blocks in self.call_blocks.values():
            covered.update(b for b in blocks if self.sm.type_of(b) not in FUNCTION_DEF_TYPES)
        # expression blocks: covered, if the innermost statement that contains their start was executed
        for block_id in self.sm.blocks:
            enclosing = self.subject.enclosing_statement(block_id)
            if enclosing is not None and enclosing in self.executed and self.sm.type_of(block_id) not in FUNCTION_DEF_TYPES:
                covered.add(block_id)
        called = set(c.name for c in self.function_calls)
        for f in self.subject.nepo.functions.values():
            if f.name in called:
                covered.add(f.block.id)
        start = self.subject.nepo.start
        if start is not None and self.main_ran:
            covered.add(start.id)
        return covered


def _field(block, name, default=None):
    return block.fields.get(name, default) if block is not None else default


def _helper(ex, name):
    for helper_name, params in ex.helpers:
        if helper_name == name:
            return params
    return {}


def _ed_calls(ex, trace, name):
    return [trace[i] for i in ex.calls if trace[i].name == name]


# the kind of an action, independent of the block variant (a drive with and without distance is both a 'drive')
ACTION_KINDS = {
    'actions_led_edison': 'led', 'robActions_motorDiff_on': 'drive', 'robActions_motorDiff_on_for': 'drive',
    'robActions_motorDiff_turn': 'turn', 'robActions_motorDiff_turn_for': 'turn', 'robActions_motorDiff_curve': 'curve',
    'robActions_motorDiff_curve_for': 'curve', 'robActions_motorDiff_stop': 'stop', 'robActions_motor_stop': 'stop',
    'robActions_motor_on': 'motor', 'robActions_play_tone': 'tone', 'mbedActions_play_note': 'tone',
    'robActions_play_file': 'sound_file', 'edisonCommunication_ir_sendBlock': 'ir_send', 'robControls_wait_time': 'wait',
    'robControls_wait_for': 'wait_for', 'edisonSensors_sensor_reset': 'sensor_reset',
}
# normalized directions: the XML spells them FOREWARD, BACKWARD or BACKWARDS, RIGHT, LEFT
DIRECTIONS = {'FOREWARD': 'forward', 'FORWARD': 'forward', 'BACKWARD': 'backward', 'BACKWARDS': 'backward', 'RIGHT': 'right', 'LEFT': 'left'}


def decode_action(ex, block, trace, nepo):
    """the NEPO view of one execution of an action block"""
    a = {'t': ex.t, 'block': ex.type, 'block_id': ex.block_id, 'function': nepo.function_of(ex.block_id),
         'action': ACTION_KINDS.get(ex.type, ex.type)}
    t = ex.type
    if t == 'actions_led_edison':
        a.update(port=_field(block, 'ACTORPORT'), mode=_field(block, 'MODE'))
    elif t in ('robActions_motorDiff_on', 'robActions_motorDiff_on_for'):
        h = _helper(ex, '_diffDrive')
        a.update(direction=_field(block, 'DIRECTION'), power=h.get('speed'))
        if t.endswith('_for'):
            a['distance_cm'] = h.get('distance')
    elif t in ('robActions_motorDiff_turn', 'robActions_motorDiff_turn_for'):
        h = _helper(ex, '_diffTurn')
        a.update(direction=_field(block, 'DIRECTION'), power=h.get('speed'))
        if t.endswith('_for'):
            a['degrees'] = h.get('degree')
    elif t in ('robActions_motorDiff_curve', 'robActions_motorDiff_curve_for'):
        h = _helper(ex, '_diffCurve')
        a.update(direction=_field(block, 'DIRECTION'), power_left=h.get('leftSpeed'), power_right=h.get('rightSpeed'))
        if t.endswith('_for'):
            a['distance_cm'] = h.get('distance')
    elif t == 'robActions_motor_on':
        h = _helper(ex, '_motorOn')
        a.update(port=_field(block, 'MOTORPORT'), power=h.get('power'))
    elif t == 'robActions_motor_stop':
        a.update(port=_field(block, 'MOTORPORT'))
    elif t == 'robActions_play_tone':
        tones = _ed_calls(ex, trace, 'PlayTone')
        freq = block.values.get('FREQUENCE').literal() if block is not None and 'FREQUENCE' in block.values else None
        if freq is None and tones and tones[0].args[0]:
            freq = round(8000000.0 / tones[0].args[0])  # the generator emits Ed.PlayTone(8000000/f, ms)
        a.update(frequency_hz=freq, duration_ms=tones[0].args[1] if tones else None)
    elif t == 'mbedActions_play_note':
        a.update(frequency_hz=float(_field(block, 'FREQUENCE', 0)), duration_ms=int(float(_field(block, 'DURATION', 0))))
    elif t == 'robActions_play_file':
        a.update(file=int(_field(block, 'FILE', 0)))
    elif t == 'edisonCommunication_ir_sendBlock':
        a.update(value=_helper(ex, '_irSend').get('payload'))
    elif t == 'robControls_wait_time':
        waits = _ed_calls(ex, trace, 'TimeWait')
        a.update(ms=waits[0].args[0] if waits else None)
    elif t == 'robControls_wait_for':
        a.update(t_end=trace[ex.calls[-1]].t if ex.calls else None)
    elif t == 'edisonSensors_sensor_reset':
        a.update(sensor=_field(block, 'SENSOR'))
    if 'direction' in a:
        a['dir'] = DIRECTIONS.get(a['direction'], a['direction'])
    return a
