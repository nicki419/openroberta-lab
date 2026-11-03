package de.fhg.iais.roberta.ai;

import java.io.File;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.json.JSONArray;
import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.google.inject.Inject;
import com.google.inject.Singleton;

import de.fhg.iais.roberta.main.EnvFile;
import de.fhg.iais.roberta.util.ServerProperties;

/**
 * the AI test assistant behind the Lab server: the browser never talks to DeepSeek. A call puts the context pack ({@link ContextPack}) first, as the
 * system prompt, and the per-call part ({@link AiPrompts}) after it, calls DeepSeek in JSON mode ({@link DeepSeekClient}), checks the answer and
 * describes the call as an event for the participant's telemetry file (kind ai_call).
 * <ul>
 * <li>infer: what is the program meant to do? {intent, confidence, ask, same_as_declined, not_covered}; short, 20 s.</li>
 * <li>generate: scenario tests for the intent, as test JSON {worlds: [...]}; 90 s; with a repair: the earlier answer and its problems follow, as a
 * conversation.</li>
 * <li>fix: the tests of an answer that failed when they ran on the learner's program, with how they ran: {worlds: [the fixed tests],
 * program_wrong: [{test, world, reason}: the tests left as they are, because the program is wrong]}; as generate (its effort, 90 s, repairs).</li>
 * </ul>
 * The reasoning effort of each is a setting (AI_EFFORT_INFER, AI_EFFORT_GENERATE, also for fix; default low). Measured on 2026-11-03 with deepseek-flash and a
 * 12,700-token prompt: infer about 4 s; generate about 16 s at low (2,400 reasoning tokens), 71 s at high (11,300).
 * <p>
 * One instance serves the whole server (the limits per session are here).
 */
@Singleton
public class AiService {
    private static final Logger LOG = LoggerFactory.getLogger(AiService.class);
    public static final String INFER = "infer";
    public static final String GENERATE = "generate";
    public static final String FIX = "fix";
    private static final int MAX_REASONING = 20000; // characters of the reasoning kept in the telemetry

    private final AiSettings settings;
    private final DeepSeekClient client;
    private final AiLimits limits;
    private ContextPack resourcePack; // the pack in the resources, loaded once
    private int inferTimeoutMs = 20000;
    private int generateTimeoutMs = 90000;

    @Inject
    public AiService(ServerProperties serverProperties) {
        this(AiSettings.of(serverProperties, new File(EnvFile.FILE_NAME), System.getenv()), DeepSeekClient.RETRY_DELAY_MS);
    }

    /**
     * @param settings the settings
     * @param retryDelayMs the delay before the second try of a call
     */
    public AiService(AiSettings settings, long retryDelayMs) {
        this.settings = settings;
        this.client = new DeepSeekClient(settings, retryDelayMs);
        Map<String, Integer> perHour = new HashMap<>();
        perHour.put(INFER, 60);
        perHour.put(GENERATE, 30);
        perHour.put(FIX, 30);
        this.limits = new AiLimits(perHour, System::currentTimeMillis);
    }

    public AiSettings getSettings() {
        return this.settings;
    }

    /**
     * @param inferMs how long to wait for DeepSeek's answer to infer (default 20 s)
     * @param generateMs … to generate (default 90 s)
     */
    public void setTimeouts(int inferMs, int generateMs) {
        this.inferTimeoutMs = inferMs;
        this.generateTimeoutMs = generateMs;
    }

    public DeepSeekClient getClient() {
        return this.client;
    }

    /**
     * @return the context pack: read again from AI_PACK_DIR at every call, or the server's resources once
     */
    public synchronized ContextPack pack() throws IOException {
        if ( this.settings.getPackDir() != null ) {
            return ContextPack.fromDirectory(new File(this.settings.getPackDir()));
        }
        if ( this.resourcePack == null ) {
            this.resourcePack = ContextPack.fromResources();
        }
        return this.resourcePack;
    }

