package de.fhg.iais.roberta.javaServer.restServices.all.controller;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.Arrays;
import java.util.Comparator;

import javax.ws.rs.Consumes;
import javax.ws.rs.GET;
import javax.ws.rs.POST;
import javax.ws.rs.Path;
import javax.ws.rs.Produces;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Response;

import org.json.JSONArray;
import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.google.inject.Inject;

import de.fhg.iais.roberta.generated.restEntities.BaseResponse;
import de.fhg.iais.roberta.generated.restEntities.FullRestRequest;
import de.fhg.iais.roberta.javaServer.provider.OraData;
import de.fhg.iais.roberta.persistence.UserProcessor;
import de.fhg.iais.roberta.persistence.bo.User;
import de.fhg.iais.roberta.persistence.util.DbSession;
import de.fhg.iais.roberta.persistence.util.HttpSessionState;
import de.fhg.iais.roberta.util.Key;
import de.fhg.iais.roberta.util.ServerProperties;
import de.fhg.iais.roberta.util.UtilForREST;

/**
 * the levels the Program tab's simulator plays (Edison) and the Level designer opens. The folder levels.dir (server property, usually set in .env) has a
 * folder per set and a JSON file per level, both in the order of their names ("01-first-steps/02-around-the-box.json"). A set's name is its folder's name
 * without the number in front ("first steps"); a level's id is "set folder/file name without .json". The format of a level is checked by the browser
 * (OpenRobertaWeb/src/app/levels/level.model.ts); here a file only has to be a JSON object.
 * <p>
 * The study's telemetry (OpenRobertaWeb/src/app/levels/levels.telemetry.ts) is appended to a file per participant in levels.telemetry.dir: a JSON
 * object per line, an event of the levels with the server's time, the user and the session.
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
     * the study's telemetry: the events are appended to the participant's file (user-&lt;id&gt;-&lt;account&gt;.jsonl, not logged in:
     * session-&lt;number&gt;.jsonl)
     *
     * @param request data: {events: [{kind, ...}, ...]}
     */
    @POST
    @Path("/telemetry")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response telemetry(@OraData DbSession dbSession, FullRestRequest request) {
        HttpSessionState httpSessionState = UtilForREST.handleRequestInit(dbSession, LOG, request, false);
        try {
            int userId = httpSessionState.getUserId();
            String account = null;
            if ( httpSessionState.isUserLoggedIn() ) {
                User user = new UserProcessor(dbSession, userId).getUser(userId);
                account = user == null ? null : user.getAccount();
            }
            JSONArray events = request.getData().optJSONArray("events");
            File dir = new File(this.serverProperties.getStringProperty("levels.telemetry.dir"));
            writeTelemetry(dir, userId, account, httpSessionState.getSessionNumber(), events == null ? new JSONArray() : events);
            BaseResponse response = BaseResponse.make();
            UtilForREST.addSuccessInfo(response, Key.SERVER_SUCCESS);
            return UtilForREST.responseWithFrontendInfo(response, httpSessionState, null);
        } catch ( Exception e ) {
            LOG.error("the telemetry could not be written", e);
            return UtilForREST.makeBaseResponseForError(Key.SERVER_ERROR, httpSessionState, null);
        } finally {
            dbSession.close();
        }
    }

    /**
     * appends events to a participant's file, one JSON object per line, each with serverTime, userId, account and session
     *
     * @return the file
     */
    public static synchronized File writeTelemetry(File dir, int userId, String account, long session, JSONArray events) throws IOException {
        String name = account != null ? "user-" + userId + "-" + account.replaceAll("[^A-Za-z0-9_-]", "_") : "session-" + session;
        File file = new File(dir, name + ".jsonl");
        Files.createDirectories(dir.toPath());
        StringBuilder lines = new StringBuilder();
        String now = Instant.now().toString();
        for ( int i = 0; i < events.length(); i++ ) {
            JSONObject event = events.optJSONObject(i);
            if ( event != null ) {
                event.put("serverTime", now).put("userId", userId).put("account", account == null ? JSONObject.NULL : account).put("session", session);
                lines.append(event.toString()).append('\n');
            }
        }
        Files.write(file.toPath(), lines.toString().getBytes(StandardCharsets.UTF_8), StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        return file;
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
