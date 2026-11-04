# Example 3: wait for a key, then park

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
  <block type="robControls_wait_for" id="b2">
   <value name="WAIT0">
    <block type="logic_compare" id="b3">
     <field name="OP">EQ</field>
     <value name="A">
      <block type="robSensors_getSample" id="b4">
       <mutation input="KEY_PRESSED"/>
       <field name="SENSORTYPE">KEY_PRESSED</field>
       <field name="SENSORPORT">PLAY</field>
       <field name="SLOT"/>
      </block>
     </value>
     <value name="B">
      <block type="logic_boolean" id="b5">
       <field name="BOOL">TRUE</field>
      </block>
     </value>
    </block>
   </value>
  </block>
  <block type="robActions_motorDiff_on_for" id="b6">
   <field name="DIRECTION">FOREWARD</field>
   <value name="POWER">
    <block type="math_number" id="b7">
     <field name="NUM">40</field>
    </block>
   </value>
   <value name="DISTANCE">
    <block type="math_number" id="b8">
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

### The program's decisions

- D1: block b2, wait "wait until get pressed button p..."
  - D1.1: the condition holds: it goes on
  - D1.waits: the condition doesn't hold yet: it waits

### The learner's tests

None yet.

### What the learner said before

Nothing yet.

### Task: analyze

The intent you guessed: "Wait until the PLAY key is pressed, then drive forward and stop."
The learner's sentence: "When I press play, the robot drives into the box and parks there."

## The answer (analyze)

The wait is the only decision: it waits while PLAY isn't pressed, and goes on once it is. The learner said what
happens after PLAY; that the robot waits without it is inferred. The program compares no number and waits from its
start, so the time of the press has classes but no boundary: none is invented.

```json
{
 "analysis_status":"ok",
 "likely_intent":{"description":"Wait until PLAY is pressed, then drive into the box and park there.","confidence":"high","basis":"learner_description"},
 "program_facts":{"sensors":[{"name":"key PLAY","source_block_ids":["b4"]}],"actions":[{"name":"drive forward 115 cm at 40 %","source_block_ids":["b6"]}],"control_flow":["Wait until PLAY is pressed; then drive forward 115 cm; then the program ends."],"variables":[],"functions":[]},
 "decision_points":[
  {"id":"D1","condition":"PLAY is pressed","source_block_ids":["b2","b4"],"branches":[{"id":"D1.1","outcome":"PLAY is pressed: it drives on","feasibility":"supported","reason":null},{"id":"D1.waits","outcome":"PLAY is not pressed yet: it waits","feasibility":"supported","reason":null}]}
 ],
 "scenario_paths":[
  {"id":"P1","scenario_id":"S1","branch_ids":["D1.waits","D1.1"],"input_dimensions":[{"dimension":"when PLAY is pressed","equivalence_classes":["pressed while it waits"],"boundary_candidates":[]}],"testability":"supported"},
  {"id":"P2","scenario_id":"S2","branch_ids":["D1.waits"],"input_dimensions":[{"dimension":"when PLAY is pressed","equivalence_classes":["never pressed"],"boundary_candidates":[]}],"testability":"supported"}
 ],
 "scenarios":[
  {"id":"S1","path_ids":["P1"],"title":"Parks after PLAY","category":"nominal","initial_condition":"The robot stands in front of the box","trigger":"PLAY is pressed","coded_response":"It drives 115 cm forward and stops","expected_response_hypothesis":"It drives into the box and stops inside it","oracle_basis":"learner_description","assumptions":["The box is where the program stops: the learner gave no distance."],"source_block_ids":["b2","b6"],"testability":"supported","confidence":"high"},
  {"id":"S2","path_ids":["P2"],"title":"Waits without PLAY","category":"alternative","initial_condition":"The robot stands in front of the box","trigger":"Nobody presses PLAY","coded_response":"It keeps waiting","expected_response_hypothesis":"It doesn't move","oracle_basis":"inferred","assumptions":["The learner didn't say it, but 'when I press play' means it waits until then."],"source_block_ids":["b2"],"testability":"supported","confidence":"medium"}
 ],
 "uncertainties":["The learner doesn't say how far the box is.","The program compares no number and begins to wait at once: a press at any time is seen, so there is no boundary in its time."],
 "unsupported_features":[]
}
```

