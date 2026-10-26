"""Simulation worlds and their tests: the program drives the Edison through a world the learner drew (the Tests tab's
Simulation panel), and the test's checks say whether it did what it should.

**Simulation tests run on the Lab's own simulator** (since 2026-10-22: OpenRobertaWeb/src/app/nepotest/nepoTest.simRun.ts),
not here. Of this module, NepoTest uses the data format and its checks (validate, start_problems, start_pose,
default_world, migrate_v1, world_v3: the translation of the test blocks and spec.validate_spec). The rest, the copy of
the simulator below that drives the EdPy engine's robot (SimRobot, run_simulation_test, Floor), is no longer used: it
is kept for now, with its tests (tests/test_simulation.py), as an approximation that runs without a browser. It knows
the tests of the first kind only (one start, a goal decides, a recorded path).

**The world is the Lab's simulator.** Everything the robot meets here copies the simulator of the Lab
(OpenRobertaWeb/src/app/simulation/simulationLogic: robot.edison.ts, robot.actuators.ts EdisonChassis and
ChassisDiffDrive, robot.sensors.ts LineSensor, EdisonLightSensors, EdisonInfraredSensors, simulation.scene.ts,
simulation.math.ts):
- the tests' own plain peach floor (3 x 2 m, the default), or the simulator's backgrounds (simpleBackgroundEdison,
  drawBackground, rescueBackground, mathBackground) with the simulator's wall around them; the robot can't leave the
  floor;
- the same objects: obstacles and coloured areas, as rectangles, circles and triangles;
- the same robot: 24 x 22.5 units (8 x 7.5 cm), the same wheel speed per %, moved in frames of 1/60 s with the
  simulator's kinematics, and bumping into obstacles and walls like there (the bumped side's wheel turns back);
- the same sensors: the line tracker and LLIGHT/RLIGHT average the same 5 pixels of the same floor picture
  (`floor`, drawn by the Tests tab exactly like the simulator draws its sensor canvas), and the obstacle detection
  casts the same 3 x 5 rays of 3 cm.
The program is the generated EdPy on NepoTest's engine. So what the EdPy does differently from the simulator's own
program stays different: powers in the robot's 10 % steps, turns and drives measured in wheel ticks, sensors read and
cleared like on the robot.

Added by the world: **lines** to follow (drawn like the background's track: a black core on a white band), **goal
areas** and **fail areas** (the tests check whether the robot reaches or touches them), and **starts**: where the robot
can start (each test chooses one). Touching an obstacle is no failure of its own, as in the simulator: the robot bumps
(a test can check that it never does).

    {"background": "peach",
     "starts": [{"id": "A", "name": "A", "x": 150, "y": 100, "heading": 0}, {"id": "st2", "name": "on the line", ...}],
     "items": [{"id": "l1", "name": "Line 1", "kind": "line", "points": [[20, 17], [60, 17], [70, 40]], "smooth": true},
               {"id": "o1", "name": "Obstacle 1", "kind": "rect", "role": "obstacle", "x": 64, "y": 50.7, "w": 9.6, "h": 9.6},
               {"id": "c1", "kind": "circle", "role": "color", "color": "#000000", "x": 40, "y": 60, "r": 4},
               {"id": "g1", "name": "Finish", "kind": "triangle", "role": "goal", "points": [[70, 5], [80, 5], [75, 12]]}]}

Units are cm, measured from the top left corner of the background; x points right and y down (as on the screen).
Angles are degrees, counterclockwise as seen from above; 0 points right. Roles: obstacle, color (a coloured area the
sensors see; "color" is a hex colour), goal, fail. Names are optional (the blocks show them). The simulator itself works
in units of 1/3 cm with the background at (10, 10): this module does too, internally.

A test of a world (JSON, see spec.py): {"name", "simulation": {"world_block_id", "world_name", "world", "start": a start's
id, "until": an area's id (the run ends when the robot touches it), "checks": [...]}, "max_time_ms", "globals" (the
set-up's variables), "world" (claps and keys only), "skip", "should"}. A check: {"check": "reaches" | "never_touches" |
"ends_in" | "never_bumps" | "path", "item": an id (reaches, never_touches: an area, none: any goal / fail area; ends_in:
an area; never_bumps: an obstacle, none: anything), "path": [[x, y, heading], ...] and "tolerance_cm" (path; no path:
not recorded yet), "rule": true (a rule of the world: it holds for every test, and "should": "fail" doesn't turn it
round), "block_id"}.

The world of the first kind of simulation tests (until 2026-10-26: one test per world) had one "start" instead of
"starts", and the test had its "reference" path and "tolerance_cm"; run_simulation_test still takes that.
"""

import array
import base64
import math
import sys
import zlib

from .engine import Robot
from .engine import values as V
from .engine.errors import StopProgram
from .engine.robot import TRACK_CM

# ---------------------------------------------------------------------- the simulator's constants

UNITS_PER_CM = 3.0
BORDER = 10  # units: the wall around the background (simulation.scene.ts drawPattern; Ground(10, 10, w, h))
FRAME_MS = 1000.0 / 60  # the simulator moves and senses once per animation frame (60 per second)
PEACH = 'peach'  # the tests' own floor: plain light peach (#f7d1b3), 3 x 2 m, without the simulator's wall
BACKGROUNDS = {PEACH: (900, 600), 'simpleBackgroundEdison': (260, 220), 'drawBackground': (700, 500),
               'rescueBackground': (800, 540), 'mathBackground': (700, 500)}  # and RobotEdison.imgList; sizes in units
DEFAULT_BACKGROUND = PEACH
PLAIN_BACKGROUNDS = {PEACH: 0xf7 + 0xd1 + 0xb3, 'drawBackground': 765}  # backgrounds this module can draw itself: R + G + B
WALL_SUM = 3 * 153  # the wall pattern's brightness, for floors drawn here (never under a sensor: the robot can't get there)

# EdisonChassis (units, robot frame: x ahead of the wheel axle, y to the robot's right, as on the canvas)
CHASSIS = {'frontLeft': (18.5, -11.25), 'frontRight': (18.5, 11.25), 'backLeft': (-5.5, -11.25), 'backRight': (-5.5, 11.25),
           'frontMiddle': (18.5, 0.0), 'backMiddle': (-5.5, 0.0),
           # the Edison's wheel geometry is empty, so these points are the axle's centre
           'wheelFrontLeft': (0.0, 0.0), 'wheelFrontRight': (0.0, 0.0), 'wheelBackLeft': (0.0, 0.0), 'wheelBackRight': (0.0, 0.0)}
