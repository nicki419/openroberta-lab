"""A JSON-able description of a NEPO program for test authors and AI test generators: what the program consists of, and
static hints about what is worth testing (part 2 of the project goal). The hints are heuristics, not proofs.

    {"robot_group": "edison",
     "variables": [{"name", "type", "initial", "block_id"}],
     "functions": [{"name", "params": [{"name", "type"}], "returns", "block_id", "calls", "sensors", "actions"}],
     "main": [<outline node>], "sensors": [...], "actions": [...],
     "test_hints": [{"kind", "block_id", "function", "detail", "suggested"}]}
"""

from .nepo import ACTION_TYPES, FUNCTION_CALL_TYPES, SENSOR_TYPES

COMPARE_SYMBOL = {'EQ': '==', 'NEQ': '!=', 'LT': '<', 'LTE': '<=', 'GT': '>', 'GTE': '>='}
LOOP_TYPES = ('controls_whileUntil', 'controls_repeat_ext', 'robControls_loopForever', 'controls_for', 'controls_forEach')


def _sensor_info(b):
    info = {'block_id': b.id, 'type': b.type}
    for key in ('SENSORPORT', 'MODE', 'SENSORTYPE'):
        if b.fields.get(key):
            info[key.lower()] = b.fields[key]
    return info


def _action_info(b):
    info = {'block_id': b.id, 'type': b.type}
    info.update(dict((k.lower(), v) for k, v in b.fields.items()))
    for name, value in b.values.items():
        if b.type == 'robControls_wait_for':
            break  # its inputs are conditions, shown as "until"
        lit = value.literal()
        info[name.lower()] = lit if lit is not None else '<%s>' % value.type
    return info


def _expr(b):
    """a short text for an expression block (for hints)"""
    if b is None:
        return '?'
    lit = b.literal()
    if lit is not None:
        return repr(lit)
    if b.type == 'variables_get':
        return b.fields.get('VAR', '?')
    if b.type == 'logic_compare':
        return '%s %s %s' % (_expr(b.values.get('A')), COMPARE_SYMBOL.get(b.fields.get('OP'), '?'), _expr(b.values.get('B')))
    if b.type == 'math_arithmetic':
        ops = {'ADD': '+', 'MINUS': '-', 'MULTIPLY': '*', 'DIVIDE': '/', 'POWER': '^'}
        return '(%s %s %s)' % (_expr(b.values.get('A')), ops.get(b.fields.get('OP'), '?'), _expr(b.values.get('B')))
    if b.type in FUNCTION_CALL_TYPES:
        return '%s(...)' % b.mutation.get('name')
    if b.type in SENSOR_TYPES:
        name = b.type.replace('robSensors_', '').replace('_getSample', '')
        return '%s[%s]' % (name, b.fields['SENSORPORT']) if b.fields.get('SENSORPORT') else name
    return '<%s>' % b.type


def _outline(b):
    node = {'block_id': b.id, 'type': b.type}
    if b.type in ACTION_TYPES:
        node.update(_action_info(b))
    if b.type == 'robControls_if' or b.type == 'robControls_ifElse' or b.type == 'controls_whileUntil':
        node['condition'] = _expr(b.values.get('IF0') or b.values.get('BOOL'))
    if b.type == 'robControls_wait_for':
        node['until'] = [_expr(b.values[k]) for k in sorted(b.values) if k.startswith('WAIT')]
    if b.type in FUNCTION_CALL_TYPES:
        node['function'] = b.mutation.get('name')
    body = [_outline(c) for name, seq in sorted(b.statements.items()) for c in seq]
    if body:
        node['body'] = body
    return node


