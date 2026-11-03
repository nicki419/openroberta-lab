# Example 4: two tests failed; one is wrong, the other finds a mistake in the program

## The call (fix)

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
     <mutation else="1"/>
     <repetitions>
      <value name="IF0">
       <block type="robSensors_light_getSample">
        <mutation mode="LINE"/>
        <field name="MODE">LINE</field>
        <field name="SENSORPORT">LINETRACKER</field>
        <field name="SLOT"/>
       </block>
      </value>
      <statement name="DO0">
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
    if (Ed.ReadLineState() == Ed.LINE_ON_BLACK):
        _diffCurve(Ed.FORWARD, 10, 40, Ed.DISTANCE_UNLIMITED)
    else:
        _diffCurve(Ed.FORWARD, 40, 10, Ed.DISTANCE_UNLIMITED)
```

### The learner's tests

None yet.

### What the learner said before

Nothing yet.

### Task: fix

The intent you guessed: "Follow the black line, steering back onto it whenever the line tracker loses it."
The learner's sentence: "This program should follow a black line and stop if it senses an obstacle"

These tests you wrote failed when they ran on the learner's program:

```json
{"worlds":[{"name":"A line to a goal","world":{"background":"peach","starts":[{"id":"A","name":"A","x":30,"y":140,"heading":0},{"id":"B","name":"B","x":30,"y":132,"heading":0}],"items":[{"id":"t1","kind":"line","points":[[20,140],[100,140],[160,90],[250,90]],"smooth":true,"width":1.48},{"id":"t2","name":"Goal 1","kind":"rect","role":"goal","x":225,"y":75,"w":30,"h":30}]},"tests":[{"name":"On the line, it follows it to the goal","scenario":"Given the robot starts on the line at A, when the program runs, then it follows the line and reaches Goal 1 at its end without bumping into anything.","start":"A","until":"t2","max_time_ms":8000,"world":[],"globals":{},"checks":[{"check":"reaches","item":"t2"},{"check":"never_bumps"}]}]},{"name":"A box on the line","world":{"background":"peach","starts":[{"id":"A","name":"A","x":30,"y":100,"heading":0}],"items":[{"id":"t1","kind":"line","points":[[20,100],[155,100],[260,100]],"width":1.48},{"id":"t2","name":"Box","kind":"rect","role":"obstacle","x":150,"y":95,"w":10,"h":10}]},"tests":[{"name":"Stops before the box on the line","scenario":"Given a box on the line, when the program runs for 40 s, then the robot stops in front of the box without bumping into it, and stays there.","start":"A","until":null,"max_time_ms":40000,"world":[],"globals":{},"checks":[{"check":"never_bumps","item":"t2"},{"check":"whenever","when":"obstacle_ahead","after_ms":200,"does":"stands_still"}]}]}]}
```

How they ran:

- test "On the line, it follows it to the goal" (world "A line to a goal"): failed
  The run ended after 8 s: the time was up (max_time_ms 8000).
  The robot started at (30, 140) facing 0° and ended at (99, 139) facing 20°, after 70 cm.
  Where it was: 0 s (30, 140) facing 0°; 1 s (39, 141) facing -7°; 2 s (47, 142) facing -4°; 3 s (56, 142) facing -4°; 4 s (65, 143) facing -1°; 5 s (73, 143) facing 1°; 6 s (82, 143) facing 3°; 7 s (91, 141) facing 9°; 8 s (99, 139) facing 20°.
  Checks:
  - failed: the robot reaches "Goal 1": the robot did not reach "Goal 1" within 8 s
    from 7 s to 8 s: sensed: [get line light sensor below] line tracker sees black: yes 34×, no 26× (last: yes). ran: [if get line light senso...] yes 34×, no 26×; [steer forwards speed % left 10 speed % right 40] curves forward, left 10 %, right 40 % (18×) when [if get line light senso...] says yes; [steer forwards speed % left 40 speed % right 10] curves forward, left 40 %, right 10 % (from 7 s, 17×) when [if get line light senso...] says no. did: drove 8.7 cm and turned 11.4° to the left; wheels left 8, right 9.4 cm/s; LEDs off.
  - passed: the robot never bumps into anything: the robot never bumped into anything
- test "Stops before the box on the line" (world "A box on the line"): failed
  The run ended after 40 s: the time was up (max_time_ms 40000).
  The robot started at (30, 100) facing 0° and ended at (143, 99) facing 1°, after 114 cm.
  Where it was: 0 s (30, 100) facing 0°; 4 s (65, 99) facing -1°; 8 s (100, 99) facing -1°; 12 s (134, 99) facing -1°; 16 s to 40 s (143, 99) facing 3°.
  It bumped into something in 810 frames (1/60 s each).
  Checks:
  - failed: the robot never bumps into "Box": the robot bumped into "Box" after 13 s
    why (see another check): probably because "whenever an obstacle is ahead, the robot stands still (after 200 ms)" failed (see there)
    from 12 s to 13 s: sensed: [get line light sensor below] line tracker sees black: no 30×, yes 30× (last: yes). ran: [if get line light senso...] yes 30×, no 30×; [steer forwards speed % left 40 speed % right 10] curves forward, left 40 %, right 10 % (16×) when [if get line light senso...] says no; [steer forwards speed % left 10 speed % right 40] curves forward, left 10 %, right 40 % (from 12.1 s, 15×) when [if get line light senso...] says yes. did: drove 8.7 cm, straight; wheels left 8.7, right 8.7 cm/s; LEDs off.
  - failed: whenever an obstacle is ahead, the robot stands still (after 200 ms): an obstacle was ahead, but the robot did not stand still: it drove forward, straight (5.32 cm/s), 790 times, 13.25 s in total; the first from 12.95 to 13.05 s
    why (decision missing): no block of the program reads the obstacle sensor ahead: it cannot tell when an obstacle is ahead; meanwhile [steer forwards speed % left 40 speed % right 10] makes the robot drive forward, turning right (left wheel 40 %, right wheel 10 %)
    from 12.1 s to 13.1 s: sensed: [get line light sensor below] line tracker sees black: yes 30×, no 30× (last: no). ran: [if get line light senso...] yes 30×, no 30×; [steer forwards speed % left 10 speed % right 40] curves forward, left 10 %, right 40 % (15×) when [if get line light senso...] says yes; [steer forwards speed % left 40 speed % right 10] curves forward, left 40 %, right 10 % (from 12.1 s, 15×) when [if get line light senso...] says no. did: drove 8.7 cm, straight; wheels left 8.7, right 8.7 cm/s; LEDs off; bumped into "Box" (t2) (1 frames).

These tests of your answer passed, and the learner keeps them:

- "Started beside the line, it finds it" (world "A line to a goal")

## The answer (fix)

"On the line, it follows it to the goal" ran out of time: after 8 s the robot was still following the line, 70 cm from
its start (about 9 cm/s), and the line is about 250 cm long. The test is wrong, so it gets 60 s, and keeps its world
and its checks. "Stops before the box on the line" sets up its scenario well: the robot follows the line into the box.
The program never reads the obstacle sensor, and the learner said it should stop at obstacles: the program is wrong,
so the test stays as it is.

```json
{"worlds":[
 {"name":"A line to a goal","base":"existing",
  "tests":[
   {"name":"On the line, it follows it to the goal","scenario":"Given the robot starts on the line at A, when the program runs, then it follows the line and reaches Goal 1 at its end without bumping into anything.","start":"A","until":"t2","max_time_ms":60000,"world":[],"globals":{},"checks":[{"check":"reaches","item":"t2"},{"check":"never_bumps"}]}]}],
 "program_wrong":[
  {"test":"Stops before the box on the line","world":"A box on the line","reason":"The robot drives into the box and keeps pushing it: your program reads only the line tracker, never the obstacle sensor, and you said it should stop at obstacles."}]}
```
