package com.tu.backend.ai;

public interface AiChatClient {

    AiChatCompletionResult completeJson(AiAgentRuntimeConfig config, String systemPrompt, String userPrompt);

    default AiChatCompletionResult streamText(
        AiAgentRuntimeConfig config,
        String systemPrompt,
        String userPrompt,
        AiChatStreamListener listener
    ) {
        AiChatCompletionResult result = completeJson(config, systemPrompt, userPrompt);
        if (!result.reasoningContent().isBlank()) {
            listener.onReasoningDelta(result.reasoningContent());
        }
        if (!result.content().isBlank()) {
            listener.onAnswerDelta(result.content());
        }
        return result;
    }
}
