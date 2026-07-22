package com.tu.backend.storage.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record InitMultipartUploadRequest(
    @NotBlank @Size(max = 512) String filename,
    @Size(max = 128) String contentType,
    @NotNull @Min(1) Long sizeBytes
) {
}
