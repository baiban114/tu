package com.tu.backend.ai;

public interface AiChatStreamListener {

    void onReasoningDelta(String delta);

    void onAnswerDelta(String delta);

    default boolean isCancelled() {
        return false;
    }
}
