"""The virtual Edison: a clock, scripted sensor inputs, actuator state and a trace of every Ed call.

A test builds a Robot, scripts what happens in the world (claps, key presses, obstacles, surface, light), runs the
program against it, and then inspects the trace and the final state.

Time is virtual and measured in milliseconds from program start (t = 0). It only moves when the program does
something: every Ed call costs `call_cost_ms`, every loop iteration costs `loop_cost_ms`, and blocking calls
(Ed.TimeWait, Ed.Drive with a distance) move the clock by their duration. Nothing runs in real time.

Sensor semantics follow EdPy's library (lib/edpy_code.py of EdPy 1.2.11):
- clap, keypad, obstacle, remote code, IR data, line change and music end are latched registers: an event sets them,
  and the read function returns the value and clears it. Two claps between two reads are seen as one.
- line state, light levels and drive strain are plain state, read at the current time.

Everything that isn't specified by EdPy or the firmware documents is an explicit, documented assumption (speeds, beep
length, tempo, detection latency). See docs/ai/edpy-unit-testing.md, section "Fidelity".
"""

import math
import random
from collections import namedtuple

from . import values as V
from .containers import TuneString
from .errors import EdPyRuntimeError, StopProgram, UnsupportedInMock

Call = namedtuple('Call', 't name args result')
Call.__doc__ = 'One Ed call: start time (ms), function name without "Ed.", argument tuple, return value (None for actions).'

Sound = namedtuple('Sound', 'start end kind code freq_hz tune')

# Ed calls that change the robot or the world (everything else only reads)
ACTIONS = frozenset(['LeftLed', 'RightLed', 'LineTrackerLed', 'ObstacleDetectionBeam', 'SendIRData', 'PlayBeep', 'PlayMyBeep',
                     'PlayTone', 'PlayTune', 'ChangeTempo', 'Drive', 'DriveLeftMotor', 'DriveRightMotor', 'TimeWait',
                     'StartCountDown'])

# ASSUMPTION: wheel speed per speed level in cm/s. Not documented for the Edison; calibrate against a real robot if
# timing matters. SPEED_FULL (0) is treated as SPEED_10.
DEFAULT_CM_PER_S = dict((level, 2.5 * level) for level in range(1, 11))

# derived from lib/edpy_code.py: 8 motor ticks per cm, and a pivot turn (one wheel) of 1 degree is ~1 tick,
# so one full pivot circle is 360 ticks = 45 cm of wheel travel, i.e. the track width is 45 / (2 pi) cm
TICKS_PER_CM = 8
TRACK_CM = 45.0 / (2 * math.pi)

KEYS = {'triangle': V.CONSTANTS['KEYPAD_TRIANGLE'], 'round': V.CONSTANTS['KEYPAD_ROUND']}
OBSTACLE_BITS = {'ahead': V.CONSTANTS['OBSTACLE_AHEAD'], 'left': V.CONSTANTS['OBSTACLE_LEFT'], 'right': V.CONSTANTS['OBSTACLE_RIGHT']}
SURFACES = {'black': 1, 'white': 0}

_MUSIC_TONE_BIT = 0x01
_MUSIC_TUNE_BIT = 0x02


class _Wheel(object):
    __slots__ = ('sign', 'level', 'remaining')

    def __init__(self):
        self.sign = 0  # +1 forward, -1 backward, 0 stopped
        self.level = 0
        self.remaining = None  # cm still to drive, None = unlimited


