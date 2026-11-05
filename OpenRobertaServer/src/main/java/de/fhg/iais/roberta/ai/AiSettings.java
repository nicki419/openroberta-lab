package de.fhg.iais.roberta.ai;

import java.io.File;
import java.io.IOException;
import java.net.MalformedURLException;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import de.fhg.iais.roberta.main.EnvFile;
import de.fhg.iais.roberta.util.ServerProperties;

/**
 * the settings of the AI test assistant: the model's API (the primary: SDU's UCloud) and the one asked when it fails (the fallback: DeepSeek's own
 * API), each with its address, model and API key; the default of the switch, the folder of the context pack and of the telemetry. All but the keys are
 * server properties (usually from .env, see {@link EnvFile}). The keys are read on their own, from the environment or .env
 * ({@link EnvFile#DEEPSEEK_API_KEY}, {@link EnvFile#DEEPSEEK_FALLBACK_API_KEY}), and kept here only: they are never server properties, because the
 * server logs every define, they are never logged, and they never leave the server except in the Authorization header of a call to their API.
 */
public final class AiSettings {
    private static final Logger LOG = LoggerFactory.getLogger(AiSettings.class);
    private static final String REDACTED = "***";
    public static final String PRIMARY = "primary";
    public static final String FALLBACK = "fallback";

    private final Provider primary;
    private final Provider fallback; // null: none
    private final boolean defaultOn;
    private final String packDir;
    private final String telemetryDir;
    private final String effortInfer;
    private final String effortGenerate;

    /**
     * the settings without a fallback (see {@link #withFallback})
     *
     * @param url the model's API, e.g. https://ai.cloud.sdu.dk/v1 (a / at the end is left out; the calls go to {url}/chat/completions)
     * @param model the model's id, e.g. deepseek-ai/DeepSeek-V4.1-Flash-1017
     * @param key the API key; null: this API is not available
     * @param defaultOn whether the assistant is on for a learner who was never switched
     * @param packDir the folder of the context pack; null or empty: the pack in the server's resources
     * @param telemetryDir the folder of the study's telemetry (levels.telemetry.dir)
     * @param effortInfer the model's reasoning effort for a guess (low, high, max; SDU's also none); null or empty: the model's default
     * @param effortGenerate … for writing tests
     */
    public AiSettings(
        String url,
        String model,
        String key,
        boolean defaultOn,
        String packDir,
        String telemetryDir,
        String effortInfer,
        String effortGenerate) {
        this(new Provider(PRIMARY, url, model, key), null, defaultOn, packDir, telemetryDir, effortInfer, effortGenerate);
    }

    private AiSettings(
        Provider primary,
        Provider fallback,
        boolean defaultOn,
        String packDir,
        String telemetryDir,
        String effortInfer,
        String effortGenerate) {
        this.primary = primary;
        this.fallback = fallback;
        this.defaultOn = defaultOn;
        this.packDir = packDir == null || packDir.trim().isEmpty() ? null : packDir.trim();
        this.telemetryDir = telemetryDir;
        this.effortInfer = effortInfer == null || effortInfer.trim().isEmpty() ? null : effortInfer.trim();
        this.effortGenerate = effortGenerate == null || effortGenerate.trim().isEmpty() ? null : effortGenerate.trim();
    }

    /**
     * @param url the fallback's API, e.g. https://api.deepseek.com
     * @param model its model, e.g. deepseek-flash
     * @param key its API key; null: there is no fallback
     * @return these settings with that fallback
     */
    public AiSettings withFallback(String url, String model, String key) {
        return new AiSettings(this.primary, new Provider(FALLBACK, url, model, key), this.defaultOn, this.packDir, this.telemetryDir, this.effortInfer, this.effortGenerate);
    }

    /**
     * @param serverProperties the server's properties
     * @param envFile the .env file, for the keys
     * @param environment the environment variables, for the keys (they override the file)
     */
    public static AiSettings of(ServerProperties serverProperties, File envFile, Map<String, String> environment) {
        String key = null;
        String fallbackKey = null;
        try {
            key = EnvFile.secret(envFile, environment, EnvFile.DEEPSEEK_API_KEY);
            fallbackKey = EnvFile.secret(envFile, environment, EnvFile.DEEPSEEK_FALLBACK_API_KEY);
        } catch ( IOException e ) {
            LOG.error("the AI test assistant's keys could not be read from " + envFile + ": " + e.getMessage());
        }
        AiSettings settings =
            new AiSettings(
                serverProperties.getStringProperty("ai.deepseek.url"),
                serverProperties.getStringProperty("ai.deepseek.model"),
                key,
                serverProperties.getBooleanProperty("ai.tests.default"),
                serverProperties.getStringProperty("ai.pack.dir"),
                serverProperties.getStringProperty("levels.telemetry.dir"),
                serverProperties.getStringProperty("ai.effort.infer"),
                serverProperties.getStringProperty("ai.effort.generate"))
                .withFallback(serverProperties.getStringProperty("ai.fallback.url"), serverProperties.getStringProperty("ai.fallback.model"), fallbackKey);
        LOG.info("AI test assistant: " + settings);
        return settings;
    }

