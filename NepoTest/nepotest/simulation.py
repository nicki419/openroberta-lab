"""Simulation tests: the program drives the virtual Edison through a world the learner drew (the Tests tab's simulation
window), and the world decides whether the test passes.

- **Lines** (a black core with a white rim, so the robot can follow an edge) and **floor shapes** are what the line
  tracker sees. The floor itself is light peach.
- **Obstacles** are what the obstacle detection sees, and what the robot must not touch.
- **Goal areas:** touching one ends the test as passed. **Fail areas:** touching one ends it as failed.
- **A recorded run** (the reference path) plus a tolerance makes a **corridor**: when a corner or an edge of the robot
  gets farther than the tolerance from where the robot was in the recorded run, the test fails.
- Without a goal area, the test passes if none of that happens until the program ends (or its time is up).

The world is plain geometry, not a picture. The editor draws it, and this module computes with the same shapes
(curves too: both turn a curve into the same Bezier segments), so what the learner sees is what the robot gets.

    {"start": {"x": 20, "y": 50, "heading": 0},
     "items": [{"id": "l1", "kind": "line", "points": [[20, 50], [80, 50], [120, 20]], "smooth": true, "closed": false,
                "width": 1.5},
               {"id": "g1", "kind": "rect", "role": "goal", "x": 130, "y": 15, "w": 10, "h": 10, "rot": 0},
               {"id": "o1", "kind": "ellipse", "role": "obstacle", "x": 60, "y": 80, "w": 8, "h": 8}],
     "settings": {"ambient_light": 50, "obstacle_range_cm": 10}}

Units are cm. x points right and y down (as on the screen), and the origin is arbitrary. Angles are degrees,
counterclockwise as seen from above; 0 points right. rect and ellipse items are given by their centre (x, y), size
(w, h) and rotation (rot). Their roles are: black, white (floor markings), obstacle, goal, fail. Items later in the list
lie on top of earlier ones; all lines lie on top of all floor shapes, and every line's black core on top of every rim.

A test (JSON, see spec.py): {"name", "simulation": {"world", "reference": {"path": [[x, y, heading], ...]},
"tolerance_cm"}, "max_time_ms", optional "call"/"args"/"globals" (a function instead of the program), and "world" with
claps, keys, remote codes and IR messages only (the drawn world gives obstacles, line and light).
"""

import math

from .engine import Robot
from .engine import values as V
from .engine.errors import StopProgram

# the robot's body, in cm, in the robot's own frame: "ahead" of the wheel axle's centre (the point the engine turns
# around) and to the "left". The Lab's simulator has the same proportions (axle 5.5 of 24 units from the back).
LENGTH_CM = 8.0
WIDTH_CM = 6.5
BACK_CM = 1.8
FRONT_CM = LENGTH_CM - BACK_CM
LINE_SENSOR = (5.0, 0.0)  # the line tracker, under the front (the Lab's simulator: 15 units = 5 cm ahead of the axle)
LINE_SPOT_CM = 0.3  # ASSUMPTION: the radius of the spot the line tracker sees; at an edge it sees a mix
IR_BEAMS = ((6.0, 1.5, 1, 'left'), (6.0, -1.5, -1, 'right'))  # (ahead, left, outward sign, side) of the two IR emitters
IR_ANGLES_DEG = (0, 10, 20, 30)  # ASSUMPTION: each beam sees straight ahead and up to 30 degrees to its side
DEFAULT_OBSTACLE_RANGE_CM = 10  # ASSUMPTION: how far the obstacle detection sees
DEFAULT_AMBIENT_LIGHT = 50  # what the forward-facing light sensors (LLIGHT, RLIGHT) read, in NEPO %

