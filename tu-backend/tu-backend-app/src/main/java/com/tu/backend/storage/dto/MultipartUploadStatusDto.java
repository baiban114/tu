package com.tu.backend.storage.dto;

import java.util.List;

public record MultipartUploadStatusDto(
    String uploadId,
    String fileId,
    String status,
    long sizeBytes,
    long chunkSizeBytes,
    List<Integer> uploadedPartNumbers
) {
}
