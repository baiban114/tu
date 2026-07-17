package com.tu.backend.knowledgerelation.dto;

import jakarta.validation.constraints.NotBlank;

public record MergeKnowledgePointsRequest(
    @NotBlank String sourcePointId,
    @NotBlank String targetPointId
) {
}