# the floor: reflectance 0..1. The line tracker reports 1000 * reflectance (NEPO shows it divided by 10, as %).
BACKGROUND = 0.8  # light peach
BLACK = 0.05
WHITE = 0.95
FLOOR_REFLECTANCE = {'black': BLACK, 'white': WHITE}
BLACK_BELOW = 0.5  # Ed.ReadLineState() says LINE_ON_BLACK below this
LINE_WIDTH_CM = 1.5  # the black core of a line (Edison tracks are about 1.5 cm wide)
LINE_RIM_CM = 0.5  # the white rim on each side of the core
ROLES = ('black', 'white', 'obstacle', 'goal', 'fail')
KINDS = ('line', 'rect', 'ellipse')

STEP_MS = 5  # a moving robot advances in steps of at most this much virtual time, so it can't jump over anything
CHECK_CM, CHECK_DEG = 0.05, 0.3  # contacts are checked again after this much movement
SAMPLE_CM, SAMPLE_DEG = 0.5, 3.0  # the path gets a new pose after this much movement
DEFAULT_MAX_TIME_MS = 30000
DEFAULT_TOLERANCE_CM = 2
CURVE_PIECES = 16  # a curve segment is checked as this many straight pieces
ELLIPSE_POINTS = 36
GIVEN_EVENTS = ('clap', 'key', 'remote', 'ir_message')  # what "given" may add; the drawn world does the rest


# ---------------------------------------------------------------------- geometry

def to_world(pose, ahead, left):
    """the point `ahead` cm in front of and `left` cm to the left of a pose (x, y, heading)"""
    x, y, h = pose
    r = math.radians(h)
    c, s = math.cos(r), math.sin(r)
    return (x + ahead * c - left * s, y - ahead * s - left * c)


def footprint(pose):
    """the robot's outline at a pose: front left, front right, back right, back left"""
    w = WIDTH_CM / 2.0
    return [to_world(pose, FRONT_CM, w), to_world(pose, FRONT_CM, -w), to_world(pose, -BACK_CM, -w), to_world(pose, -BACK_CM, w)]


def check_points(outline):
    """the corners and the middles of the edges of an outline"""
    n = len(outline)
    mids = [((outline[i][0] + outline[(i + 1) % n][0]) / 2.0, (outline[i][1] + outline[(i + 1) % n][1]) / 2.0) for i in range(n)]
    return list(outline) + mids


def _rotated(cx, cy, dx, dy, rot):
    r = math.radians(rot)
    c, s = math.cos(r), math.sin(r)
    return (cx + dx * c + dy * s, cy - dx * s + dy * c)


def shape_polygon(item):
    """the outline of a rect or ellipse item"""
    cx, cy, w, h, rot = float(item['x']), float(item['y']), float(item['w']), float(item['h']), float(item.get('rot', 0))
    if item['kind'] == 'rect':
        local = [(w / 2, h / 2), (-w / 2, h / 2), (-w / 2, -h / 2), (w / 2, -h / 2)]
    else:
        local = [(w / 2 * math.cos(2 * math.pi * k / ELLIPSE_POINTS), h / 2 * math.sin(2 * math.pi * k / ELLIPSE_POINTS))
                 for k in range(ELLIPSE_POINTS)]
    return [_rotated(cx, cy, dx, dy, rot) for dx, dy in local]


def bezier_segments(points, smooth, closed):
    """a line as cubic Bezier segments (p0, c1, c2, p1): straight between the points, or a Catmull-Rom curve through them.
    The editor (nepoTest.sim.ts) draws exactly these segments."""
    pts = [(float(p[0]), float(p[1])) for p in points]
    n = len(pts)
    pairs = [(i, (i + 1) % n) for i in range(n)] if closed and n > 2 else [(i, i + 1) for i in range(n - 1)]
    segments = []
    for i, j in pairs:
        p0, p1 = pts[i], pts[j]
        if not smooth:
            segments.append((p0, p0, p1, p1))
            continue
        before = pts[i - 1] if (closed and n > 2) or i > 0 else p0
        after = pts[(j + 1) % n] if (closed and n > 2) or j + 1 < n else p1
        c1 = (p0[0] + (p1[0] - before[0]) / 6.0, p0[1] + (p1[1] - before[1]) / 6.0)
        c2 = (p1[0] - (after[0] - p0[0]) / 6.0, p1[1] - (after[1] - p0[1]) / 6.0)
        segments.append((p0, c1, c2, p1))
    return segments


