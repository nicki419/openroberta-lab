# The testing strategy of the v3 AI test-generation specification, and its justification

**What this is.** This document works out the test-design strategy implied by the three v3 specifications in this folder:
- `AI_Test_Generation_Orchestration_v3.md`, cited as **ORCH**;
- `AnalysisAgent_v3.md`, cited as **AA**;
- `TestGenerationAgent_v3.md`, cited as **TGA**.

It names the strategy's parts with established testing terms and justifies them from the End-User Development lectures (Fall 2026). It covers only the testing strategy and the meaning of tests and results, not the technical architecture. It is meant as material for the report (Section 3, design rationale, and Section 6, implications for theory).

**How sources are labelled:**
- **Slides Ln p.x**: lecture *n*, PDF page *x*.
- **Literature**: a source whose bibliographic details were checked.
- **Background**: standard testing knowledge, not from the slides and not checked. Verify these before citing them.

---

## 1. The strategy in one paragraph

The v3 specification describes a **gray-box, scenario-based test-design strategy**. It has these parts:
- **Test conditions** come from the program's structure. The relevant decision points of the NEPO control flow get one planned target per feasible outcome, so the adequacy criterion is **feasible branch (decision) coverage**.
- **Test inputs** are chosen with black-box techniques, **equivalence partitioning (EP)** and **boundary value analysis (BVA)**. They are applied to the robot's *simulated environment*, not to function parameters: the start pose relative to a line, whether an obstacle is there, line shape, event timing and global variables.
- **Expected results** come from a **specification-based oracle with explicit provenance**. The learner's optional one-line statement of intent comes first, a clearly labelled inference from the code second, and a generic safety property third. A scenario with no defensible oracle is deferred.
- **Each test case** is a complete record: path + concrete inputs + expected results + postconditions.
- **The suite** is reduced to a small set that still covers every branch target, EP class and boundary side.
- **Verdicts** have three values (passed, failed, *not checked*). A failing test is never weakened to make it pass. The learner reviews and accepts every proposal, and the Lab's simulator is the only authority on whether a test passes.

ORCH §6.3 states the core order of four steps (paraphrased):

| Step | Technique | Owner | Testing term |
|---|---|---|---|
| 1 | decision points and feasible paths for **branch coverage** | AnalysisAgent | structural (white-box) identification of test conditions; coverage criterion used to *generate* tests |
| 2 | concrete inputs per path by **EP and BVA** | TestGenerationAgent | black-box selection of test data |
| 3 | **test case = path + inputs + expected results + postconditions** | TestGenerationAgent | the test case as defined in the standards (ISO/IEC/IEEE 29119-1) |
| 4 | **consolidation** of overlapping cases, keeping unique coverage | TestGenerationAgent, checked by code | test-suite reduction that keeps coverage |

---

## 2. The strategy, element by element

Each element below gives:
- **(a)** what the specification asks for;
- **(b)** the established technique;
- **(c)** the justification from the lectures, plus literature where it adds depth.

### E1. The test basis: intended behaviour, not coded behaviour (the oracle problem)

**(a) What the specification asks for:**
- **Three kinds of behaviour are kept apart** (AA §A2–A3): `coded_response` (what the blocks command), `likely_intent` (stated or inferred) and `expected_response_hypothesis` (a possible oracle, or null).
- **Oracle bases** (TGA §G2): `learner_description`, `inferred_from_program`, `applicable_safety`, and `unknown`, which means the scenario is deferred.
- **Anti-tautology rule:** don't turn each action of the program into an assertion that the action happens.
- **Conflict rule:** if the description and the code disagree, keep the stated goal and let the test fail.

**(b) The technique.** This is a deliberate answer to the **test oracle problem**: how do you know the expected result of a generated test?

**Literature:** Barr et al. (2015) sort oracles into **specified**, **derived** and **implicit** oracles, plus the **human oracle** for when none of these exists. The v3 bases map onto that taxonomy:

