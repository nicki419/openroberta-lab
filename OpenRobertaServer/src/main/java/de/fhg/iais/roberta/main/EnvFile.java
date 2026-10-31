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
 */
public final class EnvFile {
    public static final String FILE_NAME = ".env";

    /**
     * the names in .env and the server properties they set
     */
    public static final Map<String, String> PROPERTIES;

    static {
        Map<String, String> properties = new LinkedHashMap<>();
        properties.put("LEVEL_DESIGNER", "levels.designer"); // true: the Level designer tab is shown
        properties.put("LEVELS_DIR", "levels.dir"); // the folder of the level sets (a folder per set, a file per level)
        properties.put("LEVEL_TELEMETRY_DIR", "levels.telemetry.dir"); // the folder of the study's telemetry (a file per participant)
        PROPERTIES = Collections.unmodifiableMap(properties);
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
