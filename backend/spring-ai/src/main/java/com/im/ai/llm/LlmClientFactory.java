package com.im.ai.llm;

import java.util.List;
import java.util.Map;

public class LlmClientFactory {

    public static LlmClient create(String provider) {
        return switch (provider.toLowerCase()) {
            case "deepseek" -> new DeepSeekClient();
            case "minimax" -> new MiniMaxClient();
            case "openai" -> new OpenAiClient();
            default -> throw new IllegalArgumentException("Unknown provider: " + provider);
        };
    }
}
