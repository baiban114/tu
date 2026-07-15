package com.tu.backend.knowledgerelation.dto;

import java.util.List;

public record KnowledgeGraphMetaDto(
    String mode,
    String centerPointId,
    int totalPoints,
    int totalRelations,
    boolean truncated,
    List<String> warnings
) {
}
