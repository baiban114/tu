package com.tu.backend.ai;

public record AiChatCompletionResult(
    String content,
    String requestBodyJson,
    String rawResponseBody,
    Long durationMs,
    Integer promptTokens,
    Integer completionTokens,
    Integer totalTokens,
    String reasoningContent
) {

    public AiChatCompletionResult(
        String content,
        String requestBodyJson,
        String rawResponseBody,
        Long durationMs,
        Integer promptTokens,
        Integer completionTokens,
        Integer totalTokens
    ) {
        this(
            content,
            requestBodyJson,
            rawResponseBody,
            durationMs,
            promptTokens,
            completionTokens,
            totalTokens,
            ""
        );
    }
}
