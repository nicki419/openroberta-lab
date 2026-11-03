# Example 2: nothing new to test

## The call (infer)

### The program

NEPO: (left out in this example: drive and turn blocks, as in the EdPy)

EdPy:
```python
_diffDrive(Ed.FORWARD, 50, 50)
Ed.ReadClapSensor()
_diffTurn(Ed.SPIN_LEFT, 30, 90)
Ed.ReadClapSensor()
_diffDrive(Ed.FORWARD, 50, 45)
Ed.ReadClapSensor()
_diffTurn(Ed.SPIN_RIGHT, 30, 90)
Ed.ReadClapSensor()
_diffDrive(Ed.FORWARD, 50, 70)
Ed.ReadClapSensor()
_diffTurn(Ed.SPIN_RIGHT, 30, 90)
Ed.ReadClapSensor()
_diffDrive(Ed.FORWARD, 50, 45)
Ed.ReadClapSensor()
_diffTurn(Ed.SPIN_LEFT, 30, 90)
Ed.ReadClapSensor()
_diffDrive(Ed.FORWARD, 50, 50)
Ed.ReadClapSensor()
```

### The learner's tests

```json
{"worlds":[{"name":"Around the block","world":{"background":"peach","starts":[{"id":"A","name":"A","x":40,"y":100,"heading":0}],"items":[{"id":"f1","kind":"rect","role":"fail","x":110,"y":70,"w":20,"h":60},{"id":"g1","kind":"rect","role":"goal","name":"Goal 1","x":200,"y":80,"w":40,"h":40}]},"tests":[{"name":"Gets around the red block","start":"A","until":"g1","max_time_ms":30000,"world":[],"globals":{},"checks":[{"check":"never_touches"},{"check":"reaches","item":"g1"}]}]}]}
```

### What the learner said before

- "It drives around the red block to the green area."

### Task: infer

The guess the learner declined: "Drive around something in the way and on to a goal."

## The answer (infer)

The program drives a fixed path around something in its way. The learner said what for, and their own test already
checks it: it gets around their red block into their goal area. A test of the same path from another start would
fail for a program that does what they said. The intent means the same as the declined one.

```json
{"intent":"Drive around the red block and on to the green area.","confidence":0.85,"ask":false,"same_as_declined":true,"not_covered":null}
```
