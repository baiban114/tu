package com.tu.backend.externalresource.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreatePdfClipExcerptRequest(
    @NotNull @Min(1) Integer startPage,
    @NotNull @Min(1) Integer endPage,
    @NotNull @DecimalMin("0.0") @DecimalMax("1.0") Double clipTop,
    @NotNull @DecimalMin("0.0") @DecimalMax("1.0") Double clipBottom,
    @Size(max = 255) String title,
    @Size(max = 64) String fileId
) {
}
