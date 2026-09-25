"""The mock `Ed` module that a program gets from `import Ed`.

Constants have EdPy's exact values. Functions check their arguments like the EdPy compiler (count and kind), record
the call in robot.trace, let the robot do the work, and then charge robot.call_cost_ms of virtual time.
"""

import sys
import types

from . import values as V
from .containers import EdList, TuneString
from .errors import EdPyCompatibilityError, EdPyRuntimeError
from .robot import Call

# functions the Lab never generates and whose semantics aren't clear enough to model
_UNSUPPORTED = frozenset(['RegisterEventHandler', 'SetDistance', 'ResetDistance', 'ReadDistance', 'SimpleDriveForward',
                          'SimpleDriveBackward', 'SimpleDriveForwardLeft', 'SimpleDriveForwardRight', 'SimpleDriveBackwardLeft',
                          'SimpleDriveBackwardRight', 'SimpleDriveStop', 'ReadModuleRegister8Bit', 'ReadModuleRegister16Bit',
                          'WriteModuleRegister8Bit', 'WriteModuleRegister16Bit', 'SetModuleRegisterBit', 'ClearModuleRegisterBit',
                          'AndModuleRegister8Bit'])


def _check_args(name, args):
    kinds = V.SIGNATURES[name]
    ok = len(args) == len(kinds)
    for kind, arg in zip(kinds, args):
        if kind == 'I':
            ok = ok and isinstance(arg, int)
            if ok and not isinstance(arg, bool) and not V.INT_MIN <= arg <= V.INT_MAX:
                raise EdPyRuntimeError('argument %d of Ed.%s is outside the 16-bit range' % (arg, name), kind='overflow')
        elif kind == 'T':
            ok = ok and isinstance(arg, TuneString)
        elif kind == 'S':
            ok = ok and isinstance(arg, str)
    if not ok:
        raise EdPyCompatibilityError('incorrect arguments used in Ed.%s call: %r' % (name, args), kind='invalid_arguments')


def _make_function(robot, name):
    impl = getattr(robot, 'ed_' + name, None)

    def ed_function(*args):
        _check_args(name, args)
        if name in _UNSUPPORTED or impl is None:
            robot.unsupported(name)
        robot._step()
        t = robot.now
        # record first, so a blocking call that runs into the time budget still shows up in the trace
        index = len(robot.trace)
        robot.trace.append(Call(t, name, args, None))
        for listener in robot.listeners:
            on_ed_call = getattr(listener, 'on_ed_call', None)
            if on_ed_call is not None:
                on_ed_call(index, sys._getframe(1))  # the trace entry and the frame that called Ed.<name>
        result = impl(*args)
        robot.trace[index] = Call(t, name, args, result)
        robot._advance(robot.call_cost_ms)
        return result

    ed_function.__name__ = name
    return ed_function


def _ed_list(*args):
    if len(args) not in (1, 2) or not isinstance(args[0], int) or (len(args) == 2 and not isinstance(args[1], list)):
        raise EdPyCompatibilityError('incorrect arguments used in Ed.List call: %r' % (args,), kind='invalid_arguments')
    return EdList(*args)


def _ed_tune_string(*args):
    if len(args) not in (1, 2) or not isinstance(args[0], int) or (len(args) == 2 and not isinstance(args[1], str)):
        raise EdPyCompatibilityError('incorrect arguments used in Ed.TuneString call: %r' % (args,), kind='invalid_arguments')
    return TuneString(*args)


class EdModule(types.ModuleType):
    def __init__(self, robot):
        super(EdModule, self).__init__('Ed', 'Mock of the EdPy Ed module (nepotest.engine)')
        object.__setattr__(self, '_robot', robot)
        for k, v in V.CONSTANTS.items():
            object.__setattr__(self, k, v)
        for name in V.SIGNATURES:
            if name not in ('List', 'TuneString'):
                object.__setattr__(self, name, _make_function(robot, name))
        object.__setattr__(self, 'List', _ed_list)
        object.__setattr__(self, 'TuneString', _ed_tune_string)

    def __setattr__(self, name, value):
        robot = self._robot
        if name in V.SETUP_VARIABLES:
            if name in robot.setup:
                raise EdPyCompatibilityError('Ed.%s can only be set once' % name, kind='setup_variable')
            if isinstance(value, bool) or value not in V.SETUP_VARIABLES[name]:
                raise EdPyCompatibilityError('set Ed.%s to an invalid value: %r' % (name, value), kind='setup_variable')
            robot.setup[name] = value
        elif name in V.CONSTANTS:
            raise EdPyCompatibilityError('Ed.Py constant Ed.%s can not be written' % name, kind='constant_written')
        else:
            raise EdPyCompatibilityError('Unknown Ed variable Ed.%s' % name, kind='unknown_ed')

    def __getattr__(self, name):
        # only called for names that aren't constants or functions
        if name in V.SETUP_VARIABLES:
            if name not in self._robot.setup:
                raise EdPyRuntimeError("Ed.%s doesn't have a value yet" % name, kind='setup_variable')
            return self._robot.setup[name]
        raise EdPyCompatibilityError('Unknown Ed function or constant Ed.%s' % name, kind='unknown_ed')
