package de.fhg.iais.roberta.javaServer;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Assert;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import de.fhg.iais.roberta.javaServer.restServices.all.controller.LevelsController;

/**
 * the level sets: a folder per set, a JSON file per level, both in the order of their names
 */
public class LevelsControllerTest {
    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    private void write(String path, String content) throws Exception {
        File file = new File(this.folder.getRoot(), path);
        file.getParentFile().mkdirs();
        Files.write(file.toPath(), content.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    public void listsTheSetsAndLevelsInOrder() throws Exception {
        write("02-harder/01-a.json", "{\"title\": \"A\"}");
        write("01-first_steps/02-second.json", "{\"title\": \"Second\"}");
        write("01-first_steps/01-first.json", "{\"title\": \"First\"}");
        write("01-first_steps/notes.txt", "not a level");
        write("01-first_steps/03-broken.json", "{\"title\": ");
        write("03-empty/readme.md", "no levels here");
        write("README.md", "the levels");
        JSONObject listing = LevelsController.listSets(this.folder.getRoot());
        JSONArray sets = listing.getJSONArray("sets");
        Assert.assertEquals(2, sets.length());
        JSONObject first = sets.getJSONObject(0);
        Assert.assertEquals("01-first_steps", first.getString("id"));
        Assert.assertEquals("first steps", first.getString("name"));
        JSONArray levels = first.getJSONArray("levels");
        Assert.assertEquals(2, levels.length());
        Assert.assertEquals("01-first_steps/01-first", levels.getJSONObject(0).getString("id"));
        Assert.assertEquals("01-first_steps/01-first.json", levels.getJSONObject(0).getString("file"));
        Assert.assertEquals("First", levels.getJSONObject(0).getJSONObject("level").getString("title"));
        Assert.assertEquals("Second", levels.getJSONObject(1).getJSONObject("level").getString("title"));
        Assert.assertEquals("harder", sets.getJSONObject(1).getString("name"));
        JSONArray problems = listing.getJSONArray("problems");
        Assert.assertEquals(1, problems.length());
        Assert.assertEquals("01-first_steps/03-broken.json", problems.getJSONObject(0).getString("file"));
    }

    @Test
    public void aMissingFolderHasNoSets() {
        JSONObject listing = LevelsController.listSets(new File(this.folder.getRoot(), "missing"));
        Assert.assertEquals(0, listing.getJSONArray("sets").length());
    }

    @Test
    public void telemetryIsAppendedPerParticipant() throws Exception {
        File dir = new File(this.folder.getRoot(), "telemetry");
        JSONArray events = new JSONArray().put(new JSONObject().put("kind", "level_opened").put("level", "01-a/01-b")).put("not an event");
        File file = LevelsController.writeTelemetry(dir, 7, "anna.b", 42, events);
        LevelsController.writeTelemetry(dir, 7, "anna.b", 43, new JSONArray().put(new JSONObject().put("kind", "attempt_started")));
        Assert.assertEquals("user-7-anna_b.jsonl", file.getName());
        java.util.List<String> lines = Files.readAllLines(file.toPath(), StandardCharsets.UTF_8);
        Assert.assertEquals(2, lines.size());
        JSONObject first = new JSONObject(lines.get(0));
        Assert.assertEquals("level_opened", first.getString("kind"));
        Assert.assertEquals("01-a/01-b", first.getString("level"));
        Assert.assertEquals(7, first.getInt("userId"));
        Assert.assertEquals("anna.b", first.getString("account"));
        Assert.assertEquals(42, first.getLong("session"));
        Assert.assertTrue(first.has("serverTime"));
        Assert.assertEquals("attempt_started", new JSONObject(lines.get(1)).getString("kind"));
        File anonymous = LevelsController.writeTelemetry(dir, -1, null, 9, new JSONArray().put(new JSONObject().put("kind", "set_selected")));
        Assert.assertEquals("session-9.jsonl", anonymous.getName());
        Assert.assertTrue(new JSONObject(Files.readAllLines(anonymous.toPath(), StandardCharsets.UTF_8).get(0)).isNull("account"));
    }

    @Test
    public void setNames() {
        Assert.assertEquals("first steps", LevelsController.setName("01-first-steps"));
        Assert.assertEquals("Mazes", LevelsController.setName("Mazes"));
        Assert.assertEquals("2024", LevelsController.setName("2024"));
    }
}
