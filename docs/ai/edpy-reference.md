# EdPy — language, `Ed` API, and compiler (reference for AI agents)

> **What this is:** a digest of **EdPy**, the Python-2 subset that the Edison robot runs and that OpenRoberta
> generates for `edisonv2`. Its source is <https://github.com/Bdanilko/EdPy>, the compiler that "takes a subset of
> python 2 and creates a wav file which can be downloaded to a Microbric Edison robot".
> **Source snapshot:** commit `7752b61` (2019-11-25), compiler **version 1.2.11**. Documents in that repo: language
> spec `doc/edpy-language.pdf` v1.1 (2015), firmware token spec `doc/ed-tokens.pdf` v1.9 (2018). The repo isn't
> vendored here. Clone it when needed (§2).
> **Status:** written 2026-09-25. Statements marked **verified** were checked by running the real EdPy compiler (1.2.11,
> check mode) on a local Python 3.6.8. The rest is read from the EdPy source and documents.
> **Licence:** EdPy is **GPL-2.0-or-later** (Microbric Pty Ltd). This repository is Apache-2.0. Don't copy EdPy code
> into this repo without a licence review. Running it as a separate tool is a different situation from vendoring or
> linking it.
> **Companion docs:** `edisonv2-nepo-to-edpy.md` (what the Lab generates), `nepo-custom-blocks.md`.

---

## 1. Where EdPy sits in the Lab

```
NEPO ─(Java, EdisonPythonVisitor)─▶ EdPy source ─(browser POST)─▶ api.edisonrobotics.net/ep/wav/{long|short} ─▶ WAV ─▶ Edison V2
                                                 └──────────── local, optional: EdPy.py -c (this doc, §2) ──────────▶ {"error": …, "messages": […]}
```

- The Lab never compiles EdPy itself (`EdisonCompilerWorker` only copies the source). The browser sends it to Edison's
  service.
- The EdPy README says this code is the service the EdPy web app uses. The Lab's endpoint is presumably backed by it,
  but **which version is deployed is unknown**.
- The service returns the compiler's messages in the same `ERR: file:<line>:<col>: …` format as the local tool. The
  Lab shows them raw in a popup, prefixed `Compiler Error:`.
- `edisonv3` uses a *different* service (`…/open_roberta/compile`, answering with "mpy-cross"), which isn't EdPy 1.2.11.
  This doc is about Edison V2.

---

## 2. Running the real EdPy compiler locally (verified)

EdPy must run on **Python 2.7** (used by the website) or **Python 3.6** (community-tested). It **fails on Python
3.14** (verified: it crashes in its AST handling). Python 3.8+ is likely broken too, because the Python AST changed
there (`ast.Num`/`ast.Str` became `ast.Constant`); that's inferred, not tested.

This recipe was verified on Windows with the **portable** python.org "embeddable" build. Nothing is installed
system-wide; everything lives in one folder:

```bash
WORK=<some scratch dir>
git clone --depth 1 https://github.com/Bdanilko/EdPy.git "$WORK/edpy"
curl -sSfL -o "$WORK/py368.zip" https://www.python.org/ftp/python/3.6.8/python-3.6.8-embed-amd64.zip
mkdir -p "$WORK/py36" && unzip -q "$WORK/py368.zip" -d "$WORK/py36"
# the embeddable build ignores the script dir; add EdPy's src folder to its path file (Windows-style absolute path)
(cd "$WORK/edpy/src" && pwd -W) >> "$WORK/py36/python36._pth"

cd "$WORK/edpy/src"
"$WORK/py36/python.exe" EdPy.py -c en_lang.json /path/to/program.py      # check only, no WAV
# → {"error": false, "messages": [], "wavFilename": null}
# → {"error": true, "messages": ["ERR: file:5:7: Syntax Error, constant 1.5 must be an integer value"], "wavFilename": null}
```

- On Linux or macOS, use `python2 EdPy.py …` or a Python 3.6 interpreter. On Windows, `python EdPy.py` goes to the
  launcher, which obeys the `#!/usr/bin/env python2` shebang and fails with "No runtime installed that matches 2".