OUTLINE = ('frontLeft', 'frontRight', 'backRight', 'backLeft')
LENGTH_CM = 24 / UNITS_PER_CM
WIDTH_CM = 22.5 / UNITS_PER_CM
WHEEL_DIAMETER = 3.7  # cm (robot.edison.ts)
MAX_ROTATION = 3  # (new EdisonChassis(id, configuration, 3, pose))
MAXPOWER = MAX_ROTATION * WHEEL_DIAMETER * math.pi * 3 / 100  # units per second per % of power (ChassisDiffDrive)
CM_PER_S = dict((level, level * 10 * MAXPOWER / UNITS_PER_CM) for level in range(1, 11))  # an EdPy speed level is 10 %
# DEVIATION: the simulator's track width is 7 cm. Turns here are measured in wheel ticks (EdPy), and with EdPy's
# "1 tick per degree" a turn of 90 degrees only turns 90 degrees with a track of 45 / (2 pi) = 7.16 cm, as the
# simulator's own turn does. Curves turn 2 % slower than in the simulator.
TRACK_UNITS = TRACK_CM * UNITS_PER_CM
LINE_SENSOR = (15.0, 0.0)  # LineSensor({x: 15, y: 0}, 3)
LIGHT_SENSORS = (('left', (16.5, -4.5)), ('right', (16.5, 4.5)))  # EdisonLightSensors
SENSOR_DIAMETER = 3
IR_SENSORS = (('LEFT', 17.0, -8.0), ('FRONT', 18.0, 0.0), ('RIGHT', 17.0, 8.0))  # EdisonInfraredSensors, all looking ahead
IR_MAX_CM = 3.0
IR_MAX_LENGTH = 3 * IR_MAX_CM  # units (DistanceSensor.maxLength)
IR_RAYS = (-math.pi / 8, -math.pi / 16, 0.0, math.pi / 16, math.pi / 8)
OBSTACLE_COLOR = '#33B8CA'
COLOR_AREA_COLOR = '#FBED00'

# the test's own things
LINE_WIDTH_CM = 4.44 / UNITS_PER_CM  # the black core of simpleBackgroundEdison's track
LINE_BAND_CM = 16 / UNITS_PER_CM  # its white band
ROLES = ('obstacle', 'color', 'goal', 'fail')
KINDS = ('line', 'rect', 'circle', 'triangle')
CHECK_DEG = 0.3
SAMPLE_CM, SAMPLE_DEG = 0.5, 3.0  # the path gets a new pose after this much movement
DEFAULT_MAX_TIME_MS = 30000
DEFAULT_TOLERANCE_CM = 2
CURVE_PIECES = 16
GIVEN_EVENTS = ('clap', 'key')  # what "given" may add (the simulator has no IR remote and messages); the drawn world does the rest
DEFAULT_START = 'A'  # the id and name of a new world's start
CHECKS = ('reaches', 'never_touches', 'ends_in', 'never_bumps', 'path')
AREA_ROLES = ('goal', 'fail', 'color')


def js_round(v):
    """JavaScript's Math.round"""
    return int(math.floor(v + 0.5))


def to_units(x_cm, y_cm):
    return (BORDER + x_cm * UNITS_PER_CM, BORDER + y_cm * UNITS_PER_CM)


def to_cm(xu, yu):
    return ((xu - BORDER) / UNITS_PER_CM, (yu - BORDER) / UNITS_PER_CM)


def transform(pose, point):
    """SIMATH.transform: a point of the robot frame (units) at a pose (x, y, theta: clockwise)"""
    x, y, theta = pose
    s, c = math.sin(theta), math.cos(theta)
    return (point[0] * c - point[1] * s + x, point[0] * s + point[1] * c + y)


def sim_pose(x_cm, y_cm, heading_deg):
    """(x, y, theta) in the simulator's terms for a pose of the world JSON"""
    x, y = to_units(x_cm, y_cm)
    return (x, y, (-math.radians(heading_deg)) % (2 * math.pi))


def outline(pose):
    return [transform(pose, CHASSIS[name]) for name in OUTLINE]


def check_points(poly):
    """the corners and the middles of the edges of an outline"""
    n = len(poly)
    return list(poly) + [((poly[i][0] + poly[(i + 1) % n][0]) / 2.0, (poly[i][1] + poly[(i + 1) % n][1]) / 2.0) for i in range(n)]


# ---------------------------------------------------------------------- the simulator's geometry (simulation.math.ts)

def line_aligned(px, py, line):
    x1, y1, x2, y2 = line
    if px < min(x1, x2) - 0.01 or px > max(x1, x2) + 0.01:
        return False
    if py < min(y1, y2) - 0.01 or py > max(y1, y2) + 0.01:
        return False
    return True


def intersection(l1, l2):
    """getIntersectionPoint: lines as (x1, y1, x2, y2)"""
    d = (l1[0] - l1[2]) * (l2[1] - l2[3]) - (l1[1] - l1[3]) * (l2[0] - l2[2])
    if d == 0:
        return None
    a = l1[0] * l1[3] - l1[1] * l1[2]
    b = l2[0] * l2[3] - l2[1] * l2[2]
    xi = ((l2[0] - l2[2]) * a - (l1[0] - l1[2]) * b) / d
    yi = ((l2[1] - l2[3]) * a - (l1[1] - l1[3]) * b) / d
    if not line_aligned(xi, yi, l1) or not line_aligned(xi, yi, l2):
        return None
    return (xi, yi)


def sq_distance(p1, p2):
    """getDistance (the simulator's "distance" is squared)"""
    return (p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2


def closest_on_segment(p, p1, p2):
    """getDistanceToLine: the point of the segment p1 p2 nearest to p"""
    d = sq_distance(p1, p2)
    if d == 0:
        return p1
    t = ((p[0] - p1[0]) * (p2[0] - p1[0]) + (p[1] - p1[1]) * (p2[1] - p1[1])) / d
    if t < 0:
        return p1
    if t > 1:
        return p2
    return (p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1]))


