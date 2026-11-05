package de.fhg.iais.roberta.ai;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.LongSupplier;

import org.json.JSONArray;
import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.google.inject.Inject;
import com.google.inject.Singleton;

import de.fhg.iais.roberta.main.EnvFile;
import de.fhg.iais.roberta.util.ServerProperties;

/**
 * the AI test assistant behind the Lab server: the browser never talks to the model. A call puts the context pack ({@link ContextPack}) first, as the
 * system prompt, and the per-call part ({@link AiPrompts}) after it, calls the model in JSON mode ({@link DeepSeekClient}), checks the answer and
 * describes the call as an event for the participant's telemetry file (kind ai_call).
 * <p>
 * The model is DeepSeek-V4.1-Flash, at SDU's UCloud (the primary) and at DeepSeek's own API (the fallback, {@link AiSettings}). A call that gets no
 * answer from the primary (it can't be reached, doesn't answer in time, or answers with an HTTP error) is made again at the fallback, and for the next
 * 5 minutes the fallback is asked first. An answer that can't be used (cut off, not the JSON asked for) is not made again: the browser repairs it.
 * <p>
 * The event has what was sent and what came back: the per-call prompt (the system prompt is saved once per version, as
 * &lt;telemetry&gt;/ai-prompts/&lt;promptVersion&gt;.md), a repair's earlier answer and problems, the effort, token limit and timeout, every API asked
 * (tries: provider, host, model, status, error, attempts, latency), the answer, the model's reasoning, the tokens, the finish reason, the start time and
 * the time taken.
 * <ul>
 * <li>infer: what is the program meant to do? {intent, confidence, ask, same_as_declined, not_covered}; short, 20 s.</li>
 * <li>analyze (the AnalysisAgent of docs/tests): the program's decisions and their outcomes, the paths that target them (branch coverage), the
 * input classes and boundaries of each path, the scenarios and where their expected behaviour comes from; 180 s; repairs as generate.</li>
 * <li>generate (the TestGenerationAgent): scenario tests for the intent and the analysis, as test JSON {worlds: [...], coverage_plan, ...}; 180 s;
 * with a repair: the earlier answer and its problems follow, as a conversation.</li>
 * <li>fix: the tests of an answer that failed (or weren't checked) when they ran on the learner's program, with how they ran: {worlds: [the fixed
 * tests: only their inputs changed], program_wrong: [{test, world, reason}: the program is wrong], doubtful: [{test, world, reason}: the test may
 * expect more than the learner said]}; as generate (its effort, 180 s, repairs).</li>
 * </ul>
 * The reasoning effort of each is a setting (AI_EFFORT_INFER; AI_EFFORT_GENERATE, also for analyze and fix; default low). Measured on 2026-11-05
 * with the clap counter and a 32,000-token prompt, three runs each, at low: infer about 2 s on both; analyze 39-56 s at DeepSeek, 67-116 s at SDU
 * (it reasons about twice as long; its low and high made no measurable difference); generate 62-74 s and 52-78 s; fix 14-29 s and 7-33 s.
 * Every call's meta has the contract version of the answers ({@link #CONTRACT}).
 * <p>
 * One instance serves the whole server (the limits per session are here).
 */
@Singleton
public class AiService {
    private static final Logger LOG = LoggerFactory.getLogger(AiService.class);
    public static final String INFER = "infer";
    public static final String GENERATE = "generate";
    public static final String FIX = "fix";
    public static final String ANALYZE = "analyze";
    /** the version of the answers' contracts (docs/tests: AnalysisAgent and TestGenerationAgent 1.1; the fix's own) */
    public static final String CONTRACT = "1.1";
    private static final int MAX_REASONING = 200000; // characters of the reasoning kept in the telemetry (32,000 tokens are about 130,000)
    public static final String PROMPTS_DIR = "ai-prompts"; // in the telemetry folder: the system prompt of each promptVersion
    public static final long COOL_DOWN_MS = 5 * 60 * 1000; // after the primary failed, the fallback is asked first for so long

