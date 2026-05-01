package com.im.ai.llm;

import java.util.List;
import java.util.Map;
import reactor.core.publisher.Flux;

public interface LlmClient {

    String getProviderName();

    Flux<String> streamChat(String systemPrompt, List<Map<String, String>> messages,
                            String model, String apiKey);

    String chat(String systemPrompt, List<Map<String, String>> messages,
                String model, String apiKey);

    List<Float> embed(String text, String apiKey);
}
