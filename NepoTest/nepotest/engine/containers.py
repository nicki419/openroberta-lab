"""EdPy's two container types: Ed.List (fixed-size int list) and Ed.TuneString (fixed-size char string)."""

from .errors import EdPyRuntimeError
from .values import INT_MAX, INT_MIN


def _index(container, index, kind):
    if isinstance(index, bool) or not isinstance(index, int):
        raise EdPyRuntimeError('%s index must be an int, got %r' % (kind, index), kind='type_error')
    if not 0 <= index < len(container._data):
        # EdPy only range-checks constant indices; with a variable index the robot reads or writes other memory
        raise EdPyRuntimeError('%s index %d out of range 0..%d (the robot does no range check for variable indices)'
                               % (kind, index, len(container._data) - 1), kind='index_out_of_range')
    return index


class EdList(object):
    """Ed.List(maxElements [, [initial ints]]): ints only, fixed size, len() is the maximum size, no append."""

    __slots__ = ('_data',)

    def __init__(self, size, initial=None):
        initial = list(initial or [])
        if isinstance(size, bool) or not isinstance(size, int) or size < 1:
            raise EdPyRuntimeError('Ed.List size must be a positive int, got %r' % (size,), kind='invalid_list')
        if len(initial) > size:
            raise EdPyRuntimeError('Ed.List initial values (%d) are more than its size (%d)' % (len(initial), size), kind='invalid_list')
        for v in initial:
            _check_element(v)
        self._data = [int(v) for v in initial] + [0] * (size - len(initial))

    def __len__(self):
        return len(self._data)

    def __getitem__(self, index):
        return self._data[_index(self, index, 'list')]

    def __setitem__(self, index, value):
        self._data[_index(self, index, 'list')] = _check_element(value)

    def __iter__(self):
        return iter(list(self._data))

    def __eq__(self, other):
        if isinstance(other, EdList):
            return self._data == other._data
        if isinstance(other, (list, tuple)):
            return self._data == list(other)
        return NotImplemented

    def __ne__(self, other):
        result = self.__eq__(other)
        return result if result is NotImplemented else not result

    __hash__ = None

    def to_list(self):
        return list(self._data)

    def __repr__(self):
        return 'Ed.List(%d, %r)' % (len(self._data), self._data)


def _check_element(value):
    if isinstance(value, bool):
        return int(value)
    if not isinstance(value, int):
        raise EdPyRuntimeError('Ed.List elements must be ints, got %r' % (value,), kind='type_error')
    if not INT_MIN <= value <= INT_MAX:
        raise EdPyRuntimeError('Ed.List element %d is outside the 16-bit range' % value, kind='overflow')
    return value


class TuneString(object):
    """Ed.TuneString(maxChars [, "notes"]): fixed-size char buffer. len() is the maximum size (including the final 'z')."""

    __slots__ = ('_data',)

    def __init__(self, size, initial=''):
        if isinstance(size, bool) or not isinstance(size, int) or size < 1:
            raise EdPyRuntimeError('Ed.TuneString size must be a positive int, got %r' % (size,), kind='invalid_list')
        if not isinstance(initial, str):
            raise EdPyRuntimeError('Ed.TuneString initial value must be a string constant', kind='invalid_list')
        if len(initial) > size:
            raise EdPyRuntimeError('tune string literal (%d chars) is longer than its size (%d)' % (len(initial), size), kind='invalid_list')
        self._data = list(initial) + ['\0'] * (size - len(initial))

    def __len__(self):
        return len(self._data)

    def __getitem__(self, index):
        return self._data[_index(self, index, 'tune string')]

    def __setitem__(self, index, value):
        if not isinstance(value, str) or len(value) != 1:
            raise EdPyRuntimeError('tune string elements are chars (use chr()), got %r' % (value,), kind='type_error')
        self._data[_index(self, index, 'tune string')] = value

    def text(self):
        """The content up to (not including) the first NUL."""
        s = ''.join(self._data)
        return s.split('\0', 1)[0]

    def __repr__(self):
        return 'Ed.TuneString(%d, %r)' % (len(self._data), self.text())
