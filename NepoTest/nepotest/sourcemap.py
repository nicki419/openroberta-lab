"""The source map of the Lab (REST /projectWorkflow/sourceForTest): for every block, the char ranges of its EdPy code.

Offsets are chars of the EdPy source (the Lab counts Java UTF-16 units; identical for everything but characters outside
the Basic Multilingual Plane). CPython positions use UTF-8 byte columns; offset() converts them.
"""


class SourceMap(object):
    def __init__(self, source, data):
        self.source = source
        self.blocks = {}  # id -> (type, [(start, end)])
        for block_id, info in (data or {}).get('blocks', {}).items():
            ranges = [(max(0, s), min(len(source), e)) for s, e in info.get('ranges', [])]
            ranges = [(s, e) for s, e in ranges if s < e]
            if ranges:
                self.blocks[block_id] = (info.get('type'), ranges)
        self._line_starts = [0]
        for i, ch in enumerate(source):
            if ch == '\n':
                self._line_starts.append(i + 1)
        self._lines = source.split('\n')
        # innermost first: sorted by range length
        self._by_size = sorted(((e - s, s, e, b) for b, (_, rs) in self.blocks.items() for s, e in rs))

    def offset(self, lineno, col_utf8):
        """char offset of a CPython position (1-based line, UTF-8 byte column)"""
        if lineno is None or not 1 <= lineno <= len(self._line_starts):
            return None
        line = self._lines[lineno - 1]
        col = len(line.encode('utf-8')[:col_utf8].decode('utf-8', 'ignore')) if col_utf8 else 0
        return self._line_starts[lineno - 1] + col

    def blocks_at(self, offset):
        """ids of all blocks whose code contains the offset, innermost first"""
        if offset is None:
            return []
        seen, result = set(), []
        for _, s, e, b in self._by_size:
            if s <= offset < e and b not in seen:
                seen.add(b)
                result.append(b)
        return result

    def blocks_spanning(self, start, end):
        """ids of all blocks whose code contains all of [start, end), innermost first"""
        if start is None:
            return []
        if end is None or end <= start:
            return self.blocks_at(start)
        seen, result = set(), []
        for _, s, e, b in self._by_size:
            if s <= start and end <= e and b not in seen:
                seen.add(b)
                result.append(b)
        return result

    def at_position(self, position):
        """blocks spanning a CPython position (lineno, end_lineno, col_offset, end_col_offset), innermost first"""
        if position is None:
            return []
        return self.blocks_spanning(self.offset(position[0], position[2]), self.offset(position[1], position[3]))

    def innermost(self, offset):
        found = self.blocks_at(offset)
        return found[0] if found else None

    def start(self, block_id):
        return min(s for s, _ in self.blocks[block_id][1]) if block_id in self.blocks else None

    def type_of(self, block_id):
        return self.blocks[block_id][0] if block_id in self.blocks else None

    def text(self, block_id):
        return [self.source[s:e] for s, e in self.blocks.get(block_id, (None, []))[1]]

    def line_of(self, block_id):
        s = self.start(block_id)
        if s is None:
            return None
        return self.source.count('\n', 0, s) + 1
