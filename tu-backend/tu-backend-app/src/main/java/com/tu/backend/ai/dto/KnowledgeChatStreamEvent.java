package com.tu.backend.ai.dto;

public record KnowledgeChatStreamEvent(
    String phase,
    String delta,
    String message,
    KnowledgeChatResponse result,
    Integer round,
    String toolName
) {
    public static KnowledgeChatStreamEvent started() {
        return new KnowledgeChatStreamEvent("started", null, null, null, null, null);
    }

    public static KnowledgeChatStreamEvent reasoningDelta(String delta) {
        return new KnowledgeChatStreamEvent("reasoning_delta", delta, null, null, null, null);
    }

    public static KnowledgeChatStreamEvent answerDelta(String delta) {
        return new KnowledgeChatStreamEvent("answer_delta", delta, null, null, null, null);
    }

    public static KnowledgeChatStreamEvent progress(
        String phase,
        String message,
        Integer round,
        String toolName
    ) {
        return new KnowledgeChatStreamEvent(phase, null, message, null, round, toolName);
    }

    public static KnowledgeChatStreamEvent completed(KnowledgeChatResponse result) {
        return new KnowledgeChatStreamEvent("completed", null, null, result, null, null);
    }

    public static KnowledgeChatStreamEvent failed(String message) {
        return new KnowledgeChatStreamEvent("failed", null, message, null, null, null);
    }
}
