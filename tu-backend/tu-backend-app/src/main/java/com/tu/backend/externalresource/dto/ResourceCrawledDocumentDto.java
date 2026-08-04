package com.tu.backend.externalresource.dto;

import java.time.LocalDateTime;

public record ResourceCrawledDocumentDto(
    String id,
    String resourceItemId,
    String sourceUrl,
    String title,
    String content,
    LocalDateTime crawledAt,
    LocalDateTime updatedAt
) {
}
