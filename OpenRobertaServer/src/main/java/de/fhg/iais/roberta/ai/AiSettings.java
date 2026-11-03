package de.fhg.iais.roberta.ai;

import java.io.File;
import java.io.IOException;
import java.util.Map;

import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import de.fhg.iais.roberta.main.EnvFile;
import de.fhg.iais.roberta.util.ServerProperties;

/**
 * the settings of the AI test assistant: DeepSeek's address and model, its API key, the default of the switch, the folder of the context pack and of the
 * telemetry. All but the key are server properties (usually from .env, see {@link EnvFile}). The key is read on its own, from the environment or .env
 * ({@link EnvFile#DEEPSEEK_API_KEY}), and kept here only: it is never a server property, because the server logs every define, it is never logged, and
 * it never leaves the server except in the Authorization header of a call to DeepSeek.
 */
public final class AiSettings {
    private static final Logger LOG = LoggerFactory.getLogger(AiSettings.class);
    private static final String REDACTED = "***";

    private final String url;
    private final String model;
    private final String key;
    private final boolean defaultOn;
    private final String packDir;
    private final String telemetryDir;
    private final String effortInfer;
    private final String effortGenerate;

    /**
     * @param url DeepSeek's API, e.g. https://api.deepseek.com (a / at the end is left out)
     * @param model the model's id, e.g. deepseek-flash
     * @param key the API key; null: the assistant is not available
     * @param defaultOn whether the assistant is on for a learner who was never switched
     * @param packDir the folder of the context pack; null or empty: the pack in the server's resources
     * @param telemetryDir the folder of the study's telemetry (levels.telemetry.dir)
     * @param effortInfer the model's reasoning effort for a guess (low, high, max); null or empty: the model's default
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
        this.url = url == null ? null : url.trim().replaceAll("/+$", "");
        this.model = model == null ? null : model.trim();
        this.key = key == null || key.trim().isEmpty() ? null : key.trim();
        this.defaultOn = defaultOn;
        this.packDir = packDir == null || packDir.trim().isEmpty() ? null : packDir.trim();
        this.telemetryDir = telemetryDir;
        this.effortInfer = effortInfer == null || effortInfer.trim().isEmpty() ? null : effortInfer.trim();
        this.effortGenerate = effortGenerate == null || effortGenerate.trim().isEmpty() ? null : effortGenerate.trim();
    }

    /**
     * @param serverProperties the server's properties
     * @param envFile the .env file, for the key
     * @param environment the environment variables, for the key (they override the file)
     */
    public static AiSettings of(ServerProperties serverProperties, File envFile, Map<String, String> environment) {
        String key = null;
        try {
            key = EnvFile.secret(envFile, environment, EnvFile.DEEPSEEK_API_KEY);
        } catch ( IOException e ) {
            LOG.error("the AI test assistant is not available: " + EnvFile.DEEPSEEK_API_KEY + " could not be read from " + envFile + ": " + e.getMessage());
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
                serverProperties.getStringProperty("ai.effort.generate"));
        LOG.info("AI test assistant: " + settings);
        return settings;
    }

    /**
     * @return whether the assistant can call DeepSeek: an address, a model and a key are set
     */
    public boolean isAvailable() {
        return notEmpty(this.url) && notEmpty(this.model) && this.key != null;
    }

    public String getUrl() {
        return this.url;
    }

    public String getModel() {
        return this.model;
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
     * @return the value of the Authorization header of a call to DeepSeek. Never log it.
     */
    String authorization() {
        return "Bearer " + this.key;
    }

    /**
     * @param text a text that might contain the key (an error message of DeepSeek, say)
     * @return the text, with the key replaced by ***
     */
    public String redact(String text) {
        if ( text == null || this.key == null ) {
            return text;
        }
        return text.replace(this.key, REDACTED);
    }

    /**
     * @return what the browser learns (ClientInit, server.ai): {available, default}. No address, no model, no key.
     */
    public JSONObject clientInfo() {
        return new JSONObject().put("available", isAvailable()).put("default", this.defaultOn);
    }

    @Override
    public String toString() {
        return "url "
            + this.url
            + ", model "
            + this.model
            + ", key "
            + (this.key == null ? "not set" : "set")
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
}
