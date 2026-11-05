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
 * .env (and environment variables of the same names) set server properties: the switch of the Level designer, the folders of the levels and the
 * settings of the AI test assistant; its API key is a secret, never a server property
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
    public void theAiSettingsButNotTheKey() throws Exception {
        File file =
            envFile(
                "DEEPSEEK_API_KEY=sk-secret",
                "DEEPSEEK_URL=https://ai.cloud.sdu.dk/v1",
                "DEEPSEEK_MODEL=deepseek-ai/DeepSeek-V4.1-Flash-1017",
                "DEEPSEEK_FALLBACK_API_KEY=sk-fallback",
                "DEEPSEEK_FALLBACK_URL=https://api.deepseek.com",
                "DEEPSEEK_FALLBACK_MODEL=deepseek-flash",
                "AI_TESTS_DEFAULT=true",
                "AI_PACK_DIR=OpenRobertaServer/src/main/resources/ai",
                "AI_EFFORT_GENERATE=high");
        Assert.assertEquals(
            Arrays
                .asList(
                    "ai.deepseek.url=https://ai.cloud.sdu.dk/v1",
                    "ai.deepseek.model=deepseek-ai/DeepSeek-V4.1-Flash-1017",
                    "ai.fallback.url=https://api.deepseek.com",
                    "ai.fallback.model=deepseek-flash",
                    "ai.tests.default=true",
                    "ai.pack.dir=OpenRobertaServer/src/main/resources/ai",
                    "ai.effort.generate=high"),
            EnvFile.serverDefines(file, Collections.singletonMap("DEEPSEEK_API_KEY", "sk-from-the-environment")));
        Assert.assertEquals("sk-secret", EnvFile.secret(file, Collections.emptyMap(), EnvFile.DEEPSEEK_API_KEY));
        Assert.assertEquals("sk-fallback", EnvFile.secret(file, Collections.emptyMap(), EnvFile.DEEPSEEK_FALLBACK_API_KEY));
        Assert.assertEquals("sk-env", EnvFile.secret(file, Collections.singletonMap("DEEPSEEK_API_KEY", " sk-env "), EnvFile.DEEPSEEK_API_KEY));
        Assert.assertEquals("sk-secret", EnvFile.secret(file, Collections.singletonMap("DEEPSEEK_API_KEY", ""), EnvFile.DEEPSEEK_API_KEY));
        Assert.assertNull(EnvFile.secret(envFile2("DEEPSEEK_API_KEY="), Collections.emptyMap(), EnvFile.DEEPSEEK_API_KEY));
        Assert.assertNull(EnvFile.secret(new File(this.folder.getRoot(), "missing"), Collections.emptyMap(), EnvFile.DEEPSEEK_API_KEY));
    }

    private File envFile2(String... lines) throws Exception {
        File file = this.folder.newFile(".env2");
        Files.write(file.toPath(), Arrays.asList(lines), StandardCharsets.UTF_8);
        return file;
    }

    @Test
    public void noFileNoSettings() throws Exception {
        Assert.assertEquals(Collections.emptyList(), EnvFile.serverDefines(new File(this.folder.getRoot(), "missing"), Collections.emptyMap()));
    }
}
