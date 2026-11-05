package de.fhg.iais.roberta.ai;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.Executors;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Assert;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.slf4j.LoggerFactory;

import com.sun.net.httpserver.HttpServer;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import de.fhg.iais.roberta.javaServer.restServices.all.controller.AiResponse;
import de.fhg.iais.roberta.main.EnvFile;
import de.fhg.iais.roberta.util.ServerProperties;
import de.fhg.iais.roberta.util.Util;

/**
 * the AI test assistant against a fake DeepSeek (a local HTTP server that answers as scripted): the calls DeepSeek gets, the checked answers, the
 * retries and errors, and that the API key is never logged and never reaches the browser or the telemetry
 */
public class AiServiceTest {
    private static final String KEY = "sk-test-0123456789abcdef";
    private static final String EDPY =
        "import Ed\n\ndef _shorten(num): \n    return ((num+5)/10)\n\nEd.EdisonVersion = Ed.V2\nEd.TimeWait(250, Ed.TIME_MILLISECONDS)\n\nwhile True:\n    _diffDrive(Ed.FORWARD, 40, Ed.DISTANCE_UNLIMITED)\n";

    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    private HttpServer server;
    private final Deque<Object[]> answers = new ArrayDeque<>(); // {status, body, delay ms}
    private final List<JSONObject> requests = new ArrayList<>(); // {path, authorization, body}

    @Before
    public void startFakeDeepSeek() throws IOException {
        this.server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        this.server.createContext("/", exchange -> {
            String body;
            try (InputStream in = exchange.getRequestBody()) {
                body = new String(readAll(in), StandardCharsets.UTF_8);
            }
            synchronized ( this.requests ) {
                this.requests
                    .add(
                        new JSONObject()
                            .put("path", exchange.getRequestURI().getPath())
                            .put("method", exchange.getRequestMethod())
                            .put("authorization", String.valueOf(exchange.getRequestHeaders().getFirst("Authorization")))
                            .put("body", body));
            }
            Object[] answer;
            synchronized ( this.answers ) {
                answer = this.answers.isEmpty() ? new Object[] {500, "{\"error\": \"nothing scripted\"}", 0} : this.answers.removeFirst();
            }
            sleep((Integer) answer[2]);
            byte[] bytes = ((String) answer[1]).getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders((Integer) answer[0], bytes.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(bytes);
            } catch ( IOException e ) {
                // the client gave up (a timeout)
            }
        });
        this.server.setExecutor(Executors.newCachedThreadPool()); // a request that waits (a timeout) doesn't hold up the next
        this.server.start();
    }

    @After
    public void stopFakeDeepSeek() {
        this.server.stop(0);
    }

    private String url() {
        return "http://127.0.0.1:" + this.server.getAddress().getPort() + "/";
    }

    private AiService service(String key) {
        AiService service = new AiService(new AiSettings(url(), "deepseek-flash", key, false, null, this.folder.getRoot().getPath(), "low", "high"), 10);
        service.setTimeouts(1500, 1500);
        return service;
    }

    private static final String UCLOUD_KEY = "sk-ucloud-fedcba9876543210";
    private static final String SDU_MODEL = "deepseek-ai/DeepSeek-V4.1-Flash-1017";

    /**
     * DeepSeek at {url}/deepseek first (efforts as preset: low, low, none, low), then UCloud at {url}/ucloud (generate at high, to tell them apart);
     * the same fake server: the path tells them apart
     */
    private AiService serviceWithTwo() {
        AiSettings settings =
            new AiSettings(
                Arrays
                    .asList(
                        new AiSettings.Provider("deepseek", url() + "deepseek", "deepseek-flash", KEY, AiSettings.efforts("low", "low", "none", "low")),
                        new AiSettings.Provider("ucloud", url() + "ucloud", SDU_MODEL, UCLOUD_KEY, AiSettings.efforts("low", "low", "high", "low"))),
                false,
                null,
                this.folder.getRoot().getPath());
        AiService service = new AiService(settings, 10);
        service.setTimeouts(1500, 1500);
        return service;
    }

    /** an answer as SDU's vLLM gives it: the reasoning in "reasoning", no reasoning tokens, the cached tokens in prompt_tokens_details */
    private static String vllmCompletion(JSONObject content) {
        return new JSONObject()
            .put("model", SDU_MODEL)
            .put(
                "choices",
                new JSONArray()
                    .put(
                        new JSONObject()
                            .put("index", 0)
                            .put("finish_reason", "stop")
                            .put("message", new JSONObject().put("role", "assistant").put("content", content.toString()).put("reasoning", "We need JSON."))))
            .put(
                "usage",
                new JSONObject()
                    .put("prompt_tokens", 9000)
                    .put("completion_tokens", 120)
                    .put("prompt_tokens_details", new JSONObject().put("cached_tokens", 8704)))
            .toString();
    }

    private void script(int status, String body) {
        this.answers.add(new Object[] {status, body, 0});
    }

    private static String completion(JSONObject content, String finishReason) {
        return completion(content.toString(), finishReason);
    }

    private static String completion(String content, String finishReason) {
        return new JSONObject()
            .put("id", "x")
            .put("model", "deepseek-flash")
            .put(
                "choices",
                new JSONArray()
                    .put(
                        new JSONObject()
                            .put("index", 0)
                            .put("finish_reason", finishReason)
                            .put("message", new JSONObject().put("role", "assistant").put("content", content).put("reasoning_content", "I think."))))
            .put(
                "usage",
                new JSONObject()
                    .put("prompt_tokens", 9000)
                    .put("completion_tokens", 120)
                    .put("prompt_cache_hit_tokens", 8960)
                    .put("prompt_cache_miss_tokens", 40)
                    .put("completion_tokens_details", new JSONObject().put("reasoning_tokens", 80)))
            .toString();
    }

    private static JSONObject inferAnswer() {
        return new JSONObject()
            .put("intent", "Follow the black line to Goal 1.")
            .put("confidence", 0.8)
            .put("ask", true)
            .put("same_as_declined", false)
            .put("not_covered", "There are no tests yet.");
    }

