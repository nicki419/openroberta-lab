package de.fhg.iais.roberta.ai;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.time.Instant;

import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * whether the AI test assistant is on for a test subject. It is switched in the browser (the Edit menu) and kept per account in a small JSON file beside
 * the telemetry, so it holds after a reload and on another machine: {@value #FILE_NAME}, {"user-&lt;id&gt;-&lt;account&gt;": {"on": true, "time":
 * "…"}, …} (the names of the telemetry files). An account that was never switched has no entry: the browser takes the default (AI_TESTS_DEFAULT).
 */
public final class AiSwitches {
    private static final Logger LOG = LoggerFactory.getLogger(AiSwitches.class);
    public static final String FILE_NAME = "ai-switch.json";

    private AiSwitches() {
        // only static methods
    }

    /**
     * @return the key of an account (as the name of its telemetry file)
     */
    public static String keyOf(int userId, String account) {
        return "user-" + userId + "-" + account.replaceAll("[^A-Za-z0-9_-]", "_");
    }

    /**
     * @param dir the telemetry folder
     * @return on or off, or null: never switched
     */
    public static synchronized Boolean get(File dir, String key) throws IOException {
        JSONObject entry = read(dir).optJSONObject(key);
        return entry == null || !entry.has("on") ? null : entry.optBoolean("on");
    }

    /**
     * @param dir the telemetry folder
     */
    public static synchronized void set(File dir, String key, boolean on) throws IOException {
        JSONObject all = read(dir);
        all.put(key, new JSONObject().put("on", on).put("time", Instant.now().toString()));
        Files.createDirectories(dir.toPath());
        File tmp = new File(dir, FILE_NAME + ".tmp");
        Files.write(tmp.toPath(), all.toString(2).getBytes(StandardCharsets.UTF_8));
        Files.move(tmp.toPath(), new File(dir, FILE_NAME).toPath(), StandardCopyOption.REPLACE_EXISTING);
    }

    private static JSONObject read(File dir) throws IOException {
        File file = new File(dir, FILE_NAME);
        if ( !file.isFile() ) {
            return new JSONObject();
        }
        try {
            return new JSONObject(new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8));
        } catch ( org.json.JSONException e ) {
            LOG.error("the AI switches in " + file + " are not readable: every account has the default until one is switched", e);
            return new JSONObject();
        }
    }
}
