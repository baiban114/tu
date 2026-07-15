package com.tu.backend.knowledgerelation.dto;

public record KnowledgeGraphEdgeDto(
    String id,
    String fromPointId,
    String toPointId,
    String relationTypeKey,
    String label,
    String color,
    boolean bidirectional
) {
}