    private static JSONObject generateAnswer() {
        JSONObject test =
            new JSONObject()
                .put("name", "From A, it reaches Goal 1")
                .put("scenario", "Given …")
                .put("start", "A")
                .put("until", "g1")
                .put("max_time_ms", 30000)
                .put("checks", new JSONArray().put(new JSONObject().put("check", "reaches").put("item", "g1")));
        return new JSONObject()
            .put("worlds", new JSONArray().put(new JSONObject().put("name", "Follow the line").put("base", "level").put("tests", new JSONArray().put(test))));
    }

    private static JSONObject data() {
        return new JSONObject()
            .put("levelId", "01-first-steps/04-follow")
            .put(
                "program",
                new JSONObject()
                    .put(
                        "nepo",
                        "<export xmlns=\"http://de.fhg.iais.roberta.blockly\"><program><block_set xmlns=\"http://de.fhg.iais.roberta.blockly\" robottype=\"edison\" xmlversion=\"3.1\" description=\"\" tags=\"\"><instance x=\"384\" y=\"50\"><block type=\"robControls_start\" id=\"Pd1\" intask=\"true\" deletable=\"false\"><mutation declare=\"false\"></mutation><field name=\"DEBUG\">FALSE</field></block><block type=\"robActions_motorDiff_on\" id=\"Pd2\" intask=\"true\"><field name=\"DIRECTION\">FOREWARD</field><value name=\"POWER\"><block type=\"math_number\" id=\"Pd3\" intask=\"true\"><field name=\"NUM\">40</field></block></value></block></instance></block_set></program><config><block_set xmlns=\"http://de.fhg.iais.roberta.blockly\" robottype=\"edison\"><instance x=\"0\" y=\"0\"><block type=\"robBrick_Edison-Brick\" id=\"1\" intask=\"true\" deletable=\"false\"></block></instance></block_set></config></export>")
                    .put("edpy", EDPY))
            .put("tests", JSONObject.NULL)
            .put("said", new JSONArray())
            .put("fingerprint", "f00d");
    }

    @Test
    public void inferSendsThePackFirstAndReturnsTheCheckedAnswer() throws Exception {
        script(200, completion(inferAnswer(), "stop"));
        AiService service = service(KEY);
        AiService.Outcome outcome = service.call(AiService.INFER, 7, data().put("declined", "Drive to the goal."));
        Assert.assertTrue(outcome.message, outcome.ok);
        Assert.assertEquals("Follow the black line to Goal 1.", outcome.answer.getString("intent"));
        Assert.assertTrue(outcome.answer.getBoolean("ask"));
        Assert.assertEquals(8960, outcome.meta.getJSONObject("tokens").getInt("cached"));
        Assert.assertEquals(80, outcome.meta.getJSONObject("tokens").getInt("reasoning"));
        Assert.assertEquals(service.pack().getVersion(), outcome.meta.getString("promptVersion"));

        Assert.assertEquals(1, this.requests.size());
        JSONObject request = this.requests.get(0);
        Assert.assertEquals("/chat/completions", request.getString("path"));
        Assert.assertEquals("Bearer " + KEY, request.getString("authorization"));
        JSONObject body = new JSONObject(request.getString("body"));
        Assert.assertEquals("deepseek-flash", body.getString("model"));
        Assert.assertEquals("json_object", body.getJSONObject("response_format").getString("type"));
        Assert.assertEquals("low", body.getString("reasoning_effort"));
        JSONArray messages = body.getJSONArray("messages");
        Assert.assertEquals(2, messages.length());
        Assert.assertEquals("system", messages.getJSONObject(0).getString("role"));
        Assert.assertEquals(service.pack().getText(), messages.getJSONObject(0).getString("content"));
        String prompt = messages.getJSONObject(1).getString("content");
        Assert.assertTrue(prompt.startsWith("## The program\n\nNEPO:\n```xml\n<block_set robottype=\"edison\">"));
        Assert.assertFalse(prompt.contains("01-first-steps"));
        Assert.assertTrue(prompt.contains("<block type=\"robActions_motorDiff_on\" id=\"Pd2\">")); // the ids stay: the analysis names blocks by them
        Assert.assertFalse(prompt.contains("## The program's decisions")); // only for analyze, generate and fix
        Assert.assertFalse(prompt.contains("## The analysis"));
        Assert.assertFalse(prompt.contains("robBrick_Edison-Brick"));
        Assert.assertTrue(prompt.contains("EdPy:\n```python\nwhile True:\n    _diffDrive(Ed.FORWARD, 40, Ed.DISTANCE_UNLIMITED)\n```"));
        Assert.assertFalse(prompt.contains("_shorten"));
        Assert.assertTrue(prompt.contains("## The learner's tests\n\nNone yet."));
        Assert.assertTrue(prompt.endsWith("## Task: infer\n\nThe guess the learner declined: \"Drive to the goal.\"\n"));

        JSONObject event = outcome.event;
        Assert.assertEquals("ai_call", event.getString("kind"));
        Assert.assertTrue(event.getBoolean("ai"));
        Assert.assertEquals("infer", event.getString("call"));
        Assert.assertEquals("ok", event.getString("status"));
        Assert.assertEquals("01-first-steps/04-follow", event.getString("level"));
        Assert.assertEquals("f00d", event.getString("fingerprint"));
        Assert.assertEquals(prompt, event.getString("prompt"));
        Assert.assertEquals(inferAnswer().toString(), event.getString("answer"));
        Assert.assertEquals("I think.", event.getString("reasoning"));
        Assert.assertEquals(outcome.meta.getString("callId"), event.getString("callId"));
    }

    @Test
    public void theModelGetsNothingOfTheLevel() throws Exception {
        script(200, completion(inferAnswer(), "stop"));
        JSONObject level =
            new JSONObject()
                .put("id", "01-first-steps/02-around-the-red-area")
                .put("title", "Around the red area")
                .put("instructions", "Drive around it to the green area.")
                .put("timeLimit", 15)
                .put("world", new JSONObject().put("background", "peach").put("items", new JSONArray().put(new JSONObject().put("id", "secretGoal"))));
        AiService.Outcome outcome = service(KEY).call(AiService.INFER, 1, data().put("level", level));
        Assert.assertTrue(outcome.message, outcome.ok);
        String body = this.requests.get(0).getString("body");
        for ( String secret : new String[] {
            "01-first-steps",
            "Around the red area",
            "Drive around it",
            "secretGoal",
            "Time limit"
        } ) {
            Assert.assertFalse(secret, body.contains(secret));
        }
        Assert.assertEquals("01-first-steps/04-follow", outcome.event.getString("level")); // logged: levelId
    }

