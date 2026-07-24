package com.tu.backend.externalresource.dto;

import java.time.LocalDateTime;

public record ResourcePdfRegionNoteDto(
    String id,
    String resourceItemId,
    String fileId,
    int startPage,
    int endPage,
    double clipTop,
    double clipBottom,
    String note,
    String color,
    LocalDateTime createdAt,
    LocalDateTime updatedAt
) {
}
