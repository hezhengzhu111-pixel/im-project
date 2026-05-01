package com.im.ai.service;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class ChatClientService {

    private static final Map<String, String> PROVIDER_BASE_URLS = Map.of(
            "deepseek", "https://api.deepseek.com/v1",
            "openai", "https://api.openai.com/v1",
            "minimax", "https://api.minimax.chat/v1"
    );

    public ChatClientService() {
    }

    public ChatClient forUser(String provider, String apiKey) {
        return forUser(provider, apiKey, null);
    }

    public ChatClient forUser(String provider, String apiKey, String modelName) {
        String baseUrl = PROVIDER_BASE_URLS.getOrDefault(
                provider.toLowerCase(), "https://api.deepseek.com/v1");

        System.out.println("[ChatClientService] provider=" + provider + " baseUrl=" + baseUrl
                + " keyLen=" + (apiKey != null ? apiKey.length() : 0));

        var api = OpenAiApi.builder()
                .baseUrl(baseUrl)
                .apiKey(apiKey)
                .build();

        var optionsBuilder = OpenAiChatOptions.builder()
                .temperature(0.7)
                .maxTokens(4096);

        optionsBuilder.model(modelName != null && !modelName.isBlank()
                ? modelName : getDefaultModel(provider));

        var chatModel = OpenAiChatModel.builder()
                .openAiApi(api)
                .defaultOptions(optionsBuilder.build())
                .build();

        return ChatClient.builder(chatModel).build();
    }

    private static String getDefaultModel(String provider) {
        return switch (provider.toLowerCase()) {
            case "deepseek" -> "deepseek-chat";
            case "minimax" -> "abab6.5s-chat";
            case "openai" -> "gpt-4o-mini";
            default -> "deepseek-chat";
        };
    }
}
