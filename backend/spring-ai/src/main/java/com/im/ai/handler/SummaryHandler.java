package com.im.ai.handler;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.ai.service.ChatClientService;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

@Component
public class SummaryHandler {

    private final StringRedisTemplate redis;
    private final ChatClientService chatClientService;
    private final ObjectMapper objectMapper;

    public SummaryHandler(StringRedisTemplate redis, ChatClientService chatClientService) {
        this.redis = redis;
        this.chatClientService = chatClientService;
        this.objectMapper = new ObjectMapper();
    }

    @SuppressWarnings("unchecked")
    public void handle(Map<String, String> fields) {
        String conversationId = fields.getOrDefault("conversationId", "");
        String taskId = fields.getOrDefault("taskId", "0");
        String provider = fields.getOrDefault("provider", "deepseek");
        String apiKey = fields.getOrDefault("key", "");
        String messagesJson = fields.getOrDefault("messages", "[]");

        System.out.println("[SUMMARY] Starting task=" + taskId + " conv=" + conversationId + " provider=" + provider);

        try {
            List<Map<String, String>> messages = objectMapper.readValue(messagesJson, List.class);
            String messageText = buildMessageText(messages);

            var chatClient = chatClientService.forUser(provider, apiKey);
            String channel = "im:ai:stream:sub:" + taskId;
            AtomicReference<String> fullText = new AtomicReference<>("");

            Flux<String> stream = chatClient.prompt()
                    .system("你是一个聊天记录总结助手。请用3-5个要点总结以下聊天记录，保持简洁，突出关键信息和行动项。用中文回答。")
                    .user("聊天记录：\n" + messageText)
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
                        String content = fullText.get();
                        String doneMsg = "{\"type\":\"done\",\"content\":" +
                                escapeJsonValue(content) + "}";
                        redis.convertAndSend(channel, doneMsg);
                        cacheSummary(conversationId, content);
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

    private void cacheSummary(String conversationId, String content) {
        try {
            String hash = String.valueOf(conversationId.hashCode());
            String key = "im:ai:summary:" + conversationId + ":" + hash;
            redis.opsForValue().set(key, content, Duration.ofMinutes(30));
        } catch (Exception ignored) {
        }
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
