package com.tu.backend.storage.dto;

public record FileUploadConfigDto(
    long multipartThresholdBytes,
    long multipartChunkSizeBytes,
    long maxFileSizeBytes,
    long maxPdfFileSizeBytes
) {
}
