"""What the robot is doing over time, in NEPO terms, and the "states" expectations of test files.

The engine logs every change of the robot's motors, LEDs and sound (Robot.state_log); the observer can add the global
variables of the program. A Timeline turns that into moments: each moment has a start time and a snapshot

    motor.left, motor.right   ('forward' | 'backward' | 'stopped', power %)   power: speed level x 10, the robot's steps
    led.left, led.right       True / False
    sound                     None (silent), or {'kind': 'tone' | 'file' | 'beep', 'frequency_hz': the NEPO Hz or None}
    var.<name>                the value of a global variable (only if variables are tracked)

and lasts until the next moment (the last one until the run ended). The changes one block makes within MERGE_MS count
as one change: a curve starts both wheels with two calls 1 ms apart, and stops the other wheel 1 ms after the first one
has driven its distance; nobody means the 1 ms in between.

A state expectation is {"state": <state>, <timing>} (docs/ai/nepo-unit-testing.md, "States"):

    states   {"motor": "left" | "right" | "both", "is": "forward" | "backward" | "running" | "stopped", "power": m}
             {"robot": "forward" | "backward" | "turn_left" | "turn_right" | "curve_left" | "curve_right" | "still", "power": m}
             {"led": "left" | "right" | "both" | "either", "is": "on" | "off"}
             {"sound": "silent" | "any" | "tone" | "file" | "beep", "frequency_hz": m}
             {"variable": "x", "value": m}          {"all": [...]}  {"any": [...]}  {"not": <state>}
    timings  "at": "end" | ms          "always" | "never" | "sometime": {"from": ms, "to": ms}  (both optional)
             "after": <event>, "within_ms": n, "each": true | false      "while": <condition>, "delay_ms": n
             "for_ms": m (time in the state, in total)                  "starts": m (how often it began)
    events   {"event": "clap" | "key" | "remote" | "ir_message"}  {"event": "obstacle", "edge": "start" | "end"}
             {"event": "line", "color": "black" | "white"}      (optional "port" for key and obstacle)
    conditions  {"obstacle": "FRONT" | "LEFT" | "RIGHT" | "any"}  {"line": "black" | "white"}  {"light": port, "value": m}

(m: a value or matcher, see matching.py.) Events and conditions come from the test's world ("given").
"""

import math

from .matching import describe_matcher, is_matcher, value_matches

MERGE_MS = 10
SIDES = ('left', 'right')
INITIAL = {'motor.left': ('stopped', 0), 'motor.right': ('stopped', 0), 'led.left': False, 'led.right': False, 'sound': None}

MOTOR_IS = ('forward', 'backward', 'running', 'stopped')
MOVES = ('forward', 'backward', 'turn_left', 'turn_right', 'curve_left', 'curve_right', 'still')
MOVES_WITH_POWER = ('forward', 'backward', 'turn_left', 'turn_right')
LED_SIDES = ('left', 'right', 'both', 'either')
SOUNDS = ('silent', 'any', 'tone', 'file', 'beep')
TIMINGS = ('at', 'always', 'never', 'sometime', 'after', 'while', 'for_ms', 'starts')
QUANTIFIERS = ('always', 'never', 'sometime')
EVENT_KINDS = ('clap', 'key', 'obstacle', 'line', 'remote', 'ir_message')
LIGHT_PORTS = ('LLIGHT', 'RLIGHT', 'LINETRACKER')
OBSTACLE_PORTS = ('FRONT', 'LEFT', 'RIGHT')


# ---------------------------------------------------------------------- the timeline

class Moment(object):
    """the robot's state from `t` on: `state` (see the module doc), for every key the time it last changed (`since`)
    and the program block that changed it (`cause`, None if unknown)"""
    __slots__ = ('t', 'state', 'since', 'cause', 'group', 'changed')

    def __init__(self, t, state, since, cause):
        self.t, self.state, self.since, self.cause = t, state, since, cause
        self.group = None  # the block execution whose changes this moment collects ('var' for a variable change)
        self.changed = set()


