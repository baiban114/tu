package com.tu.backend.externalresource.dto;

import java.util.List;

public record ResourceItemDto(
    String id,
    String typeId,
    String typeName,
    String identityFieldKey,
    String identityFieldLabel,
    String workId,
    String workTitle,
    String title,
    String identityValue,
    String sourceUrl,
    List<String> accessUrls,
    String edition,
    String note,
    String titleSource,
    String workIdSource,
    String variantKind
) {
}
