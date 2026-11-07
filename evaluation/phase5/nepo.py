"""A small builder for Edison NEPO programs (the block_set XML of the Program tab), for phase 5's corpus.

A program is a main loop that calls one function per level, in a fixed order; each function does one step (reads the sensors, sets the motors,
returns), so a function fixed for one level can't block the ones of later levels. Expressions and statements are XML strings; ids are given when
the program is built.
"""
import itertools
import re

NS = 'http://de.fhg.iais.roberta.blockly'
_ids = itertools.count(1)


def _id():
    return 'p5_%d' % next(_ids)


# ------------------------------------------------------------------------------------------------ expressions

def num(n):
    return '<block type="math_integer" id="{id}" intask="true"><field name="NUM">%d</field></block>' % n


def on_line():
    """the line tracker sees the black line (true, false)"""
    return ('<block type="robSensors_light_getSample" id="{id}" intask="true"><mutation mode="LINE"/><field name="MODE">LINE</field>'
            '<field name="SENSORPORT">LINETRACKER</field><field name="SLOT"/></block>')


def light(port):
    """the light in percent: LINETRACKER the floor under the robot (0 on black, about 83 on the peach floor), LLIGHT and RLIGHT the light
    from above (100 in the open, 40 inside a tunnel)"""
    return ('<block type="robSensors_light_getSample" id="{id}" intask="true"><mutation mode="LIGHT"/><field name="MODE">LIGHT</field>'
            '<field name="SENSORPORT">%s</field><field name="SLOT"/></block>') % port


def obstacle(port):
    """an obstacle ahead of the sensor (FRONT, LEFT, RIGHT; all look forward)"""
    return ('<block type="robSensors_infrared_getSample" id="{id}" intask="true"><mutation mode="OBSTACLE"/><field name="MODE">OBSTACLE</field>'
            '<field name="SENSORPORT">%s</field><field name="SLOT"/></block>') % port


def compare(a, op, b):
    """op: LT, LTE, GT, GTE, EQ, NEQ"""
    b = num(b) if isinstance(b, int) else b
    return ('<block type="logic_compare" id="{id}" intask="true"><field name="OP">%s</field><value name="A">%s</value><value name="B">%s</value>'
            '</block>') % (op, a, b)


def negate(a):
    return '<block type="logic_negate" id="{id}" intask="true"><value name="BOOL">%s</value></block>' % a


# ------------------------------------------------------------------------------------------------ statements

def drive(power):
    return ('<block type="robActions_motorDiff_on" id="{id}" intask="true"><field name="DIRECTION">FOREWARD</field>'
            '<value name="POWER">%s</value></block>') % num(power)


def curve(left, right):
    return ('<block type="robActions_motorDiff_curve" id="{id}" intask="true"><field name="DIRECTION">FOREWARD</field>'
            '<value name="POWER_LEFT">%s</value><value name="POWER_RIGHT">%s</value></block>') % (num(left), num(right))


def stop():
    return '<block type="robActions_motorDiff_stop" id="{id}" intask="true"/>'


def turn(direction, power, degrees):
    """a turn on the spot, LEFT or RIGHT (blocking, but short)"""
    return ('<block type="robActions_motorDiff_turn_for" id="{id}" intask="true"><field name="DIRECTION">%s</field>'
            '<value name="POWER">%s</value><value name="DEGREE">%s</value></block>') % (direction, num(power), num(degrees))


def call(name):
    return '<block type="robProcedures_callnoreturn" id="{id}" intask="true"><mutation name="%s"/></block>' % name


def if_(*branches, otherwise=None):
    """if/else if/else: branches are (condition, [statements]) pairs"""
    n = len(branches)
    if otherwise is not None and not otherwise:  # an empty else: a learner deletes it (the simulator refuses an empty one)
        otherwise = None
    parts = ''.join('<value name="IF%d">%s</value><statement name="DO%d">%s</statement>' % (i, c, i, ''.join(s)) for i, (c, s) in enumerate(branches))
    if otherwise is None and n == 1:  # a plain if: no mutation, no repetitions (as the Lab writes it)
        return '<block type="robControls_if" id="{id}" intask="true">%s</block>' % parts
    if otherwise is None:  # if / else if: robControls_if with a mutation
        return '<block type="robControls_if" id="{id}" intask="true"><mutation elseif="%d"/><repetitions>%s</repetitions></block>' % (n - 1, parts)
    parts += '<statement name="ELSE">%s</statement>' % ''.join(otherwise)
    mutation = '<mutation%s else="1"/>' % (' elseif="%d"' % (n - 1) if n > 1 else '')
    return '<block type="robControls_ifElse" id="{id}" intask="true">%s<repetitions>%s</repetitions></block>' % (mutation, parts)


# ------------------------------------------------------------------------------------------------ programs

def function(name, body):
    """a function without parameters and result (a top-level instance)"""
    return ('<block type="robProcedures_defnoreturn" id="{id}" intask="true"><mutation declare="false"/><field name="NAME">%s</field>'
            '<statement name="STACK">%s</statement></block>') % (name, ''.join(body))


def program(functions, main=None):
    """the program: a main loop calling the functions main (all, in order, if None); functions: [(name, [statements])]"""
    calls = ''.join(call(name) for name in (main if main is not None else [n for n, _ in functions]))
    main = ('<instance x="40" y="40"><block type="robControls_start" id="{id}" intask="true" deletable="false"><mutation declare="false"/>'
            '<field name="DEBUG">FALSE</field></block><block type="robControls_loopForever" id="{id}" intask="true"><statement name="DO">%s'
            '</statement></block></instance>') % calls
    defs = ''.join('<instance x="%d" y="%d">%s</instance>' % (420 + 380 * (i % 2), 40 + 260 * (i // 2), function(name, body))
                   for i, (name, body) in enumerate(functions))
    xml = ('<block_set xmlns="%s" robottype="edison" xmlversion="3.1" description="" tags="">%s%s</block_set>') % (NS, main, defs)
    return re.sub(r'\{id\}', lambda m: _id(), xml)


CONFIG = ('<block_set xmlns="%s" robottype="edison" xmlversion="3.1" description="" tags=""><instance x="0" y="0">'
          '<block type="robBrick_Edison-Brick" id="1" intask="true" deletable="false"/></instance></block_set>') % NS


def export(block_set):
    """the program as the Lab exports it (what import.controller loads)"""
    return '<export xmlns="%s"><program>%s</program><config>%s</config></export>' % (NS, block_set, CONFIG)
