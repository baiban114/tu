package com.tu.backend.ai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AssembleLearningDocumentRequest(
    @NotBlank @Size(max = 512) String topic,
    @NotBlank @Size(max = 64) String kbId
) {
}