def _hints(program):
    hints = []

    def add(kind, b, detail, suggested=None):
        h = {'kind': kind, 'block_id': b.id, 'function': program.function_of(b.id), 'detail': detail}
        if suggested is not None:
            h['suggested'] = suggested
        hints.append(h)

    for f in program.functions.values():
        add('function', f.block, 'function %s(%s)%s' % (f.name, ', '.join(p for p, _ in f.params),
                                                      ' returns ' + f.returns if f.returns else ''),
            {'call_with': 'boundary values of the comparisons below, 0, negative numbers, and values near +-32767'})
    for b in program.generated_blocks():
        if b.type == 'logic_compare':
            a, c = b.values.get('A'), b.values.get('B')
            for var, const in ((a, c), (c, a)):
                if var is not None and const is not None and const.literal() is not None and var.literal() is None \
                        and isinstance(const.literal(), int):
                    n = const.literal()
                    add('boundary', b, _expr(b), {'values': [n - 1, n, n + 1], 'of': _expr(var)})
        elif b.type == 'math_arithmetic' and b.fields.get('OP') == 'DIVIDE':
            divisor = b.values.get('B')
            if divisor is not None and divisor.literal() is None:
                add('division', b, _expr(b), {'divisor': _expr(divisor), 'values': [0], 'note': 'integer division rounds down'})
            add('integer_division', b, _expr(b), {'note': 'EdPy divides integers: 7 / 2 = 3'})
        elif b.type == 'math_modulo':
            add('division', b, 'remainder', {'divisor': _expr(b.values.get('DIVISOR')), 'values': [0]})
        elif b.type in ('robLists_getIndex', 'robLists_setIndex'):
            at = b.values.get('AT')
            if at is not None and at.literal() is None:
                add('list_index', b, 'list index %s' % _expr(at), {'values': [-1, 0, 'length - 1', 'length']})
        elif b.type == 'robControls_wait_for':
            sensors = [_sensor_info(s) for s in b.walk() if s.type in SENSOR_TYPES]
            add('wait_for_sensor', b, 'waits until ' + ' / '.join(_expr(b.values[k]) for k in sorted(b.values)),
                {'scenarios': ['the event never happens', 'it happens once', 'it happens twice between two reads',
                               'it happens during the setup block (first 250 ms)'], 'sensors': sensors})
        elif b.type in LOOP_TYPES:
            add('loop', b, b.type, {'iterations': [0, 1, 'many'], 'note': 'a loop that never ends leaves the run with status "running"'})
        elif b.type == 'logic_operation':
            right = b.values.get('B')
            if right is not None and any(s.type in SENSOR_TYPES or s.type in FUNCTION_CALL_TYPES for s in right.walk()):
                add('eager_and_or', b, _expr(b), {'note': 'both sides are always evaluated on the Edison; sensors are read (and cleared)'})
        elif b.type in ('robActions_play_tone',):
            add('output', b, 'tone', {'note': 'the buzzer plays 4 x the NEPO frequency'})
    return hints


def describe(program):
    sensors = [dict(_sensor_info(b), function=program.function_of(b.id)) for b in program.generated_blocks() if b.type in SENSOR_TYPES]
    actions = [dict(_action_info(b), function=program.function_of(b.id)) for b in program.generated_blocks() if b.type in ACTION_TYPES]
    functions = []
    for f in program.functions.values():
        blocks = list(f.block.walk())
        functions.append({
            'name': f.name, 'block_id': f.block.id, 'returns': f.returns,
            'params': [{'name': n, 'type': t} for n, t in f.params],
            'calls': sorted(set(b.mutation.get('name') for b in blocks if b.type in FUNCTION_CALL_TYPES)),
            'sensors': sorted(set(b.type for b in blocks if b.type in SENSOR_TYPES)),
            'actions': sorted(set(b.type for b in blocks if b.type in ACTION_TYPES)),
        })
    return {
        'robot_group': program.robot_group,
        'variables': [{'name': v.name, 'type': v.type, 'initial': v.initial, 'block_id': v.block.id} for v in program.variables],
        'functions': functions,
        'main': [_outline(b) for b in program.main if b.generated],
        'sensors': sensors,
        'actions': actions,
        'test_hints': _hints(program),
    }