    @Test
    public void generateWithARepairIsAConversation() throws Exception {
        script(200, completion(generateAnswer(), "stop"));
        JSONObject data =
            data()
                .put("intent", "Follow the black line to Goal 1.")
                .put("sentence", "This program should follow a black line and stop if it senses an obstacle")
                .put("said", new JSONArray().put("It follows the line."))
                .put("repair", new JSONObject().put("answer", generateAnswer()).put("problems", new JSONArray().put("test \"From A\": start C is not in the world")));
        AiService.Outcome outcome = service(KEY).call(AiService.GENERATE, 7, data);
        Assert.assertTrue(outcome.message, outcome.ok);
        Assert.assertEquals("Follow the line", outcome.answer.getJSONArray("worlds").getJSONObject(0).getString("name"));
        JSONObject body = new JSONObject(this.requests.get(0).getString("body"));
        Assert.assertEquals("high", body.getString("reasoning_effort"));
        JSONArray messages = body.getJSONArray("messages");
        Assert.assertEquals(4, messages.length());
        String prompt = messages.getJSONObject(1).getString("content");
        Assert.assertTrue(prompt.contains("## What the learner said before\n\n- \"It follows the line.\"\n"));
        Assert.assertTrue(
            prompt
                .endsWith(
                    "## Task: generate\n\nThe intent you guessed: \"Follow the black line to Goal 1.\"\nThe learner's sentence: \"This program should follow a black line and stop if it senses an obstacle\"\n"));
        Assert.assertEquals("assistant", messages.getJSONObject(2).getString("role"));
        Assert.assertEquals(generateAnswer().toString(), messages.getJSONObject(2).getString("content"));
        Assert.assertTrue(messages.getJSONObject(3).getString("content").contains("- test \"From A\": start C is not in the world\n"));
        Assert.assertTrue(outcome.event.getString("repair").startsWith("These problems were found"));
        Assert.assertTrue(messages.getJSONObject(3).getString("content").endsWith("Answer again with the whole corrected answer.\n"));
        Assert.assertTrue(prompt.contains("## The program's decisions\n\nNot available.\n\n"));
        Assert.assertTrue(prompt.contains("## The analysis\n\nNone.\n\n## Task: generate"));
        Assert.assertEquals(AiService.CONTRACT, outcome.meta.getString("contract"));
    }

    private static JSONArray decisions() {
        return new JSONArray()
            .put(
                new JSONObject()
                    .put("id", "D1")
                    .put("block", "b3")
                    .put("kind", "if")
                    .put("label", "if get line light senso...")
                    .put(
                        "outcomes",
                        new JSONArray()
                            .put(new JSONObject().put("id", "D1.1").put("outcome", "the condition holds"))
                            .put(new JSONObject().put("id", "D1.else").put("outcome", "the condition doesn't hold: the else part runs"))));
    }

    private static JSONObject analyzeAnswer() {
        return new JSONObject()
            .put("analysis_status", "ok")
            .put("likely_intent", new JSONObject().put("description", "Follow the line.").put("confidence", "high").put("basis", "inferred_from_program"))
            .put("program_facts", new JSONObject())
            .put("decision_points", new JSONArray())
            .put("scenario_paths", new JSONArray())
            .put("scenarios", new JSONArray().put(new JSONObject().put("id", "S1")));
    }

    @Test
    public void analyzeSendsTheProgramsDecisions() throws Exception {
        script(200, completion(analyzeAnswer(), "stop"));
        AiService service = service(KEY);
        JSONObject data = data().put("intent", "Follow the black line.").put("sentence", JSONObject.NULL).put("decisions", decisions());
        AiService.Outcome outcome = service.call(AiService.ANALYZE, 7, data);
        Assert.assertTrue(outcome.message, outcome.ok);
        Assert.assertEquals("analyze", outcome.event.getString("call"));
        Assert.assertEquals(0, outcome.answer.getJSONArray("uncertainties").length()); // missing: empty
        JSONObject body = new JSONObject(this.requests.get(0).getString("body"));
        Assert.assertEquals("high", body.getString("reasoning_effort")); // as generate
        String prompt = body.getJSONArray("messages").getJSONObject(1).getString("content");
        Assert
            .assertTrue(
                prompt,
                prompt
                    .contains(
                        "\n\n## The program's decisions\n\n- D1: block b3, if \"if get line light senso...\"\n  - D1.1: the condition holds\n  - D1.else: the condition doesn't hold: the else part runs\n\n## The learner's tests"));
        Assert.assertFalse(prompt.contains("## The analysis"));
        Assert.assertTrue(prompt, prompt.endsWith("## Task: analyze\n\nThe intent you guessed: \"Follow the black line.\"\nThe learner wrote no sentence.\n"));

        script(200, completion(analyzeAnswer().put("scenarios", new JSONArray()), "stop"));
        Assert.assertEquals("bad_answer", service.call(AiService.ANALYZE, 7, data).error); // ok, but no scenarios
        script(200, completion(analyzeAnswer().put("analysis_status", "maybe"), "stop"));
        Assert.assertEquals("bad_answer", service.call(AiService.ANALYZE, 7, data).error);
        script(200, completion(analyzeAnswer().put("analysis_status", "insufficient_evidence").put("scenarios", new JSONArray()), "stop"));
        Assert.assertTrue(service.call(AiService.ANALYZE, 7, data).ok);
        JSONArray bad = decisions();
        bad.getJSONObject(0).getJSONArray("outcomes").getJSONObject(1).put("id", "D2.else");
        Assert.assertEquals("bad_request", service.call(AiService.ANALYZE, 7, data().put("intent", "Drive.").put("decisions", bad)).error); // not an outcome of D1
        Assert.assertEquals(4, this.requests.size());

        script(200, completion(generateAnswer(), "stop"));
        JSONObject generate = data().put("intent", "Follow the black line.").put("decisions", decisions()).put("analysis", analyzeAnswer());
        Assert.assertTrue(service.call(AiService.GENERATE, 7, generate).ok);
        String prompt2 = new JSONObject(this.requests.get(4).getString("body")).getJSONArray("messages").getJSONObject(1).getString("content");
        Assert.assertTrue(prompt2, prompt2.contains("## The analysis\n\n```json\n" + analyzeAnswer() + "\n```\n\n## Task: generate"));
    }