def circle_intersections(line, cx, cy, r):
    """getIntersectionPointsCircle (with its 2-unit tolerance for "on the line")"""
    ax, ay, bx, by = line

    def on_line(p):
        return abs(math.sqrt(sq_distance((ax, ay), p)) + math.sqrt(sq_distance((bx, by), p)) - math.sqrt(sq_distance((ax, ay), (bx, by)))) <= 2

    ba_x, ba_y, ca_x, ca_y = bx - ax, by - ay, cx - ax, cy - ay
    a = ba_x * ba_x + ba_y * ba_y
    if a == 0:
        return []
    p_by2 = (ba_x * ca_x + ba_y * ca_y) / a
    q = (ca_x * ca_x + ca_y * ca_y - r * r) / a
    disc = p_by2 * p_by2 - q
    if disc < 0:
        return []
    root = math.sqrt(disc)
    p1 = (ax - ba_x * (-p_by2 + root), ay - ba_y * (-p_by2 + root))
    if disc == 0:
        return [p1] if on_line(p1) else []
    p2 = (ax - ba_x * (-p_by2 - root), ay - ba_y * (-p_by2 - root))
    return [p for p in (p1 if on_line(p1) else None, p2 if on_line(p2) else None) if p is not None]


def point_in_polygon(px, py, poly):
    inside = False
    for i in range(len(poly)):
        ax, ay = poly[i]
        bx, by = poly[i - 1]
        if (ay > py) != (by > py) and px < (bx - ax) * (py - ay) / (by - ay) + ax:
            inside = not inside
    return inside


def segment_distance(px, py, ax, ay, bx, by):
    q = closest_on_segment((px, py), (ax, ay), (bx, by))
    return math.hypot(px - q[0], py - q[1])


def polygon_distance(px, py, poly):
    """0 inside the polygon, else the distance to its outline"""
    if point_in_polygon(px, py, poly):
        return 0.0
    return min(segment_distance(px, py, poly[i - 1][0], poly[i - 1][1], poly[i][0], poly[i][1]) for i in range(len(poly)))


def _cross(o, a, b):
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


def segments_cross(a, b, c, d):
    d1, d2, d3, d4 = _cross(c, d, a), _cross(c, d, b), _cross(a, b, c), _cross(a, b, d)
    if ((d1 > 0) != (d2 > 0)) and ((d3 > 0) != (d4 > 0)) and 0 not in (d1, d2, d3, d4):
        return True

    def on(p, q, r, cr):
        return cr == 0 and min(p[0], q[0]) <= r[0] <= max(p[0], q[0]) and min(p[1], q[1]) <= r[1] <= max(p[1], q[1])

    return on(c, d, a, d1) or on(c, d, b, d2) or on(a, b, c, d3) or on(a, b, d, d4)


def bbox(points, margin=0.0):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return (min(xs) - margin, min(ys) - margin, max(xs) + margin, max(ys) + margin)


def _boxes_meet(a, b):
    return a[0] <= b[2] and b[0] <= a[2] and a[1] <= b[3] and b[1] <= a[3]


# ---------------------------------------------------------------------- the world's shapes

class Shape(object):
    """a rect, circle or triangle of the world, in units (rect: top left x, y and w, h; circle: centre and r)"""

    def __init__(self, item):
        self.id = item.get('id')
        self.kind = item['kind']
        self.role = item.get('role')
        self.color = item.get('color') or (OBSTACLE_COLOR if self.role == 'obstacle' else COLOR_AREA_COLOR)
        if self.kind == 'rect':
            self.x, self.y = to_units(float(item['x']), float(item['y']))
            self.w, self.h = float(item['w']) * UNITS_PER_CM, float(item['h']) * UNITS_PER_CM
            self.polygon = [(self.x, self.y), (self.x + self.w, self.y), (self.x + self.w, self.y + self.h), (self.x, self.y + self.h)]
        elif self.kind == 'circle':
            self.x, self.y = to_units(float(item['x']), float(item['y']))
            self.r = float(item['r']) * UNITS_PER_CM
            self.polygon = [(self.x + self.r * math.cos(2 * math.pi * k / 48), self.y + self.r * math.sin(2 * math.pi * k / 48)) for k in range(48)]
        else:
            self.points = [to_units(float(p[0]), float(p[1])) for p in item['points']]
            self.polygon = self.points
        self.box = bbox(self.polygon, getattr(self, 'r', 0) * 0.02)

    def lines(self):
        """getLines: UTIL.getLinesFromRectangle for rects, the three sides of a triangle (circles have none)"""
        if self.kind == 'rect':
            x, y, w, h = self.x, self.y, self.w, self.h
            return [(x, y, x, y + h), (x, y, x + w, y), (x + w, y + h, x, y + h), (x + w, y + h, x + w, y)]
        if self.kind == 'triangle':
            (ax, ay), (bx, by), (cx, cy) = self.points
            return [(ax, ay, bx, by), (bx, by, cx, cy), (ax, ay, cx, cy)]
        return []

    def contains(self, px, py):
        """checkInObstacle"""
        if self.kind == 'rect':
            return self.x < px < self.x + self.w and self.y < py < self.y + self.h
        if self.kind == 'circle':
            return (px - self.x) ** 2 + (py - self.y) ** 2 <= self.r * self.r
        (ax, ay), (bx, by), (cx, cy) = self.points
        orig = math.floor(abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)))
        a1 = math.floor(abs((ax - px) * (by - py) - (bx - px) * (ay - py)))
        a2 = math.floor(abs((bx - px) * (cy - py) - (cx - px) * (by - py)))
        a3 = math.floor(abs((cx - px) * (ay - py) - (ax - px) * (cy - py)))
        return a1 + a2 + a3 <= orig

    def touches(self, poly, box):
        """does a polygon (the robot's outline) touch this shape?"""
        if not _boxes_meet(box, self.box):
            return False
        if self.kind == 'circle':
            return polygon_distance(self.x, self.y, poly) <= self.r
        for i in range(len(poly)):
            for j in range(len(self.polygon)):
                if segments_cross(poly[i - 1], poly[i], self.polygon[j - 1], self.polygon[j]):
                    return True
        return point_in_polygon(poly[0][0], poly[0][1], self.polygon) or point_in_polygon(self.polygon[0][0], self.polygon[0][1], poly)


