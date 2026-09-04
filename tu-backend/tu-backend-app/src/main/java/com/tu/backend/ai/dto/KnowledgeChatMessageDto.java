package com.tu.backend.ai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record KnowledgeChatMessageDto(
    @NotBlank @Size(max = 16) String role,
    @NotBlank @Size(max = 4000) String content
) {
}
