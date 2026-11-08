package de.fhg.iais.roberta.main;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * the settings of a ".env" file and of environment variables with the same names, as server properties. The file is read from the working directory (the
 * repository's root for "ora.sh start-from-git"). Only the names in {@link #PROPERTIES} are used. A line is KEY=VALUE, the value may be quoted, a line
 * starting with # is a comment. An environment variable overrides the file; a -d define on the command line overrides both (it comes later).
 * <p>
 * Secrets ({@link #DEEPSEEK_API_KEY}, {@link #UCLOUD_API_KEY}) are no server properties: the server logs every define (Util.loadAndMergeOpenRobertaServerProperties). They are
 * read with {@link #secret} by the code that needs them.
 */
public final class EnvFile {
    public static final String FILE_NAME = ".env";

    /** the APIs the AI test assistant knows: DeepSeek's own (deepseek) and SDU's UCloud (ucloud), each with &lt;NAME&gt;_API_KEY, _URL, _MODEL, _EFFORT_* */
    public static final String[] AI_PROVIDERS = {
        "deepseek",
        "ucloud"
    };

    /** the AI's calls, each with its own reasoning effort per API */
    public static final String[] AI_CALLS = {
        "analyze",
        "generate",
        "fix"
    };

    /**
     * the names in .env and the server properties they set
     */
    public static final Map<String, String> PROPERTIES;

    static {
        Map<String, String> properties = new LinkedHashMap<>();
        properties.put("LEVEL_DESIGNER", "levels.designer"); // true: the Level designer tab is shown
        properties.put("LEVELS_DIR", "levels.dir"); // the folder of the level sets (a folder per set, a file per level)
        properties.put("LEVEL_TELEMETRY_DIR", "levels.telemetry.dir"); // the folder of the study's telemetry (a file per participant)
        properties.put("STUDY_PROGRAMS_DIR", "study.programs.dir"); // the programs every new account gets (a file per program; empty: none)
        properties.put("AI_PROVIDERS", "ai.providers"); // the AI test assistant's APIs in the order they are asked: deepseek, ucloud
        for ( String provider : AI_PROVIDERS ) { // DeepSeek's own API, SDU's UCloud: the address, the model, the reasoning effort of each call
            String env = provider.toUpperCase(), property = "ai." + provider + ".";
            properties.put(env + "_URL", property + "url");
            properties.put(env + "_MODEL", property + "model");
            for ( String call : AI_CALLS ) {
                properties.put(env + "_EFFORT_" + call.toUpperCase(), property + "effort." + call); // none, low, high, max
            }
        }
        properties.put("AI_TESTS_DEFAULT", "ai.tests.default"); // true: the AI test assistant is on for a learner who was never switched
        properties.put("AI_PACK_DIR", "ai.pack.dir"); // the folder of the AI's context pack, read at every call (none: the server's resources)
        PROPERTIES = Collections.unmodifiableMap(properties);
    }

    /**
     * the name of the API key of DeepSeek's own API in .env and in the environment: a secret, see {@link #secret}
     */
    public static final String DEEPSEEK_API_KEY = "DEEPSEEK_API_KEY";

    /**
     * … of SDU's UCloud
     */
    public static final String UCLOUD_API_KEY = "UCLOUD_API_KEY";

    /**
     * @param provider one of {@link #AI_PROVIDERS}
     * @return the name of its API key (a secret): &lt;NAME&gt;_API_KEY
     */
    public static String apiKeyOf(String provider) {
        return provider.toUpperCase() + "_API_KEY";
    }

    private EnvFile() {
        // only static methods
    }

    /**
     * @param file the .env file; if it doesn't exist, there are no settings
     * @return the settings of the file, in their order
     */
    public static Map<String, String> read(File file) throws IOException {
        Map<String, String> settings = new LinkedHashMap<>();
        if ( !file.isFile() ) {
            return settings;
        }
        for ( String line : Files.readAllLines(file.toPath(), StandardCharsets.UTF_8) ) {
            line = line.trim();
            if ( line.startsWith("export ") ) {
                line = line.substring("export ".length()).trim();
            }
            int eq = line.indexOf('=');
            if ( line.isEmpty() || line.startsWith("#") || eq <= 0 ) {
                continue;
            }
            String value = line.substring(eq + 1).trim();
            if ( value.length() >= 2 && (value.startsWith("\"") && value.endsWith("\"") || value.startsWith("'") && value.endsWith("'")) ) {
                value = value.substring(1, value.length() - 1);
            }
            settings.put(line.substring(0, eq).trim(), value);
        }
        return settings;
    }

    /**
     * a secret: never a server property and never logged
     *
     * @param file the .env file
     * @param environment the environment variables (they override the file)
     * @param name the secret's name, e.g. {@link #DEEPSEEK_API_KEY}
     * @return its value, trimmed, or null if it isn't set or is empty
     */
    public static String secret(File file, Map<String, String> environment, String name) throws IOException {
        String value = environment.get(name);
        if ( value == null || value.trim().isEmpty() ) {
            value = read(file).get(name);
        }
        return value == null || value.trim().isEmpty() ? null : value.trim();
    }

    /**
     * @param file the .env file
     * @param environment the environment variables
     * @return the server properties they set, as defines "key=value" (the format of -d)
     */
    public static List<String> serverDefines(File file, Map<String, String> environment) throws IOException {
        Map<String, String> settings = read(file);
        List<String> defines = new ArrayList<>();
        for ( Map.Entry<String, String> entry : PROPERTIES.entrySet() ) {
            String value = environment.get(entry.getKey());
            if ( value == null ) {
                value = settings.get(entry.getKey());
            }
            if ( value != null && !value.trim().isEmpty() ) {
                defines.add(entry.getValue() + "=" + value.trim());
            }
        }
        return defines;
    }
}