def bezier_segments(points, smooth, closed):
    """a line as cubic Bezier segments (p0, c1, c2, p1): straight between the points, or a Catmull-Rom curve through them.
    The editor (nepoTest.sim.ts) draws exactly these segments."""
    pts = [(float(p[0]), float(p[1])) for p in points]
    n = len(pts)
    wrap = closed and n > 2
    pairs = [(i, (i + 1) % n) for i in range(n)] if wrap else [(i, i + 1) for i in range(n - 1)]
    segments = []
    for i, j in pairs:
        p0, p1 = pts[i], pts[j]
        if not smooth:
            segments.append((p0, p0, p1, p1))
            continue
        before = pts[i - 1] if wrap or i > 0 else p0
        after = pts[(j + 1) % n] if wrap or j + 1 < n else p1
        c1 = (p0[0] + (p1[0] - before[0]) / 6.0, p0[1] + (p1[1] - before[1]) / 6.0)
        c2 = (p1[0] - (after[0] - p0[0]) / 6.0, p1[1] - (after[1] - p0[1]) / 6.0)
        segments.append((p0, c1, c2, p1))
    return segments


def polyline(segments):
    """the points of Bezier segments, curves in CURVE_PIECES pieces"""
    out = []
    for p0, c1, c2, p1 in segments:
        if not out:
            out.append(p0)
        if c1 == p0 and c2 == p1:
            out.append(p1)
            continue
        for k in range(1, CURVE_PIECES + 1):
            t = k / float(CURVE_PIECES)
            u = 1 - t
            out.append((u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
                        u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1]))
    return out


# ---------------------------------------------------------------------- the floor the sensors see

def _hex_sum(color):
    c = (color or '#000000').lstrip('#')
    if len(c) == 3:
        c = ''.join(ch * 2 for ch in c)
    return int(c[0:2], 16) + int(c[2:4], 16) + int(c[4:6], 16)


class Floor(object):
    """The simulator's sensor canvas (uCtx): one pixel per unit, the background at (10, 10), the wall around it, the
    coloured areas and the test's lines on top. Each pixel holds R + G + B (alpha doesn't matter to the sensors)."""

    def __init__(self, width, height, sums):
        self.width, self.height, self.sums = width, height, sums

    @classmethod
    def decode(cls, floor):
        raw = zlib.decompress(base64.b64decode(floor['sum']))
        sums = array.array('H')
        sums.frombytes(raw)
        if sys.byteorder == 'big':
            sums.byteswap()  # stored little-endian
        if len(sums) != floor['w'] * floor['h']:
            raise ValueError('the floor picture has %d pixels, not %d x %d' % (len(sums), floor['w'], floor['h']))
        return cls(floor['w'], floor['h'], sums)

    @classmethod
    def draw(cls, world):
        """A floor drawn here, for worlds without a stored picture: a plain background (peach without a wall, or white),
        the coloured areas and the lines (a pixel takes the colour of what covers its centre; a browser also blends the
        edges)."""
        bw, bh = world.background_size
        width, height = bw + 2 * BORDER, bh + 2 * BORDER
        plain = PLAIN_BACKGROUNDS.get(world.background, 765)
        sums = array.array('H', [plain if world.background == PEACH else WALL_SUM]) * (width * height)
        for y in range(BORDER, BORDER + bh):
            row = y * width
            for x in range(BORDER, BORDER + bw):
                sums[row + x] = plain
        floor = cls(width, height, sums)
        for shape in world.colors:
            floor._fill(shape, _hex_sum(shape.color))
        for line in world.lines:
            floor._stroke(line, LINE_BAND_CM * UNITS_PER_CM / 2.0, 765)
        for line in world.lines:
            floor._stroke(line, line.half_core, 0)
        return floor

    def _pixels(self, box):
        x0, y0 = max(0, int(math.floor(box[0]))), max(0, int(math.floor(box[1])))
        x1, y1 = min(self.width - 1, int(math.ceil(box[2]))), min(self.height - 1, int(math.ceil(box[3])))
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                yield x, y

    def _fill(self, shape, value):
        for x, y in self._pixels(shape.box):
            cx, cy = x + 0.5, y + 0.5
            inside = (shape.x <= cx <= shape.x + shape.w and shape.y <= cy <= shape.y + shape.h) if shape.kind == 'rect' else \
                ((cx - shape.x) ** 2 + (cy - shape.y) ** 2 <= shape.r ** 2) if shape.kind == 'circle' else point_in_polygon(cx, cy, shape.points)
            if inside:
                self.sums[y * self.width + x] = value

    def _stroke(self, line, half, value):
        pts = line.points
        for i in range(1, len(pts)):
            a, b = pts[i - 1], pts[i]
            for x, y in self._pixels(bbox([a, b], half + 1)):
                if segment_distance(x + 0.5, y + 0.5, a[0], a[1], b[0], b[1]) <= half:
                    self.sums[y * self.width + x] = value

    def sample(self, px, py):
        """LineSensor.updateSensor: the light (0..100, unrounded) of the 5 pixels of a 3 x 3 cross at a point (units)"""
        x0, y0 = js_round(px - SENSOR_DIAMETER / 2.0), js_round(py - SENSOR_DIAMETER / 2.0)
        total = 0
        for dx, dy in ((1, 0), (0, 1), (1, 1), (2, 1), (1, 2)):
            x, y = x0 + dx, y0 + dy
            if 0 <= x < self.width and 0 <= y < self.height:
                total += self.sums[y * self.width + x]  # outside the canvas: transparent black
        return total / 5.0 / 3.0 / 2.55


class _Line(object):
    def __init__(self, item):
        self.id = item.get('id')
        self.half_core = float(item.get('width', LINE_WIDTH_CM)) * UNITS_PER_CM / 2.0
        cm = polyline(bezier_segments(item['points'], bool(item.get('smooth')), bool(item.get('closed'))))
        self.points = [to_units(x, y) for x, y in cm]


def default_world():
    """a new world: the plain peach floor, the robot's start A in its middle, nothing on it"""
    bw, bh = BACKGROUNDS[DEFAULT_BACKGROUND]
    return {'background': DEFAULT_BACKGROUND, 'starts': [{'id': DEFAULT_START, 'name': DEFAULT_START, 'x': round(bw / 2.0 / UNITS_PER_CM, 2),
                                                          'y': round(bh / 2.0 / UNITS_PER_CM, 2), 'heading': 0}],
            'items': []}


def world_v3(world):
    """a world with one "start" (block data version 2, until 2026-10-26) as one with "starts": the start becomes start A"""
    world = dict(world)
    if 'starts' not in world:
        start = world.pop('start', None) or {}
        world['starts'] = [{'id': DEFAULT_START, 'name': DEFAULT_START, 'x': start.get('x', 0), 'y': start.get('y', 0),
                            'heading': start.get('heading', 0)}]
    world.setdefault('items', [])
    return world


