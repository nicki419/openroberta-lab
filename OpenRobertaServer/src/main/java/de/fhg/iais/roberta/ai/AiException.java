package de.fhg.iais.roberta.ai;

/**
 * a call of the AI test assistant that can't be made or whose answer can't be used. The code goes to the browser and into the telemetry: bad_request,
 * too_large, bad_answer, cut_off, no_pack.
 */
public class AiException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    private final String code;

    public AiException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String getCode() {
        return this.code;
    }
}
