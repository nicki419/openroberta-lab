package de.fhg.iais.roberta.ai;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.json.JSONObject;
import org.junit.Assert;
import org.junit.Test;

/**
 * the context pack and the parts of a prompt: the pack loads, its examples use the format of the per-call message and their answers pass the checks
 */
public class AiPromptsTest {
    private static final Pattern ANSWER = Pattern.compile("## The answer \\((analyze|generate|fix)\\)\\n.*?```json\\n(.*?)\\n```", Pattern.DOTALL);

    @Test
    public void trimNepo() {
        String xml =
            "<export xmlns=\"http://de.fhg.iais.roberta.blockly\"><program><block_set xmlns=\"http://de.fhg.iais.roberta.blockly\" robottype=\"edison\" xmlversion=\"3.1\" description=\"\" tags=\"\">\n"
                + "  <instance x=\"10\" y=\"20\"><block type=\"robControls_start\" id=\"a\" intask=\"true\" deletable=\"false\"><mutation declare=\"false\"/><data>{\"learningRate\":0.03}</data></block>\n"
                + "  <block type=\"text_comment\" id=\"b\"><field name=\"TEXT\">drive &lt;fast&gt;</field></block></instance></block_set></program>"
                + "<config><block_set robottype=\"edison\"><instance x=\"0\" y=\"0\"><block type=\"robBrick_Edison-Brick\" id=\"1\"/></instance></block_set></config></export>";
        Assert
            .assertEquals(
                "<block_set robottype=\"edison\">\n"
                    + " <instance>\n"
                    + "  <block type=\"robControls_start\" id=\"a\">\n"
                    + "   <mutation declare=\"false\"/>\n"
                    + "  </block>\n"
                    + "  <block type=\"text_comment\" id=\"b\">\n"
                    + "   <field name=\"TEXT\">drive &lt;fast&gt;</field>\n"
                    + "  </block>\n"
                    + " </instance>\n"
                    + "</block_set>",
                AiPrompts.trimNepo(xml));
        Assert.assertEquals("", AiPrompts.trimNepo(null));
    }

    @Test
    public void trimEdpy() {
        Assert.assertEquals("x = 1", AiPrompts.trimEdpy("import Ed\r\ndef _f():\r\n    pass\r\nEd.TimeWait(250, Ed.TIME_MILLISECONDS)\r\n\r\nx = 1\r\n\r\n"));
        Assert.assertEquals("import Ed\nx = 1", AiPrompts.trimEdpy("import Ed\nx = 1\n"));
    }

    @Test
    public void thePackLoadsFromTheResourcesAndFromItsFolder() throws Exception {
        ContextPack pack = ContextPack.fromResources();
        Assert.assertEquals("system.md", pack.getFiles().get(0));
        Assert.assertTrue(pack.getFiles().contains("schemas/generate.schema.json"));
        Assert.assertTrue(pack.getVersion().matches("[0-9a-f]{12}"));
        Assert.assertTrue(pack.getText().startsWith("# You are the test assistant of the Open Roberta Lab"));
        Assert.assertTrue(pack.getText().contains("# The JSON schema schemas/analyze.schema.json\n\n```json\n{"));
        Assert.assertFalse(pack.getText().contains("infer.schema")); // no guess since 2026-11-06
        File folder = new File("src/main/resources/ai");
        if ( folder.isDirectory() ) { // the tests run in OpenRobertaServer
            Assert.assertEquals(pack.getVersion(), ContextPack.fromDirectory(folder).getVersion());
        }
        int size = pack.getText().length();
        Assert.assertTrue("the pack has " + size + " characters", size > 20000 && size < 140000);
    }

    @Test
    public void theSchemasAreJson() throws Exception {
        ContextPack pack = ContextPack.fromResources();
        Matcher schemas = Pattern.compile("# The JSON schema (\\S+)\\n\\n```json\\n(.*?)\\n```", Pattern.DOTALL).matcher(pack.getText());
        int found = 0;
        while ( schemas.find() ) {
            Assert.assertTrue(schemas.group(1), new JSONObject(schemas.group(2)).has("$schema"));
            found++;
        }
        Assert.assertEquals(3, found);
    }

    @Test
    public void checkFix() {
        JSONObject answer = AiPrompts.checkFix("{\"program_wrong\": [{\"test\": \"A\", \"world\": \"W\", \"reason\": \"" + String.join("", java.util.Collections.nCopies(400, "x")) + "\"}]}");
        Assert.assertEquals(0, answer.getJSONArray("worlds").length());
        Assert.assertEquals(AiPrompts.MAX_REASON, answer.getJSONArray("program_wrong").getJSONObject(0).getString("reason").length());
        for ( String bad : new String[] {
            "{}",
            "{\"worlds\": [], \"program_wrong\": []}",
            "{\"worlds\": {}, \"program_wrong\": [{\"test\": \"A\", \"reason\": \"r\"}]}",
            "{\"program_wrong\": [{\"test\": \"A\"}]}",
            "{\"worlds\": [{\"name\": \"W\"}]}"
        } ) {
            try {
                AiPrompts.checkFix(bad);
                Assert.fail(bad);
            } catch ( AiException e ) {
                Assert.assertEquals(bad, "bad_answer", e.getCode());
            }
        }
    }