    /**
     * a call of the assistant. Never throws.
     *
     * @param kind {@link #INFER}, {@link #GENERATE} or {@link #FIX}
     * @param session the session's number (the limits are per session)
     * @param data the browser's data (see {@link AiPrompts})
     */
    public Outcome call(String kind, long session, JSONObject data) {
        Outcome outcome = new Outcome();
        JSONObject event = new JSONObject().put("kind", "ai_call").put("call", kind).put("callId", UUID.randomUUID().toString());
        event.put("ai", true); // as every event of the study's telemetry: the AI was on (the browser calls only then)
        outcome.event = event;
        event.put("level", data == null ? JSONObject.NULL : data.opt("levelId")); // logged only: the model never gets the level
        event.put("fingerprint", data == null ? JSONObject.NULL : data.opt("fingerprint"));
        event.put("model", this.settings.getModel());
        if ( !INFER.equals(kind) && !GENERATE.equals(kind) && !FIX.equals(kind) || data == null ) {
            return outcome.fail("bad_request", "unknown call " + kind);
        }
        if ( !this.settings.isAvailable() ) {
            return outcome.fail("not_configured", "the AI test assistant has no API key or no model");
        }
        String limit = this.limits.acquire(session, kind);
        if ( limit != null ) {
            return outcome.fail(limit, "busy".equals(limit) ? "a call of this kind still runs" : "too many calls in the last hour");
        }
        try {
            ContextPack pack = pack();
            event.put("promptVersion", pack.getVersion());
            boolean infer = INFER.equals(kind);
            String effort = infer ? this.settings.getEffortInfer() : this.settings.getEffortGenerate();
            event.put("effort", effort == null ? JSONObject.NULL : effort);
            String prompt = AiPrompts.userMessage(kind, data);
            event.put("prompt", prompt);
            JSONArray messages = new JSONArray().put(message("system", pack.getText())).put(message("user", prompt));
            if ( !infer ) {
                String[] repair = AiPrompts.repairMessages(data);
                if ( repair != null ) {
                    messages.put(message("assistant", repair[0])).put(message("user", repair[1]));
                    event.put("repair", repair[1]);
                }
            }
            DeepSeekClient.Result result = this.client.chat(messages, infer ? 4000 : 16000, effort, infer ? this.inferTimeoutMs : this.generateTimeoutMs);
            outcome.meta =
                new JSONObject()
                    .put("callId", event.getString("callId"))
                    .put("model", result.model == null ? this.settings.getModel() : result.model)
                    .put("promptVersion", pack.getVersion())
                    .put("latencyMs", result.latencyMs)
                    .put("attempts", result.attempts)
                    .put(
                        "tokens",
                        new JSONObject()
                            .put("in", result.promptTokens)
                            .put("cached", result.cachedTokens)
                            .put("out", result.completionTokens)
                            .put("reasoning", result.reasoningTokens));
            event
                .put("httpStatus", result.httpStatus)
                .put("attempts", result.attempts)
                .put("latencyMs", result.latencyMs)
                .put("tokens", outcome.meta.getJSONObject("tokens"))
                .put("finishReason", result.finishReason == null ? JSONObject.NULL : result.finishReason)
                .put("answer", result.content == null ? JSONObject.NULL : result.content)
                .put("reasoning", result.reasoning == null ? JSONObject.NULL : cut(result.reasoning, MAX_REASONING));
            if ( !result.ok ) {
                return outcome.fail(result.error, result.message);
            }
            if ( "length".equals(result.finishReason) ) {
                return outcome.fail("cut_off", "the answer was cut off (too long)");
            }
            outcome.answer = infer ? AiPrompts.checkInfer(result.content) : FIX.equals(kind) ? AiPrompts.checkFix(result.content) : AiPrompts.checkGenerate(result.content);
            outcome.ok = true;
            event.put("status", "ok").put("error", JSONObject.NULL);
            return outcome;
        } catch ( AiException e ) {
            return outcome.fail(e.getCode(), e.getMessage());
        } catch ( IOException e ) {
            LOG.error("the context pack could not be read", e);
            return outcome.fail("no_pack", "the context pack could not be read: " + e.getMessage());
        } catch ( RuntimeException e ) {
            LOG.error("the AI call failed", e);
            return outcome.fail("server_error", String.valueOf(e.getMessage()));
        } finally {
            this.limits.release(session, kind);
            LOG.info(
                "AI "
                    + kind
                    + ": "
                    + (outcome.ok ? "ok" : outcome.error)
                    + ", "
                    + event.opt("latencyMs")
                    + " ms, tokens "
                    + event.opt("tokens")
                    + ", prompt "
                    + event.opt("promptVersion"));
        }
    }

    private static JSONObject message(String role, String content) {
        return new JSONObject().put("role", role).put("content", content);
    }

    private static String cut(String text, int max) {
        return text.length() > max ? text.substring(0, max) + " …" : text;
    }

    /**
     * a call's outcome: the checked answer, or an error code (not_configured, busy, limit, bad_request, too_large, timeout, unreachable,
     * http_&lt;status&gt;, bad_response, cut_off, bad_answer, no_pack, server_error) with a message; meta for the browser (callId, model,
     * promptVersion, latencyMs, attempts, tokens); event for the telemetry (kind ai_call).
     */
    public static final class Outcome {
        public boolean ok;
        public JSONObject answer;
        public String error;
        public String message;
        public JSONObject meta;
        public JSONObject event;

        Outcome fail(String error, String message) {
            this.ok = false;
            this.error = error;
            this.message = message;
            this.event.put("status", "error").put("error", error).put("message", message == null ? JSONObject.NULL : message);
            return this;
        }
    }
}
