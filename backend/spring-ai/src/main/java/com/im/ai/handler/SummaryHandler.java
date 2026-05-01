package com.im.ai.handler;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.ai.llm.LlmClient;
import com.im.ai.llm.LlmClientFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

@Component
public class SummaryHandler {

    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;

    public SummaryHandler(StringRedisTemplate redis) {
        this.redis = redis;
        this.objectMapper = new ObjectMapper();
    }

    @SuppressWarnings("unchecked")
    public void handle(Map<String, String> fields) {
        String conversationId = fields.getOrDefault("conversationId", "");
        String userId = fields.getOrDefault("userId", "");
        String taskId = fields.getOrDefault("taskId", "0");
        String provider = fields.getOrDefault("provider", "deepseek");
        String apiKey = fields.getOrDefault("key", "");
        String messagesJson = fields.getOrDefault("messages", "[]");

        System.out.println("[SUMMARY] Starting task=" + taskId + " conv=" + conversationId);

        try {
            List<Map<String, String>> messages = objectMapper.readValue(messagesJson, List.class);
            String messageText = buildMessageText(messages);

            String systemPrompt = "你是一个聊天记录总结助手。请用3-5个要点总结以下聊天记录，保持简洁，突出关键信息和行动项。用中文回答。";

            LlmClient client = LlmClientFactory.create(provider);

            AtomicReference<String> fullText = new AtomicReference<>("");
            String channel = "im:ai:stream:sub:" + taskId;

            client.streamChat(systemPrompt,
                    List.of(Map.of("role", "user", "content", "聊天记录：\n" + messageText)),
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

                                cacheSummary(conversationId, userId, fullText.get());
                                System.out.println("[SUMMARY] Done task=" + taskId);
                            }
                    );

        } catch (Exception e) {
            String errMsg = "{\"type\":\"error\",\"content\":\"" + escapeJson(e.getMessage()) + "\"}";
            redis.convertAndSend("im:ai:stream:sub:" + taskId, errMsg);
            System.err.println("[SUMMARY] Failed: " + e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private String buildMessageText(List<Map<String, String>> messages) {
        StringBuilder sb = new StringBuilder();
        for (Map<String, String> msg : messages) {
            String sender = msg.getOrDefault("senderName", msg.getOrDefault("senderId", "unknown"));
            String content = msg.getOrDefault("content", "");
            sb.append("[").append(sender).append("]: ").append(content).append("\n");
        }
        return sb.toString();
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

    private void cacheSummary(String conversationId, String userId, String content) {
        try {
            String hash = String.valueOf((conversationId + ":" + userId).hashCode());
            String key = "im:ai:summary:" + conversationId + ":" + hash;
            redis.opsForValue().set(key, content, Duration.ofMinutes(30));
        } catch (Exception ignored) {
        }
    }

    private String escapeJson(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r");
    }
}