    @Test
    public void checkAnalyzeAndGenerate() {
        String ok = "{\"analysis_status\": \"ok\", \"likely_intent\": {\"description\": \"Drive.\"}, \"scenarios\": [{\"id\": \"S1\"}], \"decision_points\": null}";
        JSONObject answer = AiPrompts.checkAnalyze(ok);
        Assert.assertEquals(0, answer.getJSONArray("decision_points").length());
        Assert.assertEquals(0, answer.getJSONArray("unsupported_features").length());
        for ( String bad : new String[] {
            "{}",
            "{\"analysis_status\": \"ok\", \"likely_intent\": {\"description\": \"Drive.\"}}",
            "{\"analysis_status\": \"ok\", \"scenarios\": [{\"id\": \"S1\"}]}",
            "{\"analysis_status\": \"ok\", \"likely_intent\": {\"description\": \"Drive.\"}, \"scenarios\": {}}"
        } ) {
            try {
                AiPrompts.checkAnalyze(bad);
                Assert.fail(bad);
            } catch ( AiException e ) {
                Assert.assertEquals(bad, "bad_answer", e.getCode());
            }
        }
        Assert.assertEquals(0, AiPrompts.checkGenerate("{\"generation_status\": \"no_valid_scenarios\", \"worlds\": []}").getJSONArray("worlds").length());
        for ( String bad : new String[] {
            "{\"worlds\": []}",
            "{\"generation_status\": \"no_valid_scenarios\", \"worlds\": [{\"name\": \"W\", \"tests\": []}]}"
        } ) {
            try {
                AiPrompts.checkGenerate(bad);
                Assert.fail(bad);
            } catch ( AiException e ) {
                Assert.assertEquals(bad, "bad_answer", e.getCode());
            }
        }
        JSONObject doubtful = AiPrompts.checkFix("{\"doubtful\": [{\"test\": \"A\", \"world\": \"W\", \"reason\": \"r\"}]}");
        Assert.assertEquals(1, doubtful.getJSONArray("doubtful").length());
        Assert.assertEquals(0, doubtful.getJSONArray("program_wrong").length());
    }

    @Test
    public void theExamplesAnswersPassTheChecks() throws Exception {
        ContextPack pack = ContextPack.fromResources();
        Matcher answers = ANSWER.matcher(pack.getText());
        List<String> kinds = new ArrayList<>();
        int testedBy = 0;
        while ( answers.find() ) {
            kinds.add(answers.group(1));
            if ( "analyze".equals(answers.group(1)) ) {
                JSONObject answer = AiPrompts.checkAnalyze(answers.group(2));
                Assert.assertTrue(answer.getJSONArray("scenarios").length() > 0);
                testedBy += answer.getJSONArray("scenarios").getJSONObject(0).getJSONArray("tested_by").length();
            } else if ( "fix".equals(answers.group(1)) ) {
                JSONObject answer = AiPrompts.checkFix(answers.group(2));
                Assert.assertEquals(1, answer.getJSONArray("worlds").length());
                Assert.assertEquals(1, answer.getJSONArray("program_wrong").length());
            } else {
                AiPrompts.checkGenerate(answers.group(2));
            }
        }
        Assert.assertEquals("[analyze, generate, analyze, analyze, generate, fix]", kinds.toString());
        Assert.assertEquals(1, testedBy); // example 2: the learner's test already tests it
    }

    @Test
    public void theExamplesUseTheMessagesFormat() throws Exception {
        String text = ContextPack.fromResources().getText();
        for ( String heading : new String[] {
            "The program",
            "The learner's tests",
            "What the learner said before",
            "The program's decisions",
            "The program on a plain floor",
            "The analysis",
            "Task: analyze",
            "Task: generate",
            "Task: fix"
        } ) {
            Assert.assertTrue(heading, text.contains("\n### " + heading + "\n\n"));
        }
        Assert.assertFalse("the model is told nothing of levels", Pattern.compile("(?i)\\blevels?\\b").matcher(text).find()); // Ed.ReadLeftLightLevel is EdPy
        Assert.assertTrue("the guard works", Pattern.compile("(?i)\\blevels?\\b").matcher("the Level designer").find());
        Assert.assertTrue(text.contains("NEPO:\n```xml\n<block_set robottype=\"edison\">\n <instance>\n  <block type=\"robControls_start\" id=\"b1\">\n"));
        Assert.assertFalse("the start block's data is left out", text.contains("learningRate"));
        Assert.assertTrue(text.contains("### The program's decisions\n\n- D1: block b3, if \""));
        Assert.assertTrue(text.contains("EdPy:\n```python\nwhile True:\n"));
        Assert.assertTrue(text.contains("### The program's decisions\n\nNone: the program has no if"));
        Assert.assertFalse("no guess since 2026-11-06", text.contains("Task: infer") || text.contains("The intent you guessed"));
        Assert.assertTrue(text.contains("The learner's sentence: \"This program should follow a black line and stop if it senses an obstacle\""));
        Assert.assertTrue(text.contains("How they ran:\n\n- test \"On the line, it follows it to the goal\" (world \"A line to a goal\"): failed\n  The run ended after 8 s"));
        Assert.assertTrue(text.contains("These tests of your answer passed, and the learner keeps them:\n\n- \"Started beside the line, it finds it\""));
    }
}
