"""NEPO block_set XML as short pseudocode (to read and document programs). Unknown blocks are printed by their type."""
import re
import xml.etree.ElementTree as ET

NS = '{http://de.fhg.iais.roberta.blockly}'


def _kids(b, tag, name=None):
    return [c for c in b if c.tag == NS + tag and (name is None or c.get('name') == name)]


def _field(b, name):
    f = _kids(b, 'field', name)
    return f[0].text if f else None


def _value(b, name):
    v = _kids(b, 'value', name)
    if not v:
        return '?'
    blocks = _kids(v[0], 'block')
    return expr(blocks[0]) if blocks else '?'


OPS = {'LT': '<', 'LTE': '<=', 'GT': '>', 'GTE': '>=', 'EQ': '==', 'NEQ': '!=', 'ADD': '+', 'MINUS': '-', 'MULTIPLY': '*', 'DIVIDE': '/',
       'AND': 'and', 'OR': 'or'}


def expr(b):
    t = b.get('type')
    if t in ('math_integer', 'math_number'):
        return _field(b, 'NUM')
    if t == 'logic_boolean':
        return _field(b, 'BOOL').lower()
    if t == 'robSensors_light_getSample':
        return '%s.%s' % (_field(b, 'SENSORPORT'), _field(b, 'MODE').lower())
    if t == 'robSensors_infrared_getSample':
        return 'obstacle(%s)' % _field(b, 'SENSORPORT')
    if t in ('logic_compare', 'math_arithmetic', 'logic_operation'):
        return '(%s %s %s)' % (_value(b, 'A'), OPS.get(_field(b, 'OP'), _field(b, 'OP')), _value(b, 'B'))
    if t == 'logic_negate':
        return 'not %s' % _value(b, 'BOOL')
    if t == 'variables_get':
        return _field(b, 'VAR')
    return '<%s>' % t


def stmts(blocks, depth):
    """consecutive blocks: siblings in the Lab's XML (or a <next> chain)"""
    out = []
    for b in blocks:
        while b is not None:
            out.extend(stmt(b, depth))
            nxt = _kids(b, 'next')
            b = _kids(nxt[0], 'block')[0] if nxt else None
    return out


def _body(b, name, depth):
    s = _kids(b, 'statement', name)
    blocks = _kids(s[0], 'block') if s else []
    return stmts(blocks, depth) if blocks else ['  ' * depth + 'pass']


def stmt(b, depth):
    ind = '  ' * depth
    t = b.get('type')
    if t in ('robControls_if', 'robControls_ifElse', 'controls_if'):
        rep = _kids(b, 'repetitions')
        holder = rep[0] if rep else b
        out = []
        i = 0
        while _kids(holder, 'value', 'IF%d' % i):
            out.append('%s%s %s:' % (ind, 'if' if i == 0 else 'elif', _value(holder, 'IF%d' % i)))
            out.extend(_body(holder, 'DO%d' % i, depth + 1))
            i += 1
        if _kids(holder, 'statement', 'ELSE'):
            out.append(ind + 'else:')
            out.extend(_body(holder, 'ELSE', depth + 1))
        return out
    if t in ('robControls_loopForever', 'controls_whileUntil'):
        return [ind + 'forever:'] + _body(b, 'DO', depth + 1)
    if t == 'robActions_motorDiff_on':
        return [ind + 'drive(%s)' % _value(b, 'POWER')]
    if t == 'robActions_motorDiff_curve':
        return [ind + 'curve(%s, %s)' % (_value(b, 'POWER_LEFT'), _value(b, 'POWER_RIGHT'))]
    if t == 'robActions_motorDiff_stop':
        return [ind + 'stop()']
    if t == 'robActions_motorDiff_turn_for':
        return [ind + 'turn_%s(%s, %s deg)' % (_field(b, 'DIRECTION').lower(), _value(b, 'POWER'), _value(b, 'DEGREE'))]
    if t == 'robActions_motorDiff_turn':
        return [ind + 'turn_%s(%s)' % (_field(b, 'DIRECTION').lower(), _value(b, 'POWER'))]
    if t == 'robActions_motorDiff_on_for':
        return [ind + 'drive(%s, %s cm)' % (_value(b, 'POWER'), _value(b, 'DISTANCE'))]
    if t == 'robProcedures_callnoreturn':
        return [ind + '%s()' % _kids(b, 'mutation')[0].get('name')]
    if t == 'variables_set':
        return [ind + '%s = %s' % (_field(b, 'VAR'), _value(b, 'VALUE'))]
    if t == 'robControls_wait_time':
        return [ind + 'wait(%s ms)' % _value(b, 'WAIT')]
    if t == 'robControls_start':
        return []
    return [ind + '<%s>' % t]


def pseudo(block_set_xml):
    """the program's main and functions as pseudocode lines (instances that don't run are marked)"""
    root = ET.fromstring(block_set_xml)
    out = []
    for inst in root.iter(NS + 'instance'):
        blocks = _kids(inst, 'block')
        if not blocks:
            continue
        first = blocks[0]
        t = first.get('type')
        if t == 'robProcedures_defnoreturn':
            out.append('def %s():' % _field(first, 'NAME'))
            out.extend(_body(first, 'STACK', 1))
        elif t == 'robControls_start':
            out.append('main:')
            out.extend(stmts(blocks, 1))
        elif t.startswith('nepo') or t.startswith('robBrick'):
            continue
        else:
            out.append('(not run) ' + ' / '.join(stmts(blocks, 0)))
    return out


def program_of_export(export_xml):
    """the block_set of the program of an exported program (or the block_set itself)"""
    m = re.search(r'<program>(.*?)</program>', export_xml, re.S)
    return m.group(1) if m else export_xml
