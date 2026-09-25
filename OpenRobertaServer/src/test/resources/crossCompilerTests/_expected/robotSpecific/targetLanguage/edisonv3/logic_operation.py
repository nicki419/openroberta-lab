import Ed

def _obstacleDetection(mode):
    global obstacleDetectionOn
    if (obstacleDetectionOn == False):
        Ed.ObstacleDetectionBeam(Ed.ON)
        obstacleDetectionOn = True
    return Ed.ReadObstacleDetection() == mode

Ed.EdisonVersion = Ed.V2
Ed.DistanceUnits = Ed.CM
Ed.Tempo = Ed.TEMPO_SLOW
obstacleDetectionOn = False
Ed.LineTrackerLed(Ed.ON)
Ed.ReadClapSensor()
Ed.ReadLineState()
Ed.TimeWait(250, Ed.TIME_MILLISECONDS)

___numberVar = 3
___booleanVar = True

___booleanVar = ((___booleanVar) & (False))
___booleanVar = ((___numberVar < 5) | (___booleanVar))
___booleanVar = ((((((___booleanVar) & (___numberVar == 3))) | (not ___booleanVar))) & (True))
___booleanVar = not (((___booleanVar) | (___booleanVar)))
if (((Ed.ReadKeypad() == Ed.KEYPAD_TRIANGLE)) & (_obstacleDetection(Ed.OBSTACLE_AHEAD))):
    Ed.LeftLed(Ed.ON)
while ((___booleanVar) | (___numberVar > 10)):
    ___booleanVar = False
while True:
    if (((Ed.ReadClapSensor() == Ed.CLAP_DETECTED)) | ((Ed.ReadKeypad() == Ed.KEYPAD_ROUND))):
        break
    pass

