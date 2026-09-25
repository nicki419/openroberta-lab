package de.fhg.iais.roberta.javaServer;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.Assert;
import org.junit.BeforeClass;
import org.junit.Test;

import de.fhg.iais.roberta.bean.SourceMapBean;
import de.fhg.iais.roberta.components.Project;
import de.fhg.iais.roberta.factory.RobotFactory;
import de.fhg.iais.roberta.javaServer.restServices.all.controller.ProjectWorkflowRestController;
import de.fhg.iais.roberta.javaServer.restServices.all.service.ProjectService;
import de.fhg.iais.roberta.util.Util;
import de.fhg.iais.roberta.util.ast.AstFactory;
import de.fhg.iais.roberta.util.basic.Pair;
import de.fhg.iais.roberta.util.test.UnitTestHelper;

/**
 * The Edison code generator records where the code of each block is (used by the unit test framework for NEPO programs, NepoTest/).
 */
public class EdisonSourceMapTest {
    private static final String[] PROGRAMS = {"action", "control_logic", "logic_operation", "math_lists", "sensors", "text_messages_functions"};
    private static RobotFactory factory;

    @BeforeClass
    public static void setup() {
        AstFactory.loadBlocks();
        factory = Util.configureRobotPlugin("edisonv2", "", "", new ArrayList<>());
    }

    private static Project generate(String program) {
        String export = Util.readResourceContent("/crossCompilerTests/robotSpecific/edison/" + program + ".xml");
        Pair<String, String> progAndConf = ProjectWorkflowRestController.splitExportXML(export);
        Project project = UnitTestHelper.setupWithConfigAndProgramXML(factory, progAndConf.getFirst(), progAndConf.getSecond()).setRobot("edisonv2").build();
        ProjectService.executeWorkflow("showsource", project);
        Assert.assertTrue(program + " not generated", project.hasSucceeded());
        return project;
    }

    private static List<String> textsOfType(SourceMapBean map, String source, String blockType) {
        List<String> texts = new ArrayList<>();
        for ( Map.Entry<String, List<int[]>> e : map.getRanges().entrySet() ) {
            if ( blockType.equals(map.getBlockType(e.getKey())) ) {
                for ( int[] range : e.getValue() ) {
                    texts.add(source.substring(range[0], range[1]));
                }
            }
        }
        return texts;
    }

    @Test
    public void allRangesAreInsideTheSource() {
        for ( String program : PROGRAMS ) {
            Project project = generate(program);
            String source = project.getSourceCodeBuilder().toString();
            SourceMapBean map = project.getWorkerResult(SourceMapBean.class);
            Assert.assertFalse(program + ": empty source map", map.getRanges().isEmpty());
            for ( Map.Entry<String, List<int[]>> e : map.getRanges().entrySet() ) {
                for ( int[] range : e.getValue() ) {
                    Assert.assertTrue(program + ": bad range of " + e.getKey(), 0 <= range[0] && range[0] < range[1] && range[1] <= source.length());
                }
            }
        }
    }

    @Test
    public void blocksMapToTheirCode() {
        Project project = generate("logic_operation");
        String source = project.getSourceCodeBuilder().toString();
        SourceMapBean map = project.getWorkerResult(SourceMapBean.class);
        Assert.assertEquals(List.of("Ed.LeftLed(Ed.ON)"), textsOfType(map, source, "actions_led_edison"));
        Assert.assertTrue(textsOfType(map, source, "robSensors_key_getSample").contains("(Ed.ReadKeypad() == Ed.KEYPAD_TRIANGLE)"));
        Assert.assertTrue(textsOfType(map, source, "logic_operation").contains("((___booleanVar) & (False))"));
    }

    @Test
    public void functionsMapToTheirDefinition() {
        Project project = generate("text_messages_functions");
        String source = project.getSourceCodeBuilder().toString();
        SourceMapBean map = project.getWorkerResult(SourceMapBean.class);
        List<String> defs = textsOfType(map, source, "robProcedures_defreturn");
        Assert.assertFalse(defs.isEmpty());
        for ( String def : defs ) {
            Assert.assertTrue(def, def.startsWith("def ____function_return_"));
        }
    }

    @Test
    public void theSourceMapDoesNotChangeTheGeneratedCode() {
        // the golden files (ReuseIntegrationAsUnitTest) pin the code; here: the map exists and the code starts as always
        Project project = generate("action");
        Assert.assertTrue(project.getSourceCodeBuilder().toString().startsWith("import Ed\n"));
    }
}