    private final AiSettings settings;
    private final List<DeepSeekClient> clients; // the primary's, then the fallback's (those that can be called)
    private final AiLimits limits;
    private ContextPack resourcePack; // the pack in the resources, loaded once
    private int inferTimeoutMs = 20000;
    private int generateTimeoutMs = 180000;
    private LongSupplier clock = System::currentTimeMillis;
    private volatile long primaryDownUntil = 0; // the primary failed: until then, the fallback is asked first
    public static final int MAX_TOKENS = 32000; // analyze, generate, fix: the reasoning counts (a hard program took 22,000 tokens at SDU, 116 s)

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
        List<DeepSeekClient> clients = new ArrayList<>();
        for ( AiSettings.Provider provider : settings.providers() ) {
            clients.add(new DeepSeekClient(settings, provider, retryDelayMs));
        }
        this.clients = Collections.unmodifiableList(clients);
        Map<String, Integer> perHour = new HashMap<>();
        perHour.put(INFER, 60);
        perHour.put(GENERATE, 30);
        perHour.put(FIX, 30);
        perHour.put(ANALYZE, 30);
        this.limits = new AiLimits(perHour, System::currentTimeMillis);
    }

    public AiSettings getSettings() {
        return this.settings;
    }

    /**
     * @param inferMs how long to wait for DeepSeek's answer to infer (default 20 s)
     * @param generateMs … to analyze, generate and fix (default 180 s)
     */
    public void setTimeouts(int inferMs, int generateMs) {
        this.inferTimeoutMs = inferMs;
        this.generateTimeoutMs = generateMs;
    }

    /**
     * @return the client of the first API that can be called (the primary's, if it can), or null
     */
    public DeepSeekClient getClient() {
        return this.clients.isEmpty() ? null : this.clients.get(0);
    }

    /**
     * @param clock the time in ms (for tests of the cool-down)
     */
    void setClock(LongSupplier clock) {
        this.clock = clock;
    }

    /**
     * @return the APIs to ask, in their order: the primary first, unless it failed in the last {@link #COOL_DOWN_MS}
     */
    private List<DeepSeekClient> order() {
        List<DeepSeekClient> order = new ArrayList<>(this.clients);
        if ( order.size() > 1 && this.clock.getAsLong() < this.primaryDownUntil && AiSettings.PRIMARY.equals(order.get(0).getProvider().getName()) ) {
            order.add(order.remove(0));
        }
        return order;
    }

    /**
     * saves the system prompt of a version once, so the telemetry's promptVersion can be read back: &lt;telemetry&gt;/ai-prompts/&lt;version&gt;.md
     */
    private synchronized void savePrompt(ContextPack pack) {
        if ( this.settings.getTelemetryDir() == null ) {
            return;
        }
        File file = new File(new File(this.settings.getTelemetryDir(), PROMPTS_DIR), pack.getVersion() + ".md");
        if ( file.isFile() ) {
            return;
        }
        try {
            Files.createDirectories(file.getParentFile().toPath());
            Files.write(file.toPath(), pack.getText().getBytes(StandardCharsets.UTF_8));
        } catch ( IOException e ) {
            LOG.error("the system prompt " + pack.getVersion() + " could not be saved in " + file, e);
        }
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
     * @param kind {@link #INFER}, {@link #ANALYZE}, {@link #GENERATE} or {@link #FIX}
     * @param session the session's number (the limits are per session)
     * @param data the browser's data (see {@link AiPrompts})
     */
    public Outcome call(String kind, long session, JSONObject data) {
        Outcome outcome = new Outcome();
        JSONObject event = new JSONObject().put("kind", "ai_call").put("call", kind).put("callId", UUID.randomUUID().toString());
        event.put("ai", true); // as every event of the study's telemetry: the AI was on (the browser calls only then)
        event.put("startTime", System.currentTimeMillis()); // the call came in (serverTime: its event was written, after the answer)
        outcome.event = event;
        event.put("level", data == null ? JSONObject.NULL : data.opt("levelId")); // logged only: the model never gets the level
        event.put("fingerprint", data == null ? JSONObject.NULL : data.opt("fingerprint"));
        event.put("model", this.settings.getModel());
        event.put("contract", CONTRACT);
        if ( !INFER.equals(kind) && !ANALYZE.equals(kind) && !GENERATE.equals(kind) && !FIX.equals(kind) || data == null ) {
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
            savePrompt(pack);
            boolean infer = INFER.equals(kind);
            String effort = infer ? this.settings.getEffortInfer() : this.settings.getEffortGenerate();
            int maxTokens = infer ? 4000 : MAX_TOKENS;
            int timeoutMs = infer ? this.inferTimeoutMs : this.generateTimeoutMs;
            event.put("effort", effort == null ? JSONObject.NULL : effort).put("maxTokens", maxTokens).put("timeoutMs", timeoutMs);
            String prompt = AiPrompts.userMessage(kind, data);
            event.put("prompt", prompt);
            JSONArray messages = new JSONArray().put(message("system", pack.getText())).put(message("user", prompt));
            if ( !infer ) {
                String[] repair = AiPrompts.repairMessages(data);
                if ( repair != null ) {
                    messages.put(message("assistant", repair[0])).put(message("user", repair[1]));
                    event.put("repairAnswer", repair[0]).put("repair", repair[1]);
                }
            }
            // the primary, then the fallback if the primary gave no answer (an answer that can't be used is repaired by the browser, not asked again)
            DeepSeekClient.Result result = null;
            AiSettings.Provider answering = null;
            JSONArray tries = new JSONArray();
            long latencyMs = 0;
            int attempts = 0;
            for ( DeepSeekClient client : order() ) {
                AiSettings.Provider provider = client.getProvider();
                result = client.chat(messages, maxTokens, effort, timeoutMs);
                answering = provider;
                latencyMs += result.latencyMs;
                attempts += result.attempts;
                tries
                    .put(
                        new JSONObject()
                            .put("provider", provider.getName())
                            .put("host", provider.getHost())
                            .put("model", provider.getModel())
                            .put("ok", result.ok)
                            .put("httpStatus", result.httpStatus)
                            .put("error", result.error == null ? JSONObject.NULL : result.error)
                            .put("message", result.message == null ? JSONObject.NULL : result.message)
                            .put("attempts", result.attempts)
                            .put("latencyMs", result.latencyMs));
                boolean primary = AiSettings.PRIMARY.equals(provider.getName());
                if ( result.ok ) {
                    if ( primary ) {
                        this.primaryDownUntil = 0;
                    }
                    break;
                }
                if ( primary ) {
                    this.primaryDownUntil = this.clock.getAsLong() + COOL_DOWN_MS;
                }
                LOG.warn("AI " + kind + ": " + provider.getHost() + " failed (" + result.error + ")" + (tries.length() < this.clients.size() ? ", asking the next" : ""));
            }
            String reasoning = result.reasoning;
            outcome.meta =
                new JSONObject()
                    .put("callId", event.getString("callId"))
                    .put("model", result.model == null ? answering.getModel() : result.model)
                    .put("provider", answering.getName())
                    .put("promptVersion", pack.getVersion())
                    .put("contract", CONTRACT)
                    .put("latencyMs", latencyMs)
                    .put("attempts", attempts)
                    .put(
                        "tokens",
                        new JSONObject()
                            .put("in", result.promptTokens)
                            .put("cached", result.cachedTokens)
                            .put("out", result.completionTokens)
                            .put("reasoning", result.reasoningTokens == null ? JSONObject.NULL : result.reasoningTokens));
            event
                .put("provider", answering.getName())
                .put("host", answering.getHost())
                .put("model", answering.getModel())
                .put("modelAnswered", result.model == null ? JSONObject.NULL : result.model)
                .put("tries", tries)
                .put("httpStatus", result.httpStatus)
                .put("attempts", attempts)
                .put("latencyMs", latencyMs)
                .put("tokens", outcome.meta.getJSONObject("tokens"))
                .put("finishReason", result.finishReason == null ? JSONObject.NULL : result.finishReason)
                .put("answer", result.content == null ? JSONObject.NULL : result.content)
                .put("reasoningChars", reasoning == null ? 0 : reasoning.length())
                .put("reasoning", reasoning == null ? JSONObject.NULL : cut(reasoning, MAX_REASONING));
            if ( !result.ok ) {
                return outcome.fail(result.error, result.message);
            }
            if ( "length".equals(result.finishReason) ) {
                return outcome.fail("cut_off", "the answer was cut off (too long)");
            }
            outcome.answer =
                infer
                    ? AiPrompts.checkInfer(result.content)
                    : FIX.equals(kind)
                        ? AiPrompts.checkFix(result.content)
                        : ANALYZE.equals(kind) ? AiPrompts.checkAnalyze(result.content) : AiPrompts.checkGenerate(result.content);
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
                    + event.opt("host")
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
     * http_&lt;status&gt;, bad_response, cut_off, bad_answer, no_pack, server_error) with a message; meta for the browser (callId, model, provider,
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
