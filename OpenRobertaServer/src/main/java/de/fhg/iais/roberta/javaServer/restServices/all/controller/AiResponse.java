package de.fhg.iais.roberta.javaServer.restServices.all.controller;

import org.json.JSONObject;

import de.fhg.iais.roberta.ai.AiService;
import de.fhg.iais.roberta.generated.restEntities.BaseResponse;

/**
 * the response of /ai/infer, /ai/generate and /ai/switch: a base response plus the checked answer (answer), what the browser may log about the call (meta) and,
 * if it failed, why (aiError: a code, aiMessage: in words). Hand-written, because the generator of the REST entities isn't part of this repository.
 */
public class AiResponse extends BaseResponse {
    private JSONObject answer;
    private JSONObject meta;
    private String aiError;
    private String aiMessage;

    public static AiResponse of(AiService.Outcome outcome) {
        AiResponse response = new AiResponse();
        response.answer = outcome.answer;
        response.meta = outcome.meta;
        response.aiError = outcome.ok ? null : outcome.error;
        response.aiMessage = outcome.ok ? null : outcome.message;
        return response;
    }

    /**
     * @return a response with an answer of the server's own (/ai/switch)
     */
    public static AiResponse of(JSONObject answer) {
        AiResponse response = new AiResponse();
        response.answer = answer;
        return response;
    }

    @Override
    public JSONObject toJson() {
        JSONObject jsonO = super.toJson();
        if ( this.answer != null ) {
            jsonO.put("answer", this.answer);
        }
        if ( this.meta != null ) {
            jsonO.put("meta", this.meta);
        }
        if ( this.aiError != null ) {
            jsonO.put("aiError", this.aiError);
            jsonO.put("aiMessage", this.aiMessage == null ? "" : this.aiMessage);
        }
        return jsonO;
    }
}
