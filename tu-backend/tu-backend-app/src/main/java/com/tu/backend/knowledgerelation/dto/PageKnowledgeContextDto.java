package com.tu.backend.knowledgerelation.dto;

import java.util.List;

public record PageKnowledgeContextDto(
    String pageId,
    List<KnowledgePointDto> pagePoints,
    List<KnowledgePointDto> prerequisites,
    List<KnowledgePointDto> successors
) {
}
