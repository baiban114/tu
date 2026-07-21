package com.tu.backend.kbresourcelink.dto;

public record KbResourceLinkDto(
    String id,
    String kbId,
    String resourceItemId,
    String parentPageId,
    int sortOrder,
    String title,
    String typeId,
    String typeCode,
    String typeName,
    String sourceUrl,
    String note
) {
}