def start_pose(world_data, start_id=None):
    """the start (a dict with x, y, heading) of a world by its id; a world of the first kind has one "start"; None if there
    is no such start"""
    if start_id is None and isinstance(world_data.get('start'), dict):
        return world_data['start']
    starts = [s for s in world_data.get('starts') or [] if isinstance(s, dict)]
    if start_id is None:
        return starts[0] if starts else None
    return next((s for s in starts if s.get('id') == start_id), None)


def item_name(world_data, item):
    """an item's name: its own, or its kind and number ("Goal 2"), as the blocks show it"""
    if item.get('name'):
        return item['name']
    kind = 'line' if item.get('kind') == 'line' else item.get('role')
    same = [i for i in world_data.get('items') or [] if ('line' if i.get('kind') == 'line' else i.get('role')) == kind]
    word = {'goal': 'Goal', 'fail': 'Fail area', 'color': 'Area', 'obstacle': 'Obstacle', 'line': 'Line'}.get(kind, kind)
    return '%s %d' % (word, same.index(item) + 1 if item in same else 1)


def migrate_v1(world):
    """a world of the first version of simulation tests (block data version 1: an unbounded, plain peach floor; rect and
    ellipse given by their centre, with a rotation; roles black and white) in today's terms, on the plain peach
    floor, as then"""
    items = []
    for item in (world or {}).get('items') or []:
        kind, role = item.get('kind'), item.get('role')
        if kind in ('rect', 'ellipse'):
            new = {'id': item.get('id'), 'role': 'color' if role in ('black', 'white') else role}
            if role in ('black', 'white'):
                new['color'] = '#000000' if role == 'black' else '#ffffff'
            if kind == 'rect':  # the rotation is lost: the simulator's rectangles don't turn
                new.update(kind='rect', x=item['x'] - item['w'] / 2.0, y=item['y'] - item['h'] / 2.0, w=item['w'], h=item['h'])
            else:
                new.update(kind='circle', x=item['x'], y=item['y'], r=(item['w'] + item['h']) / 4.0)
            items.append(new)
        elif kind == 'line':
            items.append(dict((k, v) for k, v in item.items() if k != 'width'))  # the background's line width
    return {'background': PEACH, 'start': (world or {}).get('start') or {'x': 0, 'y': 0, 'heading': 0}, 'items': items}


class SimWorld(object):
    """the drawn world: background, start pose (start: a start's id; none: the world's only or first start), floor
    picture, obstacles, goal and fail areas"""

    def __init__(self, data, floor=None, start=None):
        data = data or {}
        self.background = data.get('background') or DEFAULT_BACKGROUND
        self.background_size = BACKGROUNDS.get(self.background, BACKGROUNDS[DEFAULT_BACKGROUND])
        bw, bh = self.background_size
        self.ground = (BORDER, BORDER, BORDER + bw, BORDER + bh)  # Ground(10, 10, w, h) as (x0, y0, x1, y1)
        start = start_pose(data, start) or {}
        self.start = (float(start.get('x', 0)), float(start.get('y', 0)), float(start.get('heading', 0)))
        self.lines, self.obstacles, self.colors, self.goals, self.fails = [], [], [], [], []
        for item in data.get('items') or []:
            kind = item.get('kind')
            if kind == 'line':
                if len(item.get('points') or []) >= 2:
                    self.lines.append(_Line(item))
            elif kind in ('rect', 'circle', 'triangle'):
                shape = Shape(item)
                {'obstacle': self.obstacles, 'color': self.colors, 'goal': self.goals, 'fail': self.fails}.get(shape.role, self.colors).append(shape)
        self.floor = Floor.decode(floor) if floor else Floor.draw(self)

    def ground_lines(self):
        x0, y0, x1, y1 = self.ground
        return [(x0, y0, x0, y1), (x0, y0, x1, y0), (x1, y1, x0, y1), (x1, y1, x1, y0)]

    def touching(self, poly, shapes):
        box = bbox(poly)
        for s in shapes:
            if s.touches(poly, box):
                return s
        return None


class Corridor(object):
    """where the robot may be: within `tolerance` cm of its outline at any pose of a recorded path"""
    CELL = 15.0  # units

    def __init__(self, path, tolerance_cm):
        self.tolerance = float(tolerance_cm) * UNITS_PER_CM
        self.outlines = [outline(sim_pose(p[0], p[1], p[2])) for p in path]
        self.cells = {}
        for k, poly in enumerate(self.outlines):
            box = bbox(poly, self.tolerance)
            for i in range(int(math.floor(box[0] / self.CELL)), int(math.floor(box[2] / self.CELL)) + 1):
                for j in range(int(math.floor(box[1] / self.CELL)), int(math.floor(box[3] / self.CELL)) + 1):
                    self.cells.setdefault((i, j), []).append(k)
        self._last = 0  # the robot moves along the path: look near the last match first

    def _near(self, k, x, y):
        return polygon_distance(x, y, self.outlines[k]) <= self.tolerance + 1e-9

    def contains(self, x, y):
        n = len(self.outlines)
        for k in range(max(0, self._last - 4), min(n, self._last + 16)):
            if self._near(k, x, y):
                self._last = k
                return True
        for k in self.cells.get((int(math.floor(x / self.CELL)), int(math.floor(y / self.CELL))), ()):
            if self._near(k, x, y):
                self._last = k
                return True
        return False

    def outside(self, points):
        for p in points:
            if not self.contains(p[0], p[1]):
                return p
        return None


# ---------------------------------------------------------------------- the robot in the world