def _polyline(segments):
    """the straight pieces of Bezier segments: [(ax, ay, bx, by)]"""
    pieces = []
    for p0, c1, c2, p1 in segments:
        if c1 == p0 and c2 == p1:
            pieces.append((p0[0], p0[1], p1[0], p1[1]))
            continue
        prev = p0
        for k in range(1, CURVE_PIECES + 1):
            t = k / float(CURVE_PIECES)
            u = 1 - t
            pt = (u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
                  u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1])
            pieces.append((prev[0], prev[1], pt[0], pt[1]))
            prev = pt
    return pieces


def segment_distance(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    length2 = dx * dx + dy * dy
    t = 0.0 if length2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def point_in_polygon(px, py, poly):
    inside = False
    n = len(poly)
    for i in range(n):
        ax, ay = poly[i]
        bx, by = poly[i - 1]
        if (ay > py) != (by > py) and px < (bx - ax) * (py - ay) / (by - ay) + ax:
            inside = not inside
    return inside


def polygon_distance(px, py, poly):
    """0 inside the polygon, else the distance to its outline"""
    if point_in_polygon(px, py, poly):
        return 0.0
    return min(segment_distance(px, py, poly[i - 1][0], poly[i - 1][1], poly[i][0], poly[i][1]) for i in range(len(poly)))


def _cross(ox, oy, ax, ay, bx, by):
    return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox)


def segments_cross(a, b, c, d):
    """do the segments ab and cd touch?"""
    d1 = _cross(c[0], c[1], d[0], d[1], a[0], a[1])
    d2 = _cross(c[0], c[1], d[0], d[1], b[0], b[1])
    d3 = _cross(a[0], a[1], b[0], b[1], c[0], c[1])
    d4 = _cross(a[0], a[1], b[0], b[1], d[0], d[1])
    if ((d1 > 0) != (d2 > 0)) and ((d3 > 0) != (d4 > 0)) and d1 != 0 and d2 != 0 and d3 != 0 and d4 != 0:
        return True

    def on(p, q, r, cr):  # r on segment pq, if collinear
        return cr == 0 and min(p[0], q[0]) <= r[0] <= max(p[0], q[0]) and min(p[1], q[1]) <= r[1] <= max(p[1], q[1])

    return on(c, d, a, d1) or on(c, d, b, d2) or on(a, b, c, d3) or on(a, b, d, d4)


def bbox(points, margin=0.0):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return (min(xs) - margin, min(ys) - margin, max(xs) + margin, max(ys) + margin)


def _boxes_meet(a, b):
    return a[0] <= b[2] and b[0] <= a[2] and a[1] <= b[3] and b[1] <= a[3]


def polygons_touch(a, b, box_a=None, box_b=None):
    if not _boxes_meet(box_a or bbox(a), box_b or bbox(b)):
        return False
    for i in range(len(a)):
        for j in range(len(b)):
            if segments_cross(a[i - 1], a[i], b[j - 1], b[j]):
                return True
    return point_in_polygon(a[0][0], a[0][1], b) or point_in_polygon(b[0][0], b[0][1], a)


class _Grid(object):
    """a spatial index: cells of CELL cm, each with the indices of the things whose box meets it"""
    CELL = 5.0

    def __init__(self):
        self.cells = {}

    def add(self, index, box):
        c = self.CELL
        for i in range(int(math.floor(box[0] / c)), int(math.floor(box[2] / c)) + 1):
            for j in range(int(math.floor(box[1] / c)), int(math.floor(box[3] / c)) + 1):
                self.cells.setdefault((i, j), []).append(index)

    def near(self, x, y):
        return self.cells.get((int(math.floor(x / self.CELL)), int(math.floor(y / self.CELL))), ())


# ---------------------------------------------------------------------- the world

