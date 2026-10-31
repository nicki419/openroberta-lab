package de.fhg.iais.roberta.javaServer.restServices.all.controller;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.Comparator;

import javax.ws.rs.GET;
import javax.ws.rs.Path;
import javax.ws.rs.Produces;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Response;

import org.json.JSONArray;
import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.google.inject.Inject;

import de.fhg.iais.roberta.util.ServerProperties;

/**
 * the levels the Program tab's simulator plays (Edison) and the Level designer opens. The folder levels.dir (server property, usually set in .env) has a
 * folder per set and a JSON file per level, both in the order of their names ("01-first-steps/02-around-the-box.json"). A set's name is its folder's name
 * without the number in front ("first steps"); a level's id is "set folder/file name without .json". The format of a level is checked by the browser
 * (OpenRobertaWeb/src/app/levels/level.model.ts); here a file only has to be a JSON object.
 */
@Path("/levels")
public class LevelsController {
    private static final Logger LOG = LoggerFactory.getLogger(LevelsController.class);
    private static final String LEVEL_EXTENSION = ".json";

    private final ServerProperties serverProperties;

    @Inject
    public LevelsController(ServerProperties serverProperties) {
        this.serverProperties = serverProperties;
    }

    /**
     * @return {sets: [{id, name, levels: [{id, file, level}]}], problems: [{file, message}]}
     */
    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public Response sets() {
        return Response.ok(listSets(new File(this.serverProperties.getStringProperty("levels.dir"))).toString()).build();
    }

    /**
     * the level sets of a folder (sets without a valid level are left out)
     *
     * @param dir the folder of the sets
     * @return {sets: [{id, name, levels: [{id, file, level}]}], problems: [{file, message}]}
     */
    public static JSONObject listSets(File dir) {
        JSONArray sets = new JSONArray();
        JSONArray problems = new JSONArray();
        for ( File setDir : sorted(dir.listFiles(File::isDirectory)) ) {
            JSONArray levels = new JSONArray();
            for ( File file : sorted(setDir.listFiles((d, name) -> name.toLowerCase().endsWith(LEVEL_EXTENSION))) ) {
                String fileName = setDir.getName() + "/" + file.getName();
                try {
                    JSONObject level = new JSONObject(new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8));
                    String name = file.getName().substring(0, file.getName().length() - LEVEL_EXTENSION.length());
                    levels.put(new JSONObject().put("id", setDir.getName() + "/" + name).put("file", fileName).put("level", level));
                } catch ( Exception e ) {
                    LOG.warn("level file " + fileName + " is ignored: " + e.getMessage());
                    problems.put(new JSONObject().put("file", fileName).put("message", String.valueOf(e.getMessage())));
                }
            }
            if ( levels.length() > 0 ) {
                sets.put(new JSONObject().put("id", setDir.getName()).put("name", setName(setDir.getName())).put("levels", levels));
            }
        }
        return new JSONObject().put("sets", sets).put("problems", problems);
    }

    /**
     * @return a set's name: its folder's name without the number in front, "-" and "_" as spaces ("01-first_steps": "first steps")
     */
    public static String setName(String folder) {
        String name = folder.replaceFirst("^\\d+[-_. ]*", "").replaceAll("[-_]+", " ").trim();
        return name.isEmpty() ? folder : name;
    }

    private static File[] sorted(File[] files) {
        if ( files == null ) {
            return new File[0];
        }
        Arrays.sort(files, Comparator.comparing(File::getName));
        return files;
    }
}
