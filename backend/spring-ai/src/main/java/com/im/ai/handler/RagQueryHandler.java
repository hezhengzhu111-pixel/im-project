package com.im.ai.handler;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.ai.llm.LlmClient;
import com.im.ai.llm.LlmClientFactory;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.atomic.AtomicReference;

@Component
public class RagQueryHandler {

    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;

    public RagQueryHandler(StringRedisTemplate redis) {
        this.redis = redis;
        this.objectMapper = new ObjectMapper();
    }

    @SuppressWarnings("unchecked")
    public void handle(Map<String, String> fields) {
        String userId = fields.getOrDefault("userId", "");
        String query = fields.getOrDefault("query", "");
        String groupId = fields.getOrDefault("groupId", "");
        String taskId = fields.getOrDefault("taskId", "0");
        String provider = fields.getOrDefault("provider", "deepseek");
        String apiKey = fields.getOrDefault("key", "");

        System.out.println("[RAG_QUERY] Starting task=" + taskId + " query=" + query);

        try {
            // 1. Retrieve relevant chunks from all user's documents
            List<String> chunks = retrieveChunks(userId, groupId, query);

            // 2. Build augmented prompt
            String context = String.join("\n\n---\n\n", chunks);
            String systemPrompt = "基于以下知识库内容回答用户问题。如果知识库中没有相关信息，请如实说明。用中文回答。\n\n知识库内容：\n" + context;

            // 3. Call LLM with streaming
            LlmClient client = LlmClientFactory.create(provider);

            AtomicReference<String> fullText = new AtomicReference<>("");
            String channel = "im:ai:stream:sub:" + taskId;

            client.streamChat(systemPrompt,
                    List.of(Map.of("role", "user", "content", query)),
                    "default", apiKey)
                    .subscribe(
                            chunk -> {
                                redis.convertAndSend(channel, chunk);
                                fullText.updateAndGet(s -> s + extractChunkContent(chunk));
                            },
                            error -> {
                                String errMsg = "{\"type\":\"error\",\"content\":\"" +
                                        escapeJson(error.getMessage()) + "\"}";
                                redis.convertAndSend(channel, errMsg);
                            },
                            () -> {
                                String doneMsg = "{\"type\":\"done\",\"content\":" +
                                        objectMapper.writeValueAsString(fullText.get()) + "}";
                                redis.convertAndSend(channel, doneMsg);
                                System.out.println("[RAG_QUERY] Done task=" + taskId);
                            }
                    );

        } catch (Exception e) {
            String errMsg = "{\"type\":\"error\",\"content\":\"" + escapeJson(e.getMessage()) + "\"}";
            redis.convertAndSend("im:ai:stream:sub:" + taskId, errMsg);
            System.err.println("[RAG_QUERY] Failed: " + e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private List<String> retrieveChunks(String userId, String groupId, String query) {
        List<String> results = new ArrayList<>();

        try {
            Set<String> docKeys = redis.keys("im:ai:doc:*:meta");
            if (docKeys == null) return results;

            for (String metaKey : docKeys) {
                String docId = metaKey.replace("im:ai:doc:", "").replace(":meta", "");
                Map<Object, Object> meta = redis.opsForHash().entries(metaKey);
                String status = String.valueOf(meta.getOrDefault("parseStatus", ""));
                String chunkCountStr = String.valueOf(meta.getOrDefault("chunkCount", "0"));

                if (!"done".equals(status)) continue;

                int chunkCount = Integer.parseInt(chunkCountStr);
                int limit = Math.min(chunkCount, 5);

                for (int i = 0; i < limit; i++) {
                    String chunkKey = "im:ai:doc:" + docId + ":chunk:" + i;
                    String content = (String) redis.opsForHash().get(chunkKey, "content");
                    if (content != null && !content.isBlank()) {
                        results.add(content);
                    }
                }
            }
        } catch (Exception e) {
            System.err.println("[RAG_QUERY] Retrieval error: " + e.getMessage());
        }

        if (results.size() > 5) {
            results = results.subList(0, 5);
        }
        return results;
    }

    private String extractChunkContent(String chunk) {
        try {
            var node = objectMapper.readTree(chunk);
            var content = node.get("content");
            return content != null && !content.isNull() ? content.asText() : "";
        } catch (Exception e) {
            return "";
        }
    }

    private String escapeJson(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r");
    }
}