| v3 oracle basis | Barr et al. (2015) category | Comment |
|---|---|---|
| `learner_description` | specified oracle (an informal, one-line specification) | the strongest available basis; it can expose code that disagrees with the goal |
| `inferred_from_program` | derived oracle (derived from an artefact, here the program itself) | it risks circularity, which is why it is labelled and must be reviewed |
| `applicable_safety` | implicit oracle (a generic property: no collisions, no fail areas) | it applies to any robot program, but only "if relevant" |
| learner review and acceptance (`review_required`) | human oracle | the end user is the final judge |

An oracle derived from the implementation "confirms the code, bugs included". That is the reason for the anti-tautology rule.

**(c) Lecture justification:**
- **Slides L2 p.31:** EUSE testing and verification means gaining confidence about *correctness*. Correctness is always relative to some intent, so the strategy first fixes which intent counts.
- **Slides L2 p.34:** end users rarely document requirements; their requirements are emergent and bound up with design. A mandatory specification would therefore be unrealistic. The v3 answer is an *optional* one-line statement with a fallback to inference (ORCH §4).
- **Slides L4 p.31** (Shaw 2021, in the slides): vernacular developers often program to find out what they need. They work *toward* a specification rather than from one, and without one they can't use many correctness techniques, so they look for plausible behaviour. The v3 design turns "plausible behaviour" into an explicit, labelled, reviewable hypothesis.
- **Slides L4 p.28–29:** correctness versus fitness for intended purpose. Specifications are incomplete and change over time, and physical systems inherit physical uncertainty. Assurance therefore combines tests, proofs and human judgement. The v3 invariant (ORCH §16, §9) matches this: a simulated pass is not proof that the program is correct, and a failure against an unconfirmed hypothesis is not proof that the learner made a mistake.
- **Slides L3 p.39** (programming by natural language, Hirzel 2023): natural language is ambiguous, and programs built from it are often wrong. The suggested mitigations are to *show the user the result or its effect* and to keep utterances short. This matches the bounded one-line field (280 characters) and the requirement that every proposal is shown for review and runs before anything is claimed.
- **Slides L5 p.39:** ways of specifying intent range from tests and input-output examples (precise and checkable) to natural language (expressive and ambiguous). The strategy translates an ambiguous sentence into precise, checkable tests, and the learner checks the translation.

### E2. Test conditions from structure: feasible branch coverage

**(a) What the specification asks for** (AA §A4, TGA §G1, ORCH §6.3):
- Every relevant decision (`if`/`else`, sensor predicates, comparisons, loop entry and exit) gets an id, `Dxx`, and every outcome a branch id, `Dxx.true` or `Dxx.false`, tied to real NEPO block ids.
- A small set of **feasible paths**, whose union targets every feasible outcome, is selected. This is branch coverage, explicitly *not* the Cartesian product of paths.
- Infeasible outcomes are deferred, with a reason.
- Loops are handled by entry versus no entry and representative repetition, not by enumerating iterations.
- The coverage is **planned, not measured**: without a trace from the simulator, it is reported as "planned coverage / execution not verified" (ORCH §6.3, TGA §G6).

**(b) The technique.** This is **branch, or decision, coverage**, the standard structural adequacy criterion. Here it is used as a *generation* criterion: it decides which situations to test, and it is not used to grade an existing suite.

**Background (verify):**
- Zhu, Hall and May (1997) treat adequacy criteria in both roles, as a stopping rule and as a generator of tests.
- The loop rule (zero, one, many iterations) is classic loop testing (Beizer 1990).

**(c) Lecture justification:**
- **Slides L3 p.19:** visual languages such as Blockly rule out syntax errors, and even simple type errors, by construction.
- **Slides L3 p.16–17:** but users of interlocking-puzzle languages still face conditionals, loops and concrete values, and real block programs grow as complex as text.

  Together: what is left to go wrong in a NEPO program is mainly **logic in decisions** and **concrete values**. Branch coverage targets the first, and EP/BVA (E3, E4) target the second.
