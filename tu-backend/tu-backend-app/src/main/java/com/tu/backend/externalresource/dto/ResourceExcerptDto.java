package com.tu.backend.externalresource.dto;

public record ResourceExcerptDto(
    String id,
    String resourceItemId,
    String resourceItemTitle,
    String chapterId,
    String chapterTitle,
    String title,
    String locator,
    String excerptText,
    String note,
    Integer sortOrder
) {
}