class _Line(object):
    def __init__(self, item):
        self.id = item.get('id')
        self.half_core = float(item.get('width', LINE_WIDTH_CM)) / 2.0
        self.half_outer = self.half_core + LINE_RIM_CM
        self.pieces = _polyline(bezier_segments(item['points'], bool(item.get('smooth')), bool(item.get('closed'))))
        self.grid = _Grid()
        for k, (ax, ay, bx, by) in enumerate(self.pieces):
            self.grid.add(k, bbox([(ax, ay), (bx, by)], self.half_outer))

    def distance(self, x, y):
        """the distance to the centre of the line, if it is less than half the line's full width (else None)"""
        best = None
        for k in self.grid.near(x, y):
            d = segment_distance(x, y, *self.pieces[k])
            if best is None or d < best:
                best = d
        return best if best is not None and best <= self.half_outer else None


class _Shape(object):
    def __init__(self, item):
        self.id = item.get('id')
        self.role = item.get('role')
        self.polygon = shape_polygon(item)
        self.box = bbox(self.polygon)

    def contains(self, x, y):
        return self.box[0] <= x <= self.box[2] and self.box[1] <= y <= self.box[3] and point_in_polygon(x, y, self.polygon)


class SimWorld(object):
    """the drawn world: start pose, what the line tracker sees, obstacles, goal and fail areas"""

    def __init__(self, data):
        data = data or {}
        start = data.get('start') or {}
        self.start = (float(start.get('x', 0)), float(start.get('y', 0)), float(start.get('heading', 0)))
        settings = data.get('settings') or {}
        self.ambient_raw = int(settings.get('ambient_light', DEFAULT_AMBIENT_LIGHT)) * 10
        self.obstacle_range = float(settings.get('obstacle_range_cm', DEFAULT_OBSTACLE_RANGE_CM))
        self.lines, self.floor, self.obstacles, self.goals, self.fails = [], [], [], [], []
        for item in data.get('items') or []:
            if item.get('kind') == 'line':
                if len(item.get('points') or []) >= 2:
                    self.lines.append(_Line(item))
            elif item.get('kind') in ('rect', 'ellipse'):
                shape = _Shape(item)
                {'black': self.floor, 'white': self.floor, 'obstacle': self.obstacles, 'goal': self.goals,
                 'fail': self.fails}.get(shape.role, self.floor).append(shape)

    def reflectance(self, x, y):
        """what the floor reflects at a point: a line's black core, a line's white rim, a floor shape, or the background"""
        rim = False
        for line in self.lines:
            d = line.distance(x, y)
            if d is not None:
                if d <= line.half_core:
                    return BLACK
                rim = True
        if rim:
            return WHITE
        for shape in reversed(self.floor):
            if shape.contains(x, y):
                return FLOOR_REFLECTANCE.get(shape.role, BACKGROUND)
        return BACKGROUND

    def tracker_level(self, pose):
        """what the line tracker sees at a robot pose: the mean reflectance of its spot (0..1)"""
        cx, cy = to_world(pose, *LINE_SENSOR)
        samples = [(cx, cy)] + [(cx + LINE_SPOT_CM * math.cos(math.pi * k / 3), cy + LINE_SPOT_CM * math.sin(math.pi * k / 3))
                                for k in range(6)]
        return sum(self.reflectance(x, y) for x, y in samples) / len(samples)

    def obstacle_bits(self, pose):
        """the obstacle detection at a robot pose: OBSTACLE_LEFT / _RIGHT / _AHEAD (both beams) | OBSTACLE_DETECTED, or 0"""
        if not self.obstacles:
            return 0
        seen = set()
        for ahead, left, outward, side in IR_BEAMS:
            origin = to_world(pose, ahead, left)
            for angle in IR_ANGLES_DEG:
                end = to_world((origin[0], origin[1], pose[2] + outward * angle), self.obstacle_range, 0)
                ray_box = bbox([origin, end])
                if any(_boxes_meet(ray_box, o.box) and (o.contains(*origin) or any(
                        segments_cross(origin, end, o.polygon[i - 1], o.polygon[i]) for i in range(len(o.polygon))))
                       for o in self.obstacles):
                    seen.add(side)
                    break
        c = V.CONSTANTS
        if not seen:
            return 0
        bit = c['OBSTACLE_AHEAD'] if len(seen) == 2 else c['OBSTACLE_LEFT'] if 'left' in seen else c['OBSTACLE_RIGHT']
        return c['OBSTACLE_DETECTED'] | bit

    def touching(self, outline, shapes):
        """the first shape the outline touches, or None"""
        box = bbox(outline)
        for s in shapes:
            if polygons_touch(outline, s.polygon, box, s.box):
                return s
        return None


