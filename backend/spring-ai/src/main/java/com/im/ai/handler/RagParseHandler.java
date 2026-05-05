package com.im.ai.handler;

import org.springframework.ai.document.Document;
import org.springframework.ai.reader.tika.TikaDocumentReader;
import org.springframework.ai.transformer.splitter.TokenTextSplitter;
import org.springframework.core.io.InputStreamResource;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
public class RagParseHandler {

    private final StringRedisTemplate redis;

    public RagParseHandler(StringRedisTemplate redis) {
        this.redis = redis;
    }

    public void handle(Map<String, String> fields) {
        String docId = fields.getOrDefault("docId", "");
        String userId = fields.getOrDefault("userId", "");
        String ossUrl = fields.getOrDefault("ossUrl", "");

        System.out.println("[RAG_PARSE] Starting doc=" + docId + " url=" + ossUrl);

        try {
            // 1. Download document
            byte[] fileData = downloadFile(ossUrl);

            // 2. Parse with Spring AI TikaDocumentReader
            var resource = new InputStreamResource(new ByteArrayInputStream(fileData));
            TikaDocumentReader reader = new TikaDocumentReader(resource);
            List<Document> documents = reader.read();

            // 3. Split with Spring AI TokenTextSplitter
            TokenTextSplitter splitter = TokenTextSplitter.builder()
                    .withChunkSize(800)
                    .withMinChunkSizeChars(350)
                    .withKeepSeparator(true)
                    .build();
            List<Document> chunks = splitter.apply(documents);

            System.out.println("[RAG_PARSE] doc=" + docId + " parsed=" + documents.size() +
                    " docs, chunks=" + chunks.size());

            // 4. Store chunks in Redis Hash
            for (int i = 0; i < chunks.size(); i++) {
                String key = "im:ai:doc:" + docId + ":chunk:" + i;
                Map<String, String> chunkData = new HashMap<>();
                chunkData.put("content", chunks.get(i).getText());
                chunkData.put("userId", userId);
                chunkData.put("index", String.valueOf(i));
                redis.opsForHash().putAll(key, chunkData);
                redis.expire(key, Duration.ofDays(30));
            }

            // 5. Update doc metadata
            Map<String, String> meta = new HashMap<>();
            meta.put("chunkCount", String.valueOf(chunks.size()));
            meta.put("parseStatus", "done");
            redis.opsForHash().putAll("im:ai:doc:" + docId + ":meta", meta);

            System.out.println("[RAG_PARSE] Done doc=" + docId + " chunks=" + chunks.size());

        } catch (Exception e) {
            System.err.println("[RAG_PARSE] Failed doc=" + docId + ": " + e.getMessage());
            Map<String, String> meta = new HashMap<>();
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
}