- `en_lang.json` is an **empty** translation file. The English messages are in the code.
- Useful flags:
  - `-c` check only
  - `-o console|json|both|test` output format (default `json`)
  - `-l error|warn|…|debug` output level
  - `-d MASK` debug dumps (`0x01` after parse, `0x02` after optimiser, `0x04` after compiler, `0x08` assembly)
  - `-a FILE` save the assembly listing
  - `-w` no WAV
  - `-s` disable optimisations
- A few inputs crash the compiler instead of returning JSON. Verified example: `Ed.PlayTone(8000000/0, 500)` ends in
  a Python `TypeError` traceback, presumably from the division by zero during constant folding. Treat non-JSON output
  as "compiler error".
- **Internal errors also end in a traceback under Python 3.** When the output contains "internal error" (e.g.
  `Compiler internal error 700` for `and`), `EdPy.py` prints the program as a list and then crashes in its own logger
  (`"PRG {:s}".format(list)`, `TypeError: unsupported format string passed to list.__format__`). To see the JSON, run
  a scratch copy with `{:s}` changed to `{!s}` in that line. Don't patch the vendored/cloned original.

**What a local check proves:** that the program is accepted by *this* EdPy version (syntax, types, ranges, known `Ed`
functions, argument counts). **What it doesn't prove:** runtime behaviour on the robot, or acceptance by the deployed
service if its version differs. Also, constant folding depends on the Python version running the compiler (§4.3).

---

## 3. The language

EdPy is "a strict subset of python". Lexical rules (indentation, comments, line continuation) are Python 2.7's.

### 3.1 Data types and literals

| Type | Details |
|---|---|
| `int` | **signed 16-bit**. Literals accepted: **−32767 … 32767** (verified: `32767` ok; `32768` and `-32768` → `constant … is out of range`). Also `0x…` and `0b…` literals (positive only). `True`/`False` are 1/0. |
| list | **ints only, fixed maximum size**: `Ed.List(maxElements [, [initial ints]])`. `len(list)` returns the **maximum** size. No `.append` (verified: `Variable … does not refer to a class`). No range check when the index is a variable. |
| tune string | `Ed.TuneString(maxChars [, "notes…z"])`. The only place double-quoted strings are allowed. `len` returns the max length. `ord(ts[i])` / `ts[i] = chr(n)`. |
| strings, floats | **not supported**. Verified: `"abc"` → `String not allowed here`; `1.5` → `constant 1.5 must be an integer value`. |

- A **variable's type is fixed at its first assignment**. Verified: int then list → `Variable ___x changed it's type`.
- Assigning a list or tune string to another variable makes an **alias**, not a copy.
- Using a variable before it has a value → `Variable … doesn't have a value yet` (verified).

### 3.2 Operators

- Operators per the spec: `+x -x`, `+ - *`, `/ // %`, `| & ^ ~`, `<< >>`, comparisons, `and or not`.
- **`and`/`or` don't work in practice.** Verified: `if a and b:` → `Problem with variable temp-0 (unknown variable)`;
  `x = y and False` → `Compiler internal error 700`.
- **Bitwise `&`/`|` work as a replacement** (verified), because EdPy booleans are 0/1. The Lab's generator emits NEPO
  AND/OR as `((a) & (b))` / `((a) | (b))`. The full parentheses are required, because `&`/`|` bind tighter than
  comparisons (`a < 5 | b` would mean `a < (5 | b)`). Nested forms compile at 8 and 16 levels. Unlike `and`/`or`,
  **both operands are always evaluated**.
- **`**` isn't implemented.** The compiler source has `# IMPLEMENT POWER`, which is why the Lab uses a `_pow`
  helper.
- Division is covered in detail in §4.3.

### 3.3 Statements

