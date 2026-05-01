package com.im.ai.callback;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.Map;

@Component
public class ReplyCallback {

    private final String apiServerUrl;
    private final String internalSecret;
    private final WebClient webClient;
    private final ObjectMapper objectMapper;

    public ReplyCallback(
            @Value("${im.api-server.url}") String apiServerUrl,
            @Value("${im.internal.secret}") String internalSecret) {
        this.apiServerUrl = apiServerUrl;
        this.internalSecret = internalSecret;
        this.webClient = WebClient.builder().build();
        this.objectMapper = new ObjectMapper();
    }

    public void sendReply(long taskId, String conversationId, String content,
                          long personaUserId, String provider, String model) {
        try {
            Map<String, Object> body = Map.of(
                "taskId", taskId,
                "conversationId", conversationId,
                "content", content,
                "personaUserId", personaUserId,
                "provider", provider != null ? provider : "",
                "model", model != null ? model : ""
            );
            byte[] bodyBytes = objectMapper.writeValueAsBytes(body);
            String path = "/api/ai/internal/reply";

            var headers = HmacSigner.signRequest("POST", path, bodyBytes, internalSecret);
            var request = webClient.post()
                    .uri(apiServerUrl + path);

            for (var entry : headers.entrySet()) {
                request.header(entry.getKey(), entry.getValue());
            }

            String response = request.bodyValue(bodyBytes)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block(java.time.Duration.ofSeconds(10));

            System.out.println("[REPLY_CALLBACK] task=" + taskId + " response=" + response);
        } catch (Exception e) {
            System.err.println("[REPLY_CALLBACK] failed: " + e.getMessage());
        }
    }

    public void updateDocStatus(long docId, String parseStatus) {
        // Placeholder: could call a Rust endpoint to update parse status
        System.out.println("[REPLY_CALLBACK] doc=" + docId + " status=" + parseStatus);
    }
}
