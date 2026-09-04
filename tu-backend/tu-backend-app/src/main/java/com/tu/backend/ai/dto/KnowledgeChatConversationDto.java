package com.tu.backend.ai.dto;

import java.time.LocalDateTime;
import java.util.List;

public record KnowledgeChatConversationDto(
    String id,
    String title,
    LocalDateTime createdAt,
    List<KnowledgeChatHistoryMessageDto> messages
) {
}