| Construct | Status |
|---|---|
| `if / elif / else`, `while [/ else]`, `for x in range([start,] stop [,step])`, `for x in <list>`, `break`, `continue`, `pass` | supported |
| `def` | supported. **No nested functions.** No variable arguments (`*args`); the compiler checks that every call matches the definition. All `return`s must return an int or nothing. Ints are passed by value, lists and tune strings by reference. **Recursion compiles** (verified; robot stack depth unknown). |
| `global` | supported, and **must be the first statement** in a function (`globals must be first in functions`) |
| `class` | supported without inheritance; the first method argument must be `self`; all statements must be inside methods |
| `import` | **only `import Ed`**, and before any function or class (`only the Ed module can be imported`, verified) |
| `print`, `raise`, `try`, `lambda`, strings, … | not supported. Verified: `print(…)` → `Unknown function print`; `raise …` → `statement not valid here`. |
| empty suite | must be `pass`. A comment-only body is a **syntax error** (verified: `ERR: file:18:1: Syntax error`). |
| Python keywords as names | error (`… is a reserved name`) |
| `if __name__ != "Ed.Py":` | The spec suggests this guard, but **1.2.11 rejects it**: `String not allowed here` (verified). **EdPy programs have no way to guard top-level code.** |

**Built-in functions:** only `abs(int)`, `len(list|tunestring)` (the maximum size), `ord(char)`, and `chr(int)`. There's
no `sum`, `min`, `max`, `range` beyond `for`, `int`, `str`, or `print`. Verified: a `sum(…)` call without a
definition → `Unknown function sum`. User functions may reuse these names; defining `def min(list):` is accepted
(verified).

**Events:** `Ed.RegisterEventHandler(Ed.EVENT_…, "functionName")` registers an interrupt-style handler. Only one runs
at a time. OpenRoberta doesn't generate events.

### 3.4 The three setup variables

`Ed.EdisonVersion`, `Ed.DistanceUnits`, and `Ed.Tempo` **must be set exactly once, in main code, to a constant**:
- `… can only be set in __main__`
- `… can only be set once`
- `… was not set in __main__`
- `… can only be set to an integer constant`
- `set … to an invalid value`

| Variable | Allowed values |
|---|---|
| `Ed.EdisonVersion` | `Ed.V1` (1), `Ed.V2` (2) — there's **no V3 value** in EdPy 1.2.11 |
| `Ed.DistanceUnits` | `Ed.CM` (0), `Ed.INCH` (1), `Ed.TIME` (2) |
| `Ed.Tempo` | `Ed.TEMPO_VERY_SLOW` (1000), `Ed.TEMPO_SLOW` (500), `Ed.TEMPO_MEDIUM` (250), `Ed.TEMPO_FAST` (70), `Ed.TEMPO_VERY_FAST` (1) |

`Ed.V1` doesn't have `Ed.ResetDistance`, `Ed.SetDistance`, `Ed.ReadDistance` (`… is not available in Edison Version 1`).

---

## 4. Numbers: the details that matter for a mock

### 4.1 Integer range

- The firmware stores 16-bit values as signed two's complement, **−32768 … +32767**. 8-bit variables are unsigned
  (0–255).
- Literals are checked at compile time (±32767, §3.1).
- **Runtime overflow isn't specified** by the token spec. Wrap-around is plausible, but it's unverified.

### 4.2 Compile-time constant folding

The optimiser folds constant expressions **before** the range check. So an out-of-range literal is fine if the folded
result fits. Verified:

| Source | Result |
|---|---|
| `Ed.PlayTone(8000000/440, 500)` | accepted (folds to 18181) |
| `___f = 440` then `Ed.PlayTone(8000000/___f, 500)` | `constant 8000000 is out of range` |
| `Ed.PlayTone(8000000/245, 500)` | accepted (32653) |
| `Ed.PlayTone(8000000/244, 500)` | `constant 32786 is out of range` |

### 4.3 Division

- The spec says "both `/` and `//` return the nearest whole number less than the float result", i.e. **floor
  division**. Python 2 `/` on ints behaves that way too.
- **Constant folding depends on the host Python version** (verified in `optimiser.py`, `value /= right` then
  `int(value)`):
  - Python 2.7 (the website) folds `-7 / 2` → **-4**, i.e. floor.
  - Python 3.6 (the verified local setup) folds it to **-3**, because it truncates `-3.5`.
  - `%` folds Python-style under both versions (`-7 % 2` → **1**).
- **Runtime division** of variables compiles to the firmware's `divw`. The token spec doesn't say how it rounds
  negative results. **Open question.**
- Practical rules:
  - For non-negative operands, all variants agree.
  - For negative operands, a mock must pick a model and document it. Python `//` gives floor semantics, matching the
    spec and Python 2.
  - Don't use a Python 3-hosted local compile to *measure* folding results.

