package de.fhg.iais.roberta.ai;

import java.util.regex.Pattern;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * the per-call part of a prompt (the user message after the context pack) and the checks of the answers. The browser sends data, never prompt text:
 * <pre>
 * {level: {id, title, instructions, timeLimit, world},
 *  program: {nepo: the program XML, edpy: its EdPy},      at least one of them
 *  tests: the learner's tests as test JSON (or null),
 *  said: [the learner's earlier sentences about this program],
 *  fingerprint: the program's fingerprint (only logged),
 *  infer:    declined: the guess the learner declined (or null)
 *  generate: intent: the guess, sentence: the learner's sentence (or null),
 *            repair: {answer: the answer with problems, problems: ["...", ...]} (or null)}
 * </pre>
 * The NEPO XML loses its block ids, positions and configuration ({@link #trimNepo}), the EdPy its helpers and fixed start-up ({@link #trimEdpy}). The
 * format of the message is the one of the examples in the context pack (ai/examples), so change both together.
 */
public final class AiPrompts {
    public static final int MAX_LEVEL = 30000;
    public static final int MAX_NEPO = 60000; // longer: left out (the EdPy says the same)
    public static final int MAX_EDPY = 30000;
    public static final int MAX_TESTS = 60000;
    public static final int MAX_SENTENCE = 200;
    public static final int MAX_SAID = 5; // the last ones
    public static final int MAX_GUESS = 300;
    public static final int MAX_PROBLEMS = 30;
    public static final int MAX_PROBLEM = 300;
    public static final int MAX_ANSWER = 60000;

    private static final String FIXED_START_END = "Ed.TimeWait(250, Ed.TIME_MILLISECONDS)";
    private static final Pattern CONFIG = Pattern.compile("<config>.*?</config>", Pattern.DOTALL);
    private static final Pattern NOISE = Pattern.compile("\\s(id|x|y|intask|deletable|xmlns|xmlversion|description|tags)=\"[^\"]*\"");
    private static final Pattern WRAPPERS = Pattern.compile("</?(export|program)\\s*>");
    private static final Pattern BETWEEN_TAGS = Pattern.compile(">\\s*<");

    private AiPrompts() {
        // only static methods
    }

    /**
     * @param task {@link AiService#INFER} or {@link AiService#GENERATE}
     * @param data the browser's data (see the class comment)
     * @return the user message
     * @throws AiException bad_request (something required is missing) or too_large
     */
    public static String userMessage(String task, JSONObject data) {
        StringBuilder m = new StringBuilder();
        JSONObject level = data.optJSONObject("level");
        if ( level == null || level.optJSONObject("world") == null ) {
            throw new AiException("bad_request", "the level and its world are missing");
        }
        String world = limited("the level's world", level.getJSONObject("world").toString(), MAX_LEVEL);
        m.append("## The level\n\n");
        m.append("Title: ").append(line(level.optString("title", ""), MAX_GUESS)).append('\n');
        m.append("Instructions: ").append(line(level.optString("instructions", ""), MAX_LEVEL)).append('\n');
        double timeLimit = level.optDouble("timeLimit", 0);
        m.append("Time limit: ").append(timeLimit > 0 ? number(timeLimit) + " s" : "none").append('\n');
        m.append("World:\n```json\n").append(world).append("\n```\n\n");

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

        if ( AiService.INFER.equals(task) ) {
            String declined = optText(data, "declined");
            m.append("## Task: infer\n\n");
            m.append("The guess the learner declined: ").append(declined == null ? "none." : quote(limited("the declined guess", declined, MAX_GUESS))).append('\n');
        } else {
            String intent = optText(data, "intent");
            if ( intent == null ) {
                throw new AiException("bad_request", "the intent is missing");
            }
            String sentence = optText(data, "sentence");
            m.append("## Task: generate\n\n");
            m.append("The intent you guessed: ").append(quote(limited("the intent", intent, MAX_GUESS))).append('\n');
            m.append(sentence == null ? "The learner wrote no sentence.\n" : "The learner's sentence: " + quote(limited("the sentence", sentence, MAX_SENTENCE)) + "\n");
        }
        return m.toString();
    }

    /**
     * @param data the browser's data
     * @return the repair of a generate answer: {answer, problems} as the assistant's earlier answer and the message that lists the problems, or null
     * @throws AiException bad_request or too_large
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
        if ( problems.length() > MAX_PROBLEMS ) {
            throw new AiException("too_large", "a repair has at most " + MAX_PROBLEMS + " problems");
        }
        StringBuilder m = new StringBuilder("These problems were found in your answer:\n\n");
        for ( int i = 0; i < problems.length(); i++ ) {
            m.append("- ").append(line(limited("a problem", problems.optString(i, ""), MAX_PROBLEM), MAX_PROBLEM)).append('\n');
        }
        m.append("\nAnswer again with the whole corrected test JSON.\n");
        return new String[] {
            limited("the answer to repair", answer.toString(), MAX_ANSWER),
            m.toString()
        };
    }

    /**
     * @param xml the program's XML (export or program block set)
     * @return the XML without block ids, positions, configuration and namespaces, one tag per line, indented by one space per level
     */
    public static String trimNepo(String xml) {
        if ( xml == null || xml.trim().isEmpty() ) {
            return "";
        }
        String s = CONFIG.matcher(xml).replaceAll("");
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
     * @return the answer: an object with an array of worlds, each with an array of tests (the browser checks the rest)
     * @throws AiException bad_answer
     */
    public static JSONObject checkGenerate(String content) {
        JSONObject answer = parse(content);
        JSONArray worlds = answer.optJSONArray("worlds");
        if ( worlds == null || worlds.length() == 0 ) {
            throw new AiException("bad_answer", "the answer has no worlds");
        }
        for ( int i = 0; i < worlds.length(); i++ ) {
            JSONObject world = worlds.optJSONObject(i);
            if ( world == null || world.optJSONArray("tests") == null ) {
                throw new AiException("bad_answer", "world " + (i + 1) + " of the answer has no tests");
            }
        }
        return answer;
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

    private static String number(double value) {
        return value == Math.rint(value) ? String.valueOf((long) value) : String.valueOf(value);
    }

    private static StringBuilder indent(StringBuilder out, int depth) {
        for ( int i = 0; i < depth; i++ ) {
            out.append(' ');
        }
        return out;
    }
}