class SimRobot(Robot):
    """The engine's virtual Edison in a drawn world, moved and sensing like the Lab's simulator (see the module doc).

    The engine still drives the wheels (EdPy semantics: speed levels, distances in ticks, blocking drives); their
    travel moves the robot once per frame. The world can end the run (StopProgram('simulation'), the reason in
    `outcome`). `path`: [t_ms, x_cm, y_cm, heading_deg] (heading not wrapped, so a replay can interpolate)."""

    def __init__(self, world, corridor=None, **options):
        options.setdefault('cm_per_s', CM_PER_S)
        super(SimRobot, self).__init__(**options)
        self.world = world
        self.corridor = corridor
        self.outcome = None  # {'result': 'goal' | 'fail_area' | 'deviation', 't', 'item', 'point'}
        self.path = []
        self.pose_u = sim_pose(*world.start)  # x, y (units), theta (clockwise, 0..2 pi), like the simulator's Pose
        self.heading_unwrapped = world.start[2]
        self.bumped = dict.fromkeys(CHASSIS, False)
        self.points = {}
        self.bumps = 0  # frames in which the robot pushed against something
        self.light = {'tracker': 0.0, 'left': 0.0, 'right': 0.0}  # unrounded light values of the last frame
        self.ir = {'LEFT': False, 'FRONT': False, 'RIGHT': False}
        self._ir_bits = 0
        self._travel = [0.0, 0.0]  # wheel travel (cm) since the last frame
        self._next_frame = FRAME_MS
        self._checking = False
        self._checked = None
        self._place()

    # ------------------------------------------------------------------ time and frames

    def _begin(self, max_time_ms, max_steps):
        super(SimRobot, self)._begin(max_time_ms, max_steps)
        self._sense(0.0, 0.0, 0.0)
        self._checking = True  # from now on, the world can end the run (StopProgram is only caught around the program)
        self._sample(force=True)

    def _move_pose(self, dl, dr):
        self._travel[0] += dl  # the robot moves at the next frame, as in the simulator
        self._travel[1] += dr

    def _move_to(self, target):
        while self._next_frame <= target + 1e-9:
            super(SimRobot, self)._move_to(self._next_frame)
            self._frame(FRAME_MS / 1000.0)
            self._next_frame += FRAME_MS
        super(SimRobot, self)._move_to(target)
        if self.beam and self._ir_bits:
            self._obstacle |= self._ir_bits  # the simulator's obstacle values hold for the whole frame

    def _frame(self, dt):
        """one animation frame of the simulator: move (ChassisDiffDrive.updateAction), then collisions and sensors"""
        dl, dr = self._travel[0] * UNITS_PER_CM, self._travel[1] * UNITS_PER_CM
        self._travel = [0.0, 0.0]
        left_speed, right_speed = dl / dt, dr / dt
        if left_speed or right_speed:
            self._drive(left_speed, right_speed, dt)
        self._sense(dt, left_speed, right_speed)
        if self._checking:
            pose = (self.pose_u[0], self.pose_u[1], self.heading_unwrapped)
            if self._checked is None or self._checked != pose:
                self._checked = pose
                self._sample()
                self._check()

    def _drive(self, left_speed, right_speed, dt):
        """ChassisDiffDrive.updateAction: the bumped side's wheel turns back; then the simulator's kinematics, as it is"""
        b = self.bumped
        temp_left, temp_right = left_speed, right_speed
        if (b['frontLeft'] or b['wheelFrontLeft']) and left_speed > 0:
            temp_left *= -1
        if b['backLeft'] and left_speed < 0:
            temp_left *= -1
        if (b['frontRight'] or b['wheelFrontRight']) and right_speed > 0:
            temp_right *= -1
        if b['backRight'] and right_speed < 0:
            temp_right *= -1
        if (temp_left, temp_right) != (left_speed, right_speed):
            self.bumps += 1
        x, y, theta = self.pose_u
        if abs(temp_right - temp_left) <= 1.0e-6:
            move = temp_right * dt
            m_x = math.cos(theta) * move
            m_y = math.sqrt(max(0.0, move * move - m_x * m_x))
            x += m_x
            if move >= 0:
                y += m_y if theta < math.pi else -m_y
            else:
                y += m_y if theta > math.pi else -m_y
            theta_diff = 0.0
        else:
            radius = (TRACK_UNITS / 2.0) * ((temp_left + temp_right) / (temp_left - temp_right))
            rot = (temp_left - temp_right) / TRACK_UNITS
            icc_x = x - radius * math.sin(theta)
            icc_y = y + radius * math.cos(theta)
            a = rot * dt
            x = math.cos(a) * (x - icc_x) - math.sin(a) * (y - icc_y) + icc_x
            y = math.sin(a) * (x - icc_x) + math.cos(a) * (y - icc_y) + icc_y  # the simulator uses the new x here too
            theta_diff = a
        self.pose_u = (x, y, (theta + theta_diff + 2 * math.pi) % (2 * math.pi))
        self.heading_unwrapped -= math.degrees(theta_diff)
        self._place()

    def _place(self):
        """chassis points in the world, and the engine's pose (relative to the start, for pose_of)"""
        self.points = dict((name, transform(self.pose_u, p)) for name, p in CHASSIS.items())
        sx, sy, sh = self.world.start
        x_cm, y_cm = to_cm(self.pose_u[0], self.pose_u[1])
        dx, dy = x_cm - sx, y_cm - sy
        r = math.radians(sh)
        self.x_cm = dx * math.cos(r) - dy * math.sin(r)
        self.y_cm = -dx * math.sin(r) - dy * math.cos(r)
        self._heading = math.radians(self.heading_unwrapped - sh)

    def world_pose(self):
        x_cm, y_cm = to_cm(self.pose_u[0], self.pose_u[1])
        return (x_cm, y_cm, self.heading_unwrapped)

    # ------------------------------------------------------------------ the simulator's sensors

    def _sense(self, dt, left_speed, right_speed):
        self._collisions(dt, max(abs(left_speed), abs(right_speed)))
        floor = self.world.floor
        px, py = transform(self.pose_u, LINE_SENSOR)
        self.light['tracker'] = floor.sample(px, py)
        for side, point in LIGHT_SENSORS:
            px, py = transform(self.pose_u, point)
            self.light[side] = floor.sample(px, py)
        self._infrared()

    def _collisions(self, dt, tolerance):
        """ChassisMobile.checkCollisions for a robot alone with the obstacles and the ground"""
        p, b = self.points, self.bumped
        x0, y0, x1, y1 = self.world.ground
        checks = ('frontLeft', 'frontRight', 'backLeft', 'backRight', 'wheelFrontRight', 'wheelFrontLeft', 'wheelBackLeft', 'wheelBackRight')
        for name in b:
            b[name] = False
        for name in checks:
            q = p[name]
            if q[0] < x0 or q[0] > x1 or q[1] < y0 or q[1] > y1:
                b[name] = True
        check_lines = (('frontLeft', 'frontRight', 'frontMiddle'), ('backLeft', 'backRight', 'backMiddle'),
                       ('wheelFrontRight', 'wheelBackRight', None), ('wheelFrontLeft', 'wheelBackLeft', None))
        for obstacle in self.world.obstacles:
            inside = [name for name in checks if obstacle.contains(*p[name])]
            for name in inside:
                b[name] = True
            if inside:
                continue
            if obstacle.kind != 'circle':
                lines = obstacle.lines()
                for first, second, middle in check_lines:
                    seg = (p[first][0], p[first][1], p[second][0], p[second][1])
                    for k in lines:
                        hit = intersection(seg, k)
                        if hit:
                            if abs(p[first][0] - hit[0]) < abs(p[second][0] - hit[0]):
                                b[first] = True
                            else:
                                b[second] = True
                        elif middle:
                            q = closest_on_segment(p[middle], (k[0], k[1]), (k[2], k[3]))
                            if sq_distance(p[middle], q) < dt * tolerance:
                                b[first] = b[second] = True
            else:
                for first, second, middle in check_lines:
                    seg = (p[first][0], p[first][1], p[second][0], p[second][1])
                    hits = circle_intersections(seg, obstacle.x, obstacle.y, obstacle.r)
                    if not hits:
                        continue
                    hit = hits[0] if len(hits) == 1 else ((hits[0][0] + hits[1][0]) / 2.0, (hits[0][1] + hits[1][1]) / 2.0)
                    d0, d1 = sq_distance(p[first], hit), sq_distance(p[second], hit)
                    if d0 + 30 < d1:
                        b[first] = True
                    elif d1 + 30 < d0:
                        b[second] = True
                    else:
                        b[first] = b[second] = True
        b['frontLeft'] = b['frontLeft'] or b['frontMiddle']
        b['frontRight'] = b['frontRight'] or b['frontMiddle']
        b['backLeft'] = b['backLeft'] or b['backMiddle'] or b['wheelBackLeft']
        b['backRight'] = b['backRight'] or b['backMiddle'] or b['wheelBackRight']

    def _infrared(self):
        """EdisonInfraredSensors: three sensors, five rays each, an obstacle closer than 3 cm (also the wall)"""
        lines = list(self.world.ground_lines())
        circles = []
        for obstacle in self.world.obstacles:
            if obstacle.kind == 'circle':
                circles.append(obstacle)
            else:
                lines += obstacle.lines()
        x, y, theta = self.pose_u
        for port, sx, sy in IR_SENSORS:
            rx, ry = transform(self.pose_u, (sx, sy))
            best = IR_MAX_LENGTH
            for angle in IR_RAYS:
                ray = (rx, ry, rx + IR_MAX_LENGTH * math.cos(theta + angle), ry + IR_MAX_LENGTH * math.sin(theta + angle))
                hits = [intersection(ray, k) for k in lines]
                for c in circles:
                    found = circle_intersections(ray, c.x, c.y, c.r)
                    if found:
                        hits.append(min(found, key=lambda q: sq_distance((rx, ry), q)))
                for hit in hits:
                    if hit is not None:
                        best = min(best, math.hypot(hit[0] - rx, hit[1] - ry))
            self.ir[port] = best / UNITS_PER_CM < IR_MAX_CM
        c = V.CONSTANTS
        seen = self.ir
        if seen['FRONT'] or (seen['LEFT'] and seen['RIGHT']):
            self._ir_bits = c['OBSTACLE_DETECTED'] | c['OBSTACLE_AHEAD']
        elif seen['LEFT']:
            self._ir_bits = c['OBSTACLE_DETECTED'] | c['OBSTACLE_LEFT']
        elif seen['RIGHT']:
            self._ir_bits = c['OBSTACLE_DETECTED'] | c['OBSTACLE_RIGHT']
        else:
            self._ir_bits = 0

    def ed_ReadLineState(self):
        return V.CONSTANTS['LINE_ON_BLACK'] if self.light['tracker'] < 50 else V.CONSTANTS['LINE_ON_WHITE']

    def ed_ReadLineTracker(self):
        return js_round(self.light['tracker']) * 10  # NEPO shows it divided by 10: the simulator's light value

    def ed_ReadLeftLightLevel(self):
        return js_round(self.light['left']) * 10

    def ed_ReadRightLightLevel(self):
        return js_round(self.light['right']) * 10

    # ------------------------------------------------------------------ what the test watches

    def _sample(self, force=False):
        last = self.path[-1] if self.path else None
        x, y, h = self.world_pose()
        if force or last is None or math.hypot(x - last[1], y - last[2]) >= SAMPLE_CM or abs(h - last[3]) >= SAMPLE_DEG:
            entry = [round(self.now, 1), round(x, 2), round(y, 2), round(h, 1)]
            if last is not None and last[0] == entry[0]:
                self.path[-1] = entry
            else:
                self.path.append(entry)

    def _check(self):
        poly = [self.points[name] for name in OUTLINE]
        w = self.world
        hit = w.touching(poly, w.fails)
        if hit is not None:
            self._decide('fail_area', hit.id)
        if self.corridor is not None:
            point = self.corridor.outside(check_points(poly))
            if point is not None:
                self._decide('deviation', None, to_cm(*point))
        hit = w.touching(poly, w.goals)
        if hit is not None:
            self._decide('goal', hit.id)

    def _decide(self, result, item=None, point=None):
        self._sample(force=True)
        self.outcome = {'result': result, 't': round(self.now, 1), 'item': item,
                        'point': [round(point[0], 2), round(point[1], 2)] if point is not None else None}
        raise StopProgram('simulation')

    def finish_path(self):
        self._sample(force=True)


