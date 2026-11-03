# Example 3: wait for a key, then park

## The call (generate)

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

The intent you guessed: "Wait until the PLAY key is pressed, then drive forward and stop."
The learner's sentence: "When I press play, the robot drives into the box and parks there."

## The answer (generate)

The program waits for PLAY, so the set-up presses it. The learner didn't say how far the box is, so the box is drawn
where the program stops (115 cm ahead): the tests check the waiting and the parking, not the distance. At 40 % the
robot drives about 14 cm/s, so 115 cm take about 8 s. The program ends after the drive, and the run ends with it, so
the tests check where the robot ended (`ends_in`), not what it does afterwards.

```json
{"worlds":[
 {"name":"Park in a box",
  "world":{"background":"peach","starts":[{"id":"A","name":"A","x":40,"y":100,"heading":0}],
           "items":[{"id":"t1","name":"Box","kind":"rect","role":"goal","x":140,"y":85,"w":30,"h":30}]},
  "tests":[
   {"name":"After PLAY, it parks in the box","scenario":"Given PLAY is pressed after 0.5 s, when the program runs, then the robot drives into the box and stops completely inside it.","start":"A","until":null,"max_time_ms":15000,"world":[{"event":"key","port":"PLAY","at":500}],"globals":{},
    "checks":[{"check":"ends_in","item":"t1"},{"check":"never_bumps"}]},
   {"name":"Without PLAY, it waits","scenario":"Given nobody presses PLAY, when the program runs for 5 s, then the robot stays where it is.","start":"A","until":null,"max_time_ms":5000,"world":[],"globals":{},
    "checks":[{"check":"does","does":"stands_still","after_ms":100}]},
   {"name":"PLAY pressed later, it still parks","scenario":"Given PLAY is pressed only after 3 s, when the program runs, then the robot still parks inside the box.","start":"A","until":null,"max_time_ms":20000,"world":[{"event":"key","port":"PLAY","at":3000}],"globals":{},
    "checks":[{"check":"ends_in","item":"t1"}]}]}]}
```
