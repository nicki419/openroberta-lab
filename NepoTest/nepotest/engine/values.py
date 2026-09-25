"""EdPy constants, setup variables and function signatures.

The values are the ones of the reference compiler EdPy 1.2.11 (lib/edpy_values.py), dumped with that compiler. Register
numbers, module numbers and internal motor codes are left out, because generated programs never use them.
"""

INT_MIN = -32768
INT_MAX = 32767
LITERAL_MAX = 32767  # EdPy rejects literals (also folded ones) outside -32767 .. 32767, even -32768

CONSTANTS = {
    'BACKWARD': 2, 'BACKWARD_LEFT': 6, 'BACKWARD_RIGHT': 4, 'FORWARD': 1, 'FORWARD_LEFT': 5, 'FORWARD_RIGHT': 3,
    'SPIN_LEFT': 8, 'SPIN_RIGHT': 7, 'STOP': 0,
    'CLAP_DETECTED': 4, 'CLAP_DETECTED_BIT': 2, 'CLAP_MASK': 4, 'CLAP_NOT_DETECTED': 0,
    'CM': 0, 'INCH': 1, 'TIME': 2, 'TIME_MILLISECONDS': 1, 'TIME_SECONDS': 0,
    'DISTANCE_UNLIMITED': 0, 'DRIVE_NO_STRAIN': 0, 'DRIVE_STRAINED': 1,
    'EVENT_TIMER_FINISHED': 0, 'EVENT_REMOTE_CODE': 1, 'EVENT_IR_DATA': 2, 'EVENT_CLAP_DETECTED': 3, 'EVENT_OBSTACLE_ANY': 4,
    'EVENT_OBSTACLE_LEFT': 5, 'EVENT_OBSTACLE_RIGHT': 6, 'EVENT_OBSTACLE_AHEAD': 7, 'EVENT_DRIVE_STRAIN': 8,
    'EVENT_KEYPAD_TRIANGLE': 9, 'EVENT_KEYPAD_ROUND': 10, 'EVENT_LINE_TRACKER_ON_WHITE': 11, 'EVENT_LINE_TRACKER_ON_BLACK': 12,
    'EVENT_LINE_TRACKER_SURFACE_CHANGE': 13, 'EVENT_TUNE_FINISHED': 14, 'EVENT_LAST_EVENT': 14,
    'KEYPAD_MASK': 15, 'KEYPAD_NONE': 0, 'KEYPAD_ROUND': 4, 'KEYPAD_TRIANGLE': 1,
    'LINE_CHANGE_BIT': 1, 'LINE_CHANGE_MASK': 2, 'LINE_MASK': 1, 'LINE_ON_BLACK': 1, 'LINE_ON_WHITE': 0,
    'MOTOR_BACK_DIST_CODE': 96, 'MOTOR_FOR_DIST_CODE': 160, 'MOTOR_LEFT': 0, 'MOTOR_RIGHT': 1,
    'MUSIC_FINISHED': 1, 'MUSIC_NOT_FINISHED': 0,
    'NOTE_A_6': 18181, 'NOTE_A_SHARP_6': 17167, 'NOTE_B_SHARP_6': 17167, 'NOTE_B_6': 16202, 'NOTE_C_7': 15289,
    'NOTE_C_SHARP_7': 14433, 'NOTE_D_7': 13622, 'NOTE_D_SHARP_7': 12856, 'NOTE_E_7': 12135, 'NOTE_E_SHARP_7': 12135,
    'NOTE_F_7': 11457, 'NOTE_F_SHARP_7': 10814, 'NOTE_G_7': 10207, 'NOTE_G_SHARP_7': 9632, 'NOTE_A_7': 9090,
    'NOTE_A_SHARP_7': 8581, 'NOTE_B_SHARP_7': 8581, 'NOTE_B_7': 8099, 'NOTE_C_8': 7644, 'NOTE_REST': 0,
    'NOTE_SIXTEENTH': 125, 'NOTE_EIGHT': 250, 'NOTE_QUARTER': 500, 'NOTE_HALF': 1000, 'NOTE_WHOLE': 2000,
    'OBSTACLE_AHEAD': 16, 'OBSTACLE_DETECTED': 64, 'OBSTACLE_LEFT': 32, 'OBSTACLE_MASK': 120, 'OBSTACLE_NONE': 0,
    'OBSTACLE_OTHER_MASK': 7, 'OBSTACLE_RIGHT': 8,
    'OFF': 0, 'ON': 1, 'V1': 1, 'V2': 2,
    'REMOTE_CODE_0': 0, 'REMOTE_CODE_1': 1, 'REMOTE_CODE_2': 2, 'REMOTE_CODE_3': 3, 'REMOTE_CODE_4': 4,
    'REMOTE_CODE_5': 5, 'REMOTE_CODE_6': 6, 'REMOTE_CODE_7': 7, 'REMOTE_CODE_NONE': 255,
    'SPEED_FULL': 0, 'SPEED_1': 1, 'SPEED_2': 2, 'SPEED_3': 3, 'SPEED_4': 4, 'SPEED_5': 5, 'SPEED_6': 6, 'SPEED_7': 7,
    'SPEED_8': 8, 'SPEED_9': 9, 'SPEED_10': 10,
    'TEMPO_VERY_SLOW': 1000, 'TEMPO_SLOW': 500, 'TEMPO_MEDIUM': 250, 'TEMPO_FAST': 70, 'TEMPO_VERY_FAST': 1,
    'TUNE_ERROR': 1, 'TUNE_NO_ERROR': 0,
}