### 4.4 Units in the `Ed` implementations

These come from `lib/edpy_code.py`, where most `Ed` functions are written in EdPy on top of module registers:

| Function | Conversion |
|---|---|
| `TimeWait(t, TIME_MILLISECONDS)`, `StartCountDown` | `t/10` → hundredths of a second, so **10 ms resolution** (`TIME_SECONDS`: `t*100`) |
| `ReadCountDown(units)` | hundredths × 10 (ms) or / 100 (s) |
| `PlayTone(freqCode, durationMs)` | duration `/10` → hundredths |
| `ReadDistance_CM` | raw distance `/8` |

---

## 5. The `Ed` API (EdPy 1.2.11, spec version 1.4)

All signatures come from `lib/edpy_values.py`. Argument types: `I` = int, `T` = tune string, `L` = list, `S` = string
constant, `V` = int list constant. The **semantics** come from `lib/edpy_code.py` and the token spec.

### 5.1 Functions

| Function | Args | Semantics / notes |
|---|---|---|
| `Ed.LeftLed(state)`, `Ed.RightLed(state)` | I | `state & 1` → LED output register |
| `Ed.LineTrackerLed(state)` | I | line-tracker illumination on/off |
| `Ed.ObstacleDetectionBeam(state)` | I | IR obstacle beam on/off |
| `Ed.SendIRData(byte)` | I | send one IR byte |
| `Ed.TimeWait(time, units)` | I, I | pauses execution (pause timer), 10 ms resolution |
| `Ed.StartCountDown(time, units)` / `Ed.ReadCountDown(units)` | I, I / I | non-blocking one-shot timer |
| `Ed.PlayBeep()` | – | fixed beep |
| `Ed.PlayMyBeep(freqCode)` | I | beep at `freqCode` (see §6), **fixed 50 ms** |
| `Ed.PlayTone(freqCode, durationMs)` | I, I | tone; **doesn't block**. `Ed.ReadMusicEnd()` reports when it's done. |
| `Ed.PlayTune(tune)` | T | play a tune string at `Ed.Tempo` / `Ed.ChangeTempo(t)` |
| `Ed.Drive(direction, speed, distance)` | I, I, I | both wheels. `direction` ∈ FORWARD, BACKWARD, FORWARD_RIGHT, BACKWARD_RIGHT, FORWARD_LEFT, BACKWARD_LEFT, SPIN_RIGHT, SPIN_LEFT, STOP. `speed` ∈ SPEED_1 … SPEED_10, or SPEED_FULL (= **0**). `distance` in `Ed.DistanceUnits` (degrees for turns/spins), or `DISTANCE_UNLIMITED` (0). A limited distance **blocks until done**. |
| `Ed.DriveLeftMotor(…)`, `Ed.DriveRightMotor(…)` | I, I, I | one wheel, same conventions |
| `Ed.SetDistance(which, d)`, `Ed.ResetDistance()`, `Ed.ReadDistance(which)` | – | distance counters (V2 only) |
| `Ed.ReadObstacleDetection()` | – | **read and clear.** Returns `OBSTACLE_AHEAD` (0x10) if ahead, else `status & 0x38` (LEFT 0x20 / RIGHT 0x08), else `OBSTACLE_NONE` (0) |
| `Ed.ReadKeypad()` | – | **read and clear.** `KEYPAD_TRIANGLE` (0x01), `KEYPAD_ROUND` (0x04), `KEYPAD_NONE` (0) |
| `Ed.ReadClapSensor()` | – | **read and clear.** `CLAP_DETECTED` (0x04) or `CLAP_NOT_DETECTED` (0) |
| `Ed.ReadLineState()` | – | current state, **not** cleared: `LINE_ON_BLACK` (1) / `LINE_ON_WHITE` (0) |
| `Ed.ReadLineChange()` | – | read and clear: 1 if the surface changed |
| `Ed.ReadRemote()` | – | **read and clear.** Remote code 0–7, or `REMOTE_CODE_NONE` (255) |
| `Ed.ReadIRData()` | – | **read and clear.** Last received IR byte (0 if none) |
| `Ed.ReadLeftLightLevel()`, `Ed.ReadRightLightLevel()`, `Ed.ReadLineTracker()` | – | raw 16-bit light level (range not specified in the sources) |
| `Ed.ReadMusicEnd()` | – | `MUSIC_FINISHED` (1) once a tone or tune has finished (clears that flag), else `MUSIC_NOT_FINISHED` (0) |
| `Ed.ReadTuneError()`, `Ed.ReadDriveLoad()` | – | tune-string error flag; motor strain (`DRIVE_STRAINED` 1) |
| `Ed.ReadRandom()` | – | random byte |
| `Ed.List(n [, [..]])`, `Ed.TuneString(n [, "…"])` | I [, V/S] | fixed-size containers (§3.1) |
| `Ed.RegisterEventHandler(event, "fn")` | I, S | event handlers (§3.3) |
| `Ed.ReadModuleRegister8/16Bit`, `Ed.WriteModuleRegister8/16Bit`, `Ed.Set/ClearModuleRegisterBit`, … | – | low-level register access |
| `abs`, `len`, `ord`, `chr` | – | the only built-ins |

