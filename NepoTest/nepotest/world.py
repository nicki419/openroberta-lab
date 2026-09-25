"""What happens around the robot during a test, in NEPO terms (the ports and values of the Edison's sensor blocks).

    World().clap(at=1000).key('PLAY', at=1500).obstacle('FRONT', start=2000, end=2500).light('LLIGHT', 45).line('black', at=3000)

Times are virtual milliseconds from program start. Every generated program first runs a fixed setup block (about 254 ms)
that discards a clap in its first millisecond. JSON form (used in test files), one object per event:

    {"event": "clap", "at": 1000}                          {"event": "key", "port": "PLAY", "at": 1500}
    {"event": "obstacle", "port": "FRONT", "from": 2000, "to": 2500}
    {"event": "light", "port": "LLIGHT", "value": 45, "at": 0}      value as the NEPO light block reports it
    {"event": "line", "color": "black", "at": 3000}        {"event": "remote", "code": 3, "at": 100}
    {"event": "ir_message", "value": 42, "at": 100}         {"event": "strain", "from": 0, "to": 500}
"""

from .engine import Robot

KEY_PORTS = {'PLAY': 'triangle', 'REC': 'round'}
OBSTACLE_PORTS = {'FRONT': 'ahead', 'LEFT': 'left', 'RIGHT': 'right'}
LIGHT_PORTS = {'LLIGHT': 'left', 'RLIGHT': 'right', 'LINETRACKER': 'tracker'}
EVENTS = ('clap', 'key', 'obstacle', 'light', 'line', 'remote', 'ir_message', 'strain')


class World(object):
    def __init__(self, events=None):
        self.events = []
        for e in events or []:
            self.add(e)

    def add(self, event):
        e = dict(event)
        kind = e.get('event')
        if kind not in EVENTS:
            raise ValueError('unknown world event %r (known: %s)' % (kind, ', '.join(EVENTS)))
        if kind == 'key' and e.get('port') not in KEY_PORTS:
            raise ValueError('key port must be PLAY or REC')
        if kind == 'obstacle' and e.get('port') not in OBSTACLE_PORTS:
            raise ValueError('obstacle port must be FRONT, LEFT or RIGHT')
        if kind == 'light' and e.get('port') not in LIGHT_PORTS:
            raise ValueError('light port must be LLIGHT, RLIGHT or LINETRACKER')
        if kind == 'line' and e.get('color') not in ('black', 'white'):
            raise ValueError("line color must be 'black' or 'white'")
        self.events.append(e)
        return self

    def clap(self, at):
        return self.add({'event': 'clap', 'at': at})

    def key(self, port, at):
        return self.add({'event': 'key', 'port': port, 'at': at})

    def obstacle(self, port, start=0, end=None):
        return self.add({'event': 'obstacle', 'port': port, 'from': start, 'to': end})

    def light(self, port, value, at=0):
        return self.add({'event': 'light', 'port': port, 'value': value, 'at': at})

    def line(self, color, at=0):
        return self.add({'event': 'line', 'color': color, 'at': at})

    def remote(self, code, at):
        return self.add({'event': 'remote', 'code': code, 'at': at})

    def ir_message(self, value, at):
        return self.add({'event': 'ir_message', 'value': value, 'at': at})

    def strain(self, start=0, end=None):
        return self.add({'event': 'strain', 'from': start, 'to': end})

    def to_json(self):
        return [dict(e) for e in self.events]

    def build_robot(self, **robot_options):
        """the engine's virtual robot with these events scheduled"""
        robot = Robot(**robot_options)
        for e in self.events:
            kind = e['event']
            if kind == 'clap':
                robot.clap(at=e['at'])
            elif kind == 'key':
                robot.press(KEY_PORTS[e['port']], at=e['at'])
            elif kind == 'obstacle':
                robot.obstacle(OBSTACLE_PORTS[e['port']], start=e.get('from', 0), end=e.get('to'))
            elif kind == 'light':
                # generated code reads `Ed.Read...() / 10`, so a raw level of value * 10 is reported as value
                robot.light(at=e.get('at', 0), **{LIGHT_PORTS[e['port']]: int(e['value']) * 10})
            elif kind == 'line':
                robot.surface(e['color'], at=e.get('at', 0))
            elif kind == 'remote':
                robot.remote(e['code'], at=e['at'])
            elif kind == 'ir_message':
                robot.ir_data(e['value'], at=e['at'])
            elif kind == 'strain':
                robot.strain(start=e.get('from', 0), end=e.get('to'))
        return robot