    /**
     * @return whether the assistant can call a model: the primary or the fallback has an address, a model and a key
     */
    public boolean isAvailable() {
        return !providers().isEmpty();
    }

    /**
     * @return the APIs that can be called, the primary first
     */
    public List<Provider> providers() {
        List<Provider> providers = new ArrayList<>();
        if ( this.primary.isAvailable() ) {
            providers.add(this.primary);
        }
        if ( this.fallback != null && this.fallback.isAvailable() ) {
            providers.add(this.fallback);
        }
        return Collections.unmodifiableList(providers);
    }

    public Provider getPrimary() {
        return this.primary;
    }

    /**
     * @return the fallback, or null
     */
    public Provider getFallback() {
        return this.fallback;
    }

    /**
     * @return the model of the first API that can be called (the primary's if none can)
     */
    public String getModel() {
        List<Provider> providers = providers();
        return providers.isEmpty() ? this.primary.getModel() : providers.get(0).getModel();
    }

    public boolean isDefaultOn() {
        return this.defaultOn;
    }

    /**
     * @return the folder of the context pack, or null: the pack in the server's resources
     */
    public String getPackDir() {
        return this.packDir;
    }

    public String getTelemetryDir() {
        return this.telemetryDir;
    }

    /**
     * @return the model's reasoning effort for a guess, or null: the model's default
     */
    public String getEffortInfer() {
        return this.effortInfer;
    }

    /**
     * @return the model's reasoning effort for writing tests, or null: the model's default
     */
    public String getEffortGenerate() {
        return this.effortGenerate;
    }

    /**
     * @param text a text that might contain a key (an error message of an API, say)
     * @return the text, with every key replaced by ***
     */
    public String redact(String text) {
        if ( text == null ) {
            return null;
        }
        for ( Provider provider : new Provider[] {
            this.primary,
            this.fallback
        } ) {
            if ( provider != null && provider.key != null ) {
                text = text.replace(provider.key, REDACTED);
            }
        }
        return text;
    }

    /**
     * @return what the browser learns (ClientInit, server.ai): {available, default}. No address, no model, no key.
     */
    public JSONObject clientInfo() {
        return new JSONObject().put("available", isAvailable()).put("default", this.defaultOn);
    }

    @Override
    public String toString() {
        return this.primary
            + ", fallback "
            + (this.fallback == null ? "none" : this.fallback.toString())
            + ", default "
            + (this.defaultOn ? "on" : "off")
            + ", pack "
            + (this.packDir == null ? "from the resources" : this.packDir)
            + ", effort "
            + this.effortInfer
            + "/"
            + this.effortGenerate
            + (isAvailable() ? "" : ": not available");
    }

    private static boolean notEmpty(String s) {
        return s != null && !s.isEmpty();
    }

    /**
     * an API the assistant can call: its name (primary or fallback), address, model and key. The key never leaves this class except in
     * {@link #authorization()}.
     */
    public static final class Provider {
        private final String name;
        private final String url;
        private final String model;
        private final String key;

        Provider(String name, String url, String model, String key) {
            this.name = name;
            this.url = url == null ? null : url.trim().replaceAll("/+$", "");
            this.model = model == null ? null : model.trim();
            this.key = key == null || key.trim().isEmpty() ? null : key.trim();
        }

        /**
         * @return whether it can be called: an address, a model and a key are set
         */
        public boolean isAvailable() {
            return notEmpty(this.url) && notEmpty(this.model) && this.key != null;
        }

        public String getName() {
            return this.name;
        }

        public String getUrl() {
            return this.url;
        }

        public String getModel() {
            return this.model;
        }

        /**
         * @return the host of its address (for the telemetry), or the address if it can't be read
         */
        public String getHost() {
            try {
                return new URL(this.url).getHost();
            } catch ( MalformedURLException e ) {
                return String.valueOf(this.url);
            }
        }

        /**
         * @return the value of the Authorization header of a call to it. Never log it.
         */
        String authorization() {
            return "Bearer " + this.key;
        }

        @Override
        public String toString() {
            return "url " + this.url + ", model " + this.model + ", key " + (this.key == null ? "not set" : "set");
        }
    }
}
