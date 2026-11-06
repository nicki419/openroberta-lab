package de.fhg.iais.roberta.ai;

import java.io.File;
import java.io.IOException;
import java.net.MalformedURLException;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import de.fhg.iais.roberta.main.EnvFile;
import de.fhg.iais.roberta.util.ServerProperties;

/**
 * the settings of the AI test assistant: the APIs it calls, in the order they are asked (ai.providers, AI_PROVIDERS in .env; usually DeepSeek's own
 * API first, SDU's UCloud when it gives no answer), each with its address, model, API key and the reasoning effort of each call (analyze,
 * generate, fix); the default of the switch, the folder of the context pack and of the telemetry. All but the keys are server properties (usually from
 * .env, see {@link EnvFile}). The keys are read on their own, from the environment or .env (&lt;NAME&gt;_API_KEY: {@link EnvFile#DEEPSEEK_API_KEY},
 * {@link EnvFile#UCLOUD_API_KEY}), and kept here only: they are never server properties, because the server logs every define, they are never logged,
 * and they never leave the server except in the Authorization header of a call to their API.
 */
public final class AiSettings {
    private static final Logger LOG = LoggerFactory.getLogger(AiSettings.class);
    private static final String REDACTED = "***";
    public static final String DEFAULT_PROVIDER = "deepseek"; // the name of the API of the short constructor (tests)

    private final List<Provider> providers; // in the order they are asked
    private final boolean defaultOn;
    private final String packDir;
    private final String telemetryDir;

    /**
     * the settings with one API (named deepseek; see {@link #then} for more)
     *
     * @param url the API, e.g. https://api.deepseek.com (a / at the end is left out; the calls go to {url}/chat/completions)
     * @param model the model's id, e.g. deepseek-flash
     * @param key the API key; null: this API is not available
     * @param defaultOn whether the assistant is on for a learner who was never switched
     * @param packDir the folder of the context pack; null or empty: the pack in the server's resources
     * @param telemetryDir the folder of the study's telemetry (levels.telemetry.dir)
     * @param effort the model's reasoning effort for analyze, generate and fix (none, low, high, max); null or empty: the model's default
     */
    public AiSettings(String url, String model, String key, boolean defaultOn, String packDir, String telemetryDir, String effort) {
        this(
            Collections.singletonList(new Provider(DEFAULT_PROVIDER, url, model, key, efforts(effort, effort, effort))),
            defaultOn,
            packDir,
            telemetryDir);
    }

    /**
     * @param providers the APIs, in the order they are asked
     * @param defaultOn whether the assistant is on for a learner who was never switched
     * @param packDir the folder of the context pack; null or empty: the pack in the server's resources
     * @param telemetryDir the folder of the study's telemetry (levels.telemetry.dir)
     */
    public AiSettings(List<Provider> providers, boolean defaultOn, String packDir, String telemetryDir) {
        this.providers = Collections.unmodifiableList(new ArrayList<>(providers));
        this.defaultOn = defaultOn;
        this.packDir = packDir == null || packDir.trim().isEmpty() ? null : packDir.trim();
        this.telemetryDir = telemetryDir;
    }

    /**
     * @param provider an API, asked after those of these settings
     * @return these settings with it
     */
    public AiSettings then(Provider provider) {
        List<Provider> providers = new ArrayList<>(this.providers);
        providers.add(provider);
        return new AiSettings(providers, this.defaultOn, this.packDir, this.telemetryDir);
    }

    /**
     * @return the efforts of the calls: {analyze, generate, fix → effort}
     */
    public static Map<String, String> efforts(String analyze, String generate, String fix) {
        Map<String, String> efforts = new HashMap<>();
        efforts.put(AiService.ANALYZE, analyze);
        efforts.put(AiService.GENERATE, generate);
        efforts.put(AiService.FIX, fix);
        return efforts;
    }

