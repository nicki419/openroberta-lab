package de.fhg.iais.roberta.javaServer.basics.restInterface;

import org.junit.Assert;
import org.junit.Before;
import org.junit.Test;

import de.fhg.iais.roberta.javaServer.restServices.all.controller.ClientUser;
import de.fhg.iais.roberta.util.Key;

/**
 * A new account gets the programs of study.programs.dir (StudyPrograms): here the repository's study-programs/ (the familiarisation program and the
 * study's two blank programs), for the robot group edison. Without the folder (the default for every other test: the folder is relative to the
 * working directory), an account gets none.
 */
public class StudyProgramsRestTest extends AbstractRestInterfaceTest {

    @Before
    public void init() throws Exception {
        setup();
    }

    private void useStudyPrograms(String dir) {
        this.serverProperties.getserverProperties().put("study.programs.dir", dir);
        this.restUser = new ClientUser(this.robotCommunicator, this.serverProperties, this.mailManagement);
    }

    private long programsOf(String account) {
        return this.memoryDbSetup
            .getOneBigIntegerAsLong("select count(*) from PROGRAM p, USER u where p.OWNER_ID = u.ID and u.ACCOUNT = '" + account + "'");
    }

    private String textOf(String account, String program) {
        return this.memoryDbSetup
            .getOne(
                "select p.PROGRAM_TEXT from PROGRAM p, USER u, ROBOT r where p.OWNER_ID = u.ID and p.ROBOT_ID = r.ID and r.NAME = 'edison' and u.ACCOUNT = '"
                    + account
                    + "' and p.NAME = '"
                    + program
                    + "'")
            .toString();
    }

    @Test
    public void aNewAccountGetsTheFamiliarisationAndTheStudyPrograms() throws Exception {
        useStudyPrograms("../study-programs");
        restUser(
            this.sPid,
            "{'cmd':'createUser';'accountName':'participant';'userName':'p';'password':'dip';'userEmail':'';'role':'STUDENT', 'isYoungerThen14': false, 'language': 'en'}",
            "ok",
            Key.USER_CREATE_SUCCESS);
        Assert.assertEquals(3, programsOf("participant"));
        String familiarisation = textOf("participant", "Familiarisation");
        Assert.assertTrue(familiarisation.contains("robActions_play_tone"));
        Assert.assertTrue(familiarisation.contains("nepoTest_simcase"));
        Assert.assertTrue(familiarisation.contains("nepoLevel_progress"));
        Assert.assertTrue(familiarisation.contains("00-familiarisation"));
        for ( String blank : new String[] {
            "WithAI",
            "WithoutAI"
        } ) {
            String text = textOf("participant", blank);
            Assert.assertTrue(text.contains("robControls_start"));
            Assert.assertFalse(text.contains("robControls_loopForever"));
        }
    }

    @Test
    public void withoutTheFolderANewAccountGetsNoPrograms() throws Exception {
        useStudyPrograms("no-such-folder");
        restUser(
            this.sPid,
            "{'cmd':'createUser';'accountName':'other';'userName':'o';'password':'dip';'userEmail':'';'role':'STUDENT', 'isYoungerThen14': false, 'language': 'en'}",
            "ok",
            Key.USER_CREATE_SUCCESS);
        Assert.assertEquals(0, programsOf("other"));
    }
}