class Timeline(object):
    """moments: [Moment] in time order, the first at t = 0; start: when the program's own code began (after the setup
    block); end: when the run (or call) ended"""

    def __init__(self, moments, start, end):
        self.moments, self.start, self.end = moments, start, end

    @classmethod
    def of(cls, robot, observer):
        """the timeline of an observed run: robot.state_log, with causes from observer.call_exec"""
        executions = getattr(observer, 'call_exec', {})
        first = Moment(0.0, dict(INITIAL), dict.fromkeys(INITIAL, 0.0), {})
        moments = [first]
        entries = sorted(enumerate(robot.state_log), key=lambda e: (e[1].t, e[0]))
        for _, change in entries:
            ex = executions.get(change.cause) if change.cause is not None else None
            key, value = _nepo_state(change, ex)
            robot_change = change.kind in ('set', 'end')
            # a drive that ends by itself belongs to its block too: the curve block stops its other wheel 1 ms later
            group = ex.index if (robot_change and ex is not None) else None
            m = moments[-1]
            merge = robot_change and m.group != 'var' and (
                change.t == m.t or (group is not None and group == m.group and change.t - m.t <= MERGE_MS))
            if merge:
                if change.t != m.t:  # the whole group of changes happens at its last change
                    for k in m.changed:
                        m.since[k] = change.t
                    m.t = change.t
            else:
                m = Moment(change.t, dict(m.state), dict(m.since), dict(m.cause))
                moments.append(m)
            m.state[key] = value
            m.since[key] = change.t
            m.cause[key] = ex.block_id if ex is not None else None
            m.changed.add(key)
            m.group = group if robot_change else 'var'
        start = robot.program_start_ms if robot.program_start_ms is not None else 0.0
        return cls(moments, start, robot.now)

    def at(self, t):
        """the moment at time t (after all changes at t)"""
        found = self.moments[0]
        for m in self.moments:
            if m.t > t:
                break
            found = m
        return found

    def spans(self, a, b, include_end=True, keys=None):
        """[(moment, from, to)]: the moments that overlap [a, b), and the ones of zero length within [a, b]
        (include_end=False: within [a, b)). keys: only zero-length moments that changed one of these keys (a variable
        that had a value for an instant counts; the old LED state in the instant a variable changed doesn't)"""
        out = []
        n = len(self.moments)
        for i, m in enumerate(self.moments):
            s = m.t
            e = self.moments[i + 1].t if i + 1 < n else self.end
            if s > b:
                break
            if e == s:
                if a <= s <= b and (include_end or s < b) and (keys is None or m.changed & keys or i + 1 == n):
                    out.append((m, s, e))
            elif min(e, b) > max(s, a) or (a == b and s <= a < e):
                out.append((m, max(s, a), min(e, b)))
        return out

    def format(self):
        """the timeline as text, one moment per line (for debugging and the CLI)"""
        lines = []
        for m in self.moments:
            lines.append('%9.1f ms  %s' % (m.t, describe_snapshot(m.state)))
        return '\n'.join(lines)

    def to_json(self):
        return [{'t': m.t, 'state': dict((k, v) for k, v in m.state.items())} for m in self.moments]


def _nepo_state(change, ex):
    key, value = change.key, change.value
    if key.startswith('motor.'):
        sign, level = value
        if not sign:
            return key, ('stopped', 0)
        return key, ('forward' if sign > 0 else 'backward', (level or 10) * 10)  # level 0 while moving: SPEED_FULL
    if key.startswith('led.'):
        return key, bool(value)
    if key == 'sound':
        if value is None:
            return key, None
        kind, code = value
        if kind == 'tone':
            # the generator emits Ed.PlayTone(8000000/f) for the tone block and Ed.PlayTone(4000000/f) for the note block
            numerator = 4000000.0 if ex is not None and ex.type == 'mbedActions_play_note' else 8000000.0
            return key, {'kind': 'tone', 'frequency_hz': int(round(numerator / code)) if code else None}
        if kind == 'tune':
            return key, {'kind': 'file', 'frequency_hz': None}
        return key, {'kind': 'beep', 'frequency_hz': None}
    return key, value


# ---------------------------------------------------------------------- states

def movement(state):
    """(move, power): what the robot as a whole does. turn_*: the wheels run in opposite directions; curve_*: they run
    at different speeds (or one stands), and the front swings left or right; power: None for curves"""
    sl, sr = _signed(state['motor.left']), _signed(state['motor.right'])
    if sl == 0 and sr == 0:
        return 'still', 0
    if sl == sr:
        return ('forward' if sl > 0 else 'backward'), abs(sl)
    if sl * sr < 0:
        return ('turn_right' if sl > 0 else 'turn_left'), max(abs(sl), abs(sr))
    return ('curve_left' if sr > sl else 'curve_right'), None


def _signed(motor):
    direction, power = motor
    return power if direction == 'forward' else -power if direction == 'backward' else 0


