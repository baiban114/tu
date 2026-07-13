package com.tu.backend.ai.dto;

public record DocumentMarkingSuggestionDto(
    String id,
    String action,
    String locator,
    String relationTypeKey,
    String resourceItemId,
    String resourceExcerptId,
    String excerptText,
    String excerptTitle,
    String toPointId,
    Double confidence,
    String reason,
    String markerSource
) {
}
