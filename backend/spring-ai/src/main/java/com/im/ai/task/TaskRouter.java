package com.im.ai.task;

import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class TaskRouter {

    public void handleSummary(Map<String, String> fields) {
        String conversationId = fields.getOrDefault("conversationId", "");
        String userId = fields.getOrDefault("userId", "");
        String messages = fields.getOrDefault("messages", "[]");
        String taskId = fields.getOrDefault("taskId", "0");
        String provider = fields.getOrDefault("provider", "deepseek");
        String key = fields.getOrDefault("key", "");

        System.out.printf("[SUMMARY] task=%s user=%s conv=%s provider=%s%n", taskId, userId, conversationId, provider);
        // TODO: Step 6 - Full LLM call implementation
    }

    public void handleAutoReply(Map<String, String> fields) {
        String conversationId = fields.getOrDefault("conversationId", "");
        String userId = fields.getOrDefault("userId", "");
        String messages = fields.getOrDefault("messages", "[]");
        String persona = fields.getOrDefault("persona", "");
        String taskId = fields.getOrDefault("taskId", "0");
        String provider = fields.getOrDefault("provider", "deepseek");
        String key = fields.getOrDefault("key", "");

        System.out.printf("[AUTO_REPLY] task=%s user=%s conv=%s persona=%s%n", taskId, userId, conversationId, persona);
        // TODO: Step 7 - Full auto-reply implementation
    }

    public void handleRagParse(Map<String, String> fields) {
        String docId = fields.getOrDefault("docId", "");
        String userId = fields.getOrDefault("userId", "");
        String ossUrl = fields.getOrDefault("ossUrl", "");

        System.out.printf("[RAG_PARSE] doc=%s user=%s url=%s%n", docId, userId, ossUrl);
        // TODO: Step 8 - Document parsing + chunking + embedding
    }

    public void handleRagQuery(Map<String, String> fields) {
        String userId = fields.getOrDefault("userId", "");
        String query = fields.getOrDefault("query", "");
        String groupId = fields.getOrDefault("groupId", "");

        System.out.printf("[RAG_QUERY] user=%s group=%s query=%s%n", userId, groupId, query);
        // TODO: Step 8 - Vector search + augmented LLM call
    }
}
