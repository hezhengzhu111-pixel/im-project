package com.im.ai.llm;

import java.time.Duration;
import java.util.List;
import java.util.Map;

import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;

public class OpenAiClient implements LlmClient {

    private final String baseUrl;
    private final WebClient webClient;

    public OpenAiClient() {
        this("https://api.openai.com/v1");
    }

    public OpenAiClient(String baseUrl) {
        this.baseUrl = baseUrl;
        this.webClient = WebClient.builder()
                .baseUrl(baseUrl)
                .build();
    }

    @Override
    public String getProviderName() {
        return "openai";
    }

    @Override
    public Flux<String> streamChat(String systemPrompt, List<Map<String, String>> messages,
                                    String model, String apiKey) {
        var chatRequest = buildChatRequest(systemPrompt, messages, model, true);

        return webClient.post()
                .uri("/chat/completions")
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
                    .uri("/chat/completions")
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
            throw new RuntimeException("OpenAI API call failed: " + e.getMessage(), e);
        }
    }

    @Override
    public List<Float> embed(String text, String apiKey) {
        try {
            var request = Map.of(
                "model", "text-embedding-3-small",
                "input", text
            );

            String response = webClient.post()
                    .uri("/embeddings")
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .bodyValue(request)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block(Duration.ofSeconds(30));

            if (response == null) {
                return List.of();
            }
            var node = new com.fasterxml.jackson.databind.ObjectMapper().readTree(response);
            var data = node.get("data");
            if (data != null && data.isArray() && data.size() > 0) {
                var embedding = data.get(0).get("embedding");
                if (embedding != null && embedding.isArray()) {
                    var result = new java.util.ArrayList<Float>();
                    for (var v : embedding) {
                        result.add(v.floatValue());
                    }
                    return result;
                }
            }
            return List.of();
        } catch (Exception e) {
            return List.of();
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> buildChatRequest(String systemPrompt, List<Map<String, String>> messages,
                                                  String model, boolean stream) {
        var systemMsg = Map.of("role", "system", "content", (Object) systemPrompt);
        var msgList = new java.util.ArrayList<Map<String, Object>>();
        msgList.add(systemMsg);
        for (var m : messages) {
            msgList.add(Map.of("role", m.getOrDefault("role", "user"),
                               "content", (Object) m.getOrDefault("content", "")));
        }

        return Map.of(
            "model", model != null && !model.isEmpty() ? model : "gpt-4o-mini",
            "messages", msgList,
            "stream", stream,
            "temperature", 0.7,
            "max_tokens", 4096
        );
    }
}
