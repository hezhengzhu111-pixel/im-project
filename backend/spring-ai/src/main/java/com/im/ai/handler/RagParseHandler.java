package com.im.ai.handler;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.ai.llm.LlmClient;
import com.im.ai.llm.LlmClientFactory;
import org.apache.tika.Tika;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Component
public class RagParseHandler {

    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;
    private final Tika tika;

    public RagParseHandler(StringRedisTemplate redis) {
        this.redis = redis;
        this.objectMapper = new ObjectMapper();
        this.tika = new Tika();
    }

    public void handle(Map<String, String> fields) {
        String docId = fields.getOrDefault("docId", "");
        String userId = fields.getOrDefault("userId", "");
        String ossUrl = fields.getOrDefault("ossUrl", "");

        System.out.println("[RAG_PARSE] Starting doc=" + docId + " url=" + ossUrl);

        try {
            // 1. Download document
            byte[] fileData = downloadFile(ossUrl);
            String contentType = tika.detect(fileData);
            String text = tika.parseToString(new java.io.ByteArrayInputStream(fileData));

            System.out.println("[RAG_PARSE] doc=" + docId + " extracted " + text.length() + " chars");

            // 2. Chunk the text
            List<String> chunks = chunkText(text, 500);

            // 3. Store chunks in Redis
            for (int i = 0; i < chunks.size(); i++) {
                String key = "im:ai:doc:" + docId + ":chunk:" + i;
                Map<String, String> chunkData = Map.of(
                    "content", chunks.get(i),
                    "userId", userId,
                    "index", String.valueOf(i)
                );
                redis.opsForHash().putAll(key, chunkData);
                redis.expire(key, Duration.ofDays(30));
            }

            // 4. Update doc metadata
            Map<String, String> meta = new java.util.HashMap<>();
            meta.put("chunkCount", String.valueOf(chunks.size()));
            meta.put("parseStatus", "done");
            redis.opsForHash().putAll("im:ai:doc:" + docId + ":meta", meta);

            System.out.println("[RAG_PARSE] Done doc=" + docId + " chunks=" + chunks.size());

        } catch (Exception e) {
            System.err.println("[RAG_PARSE] Failed doc=" + docId + ": " + e.getMessage());
            Map<String, String> meta = new java.util.HashMap<>();
            meta.put("parseStatus", "failed");
            redis.opsForHash().putAll("im:ai:doc:" + docId + ":meta", meta);
        }
    }

    private byte[] downloadFile(String url) throws Exception {
        var client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(30))
                .build();
        var request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(60))
                .GET()
                .build();
        var response = client.send(request, HttpResponse.BodyHandlers.ofByteArray());
        if (response.statusCode() != 200) {
            throw new RuntimeException("Download failed: HTTP " + response.statusCode());
        }
        return response.body();
    }

    private List<String> chunkText(String text, int maxChars) {
        List<String> chunks = new ArrayList<>();
        String[] paragraphs = text.split("\\n\\s*\\n");

        StringBuilder current = new StringBuilder();
        for (String para : paragraphs) {
            para = para.trim();
            if (para.isEmpty()) continue;

            if (current.length() + para.length() > maxChars && current.length() > 0) {
                chunks.add(current.toString().trim());
                current = new StringBuilder();
            }
            if (current.length() > 0) {
                current.append("\n\n");
            }
            current.append(para);

            if (current.length() >= maxChars) {
                chunks.add(current.toString().trim());
                current = new StringBuilder();
            }
        }
        if (current.length() > 0) {
            chunks.add(current.toString().trim());
        }
        return chunks;
    }
}
