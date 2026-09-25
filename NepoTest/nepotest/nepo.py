"""The NEPO program: blocks, variables, functions and the main program, read from the Lab's XML (export or program XML).

    program = NepoProgram.from_file('clap_counter.xml')
    program.variables       [Variable('claps', 'Number', 0, block), ...]
    program.functions       {'clampSpeed': Function(...), ...}
    program.main            the statement blocks connected to the start block
    program.block('cc12')   any block by its id
    program.describe()      a JSON-able summary, including test hints (see summary.py)
"""

import re
import xml.etree.ElementTree as ET

NS = '{http://de.fhg.iais.roberta.blockly}'

# block types whose code the Edison generator emits as a statement that "does something" on the robot
ACTION_TYPES = frozenset([
    'actions_led_edison', 'robActions_motorDiff_on', 'robActions_motorDiff_on_for', 'robActions_motorDiff_turn',
    'robActions_motorDiff_turn_for', 'robActions_motorDiff_curve', 'robActions_motorDiff_curve_for', 'robActions_motorDiff_stop',
    'robActions_motor_on', 'robActions_motor_stop', 'robActions_play_tone', 'mbedActions_play_note', 'robActions_play_file',
    'edisonCommunication_ir_sendBlock', 'robControls_wait_time', 'robControls_wait_for', 'edisonSensors_sensor_reset',
])
SENSOR_TYPES = frozenset([
    'robSensors_key_getSample', 'robSensors_infrared_getSample', 'robSensors_light_getSample', 'robSensors_sound_getSample',
    'robSensors_irseeker_getSample', 'robSensors_getSample', 'edisonCommunication_ir_receiveBlock',
])
FUNCTION_DEF_TYPES = frozenset(['robProcedures_defnoreturn', 'robProcedures_defreturn'])
FUNCTION_CALL_TYPES = frozenset(['robProcedures_callnoreturn', 'robProcedures_callreturn'])


def _tag(el):
    return el.tag[len(NS):] if el.tag.startswith(NS) else el.tag


class Block(object):
    """One NEPO block. fields: {name: text}; values: {input name: Block}; statements: {input name: [Block]}."""

    def __init__(self, el, parent=None, parent_input=None):
        self.id = el.get('id')
        self.type = el.get('type')
        self.in_task = el.get('intask') != 'false'
        self.disabled = el.get('disabled') == 'true'
        self.parent = parent
        self.parent_input = parent_input
        self.fields = {}
        self.values = {}
        self.statements = {}
        self.mutation = {}
        self.mutation_args = []
        self.errors = []
        self.warnings = []
        for child in _flatten(el):
            tag = _tag(child)
            if tag == 'field':
                self.fields[child.get('name')] = (child.text or '').strip()
            elif tag == 'mutation':
                self.mutation = dict(child.attrib)
                self.mutation_args = [dict(a.attrib) for a in child if _tag(a) == 'arg']
            elif tag == 'value':
                blocks = [b for b in child if _tag(b) == 'block']
                if blocks:
                    self.values[child.get('name')] = Block(blocks[0], self, child.get('name'))
            elif tag == 'statement':
                self.statements[child.get('name')] = [Block(b, self, child.get('name')) for b in child if _tag(b) == 'block']
            elif tag == 'error':
                self.errors.append((child.text or '').strip())
            elif tag == 'warning':
                self.warnings.append((child.text or '').strip())

    def children(self):
        for b in self.values.values():
            yield b
        for seq in self.statements.values():
            for b in seq:
                yield b

    def walk(self):
        yield self
        for c in self.children():
            for d in c.walk():
                yield d

    @property
    def generated(self):
        """False if the generator skips the block (disabled, or not connected to the program)."""
        b = self
        while b is not None:
            if b.disabled or not b.in_task:
                return False
            b = b.parent
        return True

    def literal(self):
        """The value of a literal block (number, boolean, list of literals), else None."""
        if self.type in ('math_number', 'math_integer'):
            text = self.fields.get('NUM', '')
            try:
                value = float(text)
            except ValueError:
                return None
            return int(value) if value == int(value) else value
        if self.type == 'logic_boolean':
            return self.fields.get('BOOL') == 'TRUE'
        if self.type == 'robLists_create_with':
            items = [self.values.get('ADD%d' % i) for i in range(int(self.mutation.get('items', 0)))]
            values = [b.literal() if b is not None else None for b in items]
            return values if None not in values else None
        return None

    def __repr__(self):
        return '<Block %s %s>' % (self.type, self.id)