## The call (generate)

The same parts, with the analysis before the task, then:

### Task: generate

The intent you guessed: "Wait until the PLAY key is pressed, then drive forward and stop."
The learner's sentence: "When I press play, the robot drives into the box and parks there."

## The answer (generate)

The learner didn't say how far the box is, so the box is drawn where the program stops (115 cm ahead): the tests
check the waiting and the parking, not the distance. At 40 % the robot drives about 14 cm/s, so 115 cm take about
8 s. The program ends after the drive, and the run ends with it, so the tests check where the robot ended (`ends_in`),
not what it does afterwards. A press after 3 s would be a second test of the same class: left out.

```json
{
 "generation_status":"ready_for_review",
 "worlds":[
  {"name":"Park in a box","world":{"background":"peach","starts":[{"id":"A","name":"A","x":40,"y":100,"heading":0}],"items":[{"id":"t1","name":"Box","kind":"rect","role":"goal","x":140,"y":85,"w":30,"h":30}]},
   "tests":[
    {"name":"After PLAY, it parks in the box","scenario":"Given PLAY is pressed after 0.5 s, when the program runs, then the robot drives into the box and stops completely inside it.","start":"A","until":null,"max_time_ms":15000,"world":[{"event":"key","port":"PLAY","at":500}],"globals":{},"checks":[{"check":"ends_in","item":"t1"},{"check":"never_bumps"}],"scenario_id":"S1","path_ids":["P1"],"planned_branch_ids":["D1.waits","D1.1"],"input_selection":{"equivalence_partitions":[{"dimension":"when PLAY is pressed","class":"pressed while it waits","selected_realization":"PLAY pressed after 0.5 s","realized_by":{"events":[0]}}],"boundary_values":[]},"expected_results":["After PLAY it drives into the box and stops there."],"postconditions":[{"description":"When the run ends, the robot is completely inside the box.","check_indices":[0]},{"description":"During the whole run, it never bumps into anything.","check_indices":[1]}],"oracle":{"basis":"learner_description","confidence":"high","assumptions":["The box is where the program stops: the learner gave no distance."],"review_required":true},"source_block_ids":["b2","b6"],"reason":"Parking after PLAY is what the learner said."},
    {"name":"Without PLAY, it waits","scenario":"Given nobody presses PLAY, when the program runs for 5 s, then the robot stays where it is.","start":"A","until":null,"max_time_ms":5000,"world":[],"globals":{},"checks":[{"check":"does","does":"stands_still","after_ms":100}],"scenario_id":"S2","path_ids":["P2"],"planned_branch_ids":["D1.waits"],"input_selection":{"equivalence_partitions":[{"dimension":"when PLAY is pressed","class":"never pressed","selected_realization":"no key press in the set-up","realized_by":{"events":[]}}],"boundary_values":[]},"expected_results":["It stays where it is."],"postconditions":[],"oracle":{"basis":"inferred_from_program","confidence":"medium","assumptions":["Without PLAY the robot shouldn't move."],"review_required":true},"source_block_ids":["b2"],"reason":"The other class of the key: never pressed."}
   ]}
 ],
 "coverage_plan":{"target_branch_ids":["D1.waits","D1.1"],"planned_covered_branch_ids":["D1.waits","D1.1"],"deferred_branch_ids":[],"deferred_inputs":[]},
 "consolidation_notes":["PLAY pressed after 3 s is the same class as after 0.5 s (pressed while it waits): left out."],
 "deferred_scenarios":[],
 "warnings":[]
}
```
