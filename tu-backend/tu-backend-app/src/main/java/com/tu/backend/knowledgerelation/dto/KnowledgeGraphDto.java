package com.tu.backend.knowledgerelation.dto;

import java.util.List;

public record KnowledgeGraphDto(
    List<KnowledgeGraphNodeDto> nodes,
    List<KnowledgeGraphEdgeDto> edges,
    KnowledgeGraphMetaDto meta
) {
}