- **Slides L4 p.68** (Ko, Myers & Aung 2004, design barrier): a solution resting on an invalid assumption, for example one cycle tested on one data set and then believed correct for all.

  Branch coverage forces tests into the outcomes a learner doesn't think of, typically the `else` branch or the recovery case. It counters that invalid generalisation directly.
- **Slides L4 p.53** (Blackwell): programming loses direct manipulation, because effects land elsewhere and later. Learners can't simulate every consequence in their heads, so it pays to explore the decisions systematically rather than by watching one run.
- **Slides L2 p.38–39** (WYSIWYT; Fisher et al. 2006, in the slides): WYSIWYT shows spreadsheet users *testedness* (checkmarks and question marks).

  **Literature:** underneath, WYSIWYT rests on a structural adequacy criterion, the data-flow criterion **du-adequacy** (Rothermel et al. 2001). Users build du-adequate suites without knowing the criterion.

  The v3 design follows the same pattern: a formal coverage criterion applied by the tool and hidden from the end user. The branch ids stay internal, and the learner sees named scenarios.

### E3. Selecting inputs: equivalence partitioning over the environment

**(a) What the specification asks for** (TGA §G1b, AA §A4):
- For each path, the relevant input dimensions are split into behaviourally distinct classes, for example:
  - the line tracker over black or not;
  - an obstacle absent or ahead;
  - the start centred on the line or displaced;
  - a turn the robot can take, or one too sharp;
  - a clap before or during a blocking movement.
- **One representative is chosen per needed class.** Copies of the same class with arbitrary coordinates are not allowed (TGA §9, fixture 15).
- **Valid, invalid and unsupported classes are told apart.** Inputs the simulator can't represent are never used to stand for a negative test.
- **Each choice is recorded** in `input_selection` and must match the actual world and set-up.

**(b) The technique.** This is **equivalence partitioning**.

**Literature:** Myers et al., *The Art of Software Testing*, 3rd ed.: first identify the classes, then derive one test per class.

What is particular here: the input domain of a robot program is its **physical situation**, so the classes are classes of worlds, poses and event timings, not of argument values.

**(c) Lecture justification:**
- **Slides L3 p.16:** concrete values remain the end user's problem in block languages. EP chooses which concrete situations are worth a test.
- **Slides L4 p.68:** the design barrier again. Testing one situation and believing it holds for all is exactly the generalisation EP replaces with one representative per behaviourally distinct class.
- **Slides L5 p.82:** guidelines for prompting in a low-code context: verify with concrete test data; examples double as tests.

### E4. Selecting inputs: boundary value analysis, only where the boundary is real

**(a) What the specification asks for** (TGA §G1b, AA §A4):
- Where a threshold from the source code, or a transition the simulator supports, exists, the agent picks points **just below, at and just above** it, for example:
  - the line edge;
  - the moment the obstacle sensor starts to see something;
  - the edges of an event-time window.
- **Boundary cases survive consolidation** even when they target the same branch.
- **No numerical threshold is invented.** Where a bound isn't known, the agent uses qualitative neighbouring positions and records the limitation, or defers the case if it isn't reproducible.

**(b) The technique.** This is **boundary value analysis**.

**Literature:** Myers et al.: test on, above and below the edges of the equivalence classes.

The v3 variant is cautious about which boundaries count: only boundaries grounded in the source or the simulator, never invented ones.

**(c) Lecture justification:**
- **Slides L4 p.29:** physical systems inherit physical uncertainty. In a continuous simulation, a boundary is only meaningful if the simulator reproduces it, so the rule against inventing thresholds is a rule about validity, not a limitation.
- **Slides L4 p.68:** the same invalid generalisation as in E3, now on the edges of the classes.
- **Slides L4 p.62–63** (learning barriers; attention investment): a test that fails at an invented boundary is a false alarm. It raises the perceived risk of using the tool and invites wrong assumptions, so it is worse than no test.

### E5. A complete test case, structured as a scenario