# the three setup variables: allowed values; each must be set exactly once, in main code, to a constant
SETUP_VARIABLES = {
    'EdisonVersion': (1, 2),
    'DistanceUnits': (0, 1, 2),
    'Tempo': (1000, 500, 250, 70, 1),
}

# Ed functions and their argument kinds (I = int, T = tune string, S = string constant, V = int list constant).
# Ed.List and Ed.TuneString take 1 or 2 arguments (List1/List2, TuneString1/TuneString2 in the compiler).
SIGNATURES = {
    'ChangeTempo': 'I', 'Drive': 'III', 'DriveLeftMotor': 'III', 'DriveRightMotor': 'III', 'LeftLed': 'I',
    'LineTrackerLed': 'I', 'ObstacleDetectionBeam': 'I', 'PlayBeep': '', 'PlayMyBeep': 'I', 'PlayTone': 'II',
    'PlayTune': 'T', 'ReadClapSensor': '', 'ReadCountDown': 'I', 'ReadDistance': 'I', 'ReadDriveLoad': '',
    'ReadIRData': '', 'ReadKeypad': '', 'ReadLeftLightLevel': '', 'ReadLineChange': '', 'ReadLineState': '',
    'ReadLineTracker': '', 'ReadMusicEnd': '', 'ReadObstacleDetection': '', 'ReadRandom': '', 'ReadRemote': '',
    'ReadRightLightLevel': '', 'ReadTuneError': '', 'RegisterEventHandler': 'IS', 'ResetDistance': '', 'RightLed': 'I',
    'SendIRData': 'I', 'SetDistance': 'II', 'StartCountDown': 'II', 'TimeWait': 'II',
    'SimpleDriveForward': '', 'SimpleDriveBackward': '', 'SimpleDriveForwardLeft': '', 'SimpleDriveForwardRight': '',
    'SimpleDriveBackwardLeft': '', 'SimpleDriveBackwardRight': '', 'SimpleDriveStop': '',
    'ReadModuleRegister8Bit': 'II', 'ReadModuleRegister16Bit': 'II', 'WriteModuleRegister8Bit': 'III',
    'WriteModuleRegister16Bit': 'III', 'SetModuleRegisterBit': 'III', 'ClearModuleRegisterBit': 'III',
    'AndModuleRegister8Bit': 'III',
    'List': None, 'TuneString': None,
}

# built-in functions of EdPy (range only as the iterable of a for loop)
BUILTINS = ('abs', 'len', 'ord', 'chr', 'range')

# tune string alphabet (token spec 6.6.2): note chars, duration chars (in quarter notes), rest and end marker
TUNE_NOTES = set('mMncCdDefFgGaAbBo')
TUNE_REST = 'r'
TUNE_END = 'z'
TUNE_DURATIONS = {'1': 4.0, '2': 2.0, '4': 1.0, '8': 0.5, '6': 0.25}