class Corridor(object):
    """where the robot may be: within `tolerance` cm of the robot's outline at any pose of a recorded path"""

    def __init__(self, path, tolerance):
        self.tolerance = float(tolerance)
        self.outlines = [footprint((p[0], p[1], p[2])) for p in path]
        self.grid = _Grid()
        for k, outline in enumerate(self.outlines):
            self.grid.add(k, bbox(outline, self.tolerance))
        self._last = 0  # the robot moves along the path: look near the last match first

    def _near(self, k, x, y):
        return polygon_distance(x, y, self.outlines[k]) <= self.tolerance + 1e-9

    def contains(self, x, y):
        n = len(self.outlines)
        for k in range(max(0, self._last - 4), min(n, self._last + 16)):
            if self._near(k, x, y):
                self._last = k
                return True
        for k in self.grid.near(x, y):
            if self._near(k, x, y):
                self._last = k
                return True
        return False

    def outside(self, points):
        """the first point that is out of the corridor, or None"""
        for p in points:
            if not self.contains(p[0], p[1]):
                return p
        return None


# ---------------------------------------------------------------------- the robot in the world

class SimRobot(Robot):
    """The engine's virtual Edison, placed in a drawn world: its sensors read the world, and the world can end the run
    (StopProgram('simulation'), with the reason in `outcome`). `path` is where it went: [t_ms, x, y, heading]."""

    def __init__(self, world, corridor=None, **options):
        super(SimRobot, self).__init__(**options)
        self.world = world
        self.corridor = corridor
        self.outcome = None  # {'result': 'goal' | 'fail_area' | 'crash' | 'deviation', 't', 'item', 'point'}
        self.path = []
        self._checking = False
        self._checked = None
        self._tracker = (None, None)
        self._ir = (None, 0)

    def world_pose(self):
        x, y = to_world(self.world.start, self.x_cm, self.y_cm)
        return (x, y, self.world.start[2] + self.heading_deg)

    def _begin(self, max_time_ms, max_steps):
        super(SimRobot, self)._begin(max_time_ms, max_steps)
        self._checking = True  # from now on, the world can end the run (StopProgram is only caught around the program)
        self._sample(self.world_pose(), force=True)

    def _move_to(self, target):
        while True:
            step_end = min(target, self.now + STEP_MS) if self.moving else target
            super(SimRobot, self)._move_to(step_end)
            self._sense()
            if step_end >= target:
                return

    def _sense(self):
        pose = self.world_pose()
        if self.beam:
            if self._ir[0] != pose:
                self._ir = (pose, self.world.obstacle_bits(pose))
            self._obstacle |= self._ir[1]
        if self._checking and (self._checked is None or _moved(self._checked, pose, CHECK_CM, CHECK_DEG)):
            self._checked = pose
            self._sample(pose)
            self._check(pose)

    def _sample(self, pose, force=False):
        last = self.path[-1] if self.path else None
        if force or last is None or _moved((last[1], last[2], last[3]), pose, SAMPLE_CM, SAMPLE_DEG):
            entry = [round(self.now, 1), round(pose[0], 2), round(pose[1], 2), round(pose[2], 1)]
            if last is not None and last[0] == entry[0]:
                self.path[-1] = entry
            else:
                self.path.append(entry)

    def _check(self, pose):
        outline = footprint(pose)
        w = self.world
        hit = w.touching(outline, w.obstacles)
        if hit is not None:
            self._decide('crash', pose, hit.id)
        hit = w.touching(outline, w.fails)
        if hit is not None:
            self._decide('fail_area', pose, hit.id)
        if self.corridor is not None:
            point = self.corridor.outside(check_points(outline))
            if point is not None:
                self._decide('deviation', pose, None, point)
        hit = w.touching(outline, w.goals)
        if hit is not None:
            self._decide('goal', pose, hit.id)

    def _decide(self, result, pose, item=None, point=None):
        self._sample(pose, force=True)
        self.outcome = {'result': result, 't': round(self.now, 1), 'item': item,
                        'point': [round(point[0], 2), round(point[1], 2)] if point is not None else None}
        raise StopProgram('simulation')

    def finish_path(self):
        self._sample(self.world_pose(), force=True)

    # ------------------------------------------------------------------ sensors that read the world

    def _tracker_level(self):
        pose = self.world_pose()
        if self._tracker[0] != pose:
            self._tracker = (pose, self.world.tracker_level(pose))
        return self._tracker[1]

    def ed_ReadLineState(self):
        return V.CONSTANTS['LINE_ON_BLACK'] if self._tracker_level() < BLACK_BELOW else V.CONSTANTS['LINE_ON_WHITE']

    def ed_ReadLineTracker(self):
        return int(round(self._tracker_level() * 1000))

    def ed_ReadLeftLightLevel(self):
        return self.world.ambient_raw  # the light sensors face forward: they see the room, not the floor

    def ed_ReadRightLightLevel(self):
        return self.world.ambient_raw


