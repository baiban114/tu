package com.tu.backend.ai.dto;

import com.tu.backend.rag.dto.RagSourceDto;

import java.time.LocalDateTime;
import java.util.List;

public record KnowledgeChatHistoryMessageDto(
    String id,
    String role,
    String content,
    String reasoningContent,
    List<RagSourceDto> sources,
    String selectedKbId,
    String selectedKbName,
    LocalDateTime createdAt
) {
}
