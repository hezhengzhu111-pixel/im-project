package com.im.ai.handler;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.im.ai.callback.ReplyCallback;
import com.im.ai.service.ChatClientService;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
public class AutoReplyHandler {

    private final ReplyCallback callback;
    private final ChatClientService chatClientService;
    private final ObjectMapper objectMapper;

    public AutoReplyHandler(ReplyCallback callback, ChatClientService chatClientService) {
        this.callback = callback;
        this.chatClientService = chatClientService;
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

        System.out.println("[AUTO_REPLY] Starting task=" + taskId + " user=" + userId + " provider=" + provider
                + " keyLen=" + (apiKey != null ? apiKey.length() : 0)
                + " keyPrefix=" + (apiKey != null && apiKey.length() > 5 ? apiKey.substring(0, 5) + "..." : "null"));

        try {
            List<Map<String, String>> messages = objectMapper.readValue(messagesJson, List.class);
            System.out.println("[AUTO_REPLY] msgs count=" + messages.size()
                    + " first=" + (messages.isEmpty() ? "none" : messages.get(0).getOrDefault("content","?").substring(0, Math.min(20, messages.get(0).getOrDefault("content","").length()))));

            String systemPrompt = buildPersonaPrompt(persona);
            String history = buildChatHistory(messages, userIdStr);

            System.out.println("[AUTO_REPLY] history=" + history.substring(0, Math.min(200, history.length())) + "...");

            var chatClient = chatClientService.forUser(provider, apiKey);

            String reply = chatClient.prompt()
                    .system(systemPrompt)
                    .user(history)
                    .call()
                    .content();

            if (reply == null || reply.trim().isEmpty()) {
                System.err.println("[AUTO_REPLY] Empty reply for task=" + taskId);
                return;
            }

            callback.sendReply(taskId, conversationId, reply.trim(), userId, provider, "default");
            System.out.println("[AUTO_REPLY] Done task=" + taskId);

        } catch (Exception e) {
            System.err.println("[AUTO_REPLY] Failed: " + e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private String buildChatHistory(List<Map<String, String>> messages, String selfId) {
        StringBuilder sb = new StringBuilder();
        sb.append("以下是最近的聊天记录，你需要扮演角色回复最后一条消息。\n\n");
            for (Map<String, String> msg : messages) {
                String senderId = msg.getOrDefault("senderId", "unknown");
                String senderName = msg.getOrDefault("senderName", "");
                String content = msg.getOrDefault("content", "");
                String type = msg.getOrDefault("messageType", "");
                System.out.println("[AUTO_REPLY] msg type=" + type + " contentLen=" + content.length());
                if (content.isBlank()) continue;

            String name = senderName;
            if (name == null || name.isBlank()) {
                if (String.valueOf(selfId).equals(senderId)) {
                    name = "你";
                } else {
                    name = "对方";
                }
            }

            if (String.valueOf(selfId).equals(senderId)) {
                sb.append(name).append("（你）：").append(content).append("\n");
            } else {
                sb.append(name).append("：").append(content).append("\n");
            }
        }
        sb.append("\n请用自然的口语回复，50字以内：");
        return sb.toString();
    }

    private String buildPersonaPrompt(String persona) {
        if (persona != null && !persona.isBlank()) {
            return persona + "\n\n用中文回复。参考聊天记录中的角色定位，自然地回复。";
        }
        return "你是一个友好的聊天助手。参考聊天记录中的角色定位，自然地回复。用中文回复。";
    }
}