# ---------------------------------------------------------------------- checking a simulation (before it runs)

def _number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def validate_world(world, where):
    """[problem] of a simulation world: background, starts, items"""
    problems = []
    if not isinstance(world, dict):
        return ['%s must be an object' % where]
    if world.get('background') not in BACKGROUNDS:
        problems.append('%s.background must be one of %s' % (where, ', '.join(BACKGROUNDS)))
    starts = world.get('starts')
    if not isinstance(starts, list) or not starts:
        problems.append('%s.starts must be a list of at least one start' % where)
        starts = []
    ids = set()
    for i, start in enumerate(starts):
        if not isinstance(start, dict) or not isinstance(start.get('id'), str) or not all(_number(start.get(k)) for k in ('x', 'y', 'heading')):
            problems.append('%s.starts[%d] needs an id and numbers x, y and heading' % (where, i))
        elif start['id'] in ids:
            problems.append('%s.starts[%d]: there are two starts with the id %r' % (where, i, start['id']))
        else:
            ids.add(start['id'])
    for i, item in enumerate(world.get('items') or []):
        w = '%s.items[%d]' % (where, i)
        kind = item.get('kind') if isinstance(item, dict) else None
        if kind not in KINDS:
            problems.append('%s: "kind" must be one of %s' % (w, ', '.join(KINDS)))
            continue
        if kind == 'line' or kind == 'triangle':
            points = item.get('points')
            count = 3 if kind == 'triangle' else None
            if not isinstance(points, list) or len(points) < 2 or (count and len(points) != count) or not all(
                    isinstance(p, list) and len(p) == 2 and all(_number(c) for c in p) for p in points):
                problems.append('%s: a %s needs %s points [x, y]' % (w, kind, 'three' if count else 'at least two'))
        else:
            keys = ('x', 'y', 'w', 'h') if kind == 'rect' else ('x', 'y', 'r')
            if not all(_number(item.get(k)) for k in keys):
                problems.append('%s: a %s needs numbers %s' % (w, kind, ', '.join(keys)))
        if kind != 'line' and item.get('role') not in ROLES:
            problems.append('%s: "role" must be one of %s' % (w, ', '.join(ROLES)))
        if item.get('name') is not None and not isinstance(item.get('name'), str):
            problems.append('%s: "name" must be a string' % w)
    return problems


