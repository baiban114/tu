package com.tu.backend.ai.dto;

import com.tu.backend.rag.dto.RagSourceDto;

import java.util.List;

public record KnowledgeChatResponse(
    String answer,
    List<RagSourceDto> sources,
    String reasoningContent,
    String selectedKbId,
    String selectedKbName,
    String conversationId
) {
    public KnowledgeChatResponse(
        String answer,
        List<RagSourceDto> sources,
        String reasoningContent,
        String selectedKbId,
        String selectedKbName
    ) {
        this(answer, sources, reasoningContent, selectedKbId, selectedKbName, null);
    }

    public KnowledgeChatResponse withConversationId(String value) {
        return new KnowledgeChatResponse(
            answer,
            sources,
            reasoningContent,
            selectedKbId,
            selectedKbName,
            value
        );
    }
}
