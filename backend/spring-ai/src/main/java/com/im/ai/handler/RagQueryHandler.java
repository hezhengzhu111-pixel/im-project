package com.im.ai.handler;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.ai.service.ChatClientService;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;

import java.util.*;
import java.util.concurrent.atomic.AtomicReference;

@Component
public class RagQueryHandler {

    private final StringRedisTemplate redis;
    private final ChatClientService chatClientService;
    private final ObjectMapper objectMapper;

    public RagQueryHandler(StringRedisTemplate redis, ChatClientService chatClientService) {
        this.redis = redis;
        this.chatClientService = chatClientService;
        this.objectMapper = new ObjectMapper();
    }

    @SuppressWarnings("unchecked")
    public void handle(Map<String, String> fields) {
        String userId = fields.getOrDefault("userId", "");
        String query = fields.getOrDefault("query", "");
        String taskId = fields.getOrDefault("taskId", "0");
        String provider = fields.getOrDefault("provider", "deepseek");
        String apiKey = fields.getOrDefault("key", "");

        System.out.println("[RAG_QUERY] Starting task=" + taskId + " query=" + query + " provider=" + provider);

        try {
            // 1. Retrieve relevant chunks from Redis
            List<String> chunks = retrieveChunks(userId);

            // 2. Build augmented prompt
            String context = String.join("\n\n---\n\n", chunks);
            String systemPrompt = "基于以下知识库内容回答用户问题。如果知识库中没有相关信息，请如实说明。用中文回答。\n\n知识库内容：\n" + context;

            // 3. Call LLM with streaming via ChatClient
            var chatClient = chatClientService.forUser(provider, apiKey);
            String channel = "im:ai:stream:sub:" + taskId;
            AtomicReference<String> fullText = new AtomicReference<>("");

            Flux<String> stream = chatClient.prompt()
                    .system(systemPrompt)
                    .user(query)
                    .stream()
                    .content();

            stream.subscribe(
                    chunk -> {
                        String json = "{\"type\":\"chunk\",\"content\":" +
                                escapeJsonValue(chunk) + "}";
                        redis.convertAndSend(channel, json);
                        fullText.updateAndGet(s -> s + chunk);
                    },
                    error -> {
                        String errMsg = "{\"type\":\"error\",\"content\":\"" +
                                escapeJson(error.getMessage()) + "\"}";
                        redis.convertAndSend(channel, errMsg);
                    },
                    () -> {
                        String doneMsg = "{\"type\":\"done\",\"content\":" +
                                escapeJsonValue(fullText.get()) + "}";
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

    private List<String> retrieveChunks(String userId) {
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

                int chunkCount;
                try {
                    chunkCount = Integer.parseInt(chunkCountStr);
                } catch (NumberFormatException e) {
                    continue;
                }

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

    private String escapeJson(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r");
    }

    private String escapeJsonValue(String s) {
        try {
            return objectMapper.writeValueAsString(s);
        } catch (Exception e) {
            return "\"" + escapeJson(s) + "\"";
        }
    }
}
