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
import de.fhg.iais.roberta.util.basic.Pair;
import de.fhg.iais.roberta.util.jaxb.JaxbHelper;

/**
 * The Lab saves a program's test suite (NEPO test blocks of the Tests tab, type prefix nepoTest_) as extra instances of the program's block_set. The
 * server must keep them untouched when a program is imported and when it is loaded (both validate against blockly.xsd and re-marshal the XML).
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

    @Test
    public void testBlocksSurviveImportAndLoad() throws Exception {
        String export = Util.readResourceContent("/nepotest/clap_counter_with_tests.xml");
        int testBlocks = count(export, "type=\"nepoTest_");
        Assert.assertTrue(testBlocks > 50);

        Export jaxb = JaxbHelper.xml2Element(export, Export.class); // /program/import: schema validation
        String progXml = JaxbHelper.blockSet2xml(jaxb.getProgram().getBlockSet());
        String confXml = JaxbHelper.blockSet2xml(jaxb.getConfig().getBlockSet());
        Pair<String, String> transformed = new XsltAndJavaTransformer().transform(factory, progXml, confXml); // /program/import and /program/listing
        String program = transformed.getFirst();

        Assert.assertEquals(testBlocks, count(program, "type=\"nepoTest_"));
        Assert.assertTrue(program.contains("<field name=\"NAME\">clampSpeed limits 150 to 100</field>"));
        Assert.assertTrue(program.contains("<mutation name=\"clampSpeed\">"));
        Assert.assertTrue(program.contains("<arg name=\"speed\" type=\"Number\"/>"));
    }
}
