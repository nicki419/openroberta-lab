# Example 3: wait for a key, then park on a soft goal

## The call (generate)

### The level

Title: Park in the box
Instructions: Stop in the light green box and stand still there for 2 seconds. Don't bump into the red block behind it. You have 15 seconds.
Time limit: 15 s
World:
```json
{"background":"peach","starts":[{"id":"A","name":"A","x":40,"y":100,"heading":0}],"items":[{"id":"g1","kind":"rect","role":"goal","name":"Goal 1","x":140,"y":85,"w":30,"h":30,"soft":{"still":2}},{"id":"o1","kind":"rect","role":"obstacle","name":"Obstacle 1","x":185,"y":80,"w":8,"h":40,"failOnHit":true}]}
```

### The program

NEPO:
```xml
<block_set robottype="edison">
 <instance>
  <block type="robControls_start">
   <mutation declare="false"/>
   <field name="DEBUG">FALSE</field>
  </block>
  <block type="robControls_wait_for">
   <value name="WAIT0">
    <block type="logic_compare">
     <field name="OP">EQ</field>
     <value name="A">
      <block type="robSensors_getSample">
       <mutation input="KEY_PRESSED"/>
       <field name="SENSORTYPE">KEY_PRESSED</field>
       <field name="SENSORPORT">PLAY</field>
       <field name="SLOT"/>
      </block>
     </value>
     <value name="B">
      <block type="logic_boolean">
       <field name="BOOL">TRUE</field>
      </block>
     </value>
    </block>
   </value>
  </block>
  <block type="robActions_motorDiff_on_for">
   <field name="DIRECTION">FOREWARD</field>
   <value name="POWER">
    <block type="math_number">
     <field name="NUM">40</field>
    </block>
   </value>
   <value name="DISTANCE">
    <block type="math_number">
     <field name="NUM">115</field>
    </block>
   </value>
  </block>
 </instance>
</block_set>
```

EdPy:
```python
while True:
    if ((Ed.ReadKeypad() == Ed.KEYPAD_TRIANGLE)) == True:
        break
    pass
_diffDrive(Ed.FORWARD, 40, 115)
Ed.ReadClapSensor()
```

### The learner's tests

None yet.

### What the learner said before

Nothing yet.

### Task: generate

The intent you guessed: "Wait until the PLAY key is pressed, then drive into the light green box and stop there."
The learner's sentence: "When I press play, the robot drives into the box and parks there."

## The answer (generate)

The program waits for PLAY, so the set-up presses it. At 40 % the robot drives about 14 cm/s: 115 cm take about
8 s, well within the level's 15 s, also when PLAY comes at 3 s. The program ends after the drive, and the run ends
with it, so the tests check where the robot ended (`ends_in`), not what it does afterwards. The obstacle behind the
box loses the level, so the tests check that it is never hit.

```json
{"worlds":[
 {"name":"Park in the box","base":"level","add":[],"remove":[],"starts":[],
  "tests":[
   {"name":"After PLAY, it parks in the box","scenario":"Given PLAY is pressed after 0.5 s, when the program runs, then the robot drives into Goal 1, stops completely inside it and doesn't bump into Obstacle 1.","start":"A","until":null,"max_time_ms":15000,"world":[{"event":"key","port":"PLAY","at":500}],"globals":{},
    "checks":[{"check":"ends_in","item":"g1"},{"check":"never_bumps","item":"o1"}]},
   {"name":"Without PLAY, it waits","scenario":"Given nobody presses PLAY, when the program runs for 5 s, then the robot stays where it is.","start":"A","until":null,"max_time_ms":5000,"world":[],"globals":{},
    "checks":[{"check":"does","does":"stands_still","after_ms":100}]},
   {"name":"PLAY pressed later, it still parks in time","scenario":"Given PLAY is pressed only after 3 s, when the program runs, then the robot still parks inside Goal 1 within the level's 15 s.","start":"A","until":null,"max_time_ms":15000,"world":[{"event":"key","port":"PLAY","at":3000}],"globals":{},
    "checks":[{"check":"ends_in","item":"g1"},{"check":"never_bumps","item":"o1"}]}]}]}
```
