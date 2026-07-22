package com.tu.backend.storage.dto;

public record UploadPartResponse(
    int partNumber,
    String etag
) {
}
