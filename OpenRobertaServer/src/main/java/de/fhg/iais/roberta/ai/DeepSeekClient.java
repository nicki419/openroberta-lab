package de.fhg.iais.roberta.ai;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ConnectException;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * a small client of an OpenAI-compatible chat API (POST {url}/chat/completions: SDU's UCloud or DeepSeek's own), with Java 8's HttpURLConnection. It
 * asks for JSON (JSON mode, response_format json_object), with timeouts, and tries a second time once after a 429 (too many requests), a 5xx, or no
 * connection. The key goes only into the Authorization header; error texts of the API are redacted ({@link AiSettings#redact}). Stateless, so one
 * client per API serves all requests.
 */
public class DeepSeekClient {
    public static final long RETRY_DELAY_MS = 1000;
    private static final int CONNECT_TIMEOUT_MS = 5000;
    private static final long MAX_RETRY_AFTER_MS = 5000;
    private static final int MAX_ERROR_CHARS = 500;

    private final AiSettings settings;
    private final AiSettings.Provider provider;
    private final long retryDelayMs;

    /**
     * @param settings the settings (to redact the keys from error texts)
     * @param provider the API: its address, model and key
     * @param retryDelayMs how long to wait before the second try (unless the API says so in Retry-After, at most 5 s)
     */
    public DeepSeekClient(AiSettings settings, AiSettings.Provider provider, long retryDelayMs) {
        this.settings = settings;
        this.provider = provider;
        this.retryDelayMs = retryDelayMs;
    }

    public AiSettings.Provider getProvider() {
        return this.provider;
    }

    /**
     * a chat completion in JSON mode. Never throws: a failure is a result with an error.
     *
     * @param messages [{role, content}, ...], the first the system prompt
     * @param maxTokens the most tokens of the answer, the reasoning included
     * @param effort the reasoning effort (low, high, max), or null: the model's default
     * @param readTimeoutMs how long to wait for the answer, per try
     */
    public Result chat(JSONArray messages, int maxTokens, String effort, int readTimeoutMs) {
        JSONObject body =
            new JSONObject()
                .put("model", this.provider.getModel())
                .put("messages", messages)
                .put("response_format", new JSONObject().put("type", "json_object"))
                .put("max_tokens", maxTokens)
                .put("stream", false);
        if ( effort != null ) {
            body.put("reasoning_effort", effort);
        }
        byte[] request = body.toString().getBytes(StandardCharsets.UTF_8);
        Result result = new Result();
        long start = System.currentTimeMillis();
        for ( int attempt = 1; attempt <= 2; attempt++ ) {
            result.attempts = attempt;
            long retryAfterMs = this.retryDelayMs;
            try {
                HttpURLConnection connection = open("/chat/completions", readTimeoutMs);
                connection.setRequestMethod("POST");
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                try (OutputStream out = connection.getOutputStream()) {
                    out.write(request);
                }
                int status = connection.getResponseCode();
                result.httpStatus = status;
                if ( status == 200 ) {
                    parse(result, read(connection.getInputStream()));
                    break;
                }
                result.ok = false;
                result.error = "http_" + status;
                result.message = errorText(connection);
                String retryAfter = connection.getHeaderField("Retry-After");
                if ( retryAfter != null && retryAfter.trim().matches("\\d+") ) {
                    retryAfterMs = Math.min(MAX_RETRY_AFTER_MS, Long.parseLong(retryAfter.trim()) * 1000);
                }
                if ( status != 429 && status < 500 ) {
                    break;
                }
            } catch ( SocketTimeoutException e ) {
                boolean connecting = String.valueOf(e.getMessage()).toLowerCase().contains("connect");
                result.ok = false;
                result.error = connecting ? "unreachable" : "timeout";
                result.message = connecting ? host() + " could not be reached" : host() + " didn't answer within " + readTimeoutMs / 1000 + " s";
                if ( !connecting ) {
                    break; // another try would make the learner wait twice as long
                }
            } catch ( ConnectException e ) {
                result.ok = false;
                result.error = "unreachable";
                result.message = host() + " could not be reached: " + e.getMessage();
            } catch ( IOException e ) {
                result.ok = false;
                result.error = "unreachable";
                result.message = this.settings.redact("the call to " + host() + " failed: " + e.getMessage());
                break;
            }
            if ( attempt == 1 ) {
                sleep(retryAfterMs);
            }
        }
        result.latencyMs = System.currentTimeMillis() - start;
        return result;
    }

    /**
     * @return the models the key may use (GET {url}/models): {object: "list", data: [{id, name, ...}]}
     */
    public JSONObject models() throws IOException {
        HttpURLConnection connection = open("/models", 20000);
        int status = connection.getResponseCode();
        if ( status != 200 ) {
            throw new IOException(host() + " answered " + status + ": " + errorText(connection));
        }
        return new JSONObject(read(connection.getInputStream()));
    }

    private String host() {
        return this.provider.getHost();
    }

    private HttpURLConnection open(String path, int readTimeoutMs) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(this.provider.getUrl() + path).openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(readTimeoutMs);
        connection.setRequestProperty("Authorization", this.provider.authorization());
        connection.setRequestProperty("Accept", "application/json");
        return connection;
    }

    private void parse(Result result, String response) {
        try {
            JSONObject json = new JSONObject(response);
            JSONObject choice = json.getJSONArray("choices").getJSONObject(0);
            JSONObject message = choice.getJSONObject("message");
            result.content = message.optString("content", "");
            // DeepSeek's own API: reasoning_content; SDU's (vLLM): reasoning
            result.reasoning = message.optString("reasoning_content", message.optString("reasoning", null));
            result.finishReason = choice.optString("finish_reason", null);
            result.model = json.optString("model", null);
            JSONObject usage = json.optJSONObject("usage");
            if ( usage != null ) {
                result.promptTokens = usage.optInt("prompt_tokens");
                result.cachedTokens = usage.has("prompt_cache_hit_tokens") ? usage.optInt("prompt_cache_hit_tokens") : nested(usage, "prompt_tokens_details", "cached_tokens");
                result.completionTokens = usage.optInt("completion_tokens");
                JSONObject details = usage.optJSONObject("completion_tokens_details");
                result.reasoningTokens = details == null || !details.has("reasoning_tokens") ? null : details.optInt("reasoning_tokens"); // SDU doesn't say
            }
            result.ok = true;
            result.error = null;
            result.message = null;
        } catch ( JSONException e ) {
            result.ok = false;
            result.error = "bad_response";
            result.message = "the response of " + host() + " could not be read: " + e.getMessage();
        }
    }

    private static int nested(JSONObject json, String object, String key) {
        JSONObject inner = json.optJSONObject(object);
        return inner == null ? 0 : inner.optInt(key);
    }

    private String errorText(HttpURLConnection connection) {
        try {
            InputStream error = connection.getErrorStream();
            String text = error == null ? "" : read(error);
            text = this.settings.redact(text).trim();
            return text.length() > MAX_ERROR_CHARS ? text.substring(0, MAX_ERROR_CHARS) + " …" : text;
        } catch ( IOException e ) {
            return "";
        }
    }

    private static String read(InputStream in) throws IOException {
        try (InputStream stream = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            for ( int n = stream.read(buffer); n >= 0; n = stream.read(buffer) ) {
                out.write(buffer, 0, n);
            }
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch ( InterruptedException e ) {
            Thread.currentThread().interrupt();
        }
    }

    /**
     * the result of a chat: ok and the answer's content, or an error (timeout, unreachable, http_&lt;status&gt;, bad_response) with a message
     */
    public static final class Result {
        public boolean ok;
        public String error;
        public String message;
        public int httpStatus;
        public int attempts;
        public long latencyMs;
        public String content;
        public String reasoning;
        public String finishReason;
        public String model;
        public int promptTokens;
        public int cachedTokens;
        public int completionTokens;
        public Integer reasoningTokens; // null: the API doesn't say
    }
}
