package com.im.ai.handler;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.ai.callback.ReplyCallback;
import com.im.ai.llm.LlmClient;
import com.im.ai.llm.LlmClientFactory;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
public class AutoReplyHandler {

    private final ReplyCallback callback;
    private final ObjectMapper objectMapper;

    public AutoReplyHandler(ReplyCallback callback) {
        this.callback = callback;
        this.objectMapper = new ObjectMapper();
    }

    @SuppressWarnings("unchecked")
    public void handle(Map<String, String> fields) {
        String conversationId = fields.getOrDefault("conversationId", "");
        String userIdStr = fields.getOrDefault("userId", "0");
        String taskIdStr = fields.getOrDefault("taskId", "0");
        String provider = fields.getOrDefault("provider", "deepseek");
        String apiKey = fields.getOrDefault("key", "");
        String messagesJson = fields.getOrDefault("messages", "[]");
        String persona = fields.getOrDefault("persona", "");

        long userId = Long.parseLong(userIdStr);
        long taskId = Long.parseLong(taskIdStr);

        System.out.println("[AUTO_REPLY] Starting task=" + taskId + " user=" + userId);

        try {
            List<Map<String, String>> messages = objectMapper.readValue(messagesJson, List.class);
            String context = buildContext(messages);

            String systemPrompt = buildPersonaPrompt(persona);

            LlmClient client = LlmClientFactory.create(provider);

            String reply = client.chat(systemPrompt,
                    List.of(Map.of("role", "user", "content", "最近的聊天记录：\n" + context + "\n\n请以你的身份回复最后一条消息，50字以内：")),
                    "default", apiKey);

            if (reply == null || reply.trim().isEmpty()) {
                System.err.println("[AUTO_REPLY] Empty reply for task=" + taskId);
                return;
            }

            callback.sendReply(taskId, conversationId, reply.trim(), userId, provider, "default");
            System.out.println("[AUTO_REPLY] Done task=" + taskId + " reply=" + reply.substring(0, Math.min(50, reply.length())));

        } catch (Exception e) {
            System.err.println("[AUTO_REPLY] Failed: " + e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private String buildContext(List<Map<String, String>> messages) {
        StringBuilder sb = new StringBuilder();
        for (Map<String, String> msg : messages) {
            String sender = msg.getOrDefault("senderName", msg.getOrDefault("senderId", "unknown"));
            String content = msg.getOrDefault("content", "");
            String type = msg.getOrDefault("messageType", "TEXT");
            if ("TEXT".equals(type)) {
                sb.append("[").append(sender).append("]: ").append(content).append("\n");
            }
        }
        return sb.toString();
    }

    private String buildPersonaPrompt(String persona) {
        if (persona != null && !persona.isBlank()) {
            return persona + "\n\n请用自然的口语风格回复，每条回复控制在50字以内。用中文回复。";
        }
        return "你是一个友好的聊天助手。请用自然的口语风格回复，每条回复控制在50字以内。用中文回复。";
    }
}