    @Test
    public void fixSendsTheFailedTestsAndHowTheyRan() throws Exception {
        JSONObject answer =
            new JSONObject()
                .put("worlds", new JSONArray())
                .put("program_wrong", new JSONArray().put(new JSONObject().put("test", "From A, it reaches Goal 1").put("world", "Follow the line").put("reason", "It never reads the line tracker.")));
        script(200, completion(answer, "stop"));
        JSONObject failed = generateAnswer();
        JSONObject fix =
            new JSONObject()
                .put("tests", failed)
                .put("results", new JSONArray().put("test \"From A, it reaches Goal 1\" (world \"Follow the line\"): failed\nChecks:\n- failed: the robot did not reach \"Goal 1\""))
                .put("kept", new JSONArray().put(new JSONObject().put("test", "Stops at the box").put("world", "A box")));
        JSONObject data = data().put("intent", "Follow the black line to Goal 1.").put("sentence", JSONObject.NULL).put("fix", fix);
        AiService service = service(KEY);
        AiService.Outcome outcome = service.call(AiService.FIX, 7, data);
        Assert.assertTrue(outcome.message, outcome.ok);
        Assert.assertEquals(0, outcome.answer.getJSONArray("worlds").length());
        Assert.assertEquals("It never reads the line tracker.", outcome.answer.getJSONArray("program_wrong").getJSONObject(0).getString("reason"));
        Assert.assertEquals("fix", outcome.event.getString("call"));
        JSONObject body = new JSONObject(this.requests.get(0).getString("body"));
        Assert.assertEquals("high", body.getString("reasoning_effort")); // as generate
        JSONArray messages = body.getJSONArray("messages");
        Assert.assertEquals(2, messages.length());
        String prompt = messages.getJSONObject(1).getString("content");
        Assert.assertTrue(prompt, prompt.contains("## Task: fix\n\nThe intent you guessed: \"Follow the black line to Goal 1.\"\nThe learner wrote no sentence.\n"));
        Assert.assertTrue(prompt, prompt.contains("These tests you wrote failed when they ran on the learner's program:\n\n```json\n" + failed + "\n```\n"));
        Assert
            .assertTrue(
                prompt,
                prompt.contains("How they ran:\n\n- test \"From A, it reaches Goal 1\" (world \"Follow the line\"): failed\n  Checks:\n  - failed: the robot did not reach \"Goal 1\"\n"));
        Assert.assertTrue(prompt, prompt.endsWith("These tests of your answer passed, and the learner keeps them:\n\n- \"Stops at the box\" (world \"A box\")\n"));
        Assert.assertFalse(prompt.contains("01-first-steps"));

        script(200, completion(new JSONObject().put("worlds", new JSONArray()).put("program_wrong", new JSONArray()), "stop"));
        Assert.assertEquals("bad_answer", service.call(AiService.FIX, 7, data).error); // fixes nothing, flags nothing
        script(200, completion(generateAnswer(), "stop"));
        AiService.Outcome fixed = service.call(AiService.FIX, 7, data);
        Assert.assertTrue(fixed.message, fixed.ok);
        Assert.assertEquals(0, fixed.answer.getJSONArray("program_wrong").length()); // missing: none
        Assert.assertEquals(0, fixed.answer.getJSONArray("doubtful").length());
        Assert.assertEquals("bad_request", service.call(AiService.FIX, 7, data().put("intent", "Drive.")).error); // no failed tests
        Assert.assertEquals(3, this.requests.size());
    }

    @Test
    public void aServerErrorIsTriedOnceMore() {
        script(503, "{\"error\": \"busy\"}");
        script(200, completion(inferAnswer(), "stop"));
        AiService.Outcome outcome = service(KEY).call(AiService.INFER, 1, data());
        Assert.assertTrue(outcome.message, outcome.ok);
        Assert.assertEquals(2, outcome.meta.getInt("attempts"));
        Assert.assertEquals(2, this.requests.size());
    }

    @Test
    public void tooManyRequestsTwiceFails() {
        script(429, "{\"error\": \"rate limit\"}");
        script(429, "{\"error\": \"rate limit\"}");
        AiService.Outcome outcome = service(KEY).call(AiService.INFER, 1, data());
        Assert.assertFalse(outcome.ok);
        Assert.assertEquals("http_429", outcome.error);
        Assert.assertEquals(2, this.requests.size());
        Assert.assertEquals("error", outcome.event.getString("status"));
    }

    @Test
    public void aBadKeyIsNotTriedAgain() {
        script(401, "{\"error\": {\"message\": \"Authentication Fails, your api key: " + KEY + " is invalid\"}}");
        AiService.Outcome outcome = service(KEY).call(AiService.INFER, 1, data());
        Assert.assertEquals("http_401", outcome.error);
        Assert.assertEquals(1, this.requests.size());
        Assert.assertFalse(outcome.message.contains(KEY));
        Assert.assertTrue(outcome.message.contains("***"));
    }

    @Test
    public void aTimeoutIsNotTriedAgain() {
        this.answers.add(new Object[] {200, completion(inferAnswer(), "stop"), 3000});
        AiService.Outcome outcome = service(KEY).call(AiService.INFER, 1, data());
        Assert.assertEquals("timeout", outcome.error);
        Assert.assertEquals(1, this.requests.size());
    }

    @Test
    public void answersThatCantBeUsed() {
        script(200, completion("Sure! Here are your tests.", "stop"));
        AiService.Outcome notJson = service(KEY).call(AiService.INFER, 1, data());
        Assert.assertEquals("bad_answer", notJson.error);
        Assert.assertEquals("Sure! Here are your tests.", notJson.event.getString("answer"));

        script(200, completion("{\"worlds\": [{\"name\": \"w\", \"tes", "length"));
        AiService.Outcome cutOff = service(KEY).call(AiService.GENERATE, 1, data().put("intent", "Drive."));
        Assert.assertEquals("cut_off", cutOff.error);

        script(200, completion(new JSONObject().put("intent", "Drive.").put("ask", "maybe"), "stop"));
        Assert.assertEquals("bad_answer", service(KEY).call(AiService.INFER, 1, data()).error);

        script(200, completion("```json\n" + generateAnswer() + "\n```", "stop"));
        Assert.assertTrue(service(KEY).call(AiService.GENERATE, 1, data().put("intent", "Drive.")).ok);
    }

