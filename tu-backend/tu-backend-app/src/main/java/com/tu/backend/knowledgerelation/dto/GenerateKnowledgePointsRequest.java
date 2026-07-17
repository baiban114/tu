package com.tu.backend.knowledgerelation.dto;

import java.util.List;

public record GenerateKnowledgePointsRequest(
    List<String> sources,
    List<String> pageIds,
    List<String> locators
) {
    public GenerateKnowledgePointsRequest {
        sources = sources == null ? List.of() : sources;
        locators = locators == null ? List.of() : locators;
    }

    public GenerateKnowledgePointsRequest(List<String> sources, List<String> pageIds) {
        this(sources, pageIds, List.of());
    }
}
