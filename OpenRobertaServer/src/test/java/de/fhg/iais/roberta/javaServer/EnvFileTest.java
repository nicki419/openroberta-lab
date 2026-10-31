package de.fhg.iais.roberta.javaServer;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import org.junit.Assert;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import de.fhg.iais.roberta.main.EnvFile;

/**
 * .env (and environment variables of the same names) set server properties: the switch of the Level designer and the folders of the levels
 */
public class EnvFileTest {
    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    private File envFile(String... lines) throws Exception {
        File file = this.folder.newFile(".env");
        Files.write(file.toPath(), Arrays.asList(lines), StandardCharsets.UTF_8);
        return file;
    }

    @Test
    public void readsTheKnownNames() throws Exception {
        File file = envFile("# the study's server", "LEVEL_DESIGNER=true", "", "LEVELS_DIR = \"study levels\"", "export LEVEL_TELEMETRY_DIR='admin/t'", "OTHER=1");
        Assert.assertEquals(
            Arrays.asList("levels.designer=true", "levels.dir=study levels", "levels.telemetry.dir=admin/t"),
            EnvFile.serverDefines(file, Collections.emptyMap()));
    }

    @Test
    public void anEnvironmentVariableOverridesTheFile() throws Exception {
        File file = envFile("LEVEL_DESIGNER=true");
        Map<String, String> environment = new HashMap<>();
        environment.put("LEVEL_DESIGNER", "false");
        environment.put("LEVELS_DIR", "");
        Assert.assertEquals(Collections.singletonList("levels.designer=false"), EnvFile.serverDefines(file, environment));
    }

    @Test
    public void noFileNoSettings() throws Exception {
        Assert.assertEquals(Collections.emptyList(), EnvFile.serverDefines(new File(this.folder.getRoot(), "missing"), Collections.emptyMap()));
    }
}
