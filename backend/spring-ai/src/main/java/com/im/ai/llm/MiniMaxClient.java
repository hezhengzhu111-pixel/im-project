package com.im.ai.llm;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;

public class MiniMaxClient implements LlmClient {

    private static final String BASE_URL = "https://api.minimax.chat/v1";
    private final WebClient webClient;

    public MiniMaxClient() {
        this.webClient = WebClient.builder()
                .baseUrl(BASE_URL)
                .build();
    }

    @Override
    public String getProviderName() {
        return "minimax";
    }

    @Override
    public Flux<String> streamChat(String systemPrompt, List<Map<String, String>> messages,
                                    String model, String apiKey) {
        var chatRequest = buildChatRequest(systemPrompt, messages, model, true);

        return webClient.post()
                .uri("/text/chatcompletion_v2")
                .header("Authorization", "Bearer " + apiKey)
                .header("Content-Type", "application/json")
                .bodyValue(chatRequest)
                .retrieve()
                .bodyToFlux(String.class)
                .filter(line -> line.startsWith("data: ") && !line.startsWith("data: [DONE]"))
                .map(line -> {
                    String json = line.substring(6).trim();
                    try {
                        var node = new com.fasterxml.jackson.databind.ObjectMapper().readTree(json);
                        var choices = node.get("choices");
                        if (choices != null && choices.isArray() && choices.size() > 0) {
                            var delta = choices.get(0).get("delta");
                            if (delta != null) {
                                var content = delta.get("content");
                                if (content != null && !content.isNull()) {
                                    return "{\"type\":\"chunk\",\"content\":" +
                                           new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(content.asText()) +
                                           "}";
                                }
                            }
                        }
                        return "";
                    } catch (Exception e) {
                        return "";
                    }
                })
                .filter(s -> !s.isEmpty());
    }

    @Override
    public String chat(String systemPrompt, List<Map<String, String>> messages,
                       String model, String apiKey) {
        var chatRequest = buildChatRequest(systemPrompt, messages, model, false);

        try {
            String response = webClient.post()
                    .uri("/text/chatcompletion_v2")
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .bodyValue(chatRequest)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block(Duration.ofSeconds(60));

            if (response == null) {
                return "";
            }
            var node = new com.fasterxml.jackson.databind.ObjectMapper().readTree(response);
            var choices = node.get("choices");
            if (choices != null && choices.isArray() && choices.size() > 0) {
                var content = choices.get(0).get("message").get("content");
                if (content != null && !content.isNull()) {
                    return content.asText();
                }
            }
            return "";
        } catch (Exception e) {
            throw new RuntimeException("MiniMax API call failed: " + e.getMessage(), e);
        }
    }

    @Override
    public List<Float> embed(String text, String apiKey) {
        return List.of();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> buildChatRequest(String systemPrompt, List<Map<String, String>> messages,
                                                  String model, boolean stream) {
        var msgList = new java.util.ArrayList<Map<String, Object>>();
        msgList.add(Map.of("sender_type", "BOT", "sender_name", "assistant",
                           "text", systemPrompt));
        for (var m : messages) {
            msgList.add(Map.of("sender_type", "USER", "sender_name", m.getOrDefault("role", "user"),
                               "text", m.getOrDefault("content", "")));
        }

        return Map.of(
            "model", model != null && !model.isEmpty() ? model : "abab6.5s-chat",
            "messages", msgList,
            "stream", stream,
            "temperature", 0.7,
            "tokens_to_generate", 4096
        );
    }
}
