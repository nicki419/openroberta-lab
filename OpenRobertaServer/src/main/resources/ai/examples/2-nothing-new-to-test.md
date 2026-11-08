# Example 2: nothing new to test

## The call (analyze)

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

### The program's decisions

None: the program has no if, no wait until and no repeat while or until.

### The learner's tests

```json
{"worlds":[{"name":"Around the block","world":{"background":"peach","starts":[{"id":"A","name":"A","x":40,"y":100,"heading":0}],"items":[{"id":"f1","kind":"rect","role":"fail","x":110,"y":70,"w":20,"h":60},{"id":"g1","kind":"rect","role":"goal","name":"Goal 1","x":200,"y":80,"w":40,"h":40}]},"tests":[{"name":"Gets around the red block","start":"A","until":"g1","max_time_ms":30000,"checks":[{"check":"never_touches"},{"check":"reaches","item":"g1"}]}]}]}
```

### What the learner said before

- "It drives around the red block to the green area."

### Task: analyze

The learner's sentence: "Test that it gets around the red block to the green area."

## The answer (analyze)

The program has no decisions: one path, a fixed route. The learner said what it is for, and their own test already
tests it: from a start before the red block, it checks that the robot gets into the green area without touching the
block. So the scenario is tested by their test (`tested_by`), and no new tests are written for it. A test of the same
route from another start would fail for a program that does what they said.

```json
{
 "analysis_status":"ok",
 "likely_intent":{"description":"Drive around the red block to the green area.","confidence":"high","basis":"learner_description"},
 "program_facts":{"sensors":[],"actions":[{"name":"drive forward and turn on the spot: a fixed route","source_block_ids":[]}],"control_flow":["Once, then the program ends: forward 50 cm, left 90°, forward 45 cm, right 90°, forward 70 cm, right 90°, forward 45 cm, left 90°, forward 50 cm."],"variables":[],"functions":[]},
 "decision_points":[],
 "scenario_paths":[
  {"id":"P1","scenario_id":"S1","branch_ids":[],"input_dimensions":[{"dimension":"where the robot starts","equivalence_classes":["before the red block, facing it"]}],"testability":"supported"}
 ],
 "scenarios":[
  {"id":"S1","path_ids":["P1"],"title":"Drives around the red block to the green area","category":"nominal","initial_condition":"The robot starts before the red block, facing it, with the green area behind the block","trigger":"The program starts","coded_response":"It drives a fixed route: forward, left, forward, right, forward, right, forward, left, forward","expected_response_hypothesis":"It gets around the red block without touching it, into the green area","oracle_basis":"learner_description","assumptions":[],"source_block_ids":[],"testability":"supported","confidence":"high","tested_by":["Gets around the red block"]}
 ],
 "uncertainties":[],
 "unsupported_features":[]
}
```
