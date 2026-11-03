package de.fhg.iais.roberta.javaServer.restServices.all.controller;

import java.io.File;

import javax.ws.rs.Consumes;
import javax.ws.rs.POST;
import javax.ws.rs.Path;
import javax.ws.rs.Produces;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Response;

import org.json.JSONArray;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.google.inject.Inject;

import de.fhg.iais.roberta.ai.AiService;
import de.fhg.iais.roberta.generated.restEntities.FullRestRequest;
import de.fhg.iais.roberta.javaServer.provider.OraData;
import de.fhg.iais.roberta.persistence.UserProcessor;
import de.fhg.iais.roberta.persistence.bo.User;
import de.fhg.iais.roberta.persistence.util.DbSession;
import de.fhg.iais.roberta.persistence.util.HttpSessionState;
import de.fhg.iais.roberta.util.Key;
import de.fhg.iais.roberta.util.UtilForREST;

/**
 * the AI test assistant's calls (see {@link AiService}): POST /ai/infer and POST /ai/generate, with the browser's data in the usual request envelope.
 * The response has the checked answer, or aiError and aiMessage. Every call is appended to the participant's telemetry file (kind ai_call, with the
 * per-call prompt and the raw answer), as the level events are ({@link LevelsController#writeTelemetry}).
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
    @Path("/generate")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response generate(@OraData DbSession dbSession, FullRestRequest request) {
        return call(AiService.GENERATE, dbSession, request);
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