    @Test
    public void requestsThatCantBeMade() {
        Assert.assertEquals("not_configured", service(null).call(AiService.INFER, 1, data()).error);
        AiService service = service(KEY);
        Assert.assertEquals("bad_request", service.call(AiService.INFER, 1, data().put("program", new JSONObject())).error);
        Assert.assertEquals("bad_request", service.call(AiService.GENERATE, 1, data()).error); // no intent
        String tooLong = String.join("", Collections.nCopies(201, "x"));
        Assert.assertEquals("too_large", service.call(AiService.GENERATE, 1, data().put("intent", "Drive.").put("sentence", tooLong)).error);
        Assert.assertEquals("bad_request", service.call("delete", 1, data()).error);
        Assert.assertEquals(0, this.requests.size());
    }

    @Test
    public void limitsPerSession() {
        long[] now = {0};
        Map<String, Integer> perHour = new HashMap<>();
        perHour.put(AiService.INFER, 2);
        AiLimits limits = new AiLimits(perHour, () -> now[0]);
        Assert.assertNull(limits.acquire(1, AiService.INFER));
        Assert.assertEquals("busy", limits.acquire(1, AiService.INFER));
        Assert.assertNull(limits.acquire(2, AiService.INFER)); // another session
        limits.release(1, AiService.INFER);
        Assert.assertNull(limits.acquire(1, AiService.INFER));
        limits.release(1, AiService.INFER);
        Assert.assertEquals("limit", limits.acquire(1, AiService.INFER));
        Assert.assertEquals("limit", limits.acquire(1, AiService.GENERATE)); // no calls of this kind allowed
        now[0] = 3600 * 1000L + 1;
        Assert.assertNull(limits.acquire(1, AiService.INFER));
    }

    @Test
    public void generateWritesTestsForTheScenariosItIsGiven() throws Exception {
        // 2026-11-05: one call per scenario, so unrelated scenarios aren't crammed into one world, and each call fits the token cap at effort low
        JSONObject analysis =
            analyzeAnswer()
                .put(
                    "scenarios",
                    new JSONArray().put(new JSONObject().put("id", "S1").put("title", "Follows the line")).put(new JSONObject().put("id", "S2").put("title", "Stops at a wall")));
        script(200, completion(generateAnswer(), "stop"));
        AiService service = service(KEY);
        JSONObject data = data().put("intent", "Drive.").put("analysis", analysis).put("scenarios", new JSONArray().put("S2")).put("maxTests", 4);
        Assert.assertTrue(service.call(AiService.GENERATE, 7, data).ok);
        String prompt = new JSONObject(this.requests.get(0).getString("body")).getJSONArray("messages").getJSONObject(1).getString("content");
        Assert
            .assertTrue(
                prompt,
                prompt
                    .endsWith(
                        "Write tests only for scenario S2 \"Stops at a wall\", at most 4 tests: the analysis' other scenarios get their own calls, or the learner's tests already test them.\n"));
        Assert.assertEquals("bad_request", service.call(AiService.GENERATE, 7, new JSONObject(data.toString()).put("scenarios", new JSONArray().put("S9"))).error);
        Assert.assertEquals(1, this.requests.size());
        // a program that follows a line: every test starts on one (2026-11-05: a wall test on a plain floor circled on its start)
        script(200, completion(generateAnswer(), "stop"));
        Assert.assertTrue(service.call(AiService.GENERATE, 7, new JSONObject(data.toString()).put("followsLine", true)).ok);
        String line = new JSONObject(this.requests.get(1).getString("body")).getJSONArray("messages").getJSONObject(1).getString("content");
        Assert.assertTrue(line, line.endsWith("On a plain floor it circles on the start.\n"));
        Assert.assertTrue(line.contains("The program follows a line (it reads the line tracker): every test starts on a line"));
        Assert.assertFalse(prompt.contains("follows a line"));
    }

    @Test
    public void generateMayRunSixCallsAtOnceTheOthersOne() {
        Map<String, Integer> perHour = new HashMap<>();
        perHour.put(AiService.GENERATE, 100);
        perHour.put(AiService.INFER, 100);
        AiLimits limits = new AiLimits(perHour, Collections.singletonMap(AiService.GENERATE, AiService.GENERATE_AT_ONCE), () -> 0L);
        for ( int i = 0; i < AiService.GENERATE_AT_ONCE; i++ ) {
            Assert.assertNull(limits.acquire(1, AiService.GENERATE));
        }
        Assert.assertEquals("busy", limits.acquire(1, AiService.GENERATE));
        Assert.assertNull(limits.acquire(2, AiService.GENERATE)); // another session
        limits.release(1, AiService.GENERATE);
        Assert.assertNull(limits.acquire(1, AiService.GENERATE));
        Assert.assertNull(limits.acquire(1, AiService.INFER));
        Assert.assertEquals("busy", limits.acquire(1, AiService.INFER)); // one at a time
    }

