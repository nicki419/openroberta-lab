# Tasks

Each call's message has these parts: **The program** (NEPO and EdPy), **The learner's tests** (JSON, or none), **What
the learner said before** (their earlier sentences about this program, or none), and last **Task: infer**, **Task:
generate** or **Task: fix** with what that task needs. You are not told what task the learner is working on.

## Task: infer

The learner has just run a changed program. Guess what the program is meant to do, and decide whether writing tests
would help now. Answer:

```json
{"intent": "Follow the black line and stop when something is in the way.",
 "confidence": 0.7,
 "ask": true,
 "same_as_declined": false,
 "not_covered": "No test checks what happens at an obstacle on the line."}
```

- `intent`: one sentence, at most 200 characters, about the robot ("Drive …", "Wait for …, then …"): what the
  program is meant to do, from the learner's earlier sentences and the program. Describe the behaviour, not the blocks
  ("drives around something in its way", not "drives 50 cm, turns left 90°, …").
- `confidence`: 0 to 1, how sure you are of the intent.
- `ask`: true if new tests would check something the learner's tests don't check yet. False if their tests already
  check the intent, or the program does nothing yet (only the start block, or no movement at all).
- `same_as_declined`: if the task gives a guess the learner declined, true if your intent means the same, otherwise
  false. With no declined guess: false.
- `not_covered`: one short sentence about what no test checks yet, or null if `ask` is false.

## Task: generate

The learner wants tests. The task gives the intent you guessed (which the learner saw) and, if they wrote one, their
own sentence about what the program should do. **Their sentence wins** where it differs from the guess. Answer with
the test JSON (`{"worlds": [...]}`, see "Tests"), every test a scenario of that intent, in worlds you draw for it.
Without a sentence, take the intent from the guess, and write only tests that the guess clearly asks for.

## Repairs

After a generate answer, a message may list problems found in it ("test …: …"). Then answer again with the whole
corrected test JSON: fix every problem, and keep the tests that had none as they were. If a test can't be fixed,
leave it out.

## Task: fix

The learner chose tests from your generate answer, and each of them ran on the learner's program in the simulator.
The task gives the intent and the learner's sentence again, the tests that failed (as you wrote them, each world in
full), how each of them ran, and the names of the tests that passed. The learner asked you to fix the failed ones.

How a test ran: why the run ended and when, where the robot started and ended, where it was every few seconds, and
each check: passed, failed or not checked, with what happened. A failed check of what the robot does may say why
("why (wrong action): …", with the program's blocks in brackets) and what happened in the second before it: what the
program read from the sensors ("sensed"), its decisions and actions ("ran"), its variables ("remembered") and what
the robot did ("did").

A test fails for one of two reasons. Decide which, for each failed test:

- **The test is wrong**: its world, start, set-up or timing don't make its scenario happen, or it checks more than the
  intent asks for. For example: the start isn't on the line, the goal area doesn't cover the line's end,
  `max_time_ms` is too short for the program's speed, a thing is in the robot's way that the scenario doesn't mean, a
  check names the wrong item, or a check wants a way of driving the learner didn't ask for. Then fix the test: change
  what is wrong, and keep its scenario.
- **The program is wrong**: the test makes its scenario happen, and the program doesn't do what the learner's
  sentence says (without a sentence: what the intent says). Then don't change the test: a test changed until a wrong
  program passes it hides the mistake. Put it into `program_wrong`.

Answer:

```json
{"worlds": [{"name": "A line to a goal", "base": "existing",
             "tests": [{"name": "On the line, it follows it to the goal", "...": "the fixed test, all its fields"}]}],
 "program_wrong": [{"test": "Stops before the box on the line", "world": "A box on the line",
                    "reason": "The robot drives into the box: your program never reads the obstacle sensor, and you said it should stop at obstacles."}]}
```

- `worlds`: the fixed tests, in the test JSON, with the names they had. The worlds of your generate answer now count
  as the learner's: to keep a test in its world, write `"base": "existing"` with the world's name. If the world itself
  must change, draw it anew under another name. Don't repeat the tests that passed, and don't add new tests.
- `program_wrong`: the tests you leave as they are because the program is wrong. `test` and `world`: their names;
  `reason`: one or two sentences for the learner, at most 300 characters: what the robot does, and what it should do.
- Every failed test is either fixed or in `program_wrong`; leave out one you can't fix. `worlds` or `program_wrong`
  may be empty, but not both.
- Repairs work as for generate: answer again with the whole corrected answer, `program_wrong` included.
