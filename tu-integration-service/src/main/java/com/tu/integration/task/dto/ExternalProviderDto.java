package com.tu.integration.task.dto;

public record ExternalProviderDto(
    String id,
    String name,
    String license,
    boolean configured
) {
}
