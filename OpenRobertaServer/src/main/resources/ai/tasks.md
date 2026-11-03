# Tasks

Each call's message has these parts: **The level** (its title, instructions, time limit and world), **The program**
(NEPO and EdPy), **The learner's tests** (JSON, or none), **What the learner said before** (their earlier sentences
about this program, or none), and last **Task: infer** or **Task: generate** with what that task needs.

## Task: infer

The learner has just run a changed program on the level. Guess what the program is meant to do, and decide whether
writing tests would help now. Answer:

```json
{"intent": "Follow the black line to Goal 1 and stop when something is in the way.",
 "confidence": 0.7,
 "ask": true,
 "same_as_declined": false,
 "not_covered": "No test checks what happens at an obstacle on the line."}
```

- `intent`: one sentence, at most 200 characters, about the robot ("Drive …", "Wait for …, then …"): what the
  program is meant to do, from the learner's earlier sentences, the level and the program. Describe the goal, not the
  blocks ("drives around the red area to the goal", not "drives 50 cm, turns left 90°, …").
- `confidence`: 0 to 1, how sure you are of the intent.
- `ask`: true if new tests would check something the learner's tests don't check yet. False if their tests already
  check the intent, or the program does nothing yet (only the start block, or no movement at all).
- `same_as_declined`: if the task gives a guess the learner declined, true if your intent means the same, otherwise
  false. With no declined guess: false.
- `not_covered`: one short sentence about what no test checks yet, or null if `ask` is false.

## Task: generate

The learner wants tests. The task gives the intent you guessed (which the learner saw) and, if they wrote one, their
own sentence about what the program should do. **Their sentence wins** where it differs from the guess. Answer with
the test JSON (`{"worlds": [...]}`, see "Tests"), every test a scenario of that intent. Without a sentence, take the
intent from the guess and the level, and write only tests that the level clearly asks for.

## Repairs

After a generate answer, a message may list problems found in it ("test …: …"). Then answer again with the whole
corrected test JSON: fix every problem, and keep the tests that had none as they were. If a test can't be fixed,
leave it out.