    /**
     * @param serverProperties the server's properties
     * @param envFile the .env file, for the keys
     * @param environment the environment variables, for the keys (they override the file)
     */
    public static AiSettings of(ServerProperties serverProperties, File envFile, Map<String, String> environment) {
        List<Provider> providers = new ArrayList<>();
        String order = serverProperties.getStringProperty("ai.providers");
        for ( String name : (order == null ? "" : order).split(",") ) {
            name = name.trim().toLowerCase();
            if ( name.isEmpty() ) {
                continue;
            }
            if ( !java.util.Arrays.asList(EnvFile.AI_PROVIDERS).contains(name) ) {
                LOG.warn("the AI test assistant doesn't know the API " + name + " (ai.providers): left out");
                continue;
            }
            String key = null;
            try {
                key = EnvFile.secret(envFile, environment, EnvFile.apiKeyOf(name));
            } catch ( IOException e ) {
                LOG.error("the AI test assistant's key " + EnvFile.apiKeyOf(name) + " could not be read from " + envFile + ": " + e.getMessage());
            }
            String p = "ai." + name + ".";
            providers
                .add(
                    new Provider(
                        name,
                        serverProperties.getStringProperty(p + "url"),
                        serverProperties.getStringProperty(p + "model"),
                        key,
                        efforts(
                            serverProperties.getStringProperty(p + "effort.analyze"),
                            serverProperties.getStringProperty(p + "effort.generate"),
                            serverProperties.getStringProperty(p + "effort.fix"))));
        }
        AiSettings settings =
            new AiSettings(
                providers,
                serverProperties.getBooleanProperty("ai.tests.default"),
                serverProperties.getStringProperty("ai.pack.dir"),
                serverProperties.getStringProperty("levels.telemetry.dir"));
        LOG.info("AI test assistant: " + settings);
        return settings;
    }

    /**
     * @return whether the assistant can call a model: an API has an address, a model and a key
     */
    public boolean isAvailable() {
        return !providers().isEmpty();
    }

    /**
     * @return the APIs that can be called, in the order they are asked
     */
    public List<Provider> providers() {
        List<Provider> available = new ArrayList<>();
        for ( Provider provider : this.providers ) {
            if ( provider.isAvailable() ) {
                available.add(provider);
            }
        }
        return Collections.unmodifiableList(available);
    }

    /**
     * @return the model of the first API that can be called, or null
     */
    public String getModel() {
        List<Provider> available = providers();
        return available.isEmpty() ? null : available.get(0).getModel();
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
     * @param text a text that might contain a key (an error message of an API, say)
     * @return the text, with every key replaced by ***
     */
    public String redact(String text) {
        if ( text == null ) {
            return null;
        }
        for ( Provider provider : this.providers ) {
            if ( provider.key != null ) {
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
        StringBuilder s = new StringBuilder();
        for ( Provider provider : this.providers ) {
            s.append(s.length() == 0 ? "" : "; then ").append(provider);
        }
        return (s.length() == 0 ? "no API" : s.toString())
            + "; default "
            + (this.defaultOn ? "on" : "off")
            + ", pack "
            + (this.packDir == null ? "from the resources" : this.packDir)
            + (isAvailable() ? "" : ": not available");
    }

    private static boolean notEmpty(String s) {
        return s != null && !s.isEmpty();
    }

    /**
     * an API the assistant can call: its name (deepseek, ucloud), address, model, key and the reasoning effort of each call. The key never leaves this
     * class except in {@link #authorization()}.
     */
    public static final class Provider {
        private final String name;
        private final String url;
        private final String model;
        private final String key;
        private final Map<String, String> efforts;

        /**
         * @param name its name, e.g. ucloud
         * @param url its address, e.g. https://ai.cloud.sdu.dk/v1
         * @param model its model
         * @param key its API key; null: it can't be called
         * @param efforts the reasoning effort of each call (see {@link AiSettings#efforts}); null or empty: the model's default
         */
        public Provider(String name, String url, String model, String key, Map<String, String> efforts) {
            this.name = name;
            this.url = url == null ? null : url.trim().replaceAll("/+$", "");
            this.model = model == null ? null : model.trim();
            this.key = key == null || key.trim().isEmpty() ? null : key.trim();
            this.efforts = new HashMap<>();
            if ( efforts != null ) {
                efforts.forEach((call, effort) -> this.efforts.put(call, effort == null || effort.trim().isEmpty() ? null : effort.trim()));
            }
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
         * @param call analyze, generate or fix
         * @return its reasoning effort, or null: the model's default
         */
        public String effort(String call) {
            return this.efforts.get(call);
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
            return this.name
                + ": url "
                + this.url
                + ", model "
                + this.model
                + ", key "
                + (this.key == null ? "not set" : "set")
                + ", effort analyze/generate/fix "
                + effort(AiService.ANALYZE)
                + "/"
                + effort(AiService.GENERATE)
                + "/"
                + effort(AiService.FIX);
        }
    }
}