    @Test
    public void analyzeAndGenerateGetWhatTheLearnersTestsDontCheckYet() throws Exception {
        // 2026-11-05: without it, every offer wrote the line-following tests the learner already had again
        String gap = "No test checks that your robot turns away from a wall on its left when the light is dim.";
        script(200, completion(analyzeAnswer(), "stop"));
        script(200, completion(generateAnswer(), "stop"));
        script(200, completion(inferAnswer(), "stop"));
        AiService service = service(KEY);
        JSONObject data = data().put("intent", "Follow the line.").put("sentence", JSONObject.NULL).put("decisions", decisions()).put("notCovered", gap);
        Assert.assertTrue(service.call(AiService.ANALYZE, 7, data).ok);
        Assert.assertTrue(service.call(AiService.GENERATE, 7, new JSONObject(data.toString()).put("analysis", analyzeAnswer())).ok);
        Assert.assertTrue(service.call(AiService.INFER, 7, data().put("notCovered", gap)).ok);
        String line = "What the learner's tests don't check yet (your guess): \"" + gap + "\"\n";
        for ( int i = 0; i < 2; i++ ) {
            String prompt = new JSONObject(this.requests.get(i).getString("body")).getJSONArray("messages").getJSONObject(1).getString("content");
            Assert.assertTrue(prompt, prompt.endsWith("The learner wrote no sentence.\n" + line));
        }
        String infer = new JSONObject(this.requests.get(2).getString("body")).getJSONArray("messages").getJSONObject(1).getString("content");
        Assert.assertFalse(infer.contains("don't check yet")); // infer finds the gap itself
        script(200, completion(generateAnswer(), "stop"));
        Assert.assertTrue(service.call(AiService.GENERATE, 7, data().put("intent", "Drive.").put("notCovered", String.join("", Collections.nCopies(400, "x")))).ok);
        String cut = new JSONObject(this.requests.get(3).getString("body")).getJSONArray("messages").getJSONObject(1).getString("content");
        Assert.assertTrue(cut.endsWith("(your guess): \"" + String.join("", Collections.nCopies(AiPrompts.MAX_GUESS, "x")) + "\"\n")); // cut, not refused
    }

    @Test
    public void theAiCallsTrustTheUniversitysRootBesidesTheJdks() {
        // 2026-11-05: JDK 13.0.2 doesn't trust HARICA, which signs SDU's certificate: every call went to the fallback ("PKIX path building failed")
        javax.net.ssl.X509TrustManager trust = DeepSeekClient.trustManager();
        Assert.assertNotNull(trust);
        java.security.cert.X509Certificate[] roots = trust.getAcceptedIssuers();
        Assert.assertTrue(Arrays.stream(roots).anyMatch(c -> c.getSubjectX500Principal().getName().contains("CN=HARICA TLS RSA Root CA 2021")));
        Assert.assertTrue(roots.length > 50); // and the JDK's
    }

    @Test
    public void aRepairWithLongOrManyProblemsIsCutNotRefused() throws Exception {
        // 2026-11-05: a problem of 336 characters made the whole repair too_large, and the 4 tests it would have repaired were lost
        JSONArray problems = new JSONArray().put("test \"A\": " + String.join("", Collections.nCopies(900, "x")));
        for ( int i = 1; i < AiPrompts.MAX_PROBLEMS + 5; i++ ) {
            problems.put("test \"T" + i + "\": no checks");
        }
        script(200, completion(generateAnswer(), "stop"));
        JSONObject data = data().put("intent", "Drive.").put("repair", new JSONObject().put("answer", generateAnswer()).put("problems", problems));
        AiService.Outcome outcome = service(KEY).call(AiService.GENERATE, 7, data);
        Assert.assertTrue(outcome.message, outcome.ok);
        String repair = new JSONObject(this.requests.get(0).getString("body")).getJSONArray("messages").getJSONObject(3).getString("content");
        Assert.assertTrue(repair.contains("- test \"A\": " + String.join("", Collections.nCopies(AiPrompts.MAX_PROBLEM - 10, "x")) + " …\n"));
        Assert.assertTrue(repair, repair.contains("- test \"T" + (AiPrompts.MAX_PROBLEMS - 1) + "\": no checks\n- … and 5 more problems like these\n"));
        Assert.assertFalse(repair.contains("\"T" + AiPrompts.MAX_PROBLEMS + "\""));
    }

    @Test
    public void theFirstApiIsAskedFirstWithItsOwnEfforts() throws Exception {
        script(200, completion(generateAnswer(), "stop"));
        script(200, completion(inferAnswer(), "stop"));
        AiService service = serviceWithTwo();
        AiService.Outcome outcome = service.call(AiService.GENERATE, 1, data().put("intent", "Drive."));
        Assert.assertTrue(outcome.message, outcome.ok);
        Assert.assertTrue(service.call(AiService.INFER, 1, data()).ok);
        Assert.assertEquals(2, this.requests.size());
        Assert.assertEquals("/deepseek/chat/completions", this.requests.get(0).getString("path"));
        Assert.assertEquals("Bearer " + KEY, this.requests.get(0).getString("authorization"));
        JSONObject generate = new JSONObject(this.requests.get(0).getString("body"));
        Assert.assertEquals("deepseek-flash", generate.getString("model"));
        Assert.assertEquals("none", generate.getString("reasoning_effort")); // DeepSeek's generate
        Assert.assertEquals("low", new JSONObject(this.requests.get(1).getString("body")).getString("reasoning_effort")); // its infer
        JSONObject event = outcome.event;
        Assert.assertEquals("deepseek", event.getString("provider"));
        Assert.assertEquals("127.0.0.1", event.getString("host"));
        Assert.assertEquals("deepseek-flash", event.getString("model"));
        Assert.assertEquals("none", event.getString("effort"));
        Assert.assertEquals(1, event.getJSONArray("tries").length());
        Assert.assertEquals("I think.", event.getString("reasoning")); // DeepSeek's field
        Assert.assertEquals(80, event.getJSONObject("tokens").getInt("reasoning"));
        Assert.assertEquals("deepseek", outcome.meta.getString("provider"));
    }

