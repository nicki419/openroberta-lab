package de.fhg.iais.roberta.ai;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * the per-call part of a prompt (the user message after the context pack) and the checks of the answers. The browser sends data, never prompt text:
 * <pre>
 * {program: {nepo: the program XML (its blocks with short ids b1, b2, ...), edpy: its EdPy},      at least one of them
 *  tests: the learner's tests as test JSON (or null),
 *  said: [the learner's earlier sentences about this program],
 *  levelId, fingerprint: the level played and the program's fingerprint (only logged),
 *  infer:    declined: the guess the learner declined (or null)
 *  analyze:  decisions: [{id: D1, block: b7, kind: if | wait | while, label, outcomes: [{id: D1.1, outcome}, ...]}] (the browser finds them in
 *            the program's blocks: nepoTest.aiStrategy decisionIndex), intent: the guess, sentence: the learner's sentence (or null),
 *            notCovered: what the learner's tests don't check yet (the guess's not_covered; only if they have tests, or null),
 *            sensors: the sensors its blocks that run read ([LINETRACKER, LLIGHT, RLIGHT, OBSTACLE_FRONT, …, SOUND, KEY, IR]),
 *            repair: {answer: the answer with problems, problems: ["...", ...]} (or null)
 *  generate: as analyze, and analysis: the checked answer of analyze, scenarios: [the ids of the scenarios this call writes tests for] (or
 *            null: all; the browser makes one call per scenario that the learner's tests don't test yet), maxTests: its share of the tests,
 *            followsLine: true if a block that runs reads the line tracker (every test then starts on a line)
 *  fix:      as generate, and fix: {tests: the failed tests as test JSON, each world in full,
 *                                   results: ["how a failed test ran", ...] (the browser writes them from the runs),
 *                                   kept: [{test, world}: the tests of the answer that passed]}}
 * </pre>
 * The model gets nothing of the level the learner plays (no title, instructions, time limit or world): tests made from the level would give its
 * solution away and test the level instead of the learner's idea. So the message has the program, the learner's tests and the learner's words
 * only, and nothing else of the data is read here. The NEPO XML loses its positions and configuration ({@link #trimNepo}; its block ids stay:
 * the analysis and the tests name blocks by them), the EdPy its helpers and fixed start-up ({@link #trimEdpy}). The format of the message is the one of the examples in the context pack (ai/examples), so
 * change both together.
 */
public final class AiPrompts {
    public static final int MAX_NEPO = 60000; // longer: left out (the EdPy says the same)
    public static final int MAX_EDPY = 30000;
    public static final int MAX_TESTS = 60000;
    public static final int MAX_SENTENCE = 200;
    public static final int MAX_SAID = 5; // the last ones
    public static final int MAX_GUESS = 300;
    public static final int MAX_PROBLEMS = 40; // more: the first ones, and how many more
    public static final int MAX_PROBLEM = 800; // longer: cut (the strategy's problems quote dimensions and boundaries: 300 to 500 characters)
    public static final int MAX_ANSWER = 60000;
    public static final int MAX_RESULTS = 15; // failed tests of a fix
    public static final int MAX_RESULT = 4000;
    public static final int MAX_KEPT = 30;
    public static final int MAX_REASON = 300;
    public static final int MAX_DECISIONS = 60;
    public static final int MAX_OUTCOMES = 12; // of one decision
    public static final int MAX_LABEL = 200;
    public static final int MAX_ANALYSIS = 60000;

    private static final String FIXED_START_END = "Ed.TimeWait(250, Ed.TIME_MILLISECONDS)";
    private static final Pattern CONFIG = Pattern.compile("<config>.*?</config>", Pattern.DOTALL);
    private static final Pattern DATA = Pattern.compile("<data>.*?</data>", Pattern.DOTALL); // the start block's neural network settings: noise for the model
    private static final Pattern NOISE = Pattern.compile("\\s(x|y|intask|deletable|xmlns|xmlversion|description|tags)=\"[^\"]*\"");
    private static final Pattern WRAPPERS = Pattern.compile("</?(export|program)\\s*>");
    private static final Pattern BETWEEN_TAGS = Pattern.compile(">\\s*<");
    private static final Pattern DECISION_ID = Pattern.compile("D\\d{1,3}");
    private static final Pattern OUTCOME_ID = Pattern.compile("D\\d{1,3}\\.(\\d{1,2}|else|waits|repeats|ends)");
    private static final Pattern BLOCK_ID = Pattern.compile("b\\d{1,4}");
    private static final Pattern SCENARIO_ID = Pattern.compile("S\\d{1,3}");
    public static final int MAX_SCENARIOS = 20; // named in one generate call

    private AiPrompts() {
        // only static methods
    }

    /**
     * @param task {@link AiService#INFER}, {@link AiService#ANALYZE}, {@link AiService#GENERATE} or {@link AiService#FIX}
     * @param data the browser's data (see the class comment)
     * @return the user message
     * @throws AiException bad_request (something required is missing) or too_large
     */
    public static String userMessage(String task, JSONObject data) {
        StringBuilder m = new StringBuilder();
        JSONObject program = data.optJSONObject("program");
        String nepo = program == null ? "" : trimNepo(program.optString("nepo", ""));
        String edpy = program == null ? "" : trimEdpy(program.optString("edpy", ""));
        if ( nepo.isEmpty() && edpy.isEmpty() ) {
            throw new AiException("bad_request", "the program is missing");
        }
        limited("the EdPy", edpy, MAX_EDPY);
        m.append("## The program\n\n");
        if ( nepo.isEmpty() ) {
            m.append("NEPO: (not available)\n\n");
        } else if ( nepo.length() > MAX_NEPO ) {
            m.append("NEPO: (left out: too long; the EdPy says the same)\n\n");
        } else {
            m.append("NEPO:\n```xml\n").append(nepo).append("\n```\n\n");
        }
        m.append(edpy.isEmpty() ? "EdPy: (not available)\n\n" : "EdPy:\n```python\n" + edpy + "\n```\n\n");
        boolean infer = AiService.INFER.equals(task);
        if ( !infer ) {
            appendDecisions(m, data.opt("decisions"));
            appendSensors(m, data.opt("sensors"));
        }

        m.append("## The learner's tests\n\n");
        Object tests = data.opt("tests");
        if ( tests == null || tests == JSONObject.NULL || isEmpty(tests) ) {
            m.append("None yet.\n\n");
        } else {
            m.append("```json\n").append(limited("the tests", tests.toString(), MAX_TESTS)).append("\n```\n\n");
        }

        m.append("## What the learner said before\n\n");
        JSONArray said = data.optJSONArray("said");
        if ( said == null || said.length() == 0 ) {
            m.append("Nothing yet.\n\n");
        } else {
            for ( int i = Math.max(0, said.length() - MAX_SAID); i < said.length(); i++ ) {
                m.append("- ").append(quote(limited("a sentence", said.optString(i, ""), MAX_SENTENCE))).append('\n');
            }
            m.append('\n');
        }

        if ( !infer && !AiService.ANALYZE.equals(task) ) {
            m.append("## The analysis\n\n");
            JSONObject analysis = data.optJSONObject("analysis");
            m.append(analysis == null ? "None.\n\n" : "```json\n" + limited("the analysis", analysis.toString(), MAX_ANALYSIS) + "\n```\n\n");
        }

        if ( infer ) {
            String declined = optText(data, "declined");
            m.append("## Task: infer\n\n");
            m.append("The guess the learner declined: ").append(declined == null ? "none." : quote(limited("the declined guess", declined, MAX_GUESS))).append('\n');
        } else {
            String intent = optText(data, "intent");
            if ( intent == null ) {
                throw new AiException("bad_request", "the intent is missing");
            }
            String sentence = optText(data, "sentence");
            boolean fix = AiService.FIX.equals(task);
            m.append(fix ? "## Task: fix\n\n" : AiService.ANALYZE.equals(task) ? "## Task: analyze\n\n" : "## Task: generate\n\n");
            m.append("The intent you guessed: ").append(quote(limited("the intent", intent, MAX_GUESS))).append('\n');
            m.append(sentence == null ? "The learner wrote no sentence.\n" : "The learner's sentence: " + quote(limited("the sentence", sentence, MAX_SENTENCE)) + "\n");
            String notCovered = optText(data, "notCovered"); // the guess's not_covered, sent when the learner has tests: cut, not refused
            if ( !fix && notCovered != null ) {
                m.append("What the learner's tests don't check yet (your guess): ").append(quote(line(notCovered, MAX_GUESS))).append('\n');
            }
            if ( AiService.GENERATE.equals(task) ) {
                appendScenarios(m, data);
            }
            if ( fix ) {
                appendFix(m, data.optJSONObject("fix"));
            }
        }
        return m.toString();
    }

    /**
     * the program's decisions, as the browser found them in its blocks (every if, wait until and repeat while / until), with the ids of their
     * outcomes: the analysis and the tests name them
     */
    private static void appendDecisions(StringBuilder m, Object value) {
        m.append("## The program's decisions\n\n");
        if ( !(value instanceof JSONArray) ) {
            m.append("Not available.\n\n");
            return;
        }
        JSONArray decisions = (JSONArray) value;
        if ( decisions.length() > MAX_DECISIONS ) {
            throw new AiException("too_large", "at most " + MAX_DECISIONS + " decisions");
        }
        if ( decisions.length() == 0 ) {
            m.append("None: the program has no if, no wait until and no repeat while or until.\n\n");
            return;
        }
        for ( int i = 0; i < decisions.length(); i++ ) {
            JSONObject d = decisions.optJSONObject(i);
            String id = d == null ? null : optText(d, "id");
            String block = d == null ? null : optText(d, "block");
            JSONArray outcomes = d == null ? null : d.optJSONArray("outcomes");
            if ( id == null || !DECISION_ID.matcher(id).matches() || block == null || !BLOCK_ID.matcher(block).matches() || outcomes == null || outcomes.length() == 0 ) {
                throw new AiException("bad_request", "decision " + (i + 1) + " needs an id D<n>, a block b<n> and outcomes");
            }
            if ( outcomes.length() > MAX_OUTCOMES ) {
                throw new AiException("too_large", "decision " + id + " has more than " + MAX_OUTCOMES + " outcomes");
            }
            String label = optText(d, "label");
            m.append("- ").append(id).append(": block ").append(block).append(", ").append(line(d.optString("kind", ""), 20));
            m.append(label == null ? "" : " " + quote(line(label, MAX_LABEL))).append('\n');
            for ( int j = 0; j < outcomes.length(); j++ ) {
                JSONObject o = outcomes.optJSONObject(j);
                String oid = o == null ? null : optText(o, "id");
                if ( oid == null || !OUTCOME_ID.matcher(oid).matches() || !oid.startsWith(id + ".") ) {
                    throw new AiException("bad_request", "an outcome of " + id + " needs an id " + id + ".<outcome>");
                }
                m.append("  - ").append(oid).append(": ").append(line(o.optString("outcome", ""), MAX_LABEL)).append('\n');
            }
        }
        m.append('\n');
    }

    /**
     * generate: the scenarios of the analysis this call writes tests for (the browser makes one call per scenario that the learner's tests don't
     * test yet, in parallel), with their titles; none: all
     */
    private static void appendScenarios(StringBuilder m, JSONObject data) {
        JSONArray ids = data.optJSONArray("scenarios");
        if ( ids == null || ids.length() == 0 ) {
            return;
        }
        if ( ids.length() > MAX_SCENARIOS ) {
            throw new AiException("too_large", "at most " + MAX_SCENARIOS + " scenarios per call");
        }
        Map<String, String> titles = new HashMap<>();
        JSONObject analysis = data.optJSONObject("analysis");
        JSONArray scenarios = analysis == null ? null : analysis.optJSONArray("scenarios");
        for ( int i = 0; scenarios != null && i < scenarios.length(); i++ ) {
            JSONObject s = scenarios.optJSONObject(i);
            if ( s != null ) {
                titles.put(s.optString("id", ""), s.optString("title", ""));
            }
        }
        List<String> named = new ArrayList<>();
        for ( int i = 0; i < ids.length(); i++ ) {
            String id = ids.optString(i, "");
            if ( !SCENARIO_ID.matcher(id).matches() || !titles.containsKey(id) ) {
                throw new AiException("bad_request", "there is no scenario " + id + " in the analysis");
            }
            named.add(id + (titles.get(id).isEmpty() ? "" : " " + quote(line(titles.get(id), MAX_LABEL))));
        }
        int maxTests = data.optInt("maxTests", 0);
        m
            .append("Write tests only for ")
            .append(named.size() == 1 ? "scenario " : "scenarios ")
            .append(String.join(", ", named))
            .append(maxTests > 0 ? ", at most " + maxTests + " tests" : "")
            .append(": the analysis' other scenarios get their own calls, or the learner's tests already test them.\n");
        if ( data.optBoolean("followsLine", false) ) { // the browser found a block that runs and reads the line tracker
            m
                .append("The program follows a line (it reads the line tracker): every test starts on a line or close beside it, facing along it ")
                .append("(\"A line through the start\" in \"Tests\"), with the scenario's things on that line. On a plain floor it circles on the start.\n");
        }
    }

    /**
     * the sensors the program reads (the browser finds them in its blocks that run: nepoTest.aiStrategy sensorsRead), and what it therefore can't
     * notice (2026-11-06: a line follower that reads only the line tracker got a test in a dim tunnel)
     */
    private static void appendSensors(StringBuilder m, Object value) {
        if ( !(value instanceof JSONArray) ) {
            return;
        }
        JSONArray list = (JSONArray) value;
        List<String> read = new ArrayList<>();
        for ( int i = 0; i < list.length() && i < 20; i++ ) {
            String s = list.optString(i, "");
            if ( s.matches("[A-Z_]{1,20}") && !read.contains(s) ) {
                read.add(s);
            }
        }
        boolean line = read.contains("LINETRACKER");
        boolean light = read.contains("LLIGHT") || read.contains("RLIGHT");
        List<String> obstacles = new ArrayList<>();
        for ( String s : read ) {
            if ( s.startsWith("OBSTACLE_") ) {
                obstacles.add(s.substring("OBSTACLE_".length()));
            }
        }
        List<String> words = new ArrayList<>();
        if ( line ) {
            words.add("the line tracker (the brightness of the floor under it: black line, white band, peach floor)");
        }
        if ( light ) {
            words.add("the light sensors " + (read.contains("LLIGHT") ? "LLIGHT" : "") + (read.contains("LLIGHT") && read.contains("RLIGHT") ? " and " : "") + (read.contains("RLIGHT") ? "RLIGHT" : "") + " (the light from above: dim only inside a tunnel)");
        }
        if ( !obstacles.isEmpty() ) {
            words.add("the obstacle sensors " + String.join(", ", obstacles));
        }
        if ( read.contains("SOUND") ) {
            words.add("the sound sensor (claps)");
        }
        if ( read.contains("KEY") ) {
            words.add("the keys");
        }
        if ( read.contains("IR") ) {
            words.add("IR messages");
        }
        m.append("The sensors it reads: ").append(words.isEmpty() ? "none" : String.join("; ", words)).append(".\n");
        List<String> not = new ArrayList<>();
        if ( !light ) {
            not.add("no light sensor: dim light, which is only inside a tunnel, changes nothing it reads (the line tracker's light % is the floor, not dim light)");
        }
        if ( obstacles.isEmpty() ) {
            not.add("no obstacle sensor: it doesn't see walls or boxes, it only bumps into them");
        }
        if ( !line ) {
            not.add("not the line tracker: lines on the floor change nothing for it");
        }
        if ( !not.isEmpty() ) {
            m.append("It reads ").append(String.join("; ", not)).append(". Make no scenario, world or check about what it doesn't sense.\n");
        }
        m.append('\n');
    }

    /** the task fix: the failed tests, how they ran (one item each, its lines indented), the tests that passed */
    private static void appendFix(StringBuilder m, JSONObject fix) {
        JSONObject tests = fix == null ? null : fix.optJSONObject("tests");
        JSONArray worlds = tests == null ? null : tests.optJSONArray("worlds");
        JSONArray results = fix == null ? null : fix.optJSONArray("results");
        if ( worlds == null || worlds.length() == 0 || results == null || results.length() == 0 ) {
            throw new AiException("bad_request", "a fix needs the failed tests and how they ran");
        }
        if ( results.length() > MAX_RESULTS ) {
            throw new AiException("too_large", "a fix has at most " + MAX_RESULTS + " failed tests");
        }
        m.append("\nThese tests you wrote failed when they ran on the learner's program:\n\n");
        m.append("```json\n").append(limited("the failed tests", tests.toString(), MAX_TESTS)).append("\n```\n\n");
        m.append("How they ran:\n\n");
        for ( int i = 0; i < results.length(); i++ ) {
            String result = results.optString(i, "").replace("\r", "").trim();
            result = result.length() > MAX_RESULT ? result.substring(0, MAX_RESULT) + "\n…" : result; // cut, not refused: the fix would be lost
            m.append("- ").append(result.replace("\n", "\n  ")).append('\n');
        }
        JSONArray kept = fix.optJSONArray("kept");
        if ( kept != null && kept.length() > MAX_KEPT ) {
            throw new AiException("too_large", "a fix has at most " + MAX_KEPT + " tests that passed");
        }
        if ( kept == null || kept.length() == 0 ) {
            m.append("\nNo other test of your answer passed.\n");
        } else {
            m.append("\nThese tests of your answer passed, and the learner keeps them:\n\n");
            for ( int i = 0; i < kept.length(); i++ ) {
                JSONObject test = kept.optJSONObject(i);
                String name = test == null ? "" : test.optString("test", "");
                String world = test == null ? "" : test.optString("world", "");
                m.append("- ").append(quote(line(name, MAX_GUESS))).append(world.isEmpty() ? "" : " (world " + quote(line(world, MAX_GUESS)) + ")").append('\n');
            }
        }
    }

    /**
     * @param data the browser's data
     * @return the repair of a generate answer: {answer, problems} as the assistant's earlier answer and the message that lists the problems (at most
     *         {@link #MAX_PROBLEMS}, each cut at {@link #MAX_PROBLEM} characters), or null
     * @throws AiException bad_request, or too_large (the answer)
     */
    public static String[] repairMessages(JSONObject data) {
        JSONObject repair = data.optJSONObject("repair");
        if ( repair == null ) {
            return null;
        }
        JSONObject answer = repair.optJSONObject("answer");
        JSONArray problems = repair.optJSONArray("problems");
        if ( answer == null || problems == null || problems.length() == 0 ) {
            throw new AiException("bad_request", "a repair needs the answer and its problems");
        }
        // the problems are hints: too many or too long ones are cut, never refused (a refused repair loses the tests it would have saved)
        StringBuilder m = new StringBuilder("These problems were found in your answer:\n\n");
        int shown = Math.min(problems.length(), MAX_PROBLEMS);
        for ( int i = 0; i < shown; i++ ) {
            String problem = problems.optString(i, "").replaceAll("\\s+", " ").trim();
            m.append("- ").append(problem.length() > MAX_PROBLEM ? problem.substring(0, MAX_PROBLEM) + " …" : problem).append('\n');
        }
        if ( problems.length() > shown ) {
            m.append("- … and ").append(problems.length() - shown).append(" more problems like these\n");
        }
        m.append("\nAnswer again with the whole corrected answer.\n");
        return new String[] {
            limited("the answer to repair", answer.toString(), MAX_ANSWER),
            m.toString()
        };
    }

    /**
     * @param xml the program's XML (export or program block set)
     * @return the XML without positions, configuration, the blocks' data and namespaces (the block ids stay), one tag per line, indented by one space
     *         per level
     */
    public static String trimNepo(String xml) {
        if ( xml == null || xml.trim().isEmpty() ) {
            return "";
        }
        String s = CONFIG.matcher(xml).replaceAll("");
        s = DATA.matcher(s).replaceAll("");
        s = NOISE.matcher(s).replaceAll("");
        s = WRAPPERS.matcher(s).replaceAll("");
        s = BETWEEN_TAGS.matcher(s.trim()).replaceAll(">\n<");
        StringBuilder out = new StringBuilder();
        int depth = 0;
        for ( String line : s.split("\n") ) {
            line = line.trim();
            if ( line.isEmpty() ) {
                continue;
            }
            if ( line.startsWith("</") ) {
                depth = Math.max(0, depth - 1);
                indent(out, depth).append(line).append('\n');
                continue;
            }
            indent(out, depth).append(line).append('\n');
            if ( line.startsWith("<") && !line.startsWith("<?") && !line.endsWith("/>") && !line.contains("</") ) {
                depth++;
            }
        }
        return out.toString().trim();
    }

    /**
     * @param edpy the generated EdPy
     * @return the program's own part: what follows the fixed start-up (the helpers come before it); all of it if there is no fixed start-up
     */
    public static String trimEdpy(String edpy) {
        if ( edpy == null ) {
            return "";
        }
        String s = edpy.replace("\r\n", "\n");
        int end = s.indexOf(FIXED_START_END);
        if ( end >= 0 ) {
            s = s.substring(end + FIXED_START_END.length());
        }
        return s.replaceAll("^\\s*\n", "").replaceAll("\\s+$", "");
    }

    /**
     * @param content the model's answer to infer
     * @return {intent, confidence, ask, same_as_declined, not_covered}, checked, with the types of the schema
     * @throws AiException bad_answer
     */
    public static JSONObject checkInfer(String content) {
        JSONObject answer = parse(content);
        String intent = answer.optString("intent", "").trim();
        if ( intent.isEmpty() ) {
            throw new AiException("bad_answer", "the answer has no intent");
        }
        Object ask = answer.opt("ask");
        if ( !(ask instanceof Boolean) ) {
            throw new AiException("bad_answer", "the answer's ask is not true or false");
        }
        double confidence = answer.optDouble("confidence", Double.NaN);
        Object notCovered = answer.opt("not_covered");
        return new JSONObject()
            .put("intent", intent.length() > MAX_GUESS ? intent.substring(0, MAX_GUESS) : intent)
            .put("confidence", Double.isNaN(confidence) ? JSONObject.NULL : Math.max(0, Math.min(1, confidence)))
            .put("ask", ask)
            .put("same_as_declined", answer.optBoolean("same_as_declined", false))
            .put("not_covered", notCovered instanceof String && !((String) notCovered).trim().isEmpty() ? ((String) notCovered).trim() : JSONObject.NULL);
    }

    /**
     * @param content the model's answer to generate
     * @return the answer: an object with an array of worlds, each with an array of tests; no worlds only with generation_status no_valid_scenarios
     *         (the browser checks the rest)
     * @throws AiException bad_answer
     */
    public static JSONObject checkGenerate(String content) {
        JSONObject answer = parse(content);
        JSONArray worlds = answer.optJSONArray("worlds");
        boolean none = "no_valid_scenarios".equals(answer.optString("generation_status", ""));
        if ( worlds == null || worlds.length() == 0 && !none ) {
            throw new AiException("bad_answer", "the answer has no worlds");
        }
        if ( worlds.length() > 0 && none ) {
            throw new AiException("bad_answer", "the answer has worlds, but its generation_status is no_valid_scenarios");
        }
        for ( int i = 0; i < worlds.length(); i++ ) {
            JSONObject world = worlds.optJSONObject(i);
            if ( world == null || world.optJSONArray("tests") == null ) {
                throw new AiException("bad_answer", "world " + (i + 1) + " of the answer has no tests");
            }
        }
        return answer;
    }

    /**
     * @param content the model's answer to fix
     * @return the answer: {worlds: the fixed tests (each world with an array of tests; may be empty), program_wrong: [{test, world, reason}] (may be
     *         empty), doubtful: [{test, world, reason}] (may be empty)}, not all of them empty (the browser checks the rest)
     * @throws AiException bad_answer
     */
    public static JSONObject checkFix(String content) {
        JSONObject answer = parse(content);
        JSONArray worlds = optArray(answer, "worlds");
        for ( int i = 0; i < worlds.length(); i++ ) {
            JSONObject world = worlds.optJSONObject(i);
            if ( world == null || world.optJSONArray("tests") == null ) {
                throw new AiException("bad_answer", "world " + (i + 1) + " of the answer has no tests");
            }
        }
        JSONArray wrong = reasons(answer, "program_wrong");
        JSONArray doubtful = reasons(answer, "doubtful");
        if ( worlds.length() == 0 && wrong.length() == 0 && doubtful.length() == 0 ) {
            throw new AiException("bad_answer", "the answer fixes no test, and says of none that the program is wrong or that it expects too much");
        }
        return answer.put("worlds", worlds).put("program_wrong", wrong).put("doubtful", doubtful);
    }

    /** program_wrong or doubtful of a fix: [{test, world, reason}], each with a test and a reason (cut to MAX_REASON) */
    private static JSONArray reasons(JSONObject answer, String key) {
        JSONArray list = optArray(answer, key);
        for ( int i = 0; i < list.length(); i++ ) {
            JSONObject entry = list.optJSONObject(i);
            if ( entry == null || optText(entry, "test") == null || optText(entry, "reason") == null ) {
                throw new AiException("bad_answer", key + " " + (i + 1) + " of the answer has no test or no reason");
            }
            String reason = optText(entry, "reason");
            entry.put("reason", reason.length() > MAX_REASON ? reason.substring(0, MAX_REASON) : reason);
        }
        return list;
    }

    /**
     * @param content the model's answer to analyze
     * @return the answer: analysis_status ok or insufficient_evidence, likely_intent with a description, and the arrays decision_points,
     *         scenario_paths, scenarios, uncertainties and unsupported_features (empty if missing or null); the browser checks the rest against the
     *         program's decisions
     * @throws AiException bad_answer
     */
    public static JSONObject checkAnalyze(String content) {
        JSONObject answer = parse(content);
        String status = answer.optString("analysis_status", "");
        if ( !"ok".equals(status) && !"insufficient_evidence".equals(status) ) {
            throw new AiException("bad_answer", "the answer's analysis_status is not ok or insufficient_evidence");
        }
        JSONObject intent = answer.optJSONObject("likely_intent");
        if ( intent == null || optText(intent, "description") == null ) {
            throw new AiException("bad_answer", "the answer has no likely_intent with a description");
        }
        for ( String key : new String[] {
            "decision_points",
            "scenario_paths",
            "scenarios",
            "uncertainties",
            "unsupported_features"
        } ) {
            answer.put(key, optArray(answer, key));
        }
        if ( "ok".equals(status) && answer.getJSONArray("scenarios").length() == 0 ) {
            throw new AiException("bad_answer", "the analysis is ok but has no scenarios: give them, or say insufficient_evidence");
        }
        return answer;
    }

    /** an array of the answer: missing or null is empty */
    private static JSONArray optArray(JSONObject answer, String key) {
        Object value = answer.opt(key);
        if ( value == null || value == JSONObject.NULL ) {
            return new JSONArray();
        }
        if ( !(value instanceof JSONArray) ) {
            throw new AiException("bad_answer", "the answer's " + key + " is not an array");
        }
        return (JSONArray) value;
    }

    private static JSONObject parse(String content) {
        String s = content == null ? "" : content.trim();
        if ( s.startsWith("```") ) { // a model may wrap JSON into a Markdown block even in JSON mode
            s = s.replaceAll("^```[a-z]*\\s*", "").replaceAll("\\s*```$", "");
        }
        try {
            return new JSONObject(s);
        } catch ( JSONException e ) {
            throw new AiException("bad_answer", "the answer is not a JSON object: " + e.getMessage());
        }
    }

    private static String limited(String what, String text, int max) {
        if ( text.length() > max ) {
            throw new AiException("too_large", what + " is too long (" + text.length() + " characters, at most " + max + ")");
        }
        return text;
    }

    private static String optText(JSONObject data, String key) {
        Object value = data.opt(key);
        if ( !(value instanceof String) || ((String) value).trim().isEmpty() ) {
            return null;
        }
        return ((String) value).trim();
    }

    private static boolean isEmpty(Object tests) {
        if ( tests instanceof JSONArray ) {
            return ((JSONArray) tests).length() == 0;
        }
        if ( tests instanceof JSONObject ) {
            JSONArray worlds = ((JSONObject) tests).optJSONArray("worlds");
            return ((JSONObject) tests).length() == 0 || worlds != null && worlds.length() == 0 && ((JSONObject) tests).length() == 1;
        }
        return false;
    }

    private static String quote(String text) {
        return "\"" + line(text, Integer.MAX_VALUE).replace("\"", "'") + "\"";
    }

    private static String line(String text, int max) {
        String s = text.replaceAll("\\s+", " ").trim();
        return s.length() > max ? s.substring(0, max) : s;
    }

    private static StringBuilder indent(StringBuilder out, int depth) {
        for ( int i = 0; i < depth; i++ ) {
            out.append(' ');
        }
        return out;
    }
}
