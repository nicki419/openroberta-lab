package de.fhg.iais.roberta.ai;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * the context pack: what the model is taught before every call, its system prompt. It is a folder of text files (in the server's resources, ai/, or
 * the folder AI_PACK_DIR of .env, to change the prompt without a rebuild). pack.txt lists the files in their order. Markdown files are taken as they
 * are, a JSON file (a schema of an answer) as a JSON block with a heading; the files are separated by a line "---".
 * <p>
 * The text is the same for every call, so DeepSeek can cache it. Its hash is the {@link #getVersion() promptVersion} that every logged call carries, so
 * every result of the study can be traced to the prompt that made it.
 */
public final class ContextPack {
    public static final String RESOURCES = "/ai/";
    public static final String MANIFEST = "pack.txt";
    private static final String SEPARATOR = "\n\n---\n\n";

    private final String text;
    private final String version;
    private final List<String> files;

    private ContextPack(String text, List<String> files) {
        this.text = text;
        this.files = Collections.unmodifiableList(files);
        this.version = sha256(text).substring(0, 12);
    }

    /**
     * @return the pack in the server's resources (ai/)
     */
    public static ContextPack fromResources() throws IOException {
        List<String> files = manifest(resource(MANIFEST));
        StringBuilder text = new StringBuilder();
        for ( String file : files ) {
            append(text, file, resource(file));
        }
        return new ContextPack(text.toString(), files);
    }

    /**
     * @param dir a folder with pack.txt and the files it lists
     */
    public static ContextPack fromDirectory(File dir) throws IOException {
        List<String> files = manifest(read(new File(dir, MANIFEST)));
        StringBuilder text = new StringBuilder();
        for ( String file : files ) {
            append(text, file, read(new File(dir, file)));
        }
        return new ContextPack(text.toString(), files);
    }

    /**
     * @return the system prompt
     */
    public String getText() {
        return this.text;
    }

    /**
     * @return the first 12 hex digits of the SHA-256 of the text
     */
    public String getVersion() {
        return this.version;
    }

    /**
     * @return the files, in their order
     */
    public List<String> getFiles() {
        return this.files;
    }

    private static List<String> manifest(String content) {
        List<String> files = new ArrayList<>();
        for ( String line : content.split("\n") ) {
            line = line.trim();
            if ( !line.isEmpty() && !line.startsWith("#") ) {
                files.add(line);
            }
        }
        return files;
    }

    private static void append(StringBuilder text, String file, String content) {
        if ( text.length() > 0 ) {
            text.append(SEPARATOR);
        }
        if ( file.endsWith(".json") ) {
            text.append("# The JSON schema ").append(file).append("\n\n```json\n").append(content.trim()).append("\n```");
        } else {
            text.append(content.trim());
        }
    }

    private static String resource(String file) throws IOException {
        try (InputStream in = ContextPack.class.getResourceAsStream(RESOURCES + file)) {
            if ( in == null ) {
                throw new IOException("the context pack has no file " + file);
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            for ( int n = in.read(buffer); n >= 0; n = in.read(buffer) ) {
                out.write(buffer, 0, n);
            }
            return normalize(new String(out.toByteArray(), StandardCharsets.UTF_8));
        }
    }

    private static String read(File file) throws IOException {
        if ( !file.isFile() ) {
            throw new IOException("the context pack has no file " + file);
        }
        return normalize(new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8));
    }

    private static String normalize(String text) {
        return text.replace("\r\n", "\n");
    }

    static String sha256(String text) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for ( byte b : hash ) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch ( NoSuchAlgorithmException e ) {
            throw new IllegalStateException(e);
        }
    }
}
