"""The learner's sentence for each level function: a precise one and a vague one (written before measuring, 2026-11-07). In the study the
learner writes it; here it says what the function's level asks of the whole program."""

SENTENCES = {
    'followLine': {
        'precise': 'Follow the black line from the start all the way to the green goal at its end, also through the curves, without leaving it.',
        'vague': 'Follow the line.',
    },
    'stopAtWall': {
        'precise': 'Follow the black line, and when a wall is right in front of the robot, stop before it without touching it and stay there.',
        'vague': 'Stop at the wall.',
    },
    'driveInTheDark': {
        'precise': 'Follow the black line; inside a dark tunnel, where there is no line, drive straight through without touching its walls, '
                   'and follow the line again after the tunnel.',
        'vague': 'Get through the tunnel.',
    },
    'avoidWalls': {
        'precise': 'Inside a dark tunnel, steer away from its walls: when a wall is close on the left, turn right, and when one is close on the '
                   'right, turn left, so the robot gets through a bending tunnel without touching it.',
        'vague': "Don't hit the tunnel walls.",
    },
    'followInTheDark': {
        'precise': 'In the dark, follow a black line when there is one under the robot, and drive straight where there is none; in the light, '
                   'follow the line as before.',
        'vague': 'Follow the line in the dark too.',
    },
}
