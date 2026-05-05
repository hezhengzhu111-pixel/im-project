package com.im.ai.config;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AiConfig {

    @Bean
    public OpenAiChatModel openAiChatModel(
            @Value("${spring.ai.openai.api-key:placeholder}") String apiKey,
            @Value("${spring.ai.openai.base-url:https://api.openai.com/v1}") String baseUrl) {
        var api = OpenAiApi.builder()
                .baseUrl(baseUrl)
                .apiKey(apiKey)
                .build();
        return OpenAiChatModel.builder()
                .openAiApi(api)
                .defaultOptions(OpenAiChatOptions.builder()
                        .temperature(0.7)
                        .maxTokens(4096)
                        .build())
                .build();
    }

    @Bean
    public ChatClient.Builder chatClientBuilder(OpenAiChatModel chatModel) {
        return ChatClient.builder(chatModel);
    }
}
