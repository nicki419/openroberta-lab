# Example 1: a line follower that stops at obstacles

## The call (analyze)

### The program

NEPO:
```xml
<block_set robottype="edison">
 <instance>
  <block type="robControls_start" id="b1">
   <mutation declare="false"/>
   <field name="DEBUG">FALSE</field>
  </block>
  <block type="robControls_loopForever" id="b2">
   <statement name="DO">
    <block type="robControls_ifElse" id="b3">
     <mutation elseif="1" else="1"/>
     <repetitions>
      <value name="IF0">
       <block type="robSensors_infrared_getSample" id="b4">
        <mutation mode="OBSTACLE"/>
        <field name="MODE">OBSTACLE</field>
        <field name="SENSORPORT">FRONT</field>
        <field name="SLOT"/>
       </block>
      </value>
      <statement name="DO0">
       <block type="robActions_motorDiff_stop" id="b5"/>
      </statement>
      <value name="IF1">
       <block type="robSensors_light_getSample" id="b6">
        <mutation mode="LINE"/>
        <field name="MODE">LINE</field>
        <field name="SENSORPORT">LINETRACKER</field>
        <field name="SLOT"/>
       </block>
      </value>
      <statement name="DO1">
       <block type="robActions_motorDiff_curve" id="b7">
        <field name="DIRECTION">FOREWARD</field>
        <value name="POWER_LEFT">
         <block type="math_number" id="b8">
          <field name="NUM">10</field>
         </block>
        </value>
        <value name="POWER_RIGHT">
         <block type="math_number" id="b9">
          <field name="NUM">40</field>
         </block>
        </value>
       </block>
      </statement>
      <statement name="ELSE">
       <block type="robActions_motorDiff_curve" id="b10">
        <field name="DIRECTION">FOREWARD</field>
        <value name="POWER_LEFT">
         <block type="math_number" id="b11">
          <field name="NUM">40</field>
         </block>
        </value>
        <value name="POWER_RIGHT">
         <block type="math_number" id="b12">
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

### The program's decisions

- D1: block b3, if "if get obstacle infrare..."
  - D1.1: condition 1 holds
  - D1.2: condition 2 holds (the ones before it don't)
  - D1.else: no condition holds: the else part runs

### The program on a plain floor

The Lab ran it for 3 s on a plain peach floor, bright, with nothing around and nothing happening: it turned right, 258° in all, in a curve (its path 26 cm).

### The learner's tests

None yet.

### What the learner said before

Nothing yet.

### Task: analyze

The learner's sentence: "This program should follow a black line and stop if it senses an obstacle"

## The answer (analyze)

One decision with three outcomes; the learner's sentence says what each should lead to. Two scenarios, each with its
path: following the line takes the second outcome and the else part again and again; at an obstacle the first
outcome happens too. The inputs that decide them, each with the situations that behave differently: where the robot
starts relative to the line (on it, beside it), and what is ahead on the line (nothing, an obstacle). The sentence
gives no end of the line: an assumption.

```json
{
 "analysis_status":"ok",
 "likely_intent":{"description":"Follow the black line, and stop when an obstacle is ahead.","confidence":"high","basis":"learner_description"},
 "program_facts":{"sensors":[{"name":"obstacle sensor ahead (FRONT)","source_block_ids":["b4"]},{"name":"line tracker","source_block_ids":["b6"]}],"actions":[{"name":"stop","source_block_ids":["b5"]},{"name":"curve left (left wheel 10 %, right 40 %)","source_block_ids":["b7"]},{"name":"curve right (left wheel 40 %, right 10 %)","source_block_ids":["b10"]}],"control_flow":["Forever: if an obstacle is ahead, stop; else if the line tracker sees black, curve left; else curve right."],"variables":[],"functions":[]},
 "decision_points":[
  {"id":"D1","condition":"first: an obstacle is ahead; second: the line tracker sees black","source_block_ids":["b3","b4","b6"],"branches":[{"id":"D1.1","outcome":"an obstacle is ahead: the robot stops","feasibility":"supported","reason":null},{"id":"D1.2","outcome":"no obstacle, the line tracker sees black: it curves left","feasibility":"supported","reason":null},{"id":"D1.else","outcome":"no obstacle, no black: it curves right","feasibility":"supported","reason":null}]}
 ],
 "scenario_paths":[
  {"id":"P1","scenario_id":"S1","branch_ids":["D1.2","D1.else"],"input_dimensions":[{"dimension":"where the robot starts relative to the line","equivalence_classes":["on the line","beside the line"]},{"dimension":"what is ahead on the line","equivalence_classes":["nothing"]}],"testability":"supported"},
  {"id":"P2","scenario_id":"S2","branch_ids":["D1.2","D1.else","D1.1"],"input_dimensions":[{"dimension":"what is ahead on the line","equivalence_classes":["an obstacle on the line"]}],"testability":"supported"}
 ],
 "scenarios":[
  {"id":"S1","path_ids":["P1"],"title":"Follows the line","category":"nominal","initial_condition":"The robot starts on a curved line, or beside it","trigger":"The line tracker sees black, then the floor, again and again","coded_response":"It curves left on black and right on the floor","expected_response_hypothesis":"It follows the line to its end","oracle_basis":"learner_description","assumptions":["The end of the line is where it should get to."],"source_block_ids":["b6","b7","b10"],"testability":"supported","confidence":"high","tested_by":[]},
  {"id":"S2","path_ids":["P2"],"title":"Stops at an obstacle on the line","category":"adverse","initial_condition":"An obstacle is on the line ahead of the robot","trigger":"The obstacle sensor sees it","coded_response":"It stops while the obstacle is ahead","expected_response_hypothesis":"It stops before the obstacle without bumping into it, and stays there","oracle_basis":"learner_description","assumptions":[],"source_block_ids":["b4","b5"],"testability":"supported","confidence":"high","tested_by":[]}
 ],
 "uncertainties":["The sentence doesn't say where the line ends or what the robot should do there."],
 "unsupported_features":[]
}
```

## The call (generate)

The same parts, with the analysis (your answer to analyze, as above) before the task, then:

### Task: generate

The learner's sentence: "This program should follow a black line and stop if it senses an obstacle"
Write tests only for scenarios S1 "Follows the line", S2 "Stops at an obstacle on the line": the analysis' other scenarios get their own calls, or the learner's tests already test them.

## The answer (generate)

Two worlds drawn for the two scenarios. A curved line with a goal area over its end, for following the line, from a
start on its middle. The other class of start, beside the line, is deferred: the learner didn't say the robot should
find the line, and their robot starts on it.
A straight line with a box on it, for the stop: the robot follows the line from far away and meets the box (the class
"an obstacle on the line"). Every outcome is planned by a test whose run takes it. The program never ends, so a run
lasts until the robot touches the goal (`until`) or the time is up. A robot stuck at the box stands still too, so
`never_bumps` checks that it stopped in time, and a positive check shows the scenario happened. No check says which
wheel turns: a line follower of another kind passes too.

```json
{
 "generation_status":"ready_for_review",
 "worlds":[
  {"name":"A line to a goal","world":{"background":"peach","starts":[{"id":"A","name":"A","x":30,"y":140,"heading":0}],"items":[{"id":"t1","kind":"line","points":[[20,140],[100,140],[160,90],[250,90]],"smooth":true,"width":1.48},{"id":"t2","name":"Goal 1","kind":"rect","role":"goal","x":225,"y":75,"w":30,"h":30}]},
   "tests":[
    {"name":"On the line, it follows it to the goal","scenario":"Given the robot starts on the line at A, when the program runs, then it follows the line and reaches Goal 1 at its end without bumping into anything.","start":"A","until":"t2","max_time_ms":60000,"world":[],"globals":{},"checks":[{"check":"reaches","item":"t2"},{"check":"never_bumps"}],"scenario_id":"S1","path_ids":["P1"],"planned_branch_ids":["D1.2","D1.else"],"input_selection":{"equivalence_partitions":[{"dimension":"where the robot starts relative to the line","class":"on the line","selected_realization":"A, on the line's first point, facing along it","realized_by":{"start":"A"}},{"dimension":"what is ahead on the line","class":"nothing","selected_realization":"nothing is on the line in this world","realized_by":{"items":["t1"]}}]},"expected_results":["It follows the line and reaches Goal 1 at the line's end."],"postconditions":[{"description":"By the end of the run, the robot has touched Goal 1.","check_indices":[0]},{"description":"During the whole run, it never bumps into anything.","check_indices":[1]}],"oracle":{"basis":"learner_description","confidence":"high","assumptions":["The end of the line is where it should get to."],"review_required":true},"source_block_ids":["b6","b7","b10"],"reason":"Following the line from a start on it is what you said."}
   ]},
  {"name":"A box on the line","world":{"background":"peach","starts":[{"id":"A","name":"A","x":30,"y":100,"heading":0}],"items":[{"id":"t1","kind":"line","points":[[20,100],[155,100],[260,100]],"width":1.48},{"id":"t2","name":"Box","kind":"rect","role":"obstacle","x":150,"y":95,"w":10,"h":10}]},
   "tests":[
    {"name":"Stops before the box on the line","scenario":"Given a box on the line, when the program runs for 40 s, then the robot stops in front of the box without bumping into it, and stays there.","start":"A","until":null,"max_time_ms":40000,"world":[],"globals":{},"checks":[{"check":"never_bumps","item":"t2"},{"check":"whenever","when":"obstacle_ahead","after_ms":200,"does":"stands_still"}],"scenario_id":"S2","path_ids":["P2"],"planned_branch_ids":["D1.2","D1.else","D1.1"],"input_selection":{"equivalence_partitions":[{"dimension":"what is ahead on the line","class":"an obstacle on the line","selected_realization":"the Box t2 on the line, 120 cm ahead of A","realized_by":{"items":["t2"]}}]},"expected_results":["It follows the line, stops when the box is ahead, and stays there."],"postconditions":[{"description":"During the whole run, it never bumps into the box.","check_indices":[0]},{"description":"Whenever the box is ahead, it stands still.","check_indices":[1]}],"oracle":{"basis":"learner_description","confidence":"high","assumptions":[],"review_required":false},"source_block_ids":["b4","b5"],"reason":"Stopping at an obstacle is what you said."}
   ]}
 ],
 "coverage_plan":{"target_branch_ids":["D1.2","D1.else","D1.1"],"planned_covered_branch_ids":["D1.2","D1.else","D1.1"],"deferred_branch_ids":[],"deferred_inputs":[{"dimension":"where the robot starts relative to the line","value":"beside the line","reason":"You didn't say the robot should find the line: your robot starts on it."}]},
 "consolidation_notes":["The start on the line also stands for nothing ahead on the line, so there is no second test without a box."],
 "deferred_scenarios":[],
 "warnings":["You didn't say where the line should end: the tests take its end as the goal."]
}
```
