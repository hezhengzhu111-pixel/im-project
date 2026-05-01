package com.im.ai.service;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class ChatClientService {

    private final OpenAiChatModel templateModel;

    private static final Map<String, String> PROVIDER_BASE_URLS = Map.of(
            "deepseek", "https://api.deepseek.com/v1",
            "openai", "https://api.openai.com/v1",
            "minimax", "https://api.minimax.chat/v1"
    );

    public ChatClientService(OpenAiChatModel templateModel) {
        this.templateModel = templateModel;
    }

    public ChatClient forUser(String provider, String apiKey) {
        return forUser(provider, apiKey, null);
    }

    public ChatClient forUser(String provider, String apiKey, String modelName) {
        String baseUrl = PROVIDER_BASE_URLS.getOrDefault(
                provider.toLowerCase(), "https://api.deepseek.com/v1");

        var api = OpenAiApi.builder()
                .baseUrl(baseUrl)
                .apiKey(apiKey)
                .build();

        var optionsBuilder = OpenAiChatOptions.builder()
                .temperature(0.7)
                .maxTokens(4096);

        if (modelName != null && !modelName.isBlank()) {
            optionsBuilder.model(modelName);
        }

        var chatModel = OpenAiChatModel.builder()
                .openAiApi(api)
                .defaultOptions(optionsBuilder.build())
                .build();

        return ChatClient.builder(chatModel).build();
    }
}