class Robot(object):
    """The virtual robot. One Robot is used for one program run (or one Session)."""

    def __init__(self, call_cost_ms=1, loop_cost_ms=0, cm_per_s=None, beep_ms=50, seed=0, clear_music_end_on_play=False):
        self.call_cost_ms = call_cost_ms
        self.loop_cost_ms = loop_cost_ms
        self.cm_per_s = dict(DEFAULT_CM_PER_S if cm_per_s is None else cm_per_s)
        self.beep_ms = beep_ms  # ASSUMPTION: length of Ed.PlayBeep(); Ed.PlayMyBeep is 50 ms per edpy_code.py
        # UNKNOWN: whether starting a sound clears a stale 'finished' flag of an earlier one. edpy_code.py doesn't
        # clear it, so by default a flag left by an unread PlayTone makes the next `while ReadMusicEnd() ...` end at once
        self.clear_music_end_on_play = clear_music_end_on_play
        self._rng = random.Random(seed)

        # clock and budgets
        self.now = 0.0
        self.steps = 0
        self._deadline = None
        self._max_steps = None
        self._used = False

        # observations
        self.trace = []
        self.sounds = []
        self.ir_sent = []
        self.setup = {}  # Ed.EdisonVersion / DistanceUnits / Tempo as set by the program
        self.program_start_ms = None  # time when the fixed setup block of a generated program was done
        self._setup_trace_len = 0

        # actuators
        self.leds = {'left': False, 'right': False}
        self.line_tracker_led = False
        self.beam = False
        self._wheels = {'left': _Wheel(), 'right': _Wheel()}
        self.odometer_cm = {'left': 0.0, 'right': 0.0}  # signed wheel travel
        self.x_cm = 0.0
        self.y_cm = 0.0
        self._heading = 0.0  # radians, counterclockwise positive (a right turn makes it negative)
        self._sound = None
        self._tempo = None
        self._countdown_end = None

        # latched registers
        self._clap = False
        self._keys = 0
        self._remote = None
        self._ir = 0
        self._obstacle = 0
        self._line_change = False
        self._music = 0
        self._tune_error = False

        # scripted world
        self._events = []  # (t, seq, kind, value) instantaneous, latched when their time has come
        self._obstacles = []  # (start, end or None, bit)
        self._strains = []  # (start, end or None)
        self._surface_changes = []  # (t, seq, 1|0)
        self._light_changes = []  # (t, seq, dict)
        self._surface = 0  # ASSUMPTION: a white table unless the test says otherwise
        self._light = {'left': 0, 'right': 0, 'tracker': 0}  # raw levels; generated code divides them by 10
        self._seq = 0

    # ------------------------------------------------------------------ scenario (what happens in the world)

    def clap(self, at):
        """A clap (or any loud sound) at time `at` ms."""
        self._schedule(at, 'clap', True)
        return self

    def press(self, key, at):
        """A press of the 'triangle' (play) or 'round' (record) key at time `at` ms."""
        bit = KEYS.get(key, key)
        if bit not in KEYS.values():
            raise ValueError("key must be 'triangle' or 'round'")
        self._schedule(at, 'key', bit)
        return self

    def remote(self, code, at):
        """A TV remote code (0..7, as learned by the robot) received at time `at` ms."""
        if not 0 <= code <= 7:
            raise ValueError('remote code must be 0..7')
        self._schedule(at, 'remote', code)
        return self

    def ir_data(self, byte, at):
        """An IR data byte (0..255, e.g. from another Edison) received at time `at` ms."""
        if not 0 <= byte <= 255:
            raise ValueError('IR data must be a byte')
        self._schedule(at, 'ir', byte)
        return self

    def obstacle(self, where='ahead', start=0, end=None):
        """An obstacle 'ahead', 'left' or 'right' of the robot during [start, end) ms (end None = forever).

        The robot only sees it while its obstacle detection beam is on (the generated helper _obstacleDetection
        switches the beam on at its first use; IR send/receive switches it off)."""
        if where not in OBSTACLE_BITS:
            raise ValueError("where must be 'ahead', 'left' or 'right'")
        self._obstacles.append((start, end, OBSTACLE_BITS[where]))
        return self

    def surface(self, color, at=0):
        """The surface under the line tracker becomes 'black' or 'white' at time `at` ms."""
        self._seq += 1
        self._surface_changes.append((at, self._seq, SURFACES[color]))
        self._surface_changes.sort()
        return self

    def light(self, left=None, right=None, tracker=None, at=0):
        """Raw light levels from time `at` ms on. Generated code reads them as `Ed.Read...LightLevel() / 10`."""
        change = dict((k, v) for k, v in (('left', left), ('right', right), ('tracker', tracker)) if v is not None)
        self._seq += 1
        self._light_changes.append((at, self._seq, change))
        self._light_changes.sort(key=lambda c: (c[0], c[1]))
        return self

    def strain(self, start=0, end=None):
        """The wheels are strained (blocked) during [start, end) ms."""
        self._strains.append((start, end))
        return self

    def _schedule(self, at, kind, value):
        self._seq += 1
        self._events.append((at, self._seq, kind, value))
        self._events.sort()

    # ------------------------------------------------------------------ observation

    def calls(self, *names, **kwargs):
        """The trace, optionally only calls of the given Ed function names. include_setup=False (default) drops the
        calls of the fixed setup block that every generated program starts with."""
        include_setup = kwargs.pop('include_setup', False)
        if kwargs:
            raise TypeError('unexpected arguments %r' % list(kwargs))
        trace = self.trace if include_setup else self.trace[self._setup_trace_len:]
        return [c for c in trace if not names or c.name in names]

    def actions(self, include_setup=False):
        """Only the calls that change the robot (LEDs, driving, sound, IR sending, waiting)."""
        return [c for c in self.calls(include_setup=include_setup) if c.name in ACTIONS]

    def action_names(self, include_setup=False):
        return [c.name for c in self.actions(include_setup)]

    def led_timeline(self, side):
        """[(t, on)] for 'left' or 'right' LED, from the trace."""
        name = {'left': 'LeftLed', 'right': 'RightLed'}[side]
        return [(c.t, bool(c.args[0] & 1)) for c in self.trace if c.name == name]

    @property
    def heading_deg(self):
        """Heading relative to the start, counterclockwise positive (turning right makes it negative)."""
        return math.degrees(self._heading)

    @property
    def pose(self):
        """(x_cm, y_cm, heading_deg): start at (0, 0), facing +x."""
        return (self.x_cm, self.y_cm, self.heading_deg)

    @property
    def moving(self):
        return any(w.sign for w in self._wheels.values())

    def format_trace(self, include_setup=False, collapse=True):
        """The trace as text, one call per line. collapse=True merges runs of identical calls (busy-wait polling)."""
        runs = []
        for c in self.calls(include_setup=include_setup):
            key = (c.name, c.args, c.result)
            if collapse and runs and runs[-1][0] == key:
                runs[-1][2] = c.t
                runs[-1][3] += 1
            else:
                runs.append([key, c.t, c.t, 1])
        lines = []
        for (name, args, result), first, last, count in runs:
            call = 'Ed.%s(%s)%s' % (name, ', '.join(repr(a) for a in args), '' if result is None else ' -> %r' % (result,))
            if count == 1:
                lines.append('%9.1f ms  %s' % (first, call))
            else:
                lines.append('%9.1f ms  %s   x%d until %.1f ms' % (first, call, count, last))
        return '\n'.join(lines)

    # ------------------------------------------------------------------ used by the runner

    def _begin(self, max_time_ms, max_steps):
        if self._used:
            raise RuntimeError('a Robot can only be used for one run; create a new one')
        self._used = True
        self._set_budget(max_time_ms, max_steps)
        self._move_to(0.0)  # latch events scheduled at t = 0

    def _set_budget(self, max_time_ms, max_steps):
        self._deadline = None if max_time_ms is None else self.now + max_time_ms
        self._max_steps = None if max_steps is None else self.steps + max_steps

    def _mark_setup_done(self):
        self.program_start_ms = self.now
        self._setup_trace_len = len(self.trace)

    def _step(self):
        self.steps += 1
        if self._max_steps is not None and self.steps > self._max_steps:
            raise StopProgram('step_limit')

    def _tick(self):
        self._step()
        if self.loop_cost_ms:
            self._advance(self.loop_cost_ms)

    def _advance(self, dt):
        if dt < 0:
            raise ValueError('time can only move forward')
        target = self.now + dt
        if self._deadline is not None and target > self._deadline:
            self._move_to(self._deadline)
            raise StopProgram('time_limit')
        self._move_to(target)

    def _move_to(self, target):
        start = self.now
        self._integrate_motors(target - start)
        if self._sound is not None and self._sound.end <= target:
            self._music |= _MUSIC_TUNE_BIT if self._sound.kind == 'tune' else _MUSIC_TONE_BIT
            self._sound = None
        while self._events and self._events[0][0] <= target:
            _, _, kind, value = self._events.pop(0)
            if kind == 'clap':
                self._clap = True
            elif kind == 'key':
                self._keys |= value
            elif kind == 'remote':
                self._remote = value
            elif kind == 'ir':
                self._ir = value
        while self._surface_changes and self._surface_changes[0][0] <= target:
            _, _, value = self._surface_changes.pop(0)
            if value != self._surface:
                self._line_change = True
            self._surface = value
        while self._light_changes and self._light_changes[0][0] <= target:
            self._light.update(self._light_changes.pop(0)[2])
        if self.beam:
            # ASSUMPTION: while the beam is on, an obstacle is detected without delay, and again right after each read
            for (s, e, bit) in self._obstacles:
                if s <= target and (e is None or e > start):
                    self._obstacle |= V.CONSTANTS['OBSTACLE_DETECTED'] | bit
        self.now = target

    # ------------------------------------------------------------------ motors

    def _speed(self, level):
        return self.cm_per_s[10 if level == 0 else level] / 1000.0  # cm per ms

    def _set_wheel(self, side, sign, level, distance_cm):
        w = self._wheels[side]
        w.sign, w.level = sign, level
        w.remaining = distance_cm if sign else None

    def _integrate_motors(self, dt):
        while dt > 1e-9 and self.moving:
            step = dt
            for w in self._wheels.values():
                if w.sign and w.remaining is not None:
                    step = min(step, w.remaining / self._speed(w.level))
            travel = {}
            for side, w in self._wheels.items():
                travel[side] = w.sign * self._speed(w.level) * step if w.sign else 0.0
            self._move_pose(travel['left'], travel['right'])
            for side, w in self._wheels.items():
                self.odometer_cm[side] += travel[side]
                if w.sign and w.remaining is not None:
                    w.remaining -= abs(travel[side])
                    if w.remaining <= 1e-9:
                        w.sign, w.remaining = 0, None
            dt -= step

    def _move_pose(self, dl, dr):
        dth = (dr - dl) / TRACK_CM
        ds = (dl + dr) / 2.0
        if abs(dth) < 1e-12:
            self.x_cm += ds * math.cos(self._heading)
            self.y_cm += ds * math.sin(self._heading)
        else:
            r = ds / dth
            self.x_cm += r * (math.sin(self._heading + dth) - math.sin(self._heading))
            self.y_cm -= r * (math.cos(self._heading + dth) - math.cos(self._heading))
            self._heading += dth

    def _block_until_wheels_done(self):
        waits = [w.remaining / self._speed(w.level) for w in self._wheels.values() if w.sign and w.remaining is not None]
        if waits:
            self._advance(max(waits))

    @staticmethod
    def _check_speed(speed):
        if speed < 0:
            raise EdPyRuntimeError('negative speed %d (the robot would misinterpret it)' % speed)
        return min(speed, 10)

    # ------------------------------------------------------------------ Ed API (called through edtest.ed_module)

    def ed_LeftLed(self, state):
        self.leds['left'] = bool(state & 1)

    def ed_RightLed(self, state):
        self.leds['right'] = bool(state & 1)

    def ed_LineTrackerLed(self, state):
        self.line_tracker_led = bool(state & 1)

    def ed_ObstacleDetectionBeam(self, state):
        self.beam = bool(state & 1)
        if not self.beam:
            self._obstacle = 0  # ASSUMPTION: switching the beam off drops a pending detection

    def ed_SendIRData(self, byte):
        self.ir_sent.append((self.now, byte & 0xFF))

    def ed_TimeWait(self, time, units):
        self._advance(self._to_hundredths(time, units) * 10)

    def ed_StartCountDown(self, time, units):
        self._countdown_end = self.now + self._to_hundredths(time, units) * 10

    def ed_ReadCountDown(self, units):
        if self._countdown_end is None:
            return 0
        hundredths = max(0, int((self._countdown_end - self.now) // 10))
        return hundredths // 100 if (units & 1) == V.CONSTANTS['TIME_SECONDS'] else hundredths * 10

    @staticmethod
    def _to_hundredths(time, units):
        if time < 0:
            raise EdPyRuntimeError('negative time %d (the robot behaviour is unspecified)' % time)
        # edpy_code.py: seconds * 100, or milliseconds / 10 (integer division, so 10 ms resolution)
        return time * 100 if (units & 1) == V.CONSTANTS['TIME_SECONDS'] else time // 10

    def ed_PlayBeep(self):
        self._start_sound('beep', 0, self.beep_ms)

    def ed_PlayMyBeep(self, code):
        self._start_sound('mybeep', code, 50)

    def ed_PlayTone(self, code, duration_ms):
        if duration_ms < 0:
            raise EdPyRuntimeError('negative tone duration %d' % duration_ms)
        self._start_sound('tone', code, (duration_ms // 10) * 10)

    def ed_PlayTune(self, tune):
        if not isinstance(tune, TuneString):
            raise EdPyRuntimeError('Ed.PlayTune needs a tune string')
        # ASSUMPTION: a quarter note lasts Ed.Tempo ms (TEMPO_SLOW = 500 = NOTE_QUARTER)
        quarter_ms = self._tempo if self._tempo is not None else self.setup.get('Tempo', V.CONSTANTS['TEMPO_SLOW'])
        text, beats, error = tune.text(), 0.0, False
        for i in range(0, len(text), 2):
            note = text[i]
            if note == V.TUNE_END:
                break
            dur = text[i + 1] if i + 1 < len(text) else ''
            if (note not in V.TUNE_NOTES and note != V.TUNE_REST) or dur not in V.TUNE_DURATIONS:
                error = True
                break
            beats += V.TUNE_DURATIONS[dur]
        self._tune_error = error
        self._start_sound('tune', 0, beats * quarter_ms, tune=text)

    def ed_ChangeTempo(self, tempo):
        self._tempo = tempo

    def _start_sound(self, kind, code, duration_ms, tune=None):
        freq = round(32e6 / code, 1) if code else None  # token spec: frequency code = 32e6 / Hz
        if self.clear_music_end_on_play:
            self._music = 0
        s = Sound(self.now, self.now + duration_ms, kind, code, freq, tune)
        self._sound = s  # a new sound replaces a playing one
        self.sounds.append(s)

    def ed_Drive(self, direction, speed, distance):
        speed = self._check_speed(speed)
        c = V.CONSTANTS
        if direction == c['STOP']:
            self._set_wheel('left', 0, 0, None)
            self._set_wheel('right', 0, 0, None)
            return
        if direction in (c['FORWARD'], c['BACKWARD']):
            sign = 1 if direction == c['FORWARD'] else -1
            dist = distance if distance > 0 else None  # edpy_code.py: only distance > 0 limits the drive
            self._set_wheel('left', sign, speed, dist)
            self._set_wheel('right', sign, speed, dist)
        else:
            signs = {c['FORWARD_RIGHT']: (1, 0), c['BACKWARD_RIGHT']: (-1, 0), c['FORWARD_LEFT']: (0, 1),
                     c['BACKWARD_LEFT']: (0, -1), c['SPIN_RIGHT']: (1, -1), c['SPIN_LEFT']: (-1, 1)}
            if direction not in signs:
                raise EdPyRuntimeError('invalid drive direction %d' % direction)
            dist = None
            if distance != 0:
                # edpy_code.py Ed_Drive_CM: degrees, at most one revolution, small corrections, spins use half
                degrees = distance % 360 or 360
                ticks = degrees + (2 if degrees > 300 else 1 if degrees > 100 else 0)
                if direction in (c['SPIN_RIGHT'], c['SPIN_LEFT']):
                    ticks //= 2
                dist = max(ticks, 1) / float(TICKS_PER_CM)
            left, right = signs[direction]
            self._set_wheel('left', left, speed, dist)
            self._set_wheel('right', right, speed, dist)
        self._block_until_wheels_done()

    def ed_DriveLeftMotor(self, direction, speed, distance):
        self._drive_one('left', direction, speed, distance)

    def ed_DriveRightMotor(self, direction, speed, distance):
        self._drive_one('right', direction, speed, distance)

    def _drive_one(self, side, direction, speed, distance):
        speed = self._check_speed(speed)
        if direction == V.CONSTANTS['STOP']:
            self._set_wheel(side, 0, 0, None)
            return
        sign = 1 if direction == V.CONSTANTS['FORWARD'] else -1  # edpy_code.py: anything but FORWARD drives backward
        self._set_wheel(side, sign, speed, distance if distance > 0 else None)
        self._block_until_wheels_done()

    def ed_ReadObstacleDetection(self):
        c = V.CONSTANTS
        mask = self._obstacle
        if not mask & c['OBSTACLE_DETECTED']:
            return c['OBSTACLE_NONE']
        data = c['OBSTACLE_AHEAD'] if mask & c['OBSTACLE_AHEAD'] else mask & 0x38
        self._obstacle = mask & c['OBSTACLE_OTHER_MASK']
        return data

    def ed_ReadKeypad(self):
        keys, self._keys = self._keys, 0
        return keys & V.CONSTANTS['KEYPAD_MASK']  # both keys pressed since the last read -> 5, which is neither constant

    def ed_ReadClapSensor(self):
        clap, self._clap = self._clap, False
        return V.CONSTANTS['CLAP_DETECTED'] if clap else V.CONSTANTS['CLAP_NOT_DETECTED']

    def ed_ReadLineState(self):
        return self._surface

    def ed_ReadLineChange(self):
        change, self._line_change = self._line_change, False
        return 1 if change else 0

    def ed_ReadRemote(self):
        code, self._remote = self._remote, None
        return V.CONSTANTS['REMOTE_CODE_NONE'] if code is None else code

    def ed_ReadIRData(self):
        data, self._ir = self._ir, 0
        return data

    def ed_ReadLeftLightLevel(self):
        return self._light['left']

    def ed_ReadRightLightLevel(self):
        return self._light['right']

    def ed_ReadLineTracker(self):
        return self._light['tracker']

    def ed_ReadMusicEnd(self):
        music, self._music = self._music, 0
        return V.CONSTANTS['MUSIC_FINISHED'] if music else V.CONSTANTS['MUSIC_NOT_FINISHED']

    def ed_ReadTuneError(self):
        return 1 if self._tune_error else 0

    def ed_ReadDriveLoad(self):
        strained = any(s <= self.now and (e is None or e > self.now) for (s, e) in self._strains)
        return V.CONSTANTS['DRIVE_STRAINED'] if strained else V.CONSTANTS['DRIVE_NO_STRAIN']

    def ed_ReadRandom(self):
        return self._rng.randint(0, 255)

    def unsupported(self, name):
        raise UnsupportedInMock('Ed.%s is not modelled by the mock (the Lab never generates it)' % name)
