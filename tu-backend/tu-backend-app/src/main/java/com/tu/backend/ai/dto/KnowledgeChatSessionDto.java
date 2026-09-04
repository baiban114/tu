package com.tu.backend.ai.dto;

import java.time.LocalDateTime;

public record KnowledgeChatSessionDto(
    String id,
    String title,
    String selectedKbId,
    String selectedKbName,
    LocalDateTime createdAt,
    LocalDateTime updatedAt
) {
}