**(a) What the specification asks for:**
- **The formula** (TGA §G4b): test case = targeted path(s) + specific simulator inputs + expected results + postconditions.
- **Supported checks:** every claim is tied to a supported check. Postconditions refer to checks by index.
- **Invariants:** an invariant such as `never_bumps` is described as holding over the whole run, not as the final position.
- **The scenario template** (AA §A4): initial condition → trigger → target path → coded response → stated or inferred intent → source evidence.

**(b) The technique.** This is the standard definition of a test case.

**Literature:** ISO/IEC/IEEE 29119-1:2013, quoted in the ISTQB glossary: preconditions, inputs, actions, expected results and postconditions, developed from test conditions.

Its scenario form is **scenario-based testing** in the style of BDD.

**(c) Lecture justification:**
- **Slides L3 p.56:** scenario-based specifications feel natural to end users because they are concrete examples of use. BDD scenarios balance natural language and formality, and they are executable.
- **Slides L3 p.57–60:** Gherkin's *Given* (context), *When* (event) and *Then* (outcome). BDD stories can be read as state machines: a state, an event, then a transition. The conveyor-belt robot appears as an example on p.60.

  The v3 case maps one to one:

  | v3 part | Gherkin |
  |---|---|
  | start, world and set-up | Given |
  | trigger or event | When |
  | expected results | Then |
  | postconditions | the final state after the transition |
- **Slides L3 p.61, 71** (Silva 2022/2023; de la Rosa, Sørensen & Silva 2023/2024, in the slides): a DSL for BDD scenarios, also used for programming robots. This is the closest related work in the course.

  The v3 specification excludes Given/When/Then *blocks* (`BDD_TESTS = false`), but its *test semantics* are scenario-based.
- **Slides L1 p.53:** in semiotic engineering, scenarios (BDD) are one of the means by which designers communicate their understanding of the user's goals.

### E6. A minimal suite that still covers everything (consolidation)

**(a) What the specification asks for** (TGA §G6, ORCH §6.3):
- **A coverage signature per candidate:** branch targets, paths, EP classes, boundary sides, oracle and postconditions.
- **Duplicates removed:** exact duplicates go, including those matching the learner's existing tests.
- **What must survive:** consolidation must not drop a unique feasible branch, a behaviourally distinct class or a boundary side.
- **No fixed count:** zero useful cases is better than fictional ones.
- **Honest records:** `coverage_plan` must equal the union of the retained targets, with the deferred targets listed.

**(b) The technique.** This is **test-suite reduction that keeps the coverage requirements**.

**Background (verify):** Harrold, Gupta and Soffa (1993); the survey by Yoo and Harman (2012).

What v3 adds: the requirements to keep include not only branches but also EP classes and boundary sides.

**(c) Lecture justification:**
- **Slides L4 p.56–60** (Blackwell 2002, attention investment): each test the learner must read, understand and keep is an attention cost. The learner only invests if the payoff, faults found, outweighs the cost and the risk. A small, meaningful suite lowers the cost; keeping the unique coverage keeps the payoff.
- **Slides L4 p.62:** if risk exceeds reward, end users abandon the tool, here the test assistant.
- **Slides L2 p.38** (Surprise-Explain-Reward; Wilson et al. 2003, in the slides): a few well-chosen tests produce meaningful *surprises* (failures) and *rewards* (passes). Many redundant tests only produce noise.

### E7. Verdicts with three values, and protection against trivial passes

**(a) What the specification asks for:**
- **What each value means** (ORCH §9, TGA §G5):
  - `passed: true` means the check held *in this simulated run*;
  - `passed: false` means it didn't;
  - `passed: null` means *not checked*: the condition or event never occurred. It is **never** evidence of correctness.
- **Anti-triviality** (TGA §G2): a negative-only check such as `never_bumps` also passes when the robot never moves, so safety checks are paired with a positive behavioural check where the intent justifies one.
- **Paired evidence:** a check that only applies in some condition is accompanied by evidence that the condition actually occurs.

**(b) The technique.** This is the **inconclusive verdict** of test standards, and protection against **vacuous truth** (an implication that holds because its premise never occurs). The pairing rule raises the **fault-detection ability** of each test.