def holds(spec, state):
    """does the state `spec` hold in the snapshot `state`?"""
    if 'all' in spec:
        return all(holds(s, state) for s in spec['all'])
    if 'any' in spec:
        return any(holds(s, state) for s in spec['any'])
    if 'not' in spec:
        return not holds(spec['not'], state)
    if 'motor' in spec:
        sides = SIDES if spec['motor'] == 'both' else (spec['motor'],)
        return all(_motor_holds(spec, state['motor.' + side]) for side in sides)
    if 'robot' in spec:
        move, power = movement(state)
        return move == spec['robot'] and ('power' not in spec or (power is not None and power_matches(spec['power'], power)))
    if 'led' in spec:
        want = spec.get('is', 'on') == 'on'
        side = spec['led']
        if side == 'both':
            return state['led.left'] == want and state['led.right'] == want
        if side == 'either':
            return state['led.left'] == want or state['led.right'] == want
        return state['led.' + side] == want
    if 'sound' in spec:
        sound, kind = state['sound'], spec['sound']
        if kind == 'silent':
            return sound is None
        if kind == 'any':
            return sound is not None
        if sound is None or sound['kind'] != kind:
            return False
        return 'frequency_hz' not in spec or (sound['frequency_hz'] is not None and value_matches(spec['frequency_hz'], sound['frequency_hz']))
    if 'variable' in spec:
        key = 'var.' + spec['variable']
        return key in state and value_matches(spec['value'], state[key])
    raise ValueError('unknown state %r' % (spec,))


def _motor_holds(spec, motor):
    direction, power = motor
    want = spec.get('is', 'running')
    if want == 'stopped':
        return direction == 'stopped'
    if direction == 'stopped' or (want in ('forward', 'backward') and direction != want):
        return False
    return 'power' not in spec or power_matches(spec['power'], power)


