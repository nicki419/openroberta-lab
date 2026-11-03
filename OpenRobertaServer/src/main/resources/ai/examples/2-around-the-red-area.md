# Example 2: nothing new to test

## The call (infer)

### The level

Title: Around the red area
Instructions: The robot must not touch the red area. Drive around it to the green area.
Time limit: none
World:
```json
{"background":"peach","starts":[{"id":"A","name":"A","x":40,"y":100,"heading":0}],"items":[{"id":"f1","kind":"rect","role":"fail","x":110,"y":70,"w":20,"h":60},{"id":"g1","kind":"rect","role":"goal","name":"Goal 1","x":200,"y":80,"w":40,"h":40}]}
```

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
{"worlds":[{"name":"Around the red area","world":{"background":"peach","starts":[{"id":"A","name":"A","x":40,"y":100,"heading":0}],"items":[{"id":"f1","kind":"rect","role":"fail","x":110,"y":70,"w":20,"h":60},{"id":"g1","kind":"rect","role":"goal","name":"Goal 1","x":200,"y":80,"w":40,"h":40}]},"tests":[{"name":"Gets around the red area","start":"A","until":"g1","max_time_ms":30000,"world":[],"globals":{},"checks":[{"check":"never_touches"},{"check":"reaches","item":"g1"}]}]}]}
```

### What the learner said before

Nothing yet.

### Task: infer

The guess the learner declined: "Drive around the red area to Goal 1."

## The answer (infer)

The program drives a fixed path around the red area: the level asks for no more, and the learner's test already
checks it, from the only start the level has. A test from another start would fail for a program that does what the
level asks. The intent is the declined one.

```json
{"intent":"Drive around the red area to Goal 1.","confidence":0.9,"ask":false,"same_as_declined":true,"not_covered":null}
```