**(c) Lecture justification:**
- **Slides L1 p.41–44** (Norman's gulfs): the **gulf of evaluation** is the effort of deciding whether one's expectations were met.

  **Slides L4 p.79–81:** this relates to Ko's **understanding barrier**, which is on the evaluation side only.

  If "not checked" looked like "passed", the gulf of evaluation would be *bridged falsely*: the learner would read safety where nothing was tested.
- **Slides L6 p.44** (speed versus quality): the danger is code that *appears* to work. An instant success creates an illusion of correctness.

  A trivially passing test is the testing version of that illusion; the third value and the anti-triviality rule guard against it.
- **Slides L6 p.67:** design implications: calibrate trust, and surface uncertainty.

### E8. The integrity of tests: no weakening to make them pass

**(a) What the specification asks for:**
- **No automatic fixes** (ORCH §1, §7): a failed test raises the status `simulation_failed`: show the normal report, and **do not auto-fix the test**.
- **No weakening** (TGA §8): a failed simulator assertion never makes the agent rewrite the expectation or move obstacles.
- **The one exception:** only a *demonstrably invalid specification or an impossible, untriggered scenario* may be corrected. It is corrected with bounded retries and an audit trail. The failure stays visible to the learner.

**(b) The technique.** The test's oracle is independent of the program under test. A test changed until the program passes no longer tests anything: it has turned into a derived oracle, the circularity of E1.

The exception separates a **test that is wrong** (its scenario never happened) from a **program that is wrong** (the scenario happened, and the program didn't do what was intended). That is the classic triage of a failure into a test defect or a product defect.

**(c) Lecture justification:**
- **Slides L6 p.43–44** (Fawzy et al. 2026, in the slides): users skip QA, trust AI output uncritically and reprompt instead of debugging.

  An assistant that silently adjusts tests until they pass would automate exactly this loop.
- **Slides L6 p.45:** lightweight verification should be built in, and decisions should be traceable: why a change was accepted, and which checks passed.
- **Slides L2 p.42:** an earlier EUP tool asked the user whether, and how, a web macro should be changed after an assertion was violated (Robofox).

  This is a precedent for putting the *human* in charge of the decision after a check fails.

### E9. The AI proposes; deterministic code validates; the simulator decides

**(a) What the specification asks for:**
- **Two stateless model calls in a fixed order, checked between them** (ORCH §3, §7): analysis, then validation, then generation, then validation.
- **No tools for the model:** it never gets a tool to change the workspace or run tests.
- **Deterministic code does the rest:** checks of schema, ids and geometry; turning the proposal into blocks.
- **One execution authority:** the Lab's simulator (ORCH §9).
- **Bounded retries:** only for malformed output.
- **Repeatability:** the same program and description should give stable scenarios (AA §8, test 8).

**(b) The technique.** The test generator is separated from the test executor, and the verdict comes from execution, not from the model. In LLM-system terms, this is a **workflow** (prompt chaining with gates between the steps), not an autonomous agent.

**(c) Lecture justification:**
- **Slides L6 p.7:** workflows follow predefined code paths; they are predictable and easier to test. Agents are harder to predict, test and govern.

  **Slides L6 p.13:** prompt chaining is a fixed sequence of LLM steps with checks in between; start simple.

  The two "agents" of v3 are, in these terms, a prompt chain, the recommended pattern for this risk level.
- **Slides L6 p.12, 24:** a human in the loop, with human approval gates, least privilege and audit. Agent behaviour should be tested, not only code (v3 has acceptance fixtures per agent).
- **Slides L5 p.59:** LLMs are non-deterministic and brittle to small changes in the prompt. Hence versioned prompts, low temperature, repeatability tests and validation outside the model.

  **Slides L5 p.54, 85** (Liu et al. 2025, in the slides): LLM-based low-code is more flexible, but less reliable and less predictable.
- **Slides L5 p.83:** structured output is JSON following a schema that can be validated and imported as platform artefacts. This is the v3 contract 1.1 and its deterministic conversion to blocks.

  **Slides L5 p.81:** a good prompt asks the model to state its assumptions; in v3, that is `oracle.assumptions` and `uncertainties`.
- **Slides L6 p.28:** among natural-language programming paradigms, those with an *executable oracle* or input-output pairs verify strongly; vibe coding verifies little.

  v3 puts an executable oracle (the simulator run) behind every generated artefact.

### E10. Showing the learner where each expectation comes from

**(a) What the specification asks for** (ORCH §4, §10; TGA §G2):
- **Provenance labels:** every proposal is labelled *"Based on your description"* or *"Inferred from your blocks"*.
- **Visible uncertainty:** assumptions and uncertainty are shown.
- **No overclaiming:** nothing is called "correct" or "passed" before it has run.
- **The learner's choice:** they accept all, accept some, edit or dismiss.

**(b) The technique.** The human oracle is made workable: the tool tells the learner how strong each oracle is, so they can judge it.

**(c) Lecture justification:**
- **Slides L1 p.53–55** (de Souza 2005, semiotic engineering): the system speaks for its designers. The metacommunication template is the designer saying, in the first person, what they understand the user wants.

  The intent statement and its provenance label are literally that message, sent at interaction time, and the learner can reject it.
- **Slides L6 p.12:** checkpoints only help if the human can judge what the AI did. The labels make that judgement possible.
- **Slides L6 p.66–67:** programming expertise is redistributed, not removed. Non-professionals can build but often can't evaluate, so EUD tools must support *specification, evaluation and repair*, which is EUSE. Further implications: explain what was built, calibrate trust, keep provenance and rollback.

---

## 3. Where the strategy sits among the EUSE areas

**Slides L2 p.31** (Ko et al. 2011): the five areas of EUSE. The v3 strategy belongs mainly to **testing and verification**. It touches two neighbours on purpose, and stays out of debugging:

- **Requirements** (Slides L2 p.32–35): the optional one-line description is a minimal, lightweight requirement. It is optional because end-user requirements are emergent and undocumented (p.34).
- **Debugging** (Slides L2 p.41–43): v3 explicitly *doesn't* repair the learner's program (ORCH §1, non-goals). It localises evidence instead:
  - failure verdicts with the blocks to blame;
  - replay;
  - the facts of the second before the failure.

  These lower Ko's **information barrier** (Slides L4 p.77–78) without taking over the debugging. They also answer the challenge on Slides L4 p.84: understanding and information barriers need an account of what the program did, and didn't, do.

## 4. A summary table for the report

| # | Element of the strategy | Established technique | Spec | Lectures (slides) | Literature / Background |
|---|---|---|---|---|---|
| E1 | intent before code; oracle provenance; anti-tautology | specification-based oracle; oracle taxonomy | AA §A2–A3, TGA §G2 | L2 p.31, 34; L4 p.28–29, 31; L3 p.39; L5 p.39 | Barr et al. 2015 |
| E2 | decisions → feasible paths for every outcome; planned, not measured | branch/decision coverage as a generation criterion | AA §A4, TGA §G1, ORCH §6.3 | L3 p.16–17, 19; L4 p.53, 68; L2 p.38–39 | Rothermel et al. 2001; *Bg:* Zhu et al. 1997, Beizer 1990 |
| E3 | classes of situations; one representative each | equivalence partitioning | TGA §G1b | L3 p.16; L4 p.68; L5 p.82 | Myers et al. |
| E4 | below / at / above real boundaries only | boundary value analysis | TGA §G1b | L4 p.29, 62–63, 68 | Myers et al. |
| E5 | path + inputs + expected results + postconditions; Given/When/Then | test case (ISO 29119-1); scenario-based / BDD testing | TGA §G4b, AA §A4 | L3 p.56–61, 71; L1 p.53 | ISO/IEC/IEEE 29119-1 (ISTQB glossary) |
| E6 | minimal suite keeping branches, classes, boundary sides | test-suite reduction that keeps coverage | TGA §G6 | L4 p.56–60, 62; L2 p.38 | *Bg:* Harrold et al. 1993; Yoo & Harman 2012 |
| E7 | pass / fail / not checked; anti-triviality | inconclusive verdict; protection against vacuous passes | ORCH §9, TGA §G2, §G5 | L1 p.41–44; L4 p.79–81; L6 p.44, 67 | — |
| E8 | never weaken a failing test; correct only invalid or untriggered tests | oracle independence; test defect vs product defect | ORCH §7, TGA §8 | L6 p.43–45; L2 p.42 | — |
| E9 | AI proposes, code validates, simulator decides | separating generation from execution; prompt-chaining workflow | ORCH §3, §7, §9 | L6 p.7, 12–13, 24, 28; L5 p.54, 59, 81, 83 | — |
| E10 | "Based on your description" / "Inferred from your blocks" | human oracle supported by provenance | ORCH §4, §10 | L1 p.53–55; L6 p.12, 66–67 | — |

## 5. Critique: limits of the induced strategy (for the Discussion)

1. **Planned coverage is not achieved coverage.** The specification admits that branch targets are only *intended* unless the simulator exposes a trace (ORCH §6.3).

   WYSIWYT, by contrast, *measures* testedness (Slides L2 p.39). Until the coverage is measured, the adequacy claim can't be checked, and a report must not call it branch coverage achieved.

   **How the implementation handles it (2026-11-04):**
   - The Lab's simulator records every decision's outcomes, so the assistant now measures which outcomes each check run took, next to the planned ones, kept in the telemetry (`docs/ai/nepo-ai-tests.md`, "The testing strategy"; the panel showed it as "Seen in the runs: n of m" until 2026-11-05).
   - A test whose planned outcome never ran counts as *not checked*, not as passed.
   - The decision inventory comes from the code, not from the model.

   The report may therefore state planned *and* observed branch coverage per answer. Two limits remain:
   - observed coverage only counts the runs of the tests the learner chose;
   - conditional returns of functions (`robProcedures_ifreturn`) and counting loops (`repeat n times`) aren't counted as decisions.
2. **Structural coverage can't find faults of omission.** If the learner says "stop before a wall" but the program has no obstacle decision, no branch of the code leads to that test.

   Only the specification-based oracle (E1, and the conflict rule) produces it. The two halves of the strategy are therefore *complementary*, not redundant; this is an argument for keeping both.

   **Background (verify):** Marick (1999) on the limits of code coverage.
3. **EP and BVA in a continuous physical simulation are fuzzy.** The classes are "conceptual" (AA §A4), and thresholds are unknown by design.

   Boundary tests risk being flaky, or being boundaries only in name. The specification's answer is to defer a case or record the limitation, which is honest but limits what BVA can deliver.
4. **The oracle can't be better than one sentence.** Without a description, every oracle is derived from the program and only weakly independent of it (E1).

   The labels make that visible, but the burden moves to a novice who, per Slides L6 p.66, often can't evaluate. This is the *human-oracle cost* that Barr et al. (2015) identify.
5. **The same model is designer and analyst.** Analysis errors (a wrong decision inventory) carry into generation. Validation checks references and form, not whether the analysis is right.
6. **The cost of the metadata.** The rich records per case (paths, classes, boundaries) are invisible to the learner. Their value lies entirely in better selection, which has to be shown empirically, for example by fault detection with seeded faults (ORCH §12, Phase 5). It must not be assumed.

## 6. A paragraph to adapt (Section 3, design rationale)

> The assistant's test design combines structural and specification-based testing. A first step identifies the
> decision points of the learner's NEPO program and plans scenario paths so that every feasible outcome of each
> relevant decision is targeted (branch coverage), because block languages remove syntax errors by construction but
> leave conditionals, loops and concrete values to the learner [L3]. For each path, concrete situations are then chosen
> by equivalence partitioning and boundary value analysis over the robot's simulated environment (start pose, line,
> obstacles, event timing), countering the assumption that one tested situation stands for all [Ko et al. 2004]. Each
> test case is a complete scenario of preconditions, inputs, expected results and postconditions, in the Given/When/Then
> structure of BDD [L3]. Its expected behaviour comes from the learner's optional one-line statement of intent, or, if
> none is given, from a clearly labelled inference from the program; following the taxonomy of Barr et al. (2015),
> these are specified and derived oracles, and the learner's review acts as the human oracle. Because end-user
> requirements are emergent and rarely written down [L2; Shaw 2021], the statement is optional, and every proposal
> shows its provenance. Verdicts distinguish passed, failed and not checked, and failing tests are never weakened to
> pass, so that the tool calibrates trust rather than creating an illusion of correctness [L6].

## 7. References

**Lectures (slides):**
- L1, Review of Key HCI Concepts, Theories, and Models: p.41–44 (gulfs, seven stages), p.49 (critique of cognitive engineering), p.53–55 (semiotic engineering, metacommunication).
- L2, EUD, EUP, and EUSE: p.29–31 (EUSE, the five areas), p.34–35 (requirements), p.38–40 (testing, WYSIWYT, assertions), p.42 (assertions and debugging, Robofox).
- L3, EUP Models: p.16–17, 19 (interlocking-puzzle languages: strengths and weaknesses), p.39 (weaknesses of programming by natural language), p.56–61 (scenario-based specifications, BDD, Gherkin, a DSL for BDD), p.71 (BDD DSL for robots).
- L4, Psychology of Programming: p.28–29, 31 (Shaw's myths; correctness vs fitness for purpose; vernacular developers), p.53, 56–60 (Blackwell, attention investment), p.62–84 (Ko's learning barriers and their relation to Norman's gulfs).
- L5, Low-Code Development, Foundations, Platforms and GenAI: p.39 (how users specify intent), p.54, 85 (Liu et al. 2025), p.59 (non-determinism), p.81–83 (anatomy of a prompt, guidelines, structured output).
- L6, Agentic AI and Vibe Coding: p.7, 12–13 (workflows vs agents, human in the loop, prompt chaining), p.24 (governance), p.28 (verification across NL paradigms), p.43–45 (quality assurance, speed versus quality, recommendations), p.66–67 (expertise redistributed; design implications).

**Literature** (details checked by web search on 2026-11-04; confirm page numbers in the publisher's library before final use):
- Barr, E. T., Harman, M., McMinn, P., Shahbaz, M., Yoo, S. (2015). The Oracle Problem in Software Testing: A Survey. *IEEE Transactions on Software Engineering* 41(5), 507–525. doi:10.1109/TSE.2014.2372785.
- Rothermel, G., Burnett, M., Li, L., DuPuis, C., Sheretov, A. (2001). A Methodology for Testing Spreadsheets. *ACM Transactions on Software Engineering and Methodology*, 2001, pp. 110–147. The volume is given inconsistently by the sources; check it in the ACM DL (likely 10(1)). This is the source of du-adequacy behind WYSIWYT.
- ISO/IEC/IEEE 29119-1:2013, the definition of a test case, as given in the ISTQB Glossary.
- Myers, G. J., Sandler, C., Badgett, T. *The Art of Software Testing*, 3rd ed., Wiley (2011/2012). Check the year and author order on the title page; it covers EP and BVA.
- Cited on the slides (take details from the slides' reference lists): Ko, Myers & Aung (2004); Blackwell (2002); Shaw (2021); Fisher et al. (2006); Wilson et al. (2003); Ko et al. (2011); Hirzel (2023); de Souza (2005); Silva (2022, 2023); de la Rosa, Sørensen & Silva (VL/HCC 2023; HRI 2024); Liu et al. (2025); Fawzy et al. (2026); Pimenova et al. (2026).

**Background** (not checked; verify before citing):
- Zhu, Hall & May (1997), test coverage and adequacy, *ACM Computing Surveys*.
- Beizer (1990), *Software Testing Techniques* (loop testing).
- Harrold, Gupta & Soffa (1993), on controlling the size of a test suite, *ACM TOSEM*.
- Yoo & Harman (2012), a survey of regression test minimisation, selection and prioritisation, *STVR*.
- Marick (1999), "How to Misuse Code Coverage".