def _poses(path):
    return isinstance(path, list) and all(isinstance(p, list) and len(p) >= 3 and all(_number(c) for c in p[:3]) for p in path)


def validate(sim, where):
    """[problem] of a test's "simulation" object: its world, its start, its "until" area and its checks"""
    if not isinstance(sim, dict) or not isinstance(sim.get('world'), dict):
        return ['%s: "simulation" needs a "world" object' % where]
    world = sim['world']
    problems = validate_world(world, where + '.world')
    if problems:
        return problems
    items = dict((i.get('id'), i) for i in world.get('items') or [] if isinstance(i, dict) and i.get('id'))

    def item_problem(key, item_id, roles, what):
        item = items.get(item_id)
        if item is None:
            return '%s: there is no item %r in the world' % (key, item_id)
        if item.get('kind') == 'line' or item.get('role') not in roles:
            return '%s: %r is not %s' % (key, item_id, what)
        return None

    if start_pose(world, sim.get('start')) is None:
        problems.append('%s.start: there is no start %r in the world (it has: %s)'
                        % (where, sim.get('start'), ', '.join(s.get('id') for s in world['starts'])))
    if sim.get('until') is not None:
        problem = item_problem(where + '.until', sim['until'], AREA_ROLES, 'an area')
        problem and problems.append(problem)
    checks = sim.get('checks', [])
    if not isinstance(checks, list):
        return problems + ['%s.checks must be a list' % where]
    for i, check in enumerate(checks):
        w = '%s.checks[%d]' % (where, i)
        kind = check.get('check') if isinstance(check, dict) else None
        if kind not in CHECKS:
            problems.append('%s: "check" must be one of %s' % (w, ', '.join(CHECKS)))
            continue
        item = check.get('item')
        if kind == 'ends_in' and item is None:
            problems.append('%s: "ends_in" needs the "item" the robot ends in' % w)
        elif item is not None and kind != 'path':
            problem = item_problem(w + '.item', item, ('obstacle',) if kind == 'never_bumps' else AREA_ROLES,
                                   'an obstacle' if kind == 'never_bumps' else 'an area')
            problem and problems.append(problem)
        if kind == 'path':
            if check.get('path') is not None and not _poses(check['path']):
                problems.append('%s.path must be a list of poses [x, y, heading]' % w)
            tolerance = check.get('tolerance_cm', DEFAULT_TOLERANCE_CM)
            if not _number(tolerance) or tolerance < 0:
                problems.append('%s.tolerance_cm must be a number >= 0' % w)
            if check.get('rule'):
                problems.append('%s: a recorded path belongs to one test: it can\'t be a rule' % w)
        if check.get('rule') not in (None, True, False):
            problems.append('%s.rule must be true or false' % w)
    return problems


def start_problems(world_data, start_id=None, checked=()):
    """what's wrong with where the robot starts: [(item id, message, severity)]. Outside the floor or on an obstacle: an
    error; on an area the test checks (`checked`: their ids; reaches, never touches, until), a warning."""
    world = SimWorld(world_data, floor={'w': 1, 'h': 1, 'sum': base64.b64encode(zlib.compress(b'\0\0')).decode()}, start=start_id)
    poly = outline(sim_pose(*world.start))
    problems = []
    x0, y0, x1, y1 = world.ground
    if any(p[0] < x0 or p[0] > x1 or p[1] < y0 or p[1] > y1 for p in poly):
        problems.append((None, 'the robot starts outside the floor: move the start onto the background', 'error'))
    hit = world.touching(poly, world.obstacles)
    if hit is not None:
        problems.append((hit.id, 'the robot starts on an obstacle: move the start or the obstacle', 'error'))
    names = dict((i.get('id'), item_name(world_data, i)) for i in world_data.get('items') or [])
    for shape in world.goals + world.fails + world.colors:
        if shape.id in checked and world.touching(poly, [shape]) is not None:
            problems.append((shape.id, 'the robot starts on "%s", which the test checks: move the start or the area'
                             % names.get(shape.id, shape.id), 'warning'))
    return problems


# ---------------------------------------------------------------------- running

def _s(ms):
    return ('%.1f' % (ms / 1000.0)).rstrip('0').rstrip('.')


def run_simulation_test(subject, test, record=False):
    """(report, coverage) of a simulation test. record=True: ignore the reference path (the run becomes the new one)."""
    from .spec import check_expectations  # spec imports this module
    from .world import World
    sim = test['simulation']
    world = SimWorld(sim['world'], sim.get('floor'), sim.get('start'))
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
    if kind == 'fail_area':
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
              'simulation': dict(outcome, path=robot.path, leds=leds, recorded=record, goals=len(world.goals), bumps=robot.bumps)}
    if is_call:
        report['returned'] = result._returned if error is None and robot.outcome is None else None
    else:
        report['status'] = 'error' if error is not None else 'simulation' if robot.outcome is not None else result.status
    return report, result.coverage
