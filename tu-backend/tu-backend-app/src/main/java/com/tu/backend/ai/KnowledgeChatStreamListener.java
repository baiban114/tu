package com.tu.backend.ai;

import com.tu.backend.ai.dto.KnowledgeChatStreamEvent;

public interface KnowledgeChatStreamListener {

    void onEvent(KnowledgeChatStreamEvent event);

    default boolean isCancelled() {
        return false;
    }
}