An unknown `Ed` function → `Unknown Ed function Ed.X` (verified). A wrong argument count or type →
`incorrect arguments used in X call`.

### 5.2 Constants (values)

| Group | Constants |
|---|---|
| Basic | `ON` 1, `OFF` 0, `V1` 1, `V2` 2 |
| Directions | `STOP` 0, `FORWARD` 1, `BACKWARD` 2, `FORWARD_RIGHT` 3, `BACKWARD_RIGHT` 4, `FORWARD_LEFT` 5, `BACKWARD_LEFT` 6, `SPIN_RIGHT` 7, `SPIN_LEFT` 8 |
| Speed / distance | `SPEED_FULL` 0, `SPEED_1` … `SPEED_10` = 1 … 10, `DISTANCE_UNLIMITED` 0, `MOTOR_LEFT` 0, `MOTOR_RIGHT` 1 |
| Units | `CM` 0, `INCH` 1, `TIME` 2; `TIME_SECONDS` 0, `TIME_MILLISECONDS` 1 |
| Obstacle | `OBSTACLE_NONE` 0x00, `OBSTACLE_DETECTED` 0x40, `OBSTACLE_LEFT` 0x20, `OBSTACLE_AHEAD` 0x10, `OBSTACLE_RIGHT` 0x08 |
| Line | `LINE_ON_BLACK` 1, `LINE_ON_WHITE` 0 |
| Keypad | `KEYPAD_NONE` 0, `KEYPAD_TRIANGLE` 1, `KEYPAD_ROUND` 4 |
| Clap / music / drive | `CLAP_NOT_DETECTED` 0, `CLAP_DETECTED` 4; `MUSIC_FINISHED` 1, `MUSIC_NOT_FINISHED` 0; `TUNE_ERROR` 1; `DRIVE_STRAINED` 1 |
| Remote | `REMOTE_CODE_0` … `_7` = 0 … 7, `REMOTE_CODE_NONE` 255 |
| Tempo | `TEMPO_VERY_SLOW` 1000, `TEMPO_SLOW` 500, `TEMPO_MEDIUM` 250, `TEMPO_FAST` 70, `TEMPO_VERY_FAST` 1 |
| Notes (freq codes) | `NOTE_A_6` 18181 (1760 Hz) … `NOTE_C_8` 7644 (4186 Hz), `NOTE_REST` 0. Durations: `NOTE_SIXTEENTH` 125, `NOTE_EIGHT` 250, `NOTE_QUARTER` 500, `NOTE_HALF` 1000, `NOTE_WHOLE` 2000 (ms) |
| Events | `EVENT_TIMER_FINISHED` 0, `EVENT_REMOTE_CODE` 1, `EVENT_IR_DATA` 2, `EVENT_CLAP_DETECTED` 3, `EVENT_OBSTACLE_ANY` 4, `_LEFT` 5, `_RIGHT` 6, `_AHEAD` 7, `EVENT_DRIVE_STRAIN` 8, `EVENT_KEYPAD_TRIANGLE` 9, `_ROUND` 10, `EVENT_LINE_TRACKER_ON_WHITE` 11, `_ON_BLACK` 12, `_SURFACE_CHANGE` 13, `EVENT_TUNE_FINISHED` 14 |

