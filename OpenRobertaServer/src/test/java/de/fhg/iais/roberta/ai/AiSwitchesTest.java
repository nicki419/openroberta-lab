package de.fhg.iais.roberta.ai;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import org.json.JSONObject;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * the AI switch per test subject, in a file beside the telemetry
 */
public class AiSwitchesTest {
    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    @Test
    public void anAccountNeverSwitchedHasTheDefault() throws Exception {
        File dir = new File(this.folder.getRoot(), "not/there/yet");
        assertNull(AiSwitches.get(dir, AiSwitches.keyOf(7, "pia")));
        assertFalse(dir.exists());
    }

    @Test
    public void eachAccountKeepsItsSwitch() throws Exception {
        File dir = new File(this.folder.getRoot(), "telemetry");
        String pia = AiSwitches.keyOf(7, "pia");
        String tom = AiSwitches.keyOf(8, "tom.k@x");
        AiSwitches.set(dir, pia, true);
        AiSwitches.set(dir, tom, false);
        assertEquals(Boolean.TRUE, AiSwitches.get(dir, pia));
        assertEquals(Boolean.FALSE, AiSwitches.get(dir, tom));
        AiSwitches.set(dir, pia, false);
        assertEquals(Boolean.FALSE, AiSwitches.get(dir, pia));
        assertEquals("user-8-tom_k_x", tom); // as the name of the telemetry file
        JSONObject file = new JSONObject(new String(Files.readAllBytes(new File(dir, AiSwitches.FILE_NAME).toPath()), StandardCharsets.UTF_8));
        assertEquals(2, file.length());
        assertTrue(file.getJSONObject(pia).has("time"));
        assertFalse(new File(dir, AiSwitches.FILE_NAME + ".tmp").exists());
    }

    @Test
    public void anUnreadableFileMeansTheDefault() throws Exception {
        File dir = this.folder.newFolder("broken");
        Files.write(new File(dir, AiSwitches.FILE_NAME).toPath(), "{not json".getBytes(StandardCharsets.UTF_8));
        assertNull(AiSwitches.get(dir, AiSwitches.keyOf(7, "pia")));
        AiSwitches.set(dir, AiSwitches.keyOf(7, "pia"), true);
        assertEquals(Boolean.TRUE, AiSwitches.get(dir, AiSwitches.keyOf(7, "pia")));
    }
}
