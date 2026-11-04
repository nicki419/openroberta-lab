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
            Object[] answer = this.answers.isEmpty() ? new Object[] {500, "{\"error\": \"nothing scripted\"}", 0} : this.answers.removeFirst();
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
                    Arrays.asList("DEEPSEEK_API_KEY=" + KEY, "DEEPSEEK_URL=" + url(), "DEEPSEEK_MODEL=deepseek-flash", "AI_TESTS_DEFAULT=true"),
                    StandardCharsets.UTF_8);
            List<String> defines = EnvFile.serverDefines(env, Collections.emptyMap());
            Assert.assertFalse(String.valueOf(defines).contains(KEY));
            Assert.assertTrue(defines.contains("ai.deepseek.model=deepseek-flash"));
            Properties properties = Util.loadAndMergeOpenRobertaServerProperties("classpath:/openRoberta.properties", defines);
            Assert.assertFalse(properties.toString().contains(KEY));
            AiSettings settings = AiSettings.of(new ServerProperties(properties), env, Collections.emptyMap());
            Assert.assertTrue(settings.isAvailable());
            Assert.assertFalse(settings.toString().contains(KEY));

            JSONObject clientInfo = settings.clientInfo();
            Assert.assertEquals(new JSONObject().put("available", true).put("default", true).toString(), clientInfo.toString());

            script(401, "{\"error\": \"invalid key " + KEY + "\"}");
            AiService service = new AiService(settings, 10);
            AiService.Outcome outcome = service.call(AiService.INFER, 1, data());
            Assert.assertEquals("http_401", outcome.error);
            Assert.assertFalse("the telemetry", outcome.event.toString().contains(KEY));
            AiResponse response = AiResponse.of(outcome);
            response.setRc("error");
            response.setInitToken("t");
            response.setServerTime(0);
            response.setServerVersion("v");
            Assert.assertFalse("the browser", response.immutable().toJson().toString().contains(KEY));
        } finally {
            root.detachAppender(log);
            root.setLevel(level);
        }
        Assert.assertTrue(log.list.stream().anyMatch(e -> e.getFormattedMessage().contains("new server property from command line: ai.deepseek.model=")));
        Assert.assertTrue(log.list.stream().anyMatch(e -> e.getFormattedMessage().startsWith("AI test assistant: url ")));
        for ( ILoggingEvent event : log.list ) {
            Assert.assertFalse("logged: " + event.getFormattedMessage(), event.getFormattedMessage().contains(KEY));
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
