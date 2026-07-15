package com.tu.backend.knowledgerelation.dto;

public record KnowledgeGraphNodeDto(
    String id,
    String title,
    String parentId,
    Double estimatedHours,
    String summary,
    int sortOrder
) {
}
