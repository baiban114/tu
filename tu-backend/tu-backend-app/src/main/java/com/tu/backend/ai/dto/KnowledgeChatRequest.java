package com.tu.backend.ai.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

public record KnowledgeChatRequest(
    @Size(max = 64) String kbId,
    @NotBlank @Size(max = 4000) String question,
    @Size(max = 12) List<@Valid KnowledgeChatMessageDto> messages,
    @Size(max = 64) String conversationId,
    @Pattern(regexp = "fast|deep") String mode
) {
    public KnowledgeChatRequest(String kbId, String question, List<KnowledgeChatMessageDto> messages) {
        this(kbId, question, messages, null, null);
    }

    public KnowledgeChatRequest(
        String kbId,
        String question,
        List<KnowledgeChatMessageDto> messages,
        String conversationId
    ) {
        this(kbId, question, messages, conversationId, null);
    }

    public boolean deepMode() {
        return "deep".equals(mode);
    }
}
