package com.tu.backend.knowledgerelation.dto;

import java.util.List;

public record KnowledgeGraphMetaDto(
    String mode,
    String centerPointId,
    int totalPoints,
    int totalRelations,
    boolean truncated,
    List<String> warnings,
    List<String> focusPointIds
) {
    public KnowledgeGraphMetaDto {
        if (warnings == null) {
            warnings = List.of();
        }
        if (focusPointIds == null) {
            focusPointIds = List.of();
        }
    }
}
