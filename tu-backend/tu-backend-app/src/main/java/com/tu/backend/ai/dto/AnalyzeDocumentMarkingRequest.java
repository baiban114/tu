package com.tu.backend.ai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AnalyzeDocumentMarkingRequest(
    @NotBlank @Size(max = 64) String pageId,
    @Size(max = 64) String kbId,
    Boolean replaceExistingAi
) {
}
