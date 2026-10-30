package de.fhg.iais.roberta.javaServer;

import java.util.ArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.Assert;
import org.junit.BeforeClass;
import org.junit.Test;

import de.fhg.iais.roberta.blockly.generated.Export;
import de.fhg.iais.roberta.factory.RobotFactory;
import de.fhg.iais.roberta.util.Util;
import de.fhg.iais.roberta.util.XsltAndJavaTransformer;
import de.fhg.iais.roberta.util.jaxb.JaxbHelper;

/**
 * The Lab saves a program's test suite (NEPO test blocks of the Tests tab, type prefix nepoTest_) as extra instances of the program's block_set. The
 * server must keep them untouched when a program is imported and when it is loaded (both validate against blockly.xsd and re-marshal the XML). A
 * simulation world keeps its drawn world as JSON in the block's &lt;data&gt;.
 */
public class NepoTestSuitePersistenceTest {
    private static RobotFactory factory;

    @BeforeClass
    public static void setup() {
        factory = Util.configureRobotPlugin("edisonv2", "", "", new ArrayList<>());
    }

    private static int count(String text, String regex) {
        Matcher m = Pattern.compile(regex).matcher(text);
        int n = 0;
        while ( m.find() ) {
            n++;
        }
        return n;
    }

    private static String importAndLoad(String export) throws Exception {
        Export jaxb = JaxbHelper.xml2Element(export, Export.class); // /program/import: schema validation
        String progXml = JaxbHelper.blockSet2xml(jaxb.getProgram().getBlockSet());
        String confXml = JaxbHelper.blockSet2xml(jaxb.getConfig().getBlockSet());
        return new XsltAndJavaTransformer().transform(factory, progXml, confXml).getFirst(); // /program/import and /program/listing
    }

    private static String dataOf(String xml, String blockType, String blockId) {
        Matcher m = Pattern.compile("<block type=\"" + blockType + "\" id=\"" + blockId + "\"[^>]*>.*?<data>(.*?)</data>", Pattern.DOTALL).matcher(xml);
        Assert.assertTrue("no data in block " + blockId, m.find());
        return m.group(1);
    }

    @Test
    public void testSimulationWorldsSurviveImportAndLoad() throws Exception {
        String export = Util.readResourceContent("/nepotest/line_follower_with_tests.xml");
        String program = importAndLoad(export);
        Assert.assertEquals(count(export, "type=\"nepoTest_"), count(program, "type=\"nepoTest_"));
        String world = dataOf(program, "nepoTest_world", "lft10");
        Assert.assertEquals(dataOf(export, "nepoTest_world", "lft10"), world);
        Assert.assertTrue(world.contains("\"starts\":[{\"id\":\"A\""));
        Assert.assertTrue(program.contains("<field name=\"SECONDS\">20</field>"));
        Assert.assertTrue(program.contains("<field name=\"START\">B</field>"));
        Assert.assertTrue(program.contains("<field name=\"ACTIVE\">TRUE</field>"));
    }

    @Test
    public void testBlocksSurviveImportAndLoad() throws Exception {
        String export = Util.readResourceContent("/nepotest/clap_counter_with_tests.xml");
        int testBlocks = count(export, "type=\"nepoTest_");
        Assert.assertTrue(testBlocks > 50);

        String program = importAndLoad(export);

        Assert.assertEquals(testBlocks, count(program, "type=\"nepoTest_"));
        Assert.assertTrue(program.contains("<field name=\"NAME\">clampSpeed limits 150 to 100</field>"));
        Assert.assertTrue(program.contains("<mutation name=\"clampSpeed\">"));
        Assert.assertTrue(program.contains("<arg name=\"speed\" type=\"Number\"/>"));
    }
}