def power_matches(expected, power):
    """power: what the robot runs at (speed level x 10). A plain number is the NEPO power a program would set, and is
    rounded like the robot does (_shorten: (p + 5) / 10, at most level 10): 45 to 54 all mean 50. Matchers
    ({"min": 45}, ...) compare with the power the robot runs at."""
    if isinstance(expected, (int, float)) and not isinstance(expected, bool):
        return min(int(expected + 5) // 10, 10) * 10 == power
    return value_matches(expected, power)


def keys_of(spec):
    """the snapshot keys a state spec looks at, in a stable order"""
    keys = []
    for sub in spec.get('all', []) + spec.get('any', []) + ([spec['not']] if 'not' in spec else []):
        keys += [k for k in keys_of(sub) if k not in keys]
    if 'motor' in spec:
        keys += ['motor.%s' % s for s in (SIDES if spec['motor'] == 'both' else (spec['motor'],))]
    elif 'robot' in spec:
        keys += ['motor.left', 'motor.right']
    elif 'led' in spec:
        keys += ['led.%s' % s for s in (SIDES if spec['led'] in ('both', 'either') else (spec['led'],))]
    elif 'sound' in spec:
        keys.append('sound')
    elif 'variable' in spec:
        keys.append('var.' + spec['variable'])
    return list(dict.fromkeys(keys))


def uses_variables(entries):
    def any_var(spec):
        return 'variable' in spec or any(any_var(s) for s in spec.get('all', []) + spec.get('any', [])) or \
            ('not' in spec and any_var(spec['not']))
    return any(isinstance(e, dict) and isinstance(e.get('state'), dict) and any_var(e['state']) for e in entries or [])


# ---------------------------------------------------------------------- in words

def _pct(matcher):
    text = describe_matcher(matcher)
    return (text[2:] if text.startswith('= ') else text) + ' %'


def describe(spec):
    """an expected state in words, e.g. 'the left motor runs forward at 50 %'"""
    if 'all' in spec:
        return ' and '.join(describe(s) for s in spec['all'])
    if 'any' in spec:
        return ' or '.join(describe(s) for s in spec['any'])
    if 'not' in spec:
        return 'not (%s)' % describe(spec['not'])
    if 'motor' in spec:
        both = spec['motor'] == 'both'
        who = 'both motors' if both else 'the %s motor' % spec['motor']
        is_ = spec.get('is', 'running')
        if is_ == 'stopped':
            return '%s %s stopped' % (who, 'are' if both else 'is')
        text = '%s %s%s' % (who, 'run' if both else 'runs', '' if is_ == 'running' else ' ' + is_)
        return text + (' at ' + _pct(spec['power']) if 'power' in spec else '')
    if 'robot' in spec:
        text = 'the robot ' + MOVE_WORDS[spec['robot']]
        return text + (' at ' + _pct(spec['power']) if 'power' in spec else '')
    if 'led' in spec:
        side = spec['led']
        who = {'both': 'both LEDs', 'either': 'either LED'}.get(side, 'the %s LED' % side)
        return '%s %s %s' % (who, 'are' if side == 'both' else 'is', spec.get('is', 'on'))
    if 'sound' in spec:
        text = 'the robot ' + SOUND_WORDS[spec['sound']]
        if 'frequency_hz' in spec:
            text += ' of ' + describe_matcher(spec['frequency_hz']).replace('= ', '') + ' Hz'
        return text
    if 'variable' in spec:
        return '%s %s' % (spec['variable'], describe_matcher(spec['value']))
    return repr(spec)


MOVE_WORDS = {'forward': 'drives forward', 'backward': 'drives backward', 'turn_left': 'turns left', 'turn_right': 'turns right',
              'curve_left': 'curves left', 'curve_right': 'curves right', 'still': 'stands still'}
SOUND_WORDS = {'silent': 'is silent', 'any': 'plays a sound', 'tone': 'plays a tone', 'file': 'plays a sound file',
               'beep': 'beeps'}


def _describe_key(key, state):
    value = state.get(key)
    if key.startswith('motor.'):
        direction, power = value
        side = key[len('motor.'):]
        return 'the %s motor is stopped' % side if direction == 'stopped' else 'the %s motor runs %s at %d %%' % (side, direction, power)
    if key.startswith('led.'):
        return 'the %s LED is %s' % (key[len('led.'):], 'on' if value else 'off')
    if key == 'sound':
        if value is None:
            return 'the robot is silent'
        if value['kind'] == 'tone':
            return 'the robot plays a tone of %s Hz' % value['frequency_hz']
        return 'the robot ' + SOUND_WORDS[value['kind']]
    if key.startswith('var.'):
        name = key[len('var.'):]
        return '%s has no value yet' % name if key not in state else '%s = %s' % (name, _show(value))
    return '%s = %r' % (key, value)


def _show(v):
    if isinstance(v, bool):
        return 'true' if v else 'false'
    return str(v)


def describe_actual(spec, moment):
    """what the moment shows for the keys the spec looks at, e.g. 'the robot stands still (since 1250 ms)'"""
    parts = []
    keys = keys_of(spec)
    if _mentions(spec, 'robot'):
        move, power = movement(moment.state)
        parts.append('the robot ' + MOVE_WORDS[move] + (' at %d %%' % power if move in MOVES_WITH_POWER else ''))
    for k in keys:
        if k.startswith('motor.') and not _mentions(spec, 'motor'):
            continue  # "robot" states: the movement says it
        parts.append(_describe_key(k, moment.state))
    since = max([moment.since.get(k, 0.0) for k in keys] or [moment.t])
    return '%s (since %s ms)' % (', '.join(dict.fromkeys(parts)), _ms(since))


def _mentions(spec, kind):
    """does the state spec contain a primitive state of this kind ('robot', 'motor', ...)?"""
    return kind in spec or any(_mentions(s, kind) for s in spec.get('all', []) + spec.get('any', [])) or \
        ('not' in spec and _mentions(spec['not'], kind))


def describe_snapshot(state):
    parts = []
    move, power = movement(state)
    parts.append(MOVE_WORDS[move] + (' %d %%' % power if move in MOVES_WITH_POWER else ''))
    for side in SIDES:
        direction, p = state['motor.' + side]
        parts.append('%s motor %s' % (side, 'stopped' if direction == 'stopped' else '%s %d %%' % (direction, p)))
    leds = [side for side in SIDES if state['led.' + side]]
    parts.append('LED %s on' % ' and '.join(leds) if leds else 'LEDs off')
    parts.append(_describe_key('sound', state)[len('the robot '):])
    for k in sorted(k for k in state if k.startswith('var.')):
        parts.append('%s = %s' % (k[4:], _show(state[k])))
    return ', '.join(parts)


def _ms(t):
    return ('%.1f' % t).rstrip('0').rstrip('.')


def _cause(spec, moment):
    """the program block that caused the latest change of the keys the spec looks at"""
    keys = keys_of(spec)
    if not keys:
        return None
    key = max(keys, key=lambda k: moment.since.get(k, 0.0))
    return moment.cause.get(key)


# ---------------------------------------------------------------------- the world ("given")

def event_times(spec, events):
    """the times of the world events a spec names, in order"""
    kind = spec.get('event')
    if kind in ('clap', 'remote', 'ir_message'):
        times = [e['at'] for e in events if e['event'] == kind]
    elif kind == 'key':
        times = [e['at'] for e in events if e['event'] == 'key' and spec.get('port') in (None, e.get('port'))]
    elif kind == 'obstacle':
        edge = spec.get('edge', 'start')
        times = []
        for e in events:
            if e['event'] == 'obstacle' and spec.get('port') in (None, 'any', e.get('port')):
                t = e.get('from', 0) if edge == 'start' else e.get('to')
                if t is not None:
                    times.append(t)
    elif kind == 'line':
        times = [t for t, color in _surface_changes(events) if color == spec.get('color')]
    else:
        times = []
    return sorted(times)


def describe_event(spec):
    kind = spec.get('event')
    if kind == 'obstacle':
        where = '' if spec.get('port') in (None, 'any') else ' (%s)' % spec['port']
        return 'obstacle%s %s' % (where, 'appears' if spec.get('edge', 'start') == 'start' else 'disappears')
    if kind == 'line':
        return 'line tracker sees %s' % spec.get('color')
    if kind == 'key':
        return 'key press' + (' (%s)' % spec['port'] if spec.get('port') else '')
    return {'clap': 'clap', 'remote': 'remote code', 'ir_message': 'IR message'}.get(kind, str(kind))


def _surface_changes(events):
    current, out = 'white', []
    for at, color in sorted(((e.get('at', 0), e['color']) for e in events if e['event'] == 'line'), key=lambda p: p[0]):
        if color != current:
            out.append((at, color))
            current = color
    return out


def condition_intervals(cond, events, end):
    """[(from, to)]: when a world condition holds, within [0, end]"""
    if 'obstacle' in cond:
        port = cond['obstacle']
        raw = [(e.get('from', 0), end if e.get('to') is None else e['to']) for e in events
               if e['event'] == 'obstacle' and port in ('any', e.get('port'))]
    elif 'line' in cond:
        raw, t0, current = [], 0, 'white'
        for at, color in _surface_changes(events):
            if current == cond['line']:
                raw.append((t0, at))
            t0, current = at, color
        if current == cond['line']:
            raw.append((t0, end))
    elif 'light' in cond:
        raw, t0, value = [], 0, 0
        changes = sorted(((e.get('at', 0), e['value']) for e in events if e['event'] == 'light' and e['port'] == cond['light']),
                         key=lambda p: p[0])
        for at, v in changes:
            if value_matches(cond['value'], value):
                raw.append((t0, at))
            t0, value = at, v
        if value_matches(cond['value'], value):
            raw.append((t0, end))
    else:
        raw = []
    merged = []
    for s, e in sorted((max(0, s), min(e, end)) for s, e in raw):
        if e <= s:
            continue
        if merged and s <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
        else:
            merged.append((s, e))
    return merged


def describe_condition(cond):
    if 'obstacle' in cond:
        return 'an obstacle is there' if cond['obstacle'] == 'any' else 'an obstacle is there (%s)' % cond['obstacle']
    if 'line' in cond:
        return 'the line tracker sees %s' % cond['line']
    if 'light' in cond:
        return 'light sensor %s reads %s' % (cond['light'], _pct(cond['value']))
    return repr(cond)


# ---------------------------------------------------------------------- checking

def check(entries, timeline, events, name='states'):
    """failures (spec.py's format) of a list of state expectations"""
    failures = []
    for i, entry in enumerate(entries or []):
        f = _check_one(entry, timeline, events or [])
        if f is not None:
            f.update(expect='%s[%d]' % (name, i), expected=entry, described=True)
            failures.append(f)
    return failures


def _fail(message, moment=None, spec=None, t=None):
    actual = None
    if moment is not None:
        keys = keys_of(spec) if spec is not None else list(moment.state)
        actual = {'t': t if t is not None else moment.t, 'state': dict((k, moment.state.get(k)) for k in keys)}
    return {'message': message, 'actual': actual, 'block_id': _cause(spec, moment) if moment is not None and spec is not None else None}


def _check_one(entry, tl, events):
    """None if the expectation holds, else the failure. Messages: '<when>: expected: <state>, but <what was>'"""
    spec = entry['state']
    want = describe(spec)
    end = tl.end
    keys = set(keys_of(spec))
    if 'at' in entry:
        t = end if entry['at'] == 'end' else entry['at']
        when = 'at the end (%s ms)' % _ms(end) if entry['at'] == 'end' else 'at %s ms' % _ms(t)
        if t > end:
            return _fail('%s: expected: %s, but the run ended at %s ms' % (when, want, _ms(end)))
        m = tl.moments[-1] if entry['at'] == 'end' else tl.at(t)
        if holds(spec, m.state):
            return None
        return _fail('%s: expected: %s, but %s' % (when, want, describe_actual(spec, m)), m, spec, t)
    for q in QUANTIFIERS:
        if q in entry:
            window = entry[q] or {}
            a, b = window.get('from', tl.start), min(window.get('to', end), end)
            where = 'during the run' if not window else 'from %s to %s ms' % (_ms(a), _ms(window.get('to', end)))
            if a > end:
                return _fail('%s: expected: %s, but the run ended at %s ms' % (where, want, _ms(end)))
            spans = tl.spans(a, b, keys=keys)
            if q == 'always':
                for m, s, _ in spans:
                    if not holds(spec, m.state):
                        return _fail('%s: expected all the time: %s, but at %s ms %s' % (where, want, _ms(s), describe_actual(spec, m)), m, spec, s)
            elif q == 'never':
                for m, s, _ in spans:
                    if holds(spec, m.state):
                        return _fail('%s: expected never: %s, but at %s ms %s' % (where, want, _ms(s), describe_actual(spec, m)), m, spec, s)
            elif not any(holds(spec, m.state) for m, _, _ in spans):
                seen = list(dict.fromkeys(describe_actual(spec, m).split(' (since')[0] for m, _, _ in spans))
                return _fail('%s: expected at some point: %s, but it never happened. There was: %s'
                             % (where, want, '; '.join(seen[:4]) + ('; ...' if len(seen) > 4 else '')), spans[0][0] if spans else None, spec)
            return None
    if 'after' in entry:
        within = entry.get('within_ms', 0)
        what = describe_event(entry['after'])
        times = event_times(entry['after'], events)
        if not times:
            return _fail('there is no "%s" in "given" of this test' % what)
        if not entry.get('each', True):
            times = times[:1]
        for e in times:
            when = 'within %s ms after the %s at %s ms' % (_ms(within), what, _ms(e))
            if e > end:
                return _fail('%s: expected: %s, but the run ended at %s ms' % (when, want, _ms(end)))
            spans = tl.spans(e, min(e + within, end), keys=keys)
            if not any(holds(spec, m.state) for m, _, _ in spans):
                last = spans[-1][0] if spans else tl.at(e)
                ended = ' (the run ended at %s ms)' % _ms(end) if e + within > end else ''
                return _fail('%s: expected: %s, but %s%s' % (when, want, describe_actual(spec, last), ended), last, spec, e)
        return None
    if 'while' in entry:
        cond = entry['while']
        delay = entry.get('delay_ms', 0)
        intervals = condition_intervals(cond, events, end)
        if not intervals:
            return _fail('"%s" never happens in this test (see "given")' % describe_condition(cond))
        checked = False
        for s, e in intervals:
            if s + delay >= e:
                continue
            checked = True
            for m, t, _ in tl.spans(s + delay, e, include_end=False, keys=keys):
                if not holds(spec, m.state):
                    after = ' (after %s ms)' % _ms(delay) if delay else ''
                    return _fail('while %s, from %s ms: expected%s: %s, but at %s ms %s'
                                 % (describe_condition(cond), _ms(s), after, want, _ms(t), describe_actual(spec, m)), m, spec, t)
        if not checked:
            return _fail('"%s" never lasts longer than %s ms in this test, so nothing was checked' % (describe_condition(cond), _ms(delay)))
        return None
    if 'for_ms' in entry:
        total = int(round(sum(e - s for m, s, e in tl.spans(tl.start, end) if holds(spec, m.state))))
        if value_matches(entry['for_ms'], total):
            return None
        f = _fail('expected: %s, for %s ms in total, but it was %d ms' % (want, describe_matcher(entry['for_ms']).replace('= ', ''), total))
        f['actual'] = total
        return f
    if 'starts' in entry:
        count, prev = 0, holds(spec, tl.moments[0].state)
        for m in tl.moments[1:]:
            h = holds(spec, m.state)
            if h and not prev and tl.start <= m.t <= end:
                count += 1
            prev = h
        if value_matches(entry['starts'], count):
            return None
        f = _fail('expected: %s, beginning %s times, but it began %d times' % (want, describe_matcher(entry['starts']).replace('= ', ''), count))
        f['actual'] = count
        return f
    return _fail('no timing')


# ---------------------------------------------------------------------- measurements (at the end of the run)

def pose_of(robot):
    """where the robot ended, relative to its start: ahead (x) and left (y) in cm, the heading change in degrees
    (counterclockwise: turning left is positive) and the distance driven (mean of both wheels, backward negative)"""
    return {'x_cm': round(robot.x_cm, 2), 'y_cm': round(robot.y_cm, 2), 'heading_deg': round(robot.heading_deg, 2),
            'distance_cm': round((robot.odometer_cm['left'] + robot.odometer_cm['right']) / 2.0, 2)}


def check_measurements(expect, pose):
    failures = []
    if 'distance_cm' in expect and not value_matches(expect['distance_cm'], pose['distance_cm']):
        failures.append({'expect': 'distance_cm', 'expected': expect['distance_cm'], 'actual': pose['distance_cm'],
                         'message': 'expected the robot to have driven %s cm, but it drove %s cm' % (
                             describe_matcher(expect['distance_cm']).replace('= ', ''), _ms(pose['distance_cm'])), 'described': True})
    if 'heading_deg' in expect and not value_matches(expect['heading_deg'], pose['heading_deg']):
        failures.append({'expect': 'heading_deg', 'expected': expect['heading_deg'], 'actual': pose['heading_deg'],
                         'message': 'expected the robot to have turned %s° (left positive), but it turned %s°' % (
                             describe_matcher(expect['heading_deg']).replace('= ', ''), _ms(pose['heading_deg'])), 'described': True})
    if 'end_position' in expect:
        p = expect['end_position']
        off = math.hypot(pose['x_cm'] - p.get('ahead_cm', 0), pose['y_cm'] - p.get('left_cm', 0))
        if off > p.get('tol_cm', 0) + 1e-9:
            failures.append({'expect': 'end_position', 'expected': p, 'actual': {'ahead_cm': pose['x_cm'], 'left_cm': pose['y_cm']},
                             'message': 'expected the robot to end %s cm ahead and %s cm to the left of its start (± %s cm), '
                                        'but it ended %s cm ahead and %s cm to the left (%s cm off)' % (
                                            _ms(p.get('ahead_cm', 0)), _ms(p.get('left_cm', 0)), _ms(p.get('tol_cm', 0)),
                                            _ms(pose['x_cm']), _ms(pose['y_cm']), _ms(round(off, 1))), 'described': True})
    return failures


# ---------------------------------------------------------------------- validation

def validate(entries, where, variables=None):
    """problems of a "states" list; `variables`: the program's variable names (None: not checked)"""
    if not isinstance(entries, list):
        return ['%s must be a list' % where]
    problems = []
    for i, entry in enumerate(entries):
        problems += _validate_entry(entry, '%s[%d]' % (where, i), variables)
    return problems


ENTRY_KEYS = frozenset(['state', 'within_ms', 'each', 'delay_ms']) | frozenset(TIMINGS)


def _validate_entry(entry, where, variables):
    if not isinstance(entry, dict):
        return ['%s must be an object' % where]
    problems = ['%s: unknown key %r' % (where, k) for k in entry if k not in ENTRY_KEYS]
    if 'state' not in entry:
        problems.append('%s: "state" is required' % where)
    else:
        problems += validate_state(entry['state'], where + '.state', variables)
    timings = [k for k in TIMINGS if k in entry]
    if len(timings) != 1:
        problems.append('%s needs exactly one timing of: %s' % (where, ', '.join(TIMINGS)))
        return problems
    timing = timings[0]
    for key, owner in (('within_ms', 'after'), ('each', 'after'), ('delay_ms', 'while')):
        if key in entry and timing != owner:
            problems.append('%s: "%s" only goes with "%s"' % (where, key, owner))
    value = entry[timing]
    if timing == 'at' and value != 'end' and not _nonneg(value):
        problems.append('%s.at must be "end" or a time in ms' % where)
    elif timing in QUANTIFIERS:
        if not isinstance(value, dict) or set(value) - {'from', 'to'} or not all(_nonneg(v) for v in value.values()):
            problems.append('%s.%s must be an object with optional "from" and "to" (ms)' % (where, timing))
        elif 'from' in value and 'to' in value and value['from'] > value['to']:
            problems.append('%s.%s: "from" is after "to"' % (where, timing))
    elif timing == 'after':
        problems += _validate_event(value, where + '.after')
        if not _nonneg(entry.get('within_ms')):
            problems.append('%s: "after" needs "within_ms" (ms)' % where)
        if 'each' in entry and not isinstance(entry['each'], bool):
            problems.append('%s.each must be true or false' % where)
    elif timing == 'while':
        problems += _validate_condition(value, where + '.while')
        if 'delay_ms' in entry and not _nonneg(entry['delay_ms']):
            problems.append('%s.delay_ms must be a time in ms' % where)
    elif timing in ('for_ms', 'starts') and not is_matcher(value):
        problems.append('%s.%s must be a number or a matcher' % (where, timing))
    return problems


def validate_state(spec, where, variables=None):
    if not isinstance(spec, dict) or not spec:
        return ['%s must be a state object' % where]
    problems = []

    def only(*keys):
        extra = [k for k in spec if k not in keys]
        if extra:
            problems.append('%s: unknown key %r' % (where, extra[0]))

    if 'all' in spec or 'any' in spec:
        op = 'all' if 'all' in spec else 'any'
        only(op)
        if not isinstance(spec[op], list) or not spec[op]:
            problems.append('%s.%s must be a non-empty list of states' % (where, op))
        else:
            for i, s in enumerate(spec[op]):
                problems += validate_state(s, '%s.%s[%d]' % (where, op, i), variables)
    elif 'not' in spec:
        only('not')
        problems += validate_state(spec['not'], where + '.not', variables)
    elif 'motor' in spec:
        only('motor', 'is', 'power')
        if spec['motor'] not in ('left', 'right', 'both'):
            problems.append('%s.motor must be left, right or both' % where)
        if spec.get('is', 'running') not in MOTOR_IS:
            problems.append('%s.is must be one of %s' % (where, ', '.join(MOTOR_IS)))
        if 'power' in spec and (spec.get('is') == 'stopped' or not _power_ok(spec['power'])):
            problems.append('%s.power: a power (0 or more) or a matcher, and only for a running motor' % where)
    elif 'robot' in spec:
        only('robot', 'power')
        if spec['robot'] not in MOVES:
            problems.append('%s.robot must be one of %s' % (where, ', '.join(MOVES)))
        elif 'power' in spec and (spec['robot'] not in MOVES_WITH_POWER or not _power_ok(spec['power'])):
            problems.append('%s.power: a power (0 or more) or a matcher, and only for %s' % (where, ', '.join(MOVES_WITH_POWER)))
    elif 'led' in spec:
        only('led', 'is')
        if spec['led'] not in LED_SIDES:
            problems.append('%s.led must be one of %s' % (where, ', '.join(LED_SIDES)))
        if spec.get('is', 'on') not in ('on', 'off'):
            problems.append('%s.is must be on or off' % where)
    elif 'sound' in spec:
        only('sound', 'frequency_hz')
        if spec['sound'] not in SOUNDS:
            problems.append('%s.sound must be one of %s' % (where, ', '.join(SOUNDS)))
        if 'frequency_hz' in spec and (spec['sound'] != 'tone' or not is_matcher(spec['frequency_hz'])):
            problems.append('%s.frequency_hz: a matcher, and only for "tone"' % where)
    elif 'variable' in spec:
        only('variable', 'value')
        if not isinstance(spec['variable'], str):
            problems.append('%s.variable must be a name' % where)
        elif variables is not None and spec['variable'] not in variables:
            problems.append('%s: the program has no variable %r (it has: %s)' % (where, spec['variable'], ', '.join(sorted(variables)) or 'none'))
        if 'value' not in spec or not is_matcher(spec['value']):
            problems.append('%s: "variable" needs a "value" (a value or matcher)' % where)
    else:
        problems.append('%s: unknown state (known: motor, robot, led, sound, variable, all, any, not)' % where)
    return problems


def _validate_event(spec, where):
    if not isinstance(spec, dict) or spec.get('event') not in EVENT_KINDS:
        return ['%s must be an event: {"event": %s}' % (where, ' | '.join(EVENT_KINDS))]
    kind = spec['event']
    allowed = {'key': ('port',), 'obstacle': ('port', 'edge'), 'line': ('color',)}.get(kind, ())
    problems = ['%s: unknown key %r' % (where, k) for k in spec if k != 'event' and k not in allowed]
    if kind == 'key' and spec.get('port') not in (None, 'PLAY', 'REC'):
        problems.append('%s.port must be PLAY or REC' % where)
    if kind == 'obstacle' and spec.get('port') not in (None, 'any') + OBSTACLE_PORTS:
        problems.append('%s.port must be FRONT, LEFT or RIGHT' % where)
    if kind == 'obstacle' and spec.get('edge', 'start') not in ('start', 'end'):
        problems.append('%s.edge must be start or end' % where)
    if kind == 'line' and spec.get('color') not in ('black', 'white'):
        problems.append('%s.color must be black or white' % where)
    return problems


def _validate_condition(cond, where):
    if not isinstance(cond, dict) or len([k for k in ('obstacle', 'line', 'light') if k in cond]) != 1:
        return ['%s must be a condition: {"obstacle": port}, {"line": color} or {"light": port, "value": m}' % where]
    if 'obstacle' in cond:
        ok = set(cond) == {'obstacle'} and cond['obstacle'] in OBSTACLE_PORTS + ('any',)
        return [] if ok else ['%s.obstacle must be FRONT, LEFT, RIGHT or any' % where]
    if 'line' in cond:
        ok = set(cond) == {'line'} and cond['line'] in ('black', 'white')
        return [] if ok else ['%s.line must be black or white' % where]
    ok = set(cond) == {'light', 'value'} and cond['light'] in LIGHT_PORTS and is_matcher(cond['value'])
    return [] if ok else ['%s: "light" needs a port (%s) and a "value" matcher' % (where, ', '.join(LIGHT_PORTS))]


def validate_measurements(expect, where):
    problems = []
    for key in ('distance_cm', 'heading_deg'):
        if key in expect and (not is_matcher(expect[key]) or isinstance(expect[key], bool)):
            problems.append('%s.%s must be a number or a matcher' % (where, key))
    if 'end_position' in expect:
        p = expect['end_position']
        if not isinstance(p, dict) or set(p) - {'ahead_cm', 'left_cm', 'tol_cm'} or \
                not all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in p.values()) or p.get('tol_cm', 0) < 0:
            problems.append('%s.end_position must be {"ahead_cm": n, "left_cm": n, "tol_cm": n}' % where)
    return problems


def _nonneg(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and v >= 0


def _power_ok(v):
    return _nonneg(v) if not isinstance(v, dict) else is_matcher(v)
