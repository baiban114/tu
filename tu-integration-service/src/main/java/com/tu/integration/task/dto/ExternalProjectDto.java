package com.tu.integration.task.dto;

public record ExternalProjectDto(
    String provider,
    String externalId,
    String name,
    String description,
    String sourceUrl
) {
}
