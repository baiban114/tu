package com.tu.backend.tag.dto;

import java.time.LocalDateTime;
import java.util.List;

public record TaggedContentItemDto(
    String id,
    String scope,
    String pageId,
    String pageTitle,
    String blockId,
    String sectionKey,
    String title,
    String snippet,
    List<TagPoolItemDto> matchedTags,
    LocalDateTime updatedAt
) {
}
