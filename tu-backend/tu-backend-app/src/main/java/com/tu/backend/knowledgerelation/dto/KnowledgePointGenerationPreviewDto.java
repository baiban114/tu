package com.tu.backend.knowledgerelation.dto;

import java.util.List;

public record KnowledgePointGenerationPreviewDto(
    List<KnowledgePointGenerationPreviewItemDto> items,
    int total
) {
}
