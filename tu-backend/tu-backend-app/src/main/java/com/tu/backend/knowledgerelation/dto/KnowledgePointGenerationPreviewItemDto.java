package com.tu.backend.knowledgerelation.dto;

public record KnowledgePointGenerationPreviewItemDto(
    String locator,
    String kind,
    String title,
    String pageId,
    String pageTitle,
    String status
) {
}
