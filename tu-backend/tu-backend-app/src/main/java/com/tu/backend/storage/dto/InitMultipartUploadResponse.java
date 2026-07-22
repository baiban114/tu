package com.tu.backend.storage.dto;

import java.util.List;

public record InitMultipartUploadResponse(
    String uploadId,
    String fileId,
    long chunkSizeBytes,
    long sizeBytes,
    List<Integer> uploadedPartNumbers
) {
}