    @Test
    public void withoutAnAnswerFromTheFirstTheNextIsAskedAndFirstForFiveMinutes() throws Exception {
        long[] now = {1000};
        script(503, "{\"error\": \"busy\"}");
        script(503, "{\"error\": \"busy\"}"); // DeepSeek's second try
        script(200, vllmCompletion(generateAnswer()));
        AiService service = serviceWithTwo();
        service.setClock(() -> now[0]);
        AiService.Outcome outcome = service.call(AiService.GENERATE, 1, data().put("intent", "Drive."));
        Assert.assertTrue(outcome.message, outcome.ok);
        Assert.assertEquals(3, this.requests.size());
        Assert.assertEquals("/deepseek/chat/completions", this.requests.get(1).getString("path"));
        JSONObject next = this.requests.get(2);
        Assert.assertEquals("/ucloud/chat/completions", next.getString("path"));
        Assert.assertEquals("Bearer " + UCLOUD_KEY, next.getString("authorization"));
        JSONObject body = new JSONObject(next.getString("body"));
        Assert.assertEquals(SDU_MODEL, body.getString("model"));
        Assert.assertEquals("high", body.getString("reasoning_effort")); // UCloud's own effort for generate
        Assert.assertEquals(new JSONObject(this.requests.get(0).getString("body")).getJSONArray("messages").toString(), body.getJSONArray("messages").toString());
        JSONObject event = outcome.event;
        Assert.assertEquals("ucloud", event.getString("provider"));
        Assert.assertEquals(SDU_MODEL, event.getString("model"));
        Assert.assertEquals("high", event.getString("effort"));
        Assert.assertEquals(3, event.getInt("attempts"));
        JSONArray tries = event.getJSONArray("tries");
        Assert.assertEquals(2, tries.length());
        Assert.assertEquals("deepseek", tries.getJSONObject(0).getString("provider"));
        Assert.assertEquals("none", tries.getJSONObject(0).getString("effort"));
        Assert.assertEquals("http_503", tries.getJSONObject(0).getString("error"));
        Assert.assertEquals(2, tries.getJSONObject(0).getInt("attempts"));
        Assert.assertTrue(tries.getJSONObject(1).getBoolean("ok"));
        Assert.assertEquals("We need JSON.", event.getString("reasoning")); // vLLM's field
        Assert.assertEquals(13, event.getInt("reasoningChars"));
        Assert.assertTrue(event.getJSONObject("tokens").isNull("reasoning")); // UCloud doesn't say: not 0
        Assert.assertEquals(8704, event.getJSONObject("tokens").getInt("cached"));
        Assert.assertEquals("ucloud", outcome.meta.getString("provider"));

        now[0] += AiService.COOL_DOWN_MS - 1; // still cooling down: UCloud first
        script(200, vllmCompletion(inferAnswer()));
        Assert.assertEquals("ucloud", service.call(AiService.INFER, 1, data()).event.getString("provider"));
        Assert.assertEquals("/ucloud/chat/completions", this.requests.get(3).getString("path"));

        now[0] += 2; // DeepSeek first again
        script(200, completion(inferAnswer(), "stop"));
        Assert.assertEquals("deepseek", service.call(AiService.INFER, 1, data()).event.getString("provider"));
        Assert.assertEquals("/deepseek/chat/completions", this.requests.get(4).getString("path"));
        Assert.assertEquals(5, this.requests.size());
    }

    @Test
    public void aTimeoutOfTheFirstGoesToTheNext() {
        this.answers.add(new Object[] {200, completion(inferAnswer(), "stop"), 3000}); // later than the 1.5 s timeout
        script(200, vllmCompletion(inferAnswer()));
        AiService.Outcome outcome = serviceWithTwo().call(AiService.INFER, 1, data());
        Assert.assertTrue(outcome.message, outcome.ok);
        Assert.assertEquals("timeout", outcome.event.getJSONArray("tries").getJSONObject(0).getString("error"));
        Assert.assertEquals("ucloud", outcome.event.getString("provider"));
        Assert.assertTrue(outcome.event.getLong("latencyMs") >= 1500); // what the learner waited: both
    }

    @Test
    public void anAnswerThatCantBeUsedIsNotAskedAgainAtTheNext() {
        script(200, completion("Sure! Here are your tests.", "stop"));
        AiService service = serviceWithTwo();
        Assert.assertEquals("bad_answer", service.call(AiService.INFER, 1, data()).error);
        script(200, completion("{\"worlds\": [{\"name\": \"w\", \"tes", "length"));
        Assert.assertEquals("cut_off", service.call(AiService.GENERATE, 1, data().put("intent", "Drive.")).error);
        Assert.assertEquals(2, this.requests.size());
        Assert.assertTrue(this.requests.stream().allMatch(r -> r.getString("path").startsWith("/deepseek/")));
    }

    @Test
    public void whenBothFailTheErrorIsTheLastsAndBothAreInTheTelemetry() {
        script(401, "{\"error\": \"invalid key " + KEY + "\"}");
        script(401, "{\"error\": \"invalid key " + UCLOUD_KEY + "\"}");
        AiService.Outcome outcome = serviceWithTwo().call(AiService.INFER, 1, data());
        Assert.assertFalse(outcome.ok);
        Assert.assertEquals("http_401", outcome.error);
        Assert.assertEquals(2, this.requests.size());
        JSONArray tries = outcome.event.getJSONArray("tries");
        Assert.assertEquals(2, tries.length());
        Assert.assertEquals("ucloud", outcome.event.getString("provider"));
        String event = outcome.event.toString();
        Assert.assertFalse(event.contains(KEY));
        Assert.assertFalse(event.contains(UCLOUD_KEY));
        Assert.assertTrue(tries.getJSONObject(0).getString("message").contains("***"));
        Assert.assertTrue(outcome.message.contains("***"));
    }

    @Test
    public void theTelemetryHasWhatWasSentAndWhatCameBack() throws Exception {
        script(200, completion(generateAnswer(), "stop"));
        AiService service = service(KEY);
        JSONObject data = data().put("intent", "Drive.").put("repair", new JSONObject().put("answer", generateAnswer()).put("problems", new JSONArray().put("test \"From A\": no checks")));
        long before = System.currentTimeMillis();
        AiService.Outcome outcome = service.call(AiService.GENERATE, 7, data);
        Assert.assertTrue(outcome.message, outcome.ok);
        JSONObject event = outcome.event;
        Assert.assertTrue(event.getLong("startTime") >= before);
        Assert.assertEquals(AiService.MAX_TOKENS, event.getInt("maxTokens"));
        Assert.assertEquals(1500, event.getInt("timeoutMs"));
        Assert.assertEquals("high", event.getString("effort"));
        JSONArray messages = new JSONObject(this.requests.get(0).getString("body")).getJSONArray("messages");
        Assert.assertEquals(messages.getJSONObject(1).getString("content"), event.getString("prompt"));
        Assert.assertEquals(messages.getJSONObject(2).getString("content"), event.getString("repairAnswer"));
        Assert.assertEquals(messages.getJSONObject(3).getString("content"), event.getString("repair"));
        Assert.assertEquals(generateAnswer().toString(), event.getString("answer"));
        Assert.assertEquals("stop", event.getString("finishReason"));
        Assert.assertTrue(event.has("latencyMs"));
        // the system prompt, once per version
        File saved = new File(new File(this.folder.getRoot(), AiService.PROMPTS_DIR), event.getString("promptVersion") + ".md");
        Assert.assertTrue(saved.isFile());
        Assert.assertEquals(messages.getJSONObject(0).getString("content"), new String(Files.readAllBytes(saved.toPath()), StandardCharsets.UTF_8));
        long saveTime = saved.lastModified();
        script(200, completion(inferAnswer(), "stop"));
        Assert.assertTrue(service.call(AiService.INFER, 7, data()).ok);
        Assert.assertEquals(saveTime, saved.lastModified());
        Assert.assertEquals(1, new File(this.folder.getRoot(), AiService.PROMPTS_DIR).list().length);
    }

