package com.tu.backend.ai.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record LearningDocumentAssemblyPlanDto(
    String topic,
    List<String> orderedPointIds,
    List<LearningDocumentAssemblyInsertDto> inserts,
    List<String> warnings
) {
}