def _moved(a, b, cm, deg):
    return math.hypot(a[0] - b[0], a[1] - b[1]) >= cm or abs(a[2] - b[2]) >= deg


# ---------------------------------------------------------------------- checking a simulation (before it runs)

def validate(sim, where):
    """[problem] of a test's "simulation" object"""
    problems = []
    if not isinstance(sim, dict) or not isinstance(sim.get('world'), dict):
        return ['%s: "simulation" needs a "world" object' % where]
    world = sim['world']
    start = world.get('start')
    if not isinstance(start, dict) or not all(isinstance(start.get(k), (int, float)) for k in ('x', 'y', 'heading')):
        problems.append('%s.world.start needs numbers x, y and heading' % where)
    for i, item in enumerate(world.get('items') or []):
        w = '%s.world.items[%d]' % (where, i)
        kind = item.get('kind') if isinstance(item, dict) else None
        if kind not in KINDS:
            problems.append('%s: "kind" must be one of %s' % (w, ', '.join(KINDS)))
        elif kind == 'line':
            points = item.get('points')
            if not isinstance(points, list) or len(points) < 2 or not all(
                    isinstance(p, list) and len(p) == 2 and all(isinstance(c, (int, float)) for c in p) for p in points):
                problems.append('%s: a line needs at least two points [x, y]' % w)
        else:
            if item.get('role') not in ROLES:
                problems.append('%s: "role" must be one of %s' % (w, ', '.join(ROLES)))
            if not all(isinstance(item.get(k), (int, float)) for k in ('x', 'y', 'w', 'h')):
                problems.append('%s: a %s needs numbers x, y, w and h' % (w, kind))
    reference = sim.get('reference')
    if reference is not None:
        path = reference.get('path') if isinstance(reference, dict) else None
        if not isinstance(path, list) or not all(isinstance(p, list) and len(p) >= 3 for p in path):
            problems.append('%s.reference.path must be a list of poses [x, y, heading]' % where)
    tolerance = sim.get('tolerance_cm', DEFAULT_TOLERANCE_CM)
    if not isinstance(tolerance, (int, float)) or tolerance < 0:
        problems.append('%s.tolerance_cm must be a number >= 0' % where)
    return problems


def start_problems(world_data):
    """what's wrong with where the robot starts: [(item id, message)]"""
    world = SimWorld(world_data)
    outline = footprint(world.start)
    problems = []
    for shapes, what in ((world.obstacles, 'an obstacle'), (world.fails, 'a fail area'), (world.goals, 'a goal area')):
        hit = world.touching(outline, shapes)
        if hit is not None:
            problems.append((hit.id, 'the robot starts touching %s: move it or the %s' % (what, what.split(' ', 1)[1])))
    return problems