    @Test
    public void theModelsOfTheKey() throws Exception {
        script(200, "{\"object\": \"list\", \"data\": [{\"id\": \"deepseek-flash\"}]}");
        JSONObject models = service(KEY).getClient().models();
        Assert.assertEquals("deepseek-flash", models.getJSONArray("data").getJSONObject(0).getString("id"));
        Assert.assertEquals("/models", this.requests.get(0).getString("path"));
        Assert.assertEquals("GET", this.requests.get(0).getString("method"));
    }

    @Test
    public void theKeyIsNeverLoggedAndNeverLeavesTheServer() throws Exception {
        ListAppender<ILoggingEvent> log = new ListAppender<>();
        Logger root = (Logger) LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
        Level level = root.getLevel();
        root.setLevel(Level.ALL);
        log.start();
        root.addAppender(log);
        try {
            File env = this.folder.newFile(".env");
            Files
                .write(
                    env.toPath(),
                    Arrays
                        .asList(
                            "DEEPSEEK_API_KEY=" + KEY,
                            "DEEPSEEK_URL=" + url() + "deepseek",
                            "DEEPSEEK_MODEL=deepseek-flash",
                            "UCLOUD_API_KEY=" + UCLOUD_KEY,
                            "UCLOUD_URL=" + url() + "ucloud",
                            "UCLOUD_EFFORT_GENERATE=high",
                            "AI_TESTS_DEFAULT=true"),
                    StandardCharsets.UTF_8);
            List<String> defines = EnvFile.serverDefines(env, Collections.emptyMap());
            Assert.assertFalse(String.valueOf(defines).contains(KEY));
            Assert.assertFalse(String.valueOf(defines).contains(UCLOUD_KEY));
            Assert.assertTrue(defines.contains("ai.deepseek.model=deepseek-flash"));
            Properties properties = Util.loadAndMergeOpenRobertaServerProperties("classpath:/openRoberta.properties", defines);
            Assert.assertFalse(properties.toString().contains(KEY));
            Assert.assertFalse(properties.toString().contains(UCLOUD_KEY));
            AiSettings settings = AiSettings.of(new ServerProperties(properties), env, Collections.emptyMap());
            Assert.assertTrue(settings.isAvailable());
            List<AiSettings.Provider> providers = settings.providers();
            Assert.assertEquals(2, providers.size());
            Assert.assertEquals("deepseek", providers.get(0).getName()); // the default order of openRoberta.properties
            Assert.assertEquals("ucloud", providers.get(1).getName());
            Assert.assertEquals(SDU_MODEL, providers.get(1).getModel()); // the default
            Assert.assertEquals("none", providers.get(0).effort(AiService.GENERATE)); // the presets: one generate call per scenario, at none
            Assert.assertEquals("none", providers.get(0).effort(AiService.ANALYZE));
            Assert.assertEquals("low", providers.get(0).effort(AiService.INFER));
            Assert.assertEquals("low", providers.get(0).effort(AiService.FIX));
            Assert.assertEquals("high", providers.get(1).effort(AiService.GENERATE)); // from .env
            Assert.assertFalse(settings.toString().contains(KEY));
            Assert.assertFalse(settings.toString().contains(UCLOUD_KEY));

            JSONObject clientInfo = settings.clientInfo();
            Assert.assertEquals(new JSONObject().put("available", true).put("default", true).toString(), clientInfo.toString());

            script(401, "{\"error\": \"invalid key " + KEY + "\"}");
            script(401, "{\"error\": \"invalid key " + UCLOUD_KEY + "\"}");
            AiService service = new AiService(settings, 10);
            AiService.Outcome outcome = service.call(AiService.INFER, 1, data());
            Assert.assertEquals("http_401", outcome.error);
            Assert.assertEquals(2, this.requests.size()); // both asked
            Assert.assertFalse("the telemetry", outcome.event.toString().contains(KEY));
            Assert.assertFalse("the telemetry", outcome.event.toString().contains(UCLOUD_KEY));
            AiResponse response = AiResponse.of(outcome);
            response.setRc("error");
            response.setInitToken("t");
            response.setServerTime(0);
            response.setServerVersion("v");
            Assert.assertFalse("the browser", response.immutable().toJson().toString().contains(KEY));
            Assert.assertFalse("the browser", response.immutable().toJson().toString().contains(UCLOUD_KEY));
        } finally {
            root.detachAppender(log);
            root.setLevel(level);
        }
        Assert.assertTrue(log.list.stream().anyMatch(e -> e.getFormattedMessage().contains("new server property from command line: ai.deepseek.model=")));
        Assert.assertTrue(log.list.stream().anyMatch(e -> e.getFormattedMessage().startsWith("AI test assistant: deepseek: url ")));
        for ( ILoggingEvent event : log.list ) {
            Assert.assertFalse("logged: " + event.getFormattedMessage(), event.getFormattedMessage().contains(KEY));
            Assert.assertFalse("logged: " + event.getFormattedMessage(), event.getFormattedMessage().contains(UCLOUD_KEY));
        }
    }

    private static byte[] readAll(InputStream in) throws IOException {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        for ( int n = in.read(buffer); n >= 0; n = in.read(buffer) ) {
            out.write(buffer, 0, n);
        }
        return out.toByteArray();
    }

    private static void sleep(int ms) {
        try {
            Thread.sleep(ms);
        } catch ( InterruptedException e ) {
            Thread.currentThread().interrupt();
        }
    }
}
