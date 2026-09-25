package de.fhg.iais.roberta.worker.codegen;

import com.google.common.collect.ClassToInstanceMap;

import de.fhg.iais.roberta.bean.IProjectBean;
import de.fhg.iais.roberta.bean.SourceMapBean;
import de.fhg.iais.roberta.components.Project;
import de.fhg.iais.roberta.visitor.codegen.EdisonPythonVisitor;
import de.fhg.iais.roberta.visitor.lang.codegen.AbstractLanguageVisitor;
import de.fhg.iais.roberta.worker.AbstractLanguageGeneratorWorker;

public final class EdisonPythonGeneratorWorker extends AbstractLanguageGeneratorWorker {

    @Override
    protected AbstractLanguageVisitor getVisitor(Project project, ClassToInstanceMap<IProjectBean> beans) {
        // the visitor fills the source map while generating; the REST service /projectWorkflow/sourceForTest returns it
        SourceMapBean sourceMap = new SourceMapBean();
        project.addWorkerResult(sourceMap);
        return new EdisonPythonVisitor(project.getProgramAst().getTree(), beans, sourceMap);
    }
}