Writing to a constant → `Ed.Py constant … can not be written`.

---

## 6. Firmware facts (token spec v1.9)

- **Beeper tone frequency code:** `f = 32,000,000 / DesiredFreq`, valid for **1000 Hz ≤ DesiredFreq ≤ 5000 Hz**. The
  duration is in 10 ms units (0–32767).
- **Memory:** 8-bit variables are unsigned, 16-bit variables are signed (big-endian). The stack size is chosen by the
  firmware, depending on the variables used.
- **Runtime errors the firmware can raise:** `OutOfRange` (e.g. shift counts), `SizeMismatch` (8- vs 16-bit operands).
- Tune strings are decoded by the firmware; an invalid character stops playback.

---

## 7. What this means for OpenRoberta's generated EdPy (verified with the real compiler)

| Finding | Evidence |
|---|---|
| **All six Edison golden programs** (`action`, `control_logic`, `logic_operation`, `math_lists`, `sensors`, `text_messages_functions`) **pass EdPy 1.2.11** | `-c` → `{"error": false}` for each |
| **Assert, debug and serial-print blocks can never compile.** They generate `print(...)`. | `Unknown function print` |
| **AND/OR** compile since the generator emits `((a) & (b))` / `((a) \| (b))`. They used to be emitted as `and`/`or`, which fails. | `{"error": false}` for `logic_operation.py`; the same file with `and` → `Compiler internal error 700` |
| **"Average" without "sum"** fails on the robot, while CPython runs it with the builtin `sum` | `Unknown function sum` |
| **A comment-only `if`/loop body** fails | `Syntax error` |
| **Tone blocks with a frequency ≤ 244 Hz** fail, although the Lab's validator accepts them. The cut-off for the note block's `4000000/f` is 123 Hz; the note picker starts at C4 (261.6 Hz). | `constant 32786 is out of range` |
| **Tone frequency 0** crashes the EdPy compiler (division by zero in folding) | non-JSON `TypeError` output |
| **Why the Lab requires literal tone frequencies** (`NO_CONST_NOT_SUPPORTED`): `8000000` only fits after folding with a literal | `constant 8000000 is out of range` with a variable |
| **Pitch shift:** the Lab emits `8000000/f` (tone) and `4000000/f` (note), but the firmware code is `32e6/Hz`. A NEPO tone of f Hz sounds at **4·f**, a note at **8·f**. That's apparently deliberate, moving NEPO's C4 → C7 into the buzzer's 1–5 kHz range, and it limits useful tone frequencies to about 250–1250 Hz. | token spec §6.6.2, `edpy_values.py` note constants |
| `Ed.EdisonVersion = Ed.V2` for `edisonv3` too: EdPy 1.2.11 only knows V1/V2 | `edpy_values.variables` |
| No `if __name__` guard is possible, which matches the Lab's top-level-statement design | `String not allowed here` |
| Division without parentheses (`(a+b)/(c+d)` → `a + b / c + d`) **compiles**. It's a semantic bug only a runtime test can catch. | `-c` → no error |
| `Ed.PlayMyBeep(200)` compiles (used by the example block in `nepo-custom-blocks.md`). Its argument is a **frequency code** (`32e6/Hz`), not Hz. `200` is outside the buzzer's documented range. | `-c` → no error; token spec |

---

## 8. Building a mock `Ed` runtime: a checklist from the sources

1. **Constants:** use the exact values from §5.2. Program logic compares against them, e.g.
   `Ed.ReadKeypad() == Ed.KEYPAD_ROUND` means `== 4`.
2. **Latched event sensors:** `ReadClapSensor`, `ReadKeypad`, `ReadObstacleDetection`, `ReadRemote`, `ReadIRData`,
   `ReadLineChange`, and `ReadMusicEnd` **return the pending event and clear it**. `ReadLineState` and the light
   levels are plain state. The Lab's generated code relies on this: it emits bare `Ed.ReadClapSensor()` calls to
   discard claps caused by the robot's own noise.
3. **Time:** `TimeWait` and `Drive` with a limited distance **block**, while `PlayTone`/`PlayTune` **don't**.
   Programs poll `ReadMusicEnd()` in busy loops. Use a virtual clock with 10 ms resolution, and make
   polling reads advance it, or bound the loop iterations.
