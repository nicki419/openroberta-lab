import Ed

def _diffDrive(direction, speed, distance):
    _reverse = False
    if speed < 0:
        _reverse = True
        _speed = _shorten(-speed)
    else: 
        _speed = _shorten(speed)
    if (_speed == 0): 
        Ed.Drive(Ed.STOP, 1, 1)
    else: 
        Ed.Drive(_getDirection(direction, _reverse), _speed, distance)

def _getDirection(dir, reverse):
    if reverse:
        if (dir == Ed.FORWARD): 
            return Ed.BACKWARD
        else: 
            return Ed.FORWARD
    else: 
        return dir

def _shorten(num): 
    return ((num+5)/10)

Ed.EdisonVersion = Ed.V2
Ed.DistanceUnits = Ed.CM
Ed.Tempo = Ed.TEMPO_SLOW
obstacleDetectionOn = False
Ed.LineTrackerLed(Ed.ON)
Ed.ReadClapSensor()
Ed.ReadLineState()
Ed.TimeWait(250, Ed.TIME_MILLISECONDS)

___claps = 0
___goal = 3

def ____clampSpeed(___speed):
    global ___claps, ___goal
    if ___speed > 100: return 100
    if ___speed < 0: return 0
    return ___speed

def ____average(___a, ___b):
    global ___claps, ___goal
    return ___a + ___b / 2

def ____blink(___times):
    global ___claps, ___goal
    for ___k0 in range(___times):
        Ed.LeftLed(Ed.ON)
        Ed.TimeWait(200, Ed.TIME_MILLISECONDS)
        Ed.LeftLed(Ed.OFF)
        Ed.TimeWait(200, Ed.TIME_MILLISECONDS)


while ___claps < ___goal:
    while True:
        if (Ed.ReadClapSensor() == Ed.CLAP_DETECTED):
            break
        pass
    ___claps += 1
____blink(___claps)
_diffDrive(Ed.FORWARD, ____clampSpeed(150), 10)
Ed.ReadClapSensor()

