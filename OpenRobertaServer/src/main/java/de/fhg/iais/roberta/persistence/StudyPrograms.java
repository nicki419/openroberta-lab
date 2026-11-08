package de.fhg.iais.roberta.persistence;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import de.fhg.iais.roberta.persistence.bo.Program;
import de.fhg.iais.roberta.persistence.bo.Robot;
import de.fhg.iais.roberta.persistence.bo.User;
import de.fhg.iais.roberta.persistence.dao.ProgramDao;
import de.fhg.iais.roberta.persistence.dao.RobotDao;
import de.fhg.iais.roberta.persistence.util.DbSession;
import de.fhg.iais.roberta.util.Key;
import de.fhg.iais.roberta.util.Util;
import de.fhg.iais.roberta.util.basic.Pair;

/**
 * The programs every new account gets (ClientUser createUser, since 2026-11-08): one file per program in the folder study.programs.dir (server
 * property; .env STUDY_PROGRAMS_DIR; by default study-programs, relative to the working directory), named after it. In this repository:
 * Familiarisation.xml (the familiarisation before the study: working code, one test, the warm-up level L0) and the study's two blank programs
 * WithAI.xml and WithoutAI.xml (study-programs/make.py writes them). Each file is the program's text as the Lab saves it (a block_set: the
 * program, its test suite, the levels' progress), for the robot group edison (Edison V2 and V3), with the default configuration. No folder: no
 * programs, as before. A program that can't be added is logged, and the account is created anyway.
 */
public final class StudyPrograms {
    private static final Logger LOG = LoggerFactory.getLogger(StudyPrograms.class);
    public static final String ROBOT_GROUP = "edison";

    private StudyPrograms() {
        // only static methods
    }

    /**
     * adds the programs of the folder to a user
     *
     * @param dbSession the session the user was created in
     * @param user the new user
     * @param dir the folder of the programs (null or empty: none)
     * @return the names of the programs added, in the order of their files' names
     */
    public static List<String> addTo(DbSession dbSession, User user, String dir) {
        List<String> added = new ArrayList<>();
        if ( dir == null || dir.trim().isEmpty() ) {
            return added;
        }
        File[] files = new File(dir.trim()).listFiles((folder, name) -> name.endsWith(".xml"));
        if ( files == null || files.length == 0 ) {
            return added;
        }
        Arrays.sort(files);
        Robot robot = new RobotDao(dbSession).loadRobot(ROBOT_GROUP);
        if ( robot == null ) {
            LOG.error("the programs for new accounts in " + dir + " are not added: the robot " + ROBOT_GROUP + " is not in the database");
            return added;
        }
        ProgramDao programDao = new ProgramDao(dbSession);
        for ( File file : files ) {
            String name = file.getName().substring(0, file.getName().length() - ".xml".length());
            try {
                if ( !Util.isValidJavaIdentifier(name) ) {
                    LOG.error("the program for new accounts " + file + " is not added: its name is not a valid program name");
                    continue;
                }
                String text = new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8).trim();
                Pair<Key, Program> result = programDao.persistOwnProgram(name, text, null, null, user, robot, user, null);
                if ( result.getFirst() == Key.PROGRAM_SAVE_SUCCESS ) {
                    added.add(name);
                } else {
                    LOG.error("the program for new accounts " + name + " is not added to " + user.getAccount() + ": " + result.getFirst());
                }
            } catch ( Exception e ) {
                LOG.error("the program for new accounts " + file + " is not added to " + user.getAccount(), e);
            }
        }
        return added;
    }
}
