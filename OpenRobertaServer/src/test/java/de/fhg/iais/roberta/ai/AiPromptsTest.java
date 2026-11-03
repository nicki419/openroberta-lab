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
    private static final Pattern ANSWER = Pattern.compile("## The answer \\((infer|generate)\\)\\n.*?```json\\n(.*?)\\n```", Pattern.DOTALL);

    @Test
    public void trimNepo() {
        String xml =
            "<export xmlns=\"http://de.fhg.iais.roberta.blockly\"><program><block_set xmlns=\"http://de.fhg.iais.roberta.blockly\" robottype=\"edison\" xmlversion=\"3.1\" description=\"\" tags=\"\">\n"
                + "  <instance x=\"10\" y=\"20\"><block type=\"robControls_start\" id=\"a\" intask=\"true\" deletable=\"false\"><mutation declare=\"false\"/></block>\n"
                + "  <block type=\"text_comment\" id=\"b\"><field name=\"TEXT\">drive &lt;fast&gt;</field></block></instance></block_set></program>"
                + "<config><block_set robottype=\"edison\"><instance x=\"0\" y=\"0\"><block type=\"robBrick_Edison-Brick\" id=\"1\"/></instance></block_set></config></export>";
        Assert
            .assertEquals(
                "<block_set robottype=\"edison\">\n"
                    + " <instance>\n"
                    + "  <block type=\"robControls_start\">\n"
                    + "   <mutation declare=\"false\"/>\n"
                    + "  </block>\n"
                    + "  <block type=\"text_comment\">\n"
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
        Assert.assertTrue(pack.getText().contains("# The JSON schema schemas/infer.schema.json\n\n```json\n{"));
        File folder = new File("src/main/resources/ai");
        if ( folder.isDirectory() ) { // the tests run in OpenRobertaServer
            Assert.assertEquals(pack.getVersion(), ContextPack.fromDirectory(folder).getVersion());
        }
        int size = pack.getText().length();
        Assert.assertTrue("the pack has " + size + " characters", size > 20000 && size < 90000);
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
        Assert.assertEquals(2, found);
    }

    @Test
    public void theExamplesAnswersPassTheChecks() throws Exception {
        ContextPack pack = ContextPack.fromResources();
        Matcher answers = ANSWER.matcher(pack.getText());
        List<String> kinds = new ArrayList<>();
        while ( answers.find() ) {
            kinds.add(answers.group(1));
            if ( "infer".equals(answers.group(1)) ) {
                JSONObject answer = AiPrompts.checkInfer(answers.group(2));
                Assert.assertEquals(new JSONObject(answers.group(2)).getString("intent"), answer.getString("intent"));
                Assert.assertTrue(new JSONObject(answers.group(2)).keySet().equals(answer.keySet()));
            } else {
                AiPrompts.checkGenerate(answers.group(2));
            }
        }
        Assert.assertEquals("[infer, generate, infer, generate]", kinds.toString());
    }

    @Test
    public void theExamplesUseTheMessagesFormat() throws Exception {
        String text = ContextPack.fromResources().getText();
        for ( String heading : new String[] {
            "The level",
            "The program",
            "The learner's tests",
            "What the learner said before",
            "Task: infer",
            "Task: generate"
        } ) {
            Assert.assertTrue(heading, text.contains("\n### " + heading + "\n\n"));
        }
        Assert.assertTrue(text.contains("Time limit: none\nWorld:\n```json\n{\"background\":\"peach\""));
        Assert.assertTrue(text.contains("NEPO:\n```xml\n<block_set robottype=\"edison\">\n <instance>\n"));
        Assert.assertTrue(text.contains("EdPy:\n```python\nwhile True:\n"));
        Assert.assertTrue(text.contains("The guess the learner declined: none."));
        Assert.assertTrue(text.contains("The learner's sentence: \"This program should follow a black line and stop if it senses an obstacle\""));
    }
}