def _flatten(el):
    # robProcedures_defreturn wraps its inputs in <repetitions>
    for child in el:
        if _tag(child) == 'repetitions':
            for c in child:
                yield c
        else:
            yield child


class Variable(object):
    def __init__(self, name, type_, initial, block):
        self.name, self.type, self.initial, self.block = name, type_, initial, block

    def __repr__(self):
        return 'Variable(%r, %r, %r)' % (self.name, self.type, self.initial)


class Function(object):
    def __init__(self, block):
        self.block = block
        self.name = block.fields.get('NAME')
        self.params = [(p.fields.get('VAR'), p.fields.get('TYPE')) for p in block.statements.get('ST', [])]
        self.returns = block.fields.get('TYPE') if block.type == 'robProcedures_defreturn' else None
        self.body = block.statements.get('STACK', [])
        self.return_block = block.values.get('RETURN')

    def __repr__(self):
        return 'Function(%s(%s) -> %s)' % (self.name, ', '.join('%s: %s' % p for p in self.params), self.returns)


class NepoProgram(object):
    def __init__(self, xml_text):
        self.xml = xml_text
        program_xml = _program_part(xml_text)
        root = ET.fromstring(program_xml)
        self.robot_group = root.get('robottype')
        self.instances = []  # each: list of top-level blocks (a chain)
        for inst in root:
            if _tag(inst) == 'instance':
                self.instances.append([Block(b) for b in inst if _tag(b) == 'block'])
        self._blocks = {}
        for chain in self.instances:
            for top in chain:
                for b in top.walk():
                    self._blocks[b.id] = b
        self.start = None
        self.main = []
        self.functions = {}
        for chain in self.instances:
            if chain and chain[0].type == 'robControls_start':
                self.start, self.main = chain[0], chain[1:]
            for top in chain:
                if top.type in FUNCTION_DEF_TYPES and top.generated:
                    f = Function(top)
                    self.functions[f.name] = f
        self.variables = []
        if self.start is not None:
            for decl in self.start.statements.get('ST', []):
                initial = decl.values.get('VALUE')
                self.variables.append(Variable(decl.fields.get('VAR'), decl.fields.get('TYPE'),
                                               initial.literal() if initial is not None else None, decl))
        # parent links for top-level chains: blocks after the first in a chain have no XML parent, but belong to it
        self._owner = {}
        for chain in self.instances:
            for top in chain:
                owner = top.fields.get('NAME') if top.type in FUNCTION_DEF_TYPES else None
                for b in top.walk():
                    self._owner[b.id] = owner

    @classmethod
    def from_file(cls, path):
        with open(path, encoding='utf-8') as f:
            return cls(f.read())

    @property
    def blocks(self):
        return dict(self._blocks)

    def block(self, block_id):
        return self._blocks.get(block_id)

    def function_of(self, block_id):
        """The name of the NEPO function a block belongs to, or None for the main program."""
        return self._owner.get(block_id)

    def generated_blocks(self):
        return [b for b in self._blocks.values() if b.generated]

    def errors(self):
        """[(block, message)] of the Lab's annotations, if the XML came back from the Lab."""
        return [(b, e) for b in self._blocks.values() for e in b.errors]

    def describe(self):
        from .summary import describe
        return describe(self)


def _program_part(xml_text):
    """The <block_set> of the program: from an export (<export><program>...</program><config>...) or as is."""
    m = re.search(r'<program>\s*(.*?)\s*</program>', xml_text, re.S)
    return m.group(1) if m else xml_text.strip()


def config_part(xml_text):
    m = re.search(r'<config>\s*(.*?)\s*</config>', xml_text, re.S)
    return m.group(1) if m else None
