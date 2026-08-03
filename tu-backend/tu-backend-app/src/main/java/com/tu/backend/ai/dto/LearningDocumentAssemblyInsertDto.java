package com.tu.backend.ai.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record LearningDocumentAssemblyInsertDto(
    String type,
    String forPointId,
    String refId,
    String refType,
    String title,
    String itemId,
    String excerptId,
    String fileId,
    Integer startPage,
    Integer endPage,
    Integer level,
    String text
) {
}