4. **Driving:** `SPEED_FULL == 0`, so `speed 0` means *full speed*, not stop. The Lab's helpers special-case 0 → STOP.
   Distance is in cm (`Ed.DistanceUnits = Ed.CM`), and degrees for spins.
5. **Integers:** wrap or check at 16 bits, use floor division (§4.3), and reject floats and strings. Booleans are
   0/1: generated AND/OR is `&`/`|` on booleans, which CPython also evaluates eagerly, like the robot.
6. **Lists:** fixed size; `len()` is the max size.
7. **Top level:** the program runs on load (no `main`). Execute it in a controlled sandbox, and don't `import` it.
8. **Before running a test, run `EdPy.py -c`** to reject programs the robot would never accept. CPython is more
   permissive (e.g. builtin `sum`, `print`).

---

## 9. Error message catalogue (EdPy 1.2.11)

All messages have the form `ERR: file:<line>:<col>: <text>`. The line or column may be empty or 0. The 45 templates
in the source (`{n}` = placeholder) include:

- **Syntax / structure:**
  - `Syntax error`
  - `statement not valid here`
  - `statement must be inside a loop`
  - `globals must be first in functions`
  - `imports must be before functions and classes`
  - `only the Ed module can be imported`
  - `{} only allowed at the top level`
  - `{} not supported in Ed.py`
  - `{} code too complex for Ed.Py`
  - `two {} with the same name`
  - `base classes are not allowed in Ed.Py`
  - `first method arg must be 'self'`
  - `in classes all statements must be in methods`
- **Types and values:**
  - `constant {} must be an integer value`
  - `constant {} is out of range`
  - `String not allowed here`
  - `List not allowed here`
  - `Variable {} changed it's type`
  - `Variable {} doesn't have a value yet`
  - `Variable {} is not an integer value`
  - `Variable {} can't be sliced`
  - `variable {} not a tunestring or list`
  - `{} initial value larger then first argument {}`
  - `Warning, TuneString doesn't end with 'z'`
- **Names and functions:**
  - `Unknown function {}`
  - `Unknown Ed function {}`
  - `Ed function {} not known. Are you missing 'import Ed'?`
  - `incorrect arguments used in {} call`
  - `in function {} argument definition doesn't match callers use`
  - `all returns in a function must return a value or return nothing`
  - `Variable {} hides a global variable`
  - `{} is not a global variable`
  - `{} is a reserved name`
  - `Variable {} does not refer to a class`
  - `no assignable variable`
- **Ed settings:**
  - `{} can only be set in __main__`
  - `{} can only be set once. It was already set.`
  - `{} was not set in __main__`
  - `{} can only be set to an integer constant`
  - `set {} to an invalid value`
  - `{} is not useful with setting {}`
  - `{} is not available in Edison Version {}`
  - `Ed.Py constant {} can not be written`
  - `event not a constant or out of range`

To list them all from the source, run `grep -ho '"file:{[0-9]}:[^"]*"' src/lib/*.py | sort -u`.

---

## 10. Map of the EdPy source (for deeper questions)

| File | Contents |
|---|---|
| `src/EdPy.py` | CLI entry point: parse → optimise → compile → assemble → WAV |
| `src/lib/parser.py` | Python `ast.parse` → internal IR. It's version-sensitive, which is why only Python 2.7/3.6 work. |
| `src/lib/optimiser.py` | constant folding (`BAssignWithConstants`), inlining, many type and range errors |
| `src/lib/compiler.py` | IR → token assembler (e.g. `divw` for division; `**` unimplemented) |
| `src/lib/edpy_values.py` | **`Ed` function signatures, constants, setup variables, V1/V2 availability** |
| `src/lib/edpy_code.py` | **EdPy implementations of the `Ed` functions** (semantics, units, read-and-clear) |
| `src/lib/token_assembler.py`, `tokens.py`, `audio.py` | bytecode and WAV encoding |
| `doc/edpy-language.pdf` | language spec v1.1 (some parts are superseded by the implementation, e.g. the `__name__` guard) |
| `doc/ed-tokens.pdf` | firmware token and register spec v1.9 (beeper frequency formula, memory model) |
