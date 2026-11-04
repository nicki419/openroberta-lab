package de.fhg.iais.roberta.javaServer.restServices.all.controller;

import java.io.File;

import javax.ws.rs.Consumes;
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

import de.fhg.iais.roberta.ai.AiService;
import de.fhg.iais.roberta.ai.AiSwitches;
import de.fhg.iais.roberta.generated.restEntities.FullRestRequest;
import de.fhg.iais.roberta.javaServer.provider.OraData;
import de.fhg.iais.roberta.persistence.UserProcessor;
import de.fhg.iais.roberta.persistence.bo.User;
import de.fhg.iais.roberta.persistence.util.DbSession;
import de.fhg.iais.roberta.persistence.util.HttpSessionState;
import de.fhg.iais.roberta.util.Key;
import de.fhg.iais.roberta.util.UtilForREST;

/**
 * the AI test assistant's calls (see {@link AiService}): POST /ai/infer, POST /ai/analyze, POST /ai/generate and POST /ai/fix, with the browser's
 * data in the usual request envelope.
 * The response has the checked answer, or aiError and aiMessage. Every call is appended to the participant's telemetry file (kind ai_call, with the
 * per-call prompt and the raw answer), as the level events are ({@link LevelsController#writeTelemetry}).
 * <p>
 * POST /ai/switch: the assistant on or off for the logged-in test subject (the Edit menu's switch, kept by {@link AiSwitches}).
 */
@Path("/ai")
public class AiController {
    private static final Logger LOG = LoggerFactory.getLogger(AiController.class);

    private final AiService aiService;

    @Inject
    public AiController(AiService aiService) {
        this.aiService = aiService;
    }

    @POST
    @Path("/infer")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response infer(@OraData DbSession dbSession, FullRestRequest request) {
        return call(AiService.INFER, dbSession, request);
    }

    @POST
    @Path("/analyze")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response analyze(@OraData DbSession dbSession, FullRestRequest request) {
        return call(AiService.ANALYZE, dbSession, request);
    }

    @POST
    @Path("/generate")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response generate(@OraData DbSession dbSession, FullRestRequest request) {
        return call(AiService.GENERATE, dbSession, request);
    }

    @POST
    @Path("/fix")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response fix(@OraData DbSession dbSession, FullRestRequest request) {
        return call(AiService.FIX, dbSession, request);
    }

    /**
     * the AI test assistant on or off for the logged-in test subject (the Edit menu's switch). A POST, as every call that knows the session.
     *
     * @param request data: {on: true or false} switches it; {} only asks
     * @return answer: {on: true, false or null (never switched: the default applies), stored: false if nobody is logged in (the switch then holds for the
     *         open page only)}
     */
    @POST
    @Path("/switch")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response aiSwitch(@OraData DbSession dbSession, FullRestRequest request) {
        HttpSessionState httpSessionState = UtilForREST.handleRequestInit(dbSession, LOG, request, false);
        try {
            JSONObject answer = new JSONObject().put("on", JSONObject.NULL).put("stored", false);
            int userId = httpSessionState.getUserId();
            User user = httpSessionState.isUserLoggedIn() ? new UserProcessor(dbSession, userId).getUser(userId) : null;
            if ( user != null ) {
                File dir = new File(this.aiService.getSettings().getTelemetryDir());
                String key = AiSwitches.keyOf(userId, user.getAccount());
                Object on = request.getData().opt("on");
                if ( on instanceof Boolean ) {
                    AiSwitches.set(dir, key, (Boolean) on);
                }
                Boolean stored = AiSwitches.get(dir, key);
                answer.put("on", stored == null ? JSONObject.NULL : stored).put("stored", true);
            }
            AiResponse response = AiResponse.of(answer);
            response.setCmd("switch");
            UtilForREST.addSuccessInfo(response, Key.SERVER_SUCCESS);
            return UtilForREST.responseWithFrontendInfo(response, httpSessionState, null);
        } catch ( Exception e ) {
            LOG.error("the AI switch could not be read or written", e);
            return UtilForREST.makeBaseResponseForError(Key.SERVER_ERROR, httpSessionState, null);
        } finally {
            dbSession.close();
        }
    }

    private Response call(String kind, DbSession dbSession, FullRestRequest request) {
        HttpSessionState httpSessionState = UtilForREST.handleRequestInit(dbSession, LOG, request, true);
        int userId = httpSessionState.getUserId();
        String account = null;
        try {
            if ( httpSessionState.isUserLoggedIn() ) {
                User user = new UserProcessor(dbSession, userId).getUser(userId);
                account = user == null ? null : user.getAccount();
            }
        } catch ( Exception e ) {
            LOG.error("the user of an AI call could not be read", e);
        } finally {
            dbSession.close(); // not kept open during the call to DeepSeek
        }
        AiService.Outcome outcome = this.aiService.call(kind, httpSessionState.getSessionNumber(), request.getData());
        try {
            File dir = new File(this.aiService.getSettings().getTelemetryDir());
            LevelsController.writeTelemetry(dir, userId, account, httpSessionState.getSessionNumber(), new JSONArray().put(outcome.event));
        } catch ( Exception e ) {
            LOG.error("the telemetry of an AI call could not be written", e);
        }
        AiResponse response = AiResponse.of(outcome);
        response.setCmd(kind);
        if ( outcome.ok ) {
            UtilForREST.addSuccessInfo(response, Key.SERVER_SUCCESS);
        } else {
            UtilForREST.addErrorInfo(response, Key.SERVER_ERROR);
        }
        return UtilForREST.responseWithFrontendInfo(response, httpSessionState, null);
    }
}
