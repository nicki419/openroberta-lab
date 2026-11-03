# Example 1: a line follower that stops at obstacles

## The call (infer)

### The program

NEPO:
```xml
<block_set robottype="edison">
 <instance>
  <block type="robControls_start">
   <mutation declare="false"/>
   <field name="DEBUG">FALSE</field>
  </block>
  <block type="robControls_loopForever">
   <statement name="DO">
    <block type="robControls_ifElse">
     <mutation elseif="1" else="1"/>
     <repetitions>
      <value name="IF0">
       <block type="robSensors_infrared_getSample">
        <mutation mode="OBSTACLE"/>
        <field name="MODE">OBSTACLE</field>
        <field name="SENSORPORT">FRONT</field>
        <field name="SLOT"/>
       </block>
      </value>
      <statement name="DO0">
       <block type="robActions_motorDiff_stop"/>
      </statement>
      <value name="IF1">
       <block type="robSensors_light_getSample">
        <mutation mode="LINE"/>
        <field name="MODE">LINE</field>
        <field name="SENSORPORT">LINETRACKER</field>
        <field name="SLOT"/>
       </block>
      </value>
      <statement name="DO1">
       <block type="robActions_motorDiff_curve">
        <field name="DIRECTION">FOREWARD</field>
        <value name="POWER_LEFT">
         <block type="math_number">
          <field name="NUM">10</field>
         </block>
        </value>
        <value name="POWER_RIGHT">
         <block type="math_number">
          <field name="NUM">40</field>
         </block>
        </value>
       </block>
      </statement>
      <statement name="ELSE">
       <block type="robActions_motorDiff_curve">
        <field name="DIRECTION">FOREWARD</field>
        <value name="POWER_LEFT">
         <block type="math_number">
          <field name="NUM">40</field>
         </block>
        </value>
        <value name="POWER_RIGHT">
         <block type="math_number">
          <field name="NUM">10</field>
         </block>
        </value>
       </block>
      </statement>
     </repetitions>
    </block>
   </statement>
  </block>
 </instance>
</block_set>
```

EdPy:
```python
while True:
    if _obstacleDetection(Ed.OBSTACLE_AHEAD):
        Ed.Drive(Ed.STOP, Ed.SPEED_1, 1)
        Ed.ReadClapSensor()
    elif (Ed.ReadLineState() == Ed.LINE_ON_BLACK):
        _diffCurve(Ed.FORWARD, 10, 40, Ed.DISTANCE_UNLIMITED)
    else:
        _diffCurve(Ed.FORWARD, 40, 10, Ed.DISTANCE_UNLIMITED)
```

### The learner's tests

None yet.

### What the learner said before

Nothing yet.

### Task: infer

The guess the learner declined: none.

## The answer (infer)

```json
{"intent":"Follow the black line, and stop when something is in the way.","confidence":0.75,"ask":true,"same_as_declined":false,"not_covered":"There are no tests yet."}
```

## The call (generate)

The same parts, then:

### Task: generate

The intent you guessed: "Follow the black line, and stop when something is in the way."
The learner's sentence: "This program should follow a black line and stop if it senses an obstacle"

## The answer (generate)

Two worlds drawn for the sentence: a curved line with a goal area over its end, to see the robot follow it (from a
start on the line, and from one 8 cm beside it), and a straight line with a box on it, centred on one of the line's
points, for the stop. The program never ends, so a run lasts until the robot touches the goal (`until`) or the time is
up. A robot stuck at the box stands still too, so `never_bumps` checks that it stopped in time. No check says which
wheel turns: a line follower of another kind passes too.

```json
{"worlds":[
 {"name":"A line to a goal",
  "world":{"background":"peach","starts":[{"id":"A","name":"A","x":30,"y":140,"heading":0},{"id":"B","name":"B","x":30,"y":132,"heading":0}],
           "items":[{"id":"t1","kind":"line","points":[[20,140],[100,140],[160,90],[250,90]],"smooth":true,"width":1.48},
                    {"id":"t2","name":"Goal 1","kind":"rect","role":"goal","x":225,"y":75,"w":30,"h":30}]},
  "tests":[
   {"name":"On the line, it follows it to the goal","scenario":"Given the robot starts on the line at A, when the program runs, then it follows the line and reaches Goal 1 at its end without bumping into anything.","start":"A","until":"t2","max_time_ms":60000,"world":[],"globals":{},
    "checks":[{"check":"reaches","item":"t2"},{"check":"never_bumps"}]},
   {"name":"Started beside the line, it finds it","scenario":"Given the robot starts at B, 8 cm beside the line, when the program runs, then it finds the line and still reaches Goal 1.","start":"B","until":"t2","max_time_ms":60000,"world":[],"globals":{},
    "checks":[{"check":"reaches","item":"t2"}]}]},
 {"name":"A box on the line",
  "world":{"background":"peach","starts":[{"id":"A","name":"A","x":30,"y":100,"heading":0}],
           "items":[{"id":"t1","kind":"line","points":[[20,100],[155,100],[260,100]],"width":1.48},
                    {"id":"t2","name":"Box","kind":"rect","role":"obstacle","x":150,"y":95,"w":10,"h":10}]},
  "tests":[
   {"name":"Stops before the box on the line","scenario":"Given a box on the line, when the program runs for 40 s, then the robot stops in front of the box without bumping into it, and stays there.","start":"A","until":null,"max_time_ms":40000,"world":[],"globals":{},
    "checks":[{"check":"never_bumps","item":"t2"},{"check":"whenever","when":"obstacle_ahead","after_ms":200,"does":"stands_still"}]}]}]}
```
