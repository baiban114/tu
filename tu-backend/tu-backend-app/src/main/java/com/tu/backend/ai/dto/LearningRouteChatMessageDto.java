package com.tu.backend.ai.dto;

import jakarta.validation.constraints.Size;

/**
 * One turn in a learning-route chat (user or assistant).
 *
 * @param role    user | assistant
 * @param content message body
 */
public record LearningRouteChatMessageDto(
        @Size(max = 32) String role,
        @Size(max = 20_000) String content
) {
}