def can_fail(sim):
    world = SimWorld(sim.get('world'))
    return bool(world.goals or world.fails or world.obstacles or (sim.get('reference') or {}).get('path'))


# ---------------------------------------------------------------------- running

def _s(ms):
    return ('%.1f' % (ms / 1000.0)).rstrip('0').rstrip('.')


def run_simulation_test(subject, test, record=False):
    """(report, coverage) of a simulation test. record=True: ignore the reference path (the run becomes the new one)."""
    from .spec import check_expectations  # spec imports this module
    from .world import World
    sim = test['simulation']
    world = SimWorld(sim['world'])
    path = None if record else (sim.get('reference') or {}).get('path')
    tolerance = sim.get('tolerance_cm', DEFAULT_TOLERANCE_CM)
    robot = SimRobot(world, Corridor(path, tolerance) if path else None)
    events = World(test.get('world') or [])
    max_time_ms = test.get('max_time_ms', DEFAULT_MAX_TIME_MS)
    is_call = 'call' in test
    if is_call:
        result = subject.call(test['call'], *test.get('args', []), globals=test.get('globals'), world=events, robot=robot,
                              max_steps=test.get('max_steps', 2000000), max_time_ms=max_time_ms)
    else:
        result = subject.run(events, max_time_ms=max_time_ms, max_steps=test.get('max_steps', 2000000), robot=robot)
    outcome = robot.outcome
    error = None if outcome is not None else result.error  # a call that the world ended raised StepLimitExceeded
    if outcome is None:
        robot.finish_path()
        end = 'error' if error is not None else 'returned' if is_call else result.status
        outcome = {'result': end, 't': round(robot.now, 1), 'item': None, 'point': None}

    failures = []

    def fail(message):
        failures.append({'expect': 'simulation', 'expected': None, 'actual': outcome, 'message': message, 'described': True})

    at = _s(outcome['t'])
    kind = outcome['result']
    if kind == 'crash':
        fail('the robot hit an obstacle after %s s' % at)
    elif kind == 'fail_area':
        fail('the robot touched a fail area after %s s' % at)
    elif kind == 'deviation':
        fail('the robot left the recorded path (by more than %s cm) after %s s' % (tolerance, at))
    elif error is not None:
        failures.append({'expect': 'error', 'expected': None, 'actual': error.to_json(), 'message': 'the program failed: %s' % error})
    elif kind != 'goal' and world.goals:
        if kind in ('time_limit', 'step_limit'):
            fail('the robot did not reach a goal area within %s s' % _s(max_time_ms))
        else:
            fail('the robot did not reach a goal area: the %s ended after %s s' % ('function' if is_call else 'program', at))
    if test.get('expect'):
        failures += [f for f in check_expectations(test['expect'], test, result, is_call) if f['expect'] != 'error' or error is None]

    leds = []
    for change in sorted(robot.state_log, key=lambda c: c.t):
        if change.key in ('led.left', 'led.right'):
            left = change.value if change.key == 'led.left' else (leds[-1][1] if leds else False)
            right = change.value if change.key == 'led.right' else (leds[-1][2] if leds else False)
            leds.append([round(change.t, 1), left, right])
    report = {'name': test['name'], 'block_id': test.get('block_id'), 'kind': 'simulation',
              'outcome': 'failed' if failures else 'passed', 'failures': failures,
              'error': error.to_json() if error is not None else None, 'time_ms': result.time_ms,
              'variables': result.variables, 'actions': result.actions, 'calls': result.calls, 'pose': result.pose,
              'covered_blocks': sorted(result.coverage.covered),
              'simulation': dict(outcome, path=robot.path, leds=leds, recorded=record, goals=len(world.goals))}
    if is_call:
        report['returned'] = result._returned if error is None and robot.outcome is None else None
    else:
        report['status'] = 'error' if error is not None else 'simulation' if robot.outcome is not None else result.status
    return report, result.coverage
