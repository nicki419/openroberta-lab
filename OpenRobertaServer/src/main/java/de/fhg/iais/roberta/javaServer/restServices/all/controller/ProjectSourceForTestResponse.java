package de.fhg.iais.roberta.javaServer.restServices.all.controller;

import org.json.JSONObject;

import de.fhg.iais.roberta.generated.restEntities.ProjectSourceResponse;

/**
 * the response for the /projectWorkflow/sourceForTest REST request: the response of /projectWorkflow/source plus the source map, i.e. where the code of
 * each block is in the generated source code (see {@link de.fhg.iais.roberta.bean.SourceMapBean}). Hand-written, because the generator of the REST
 * entities isn't part of this repository.
 */
public class ProjectSourceForTestResponse extends ProjectSourceResponse {
    private JSONObject sourceMap;

    public static ProjectSourceForTestResponse makeForTest() {
        return new ProjectSourceForTestResponse();
    }

    /**
     * @param sourceMap the source map, may be null, if the robot's code generator doesn't produce one
     */
    public void setSourceMap(JSONObject sourceMap) {
        this.sourceMap = sourceMap;
    }

    @Override
    public JSONObject toJson() {
        JSONObject jsonO = super.toJson();
        if ( this.sourceMap != null ) {
            jsonO.put("sourceMap", this.sourceMap);
        }
        return jsonO;
    }
}
