package com.tu.backend.externalresource.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

public record UpdateResourcePdfRegionNoteRequest(
    @Min(1) Integer startPage,
    @Min(1) Integer endPage,
    @DecimalMin("0.0") @DecimalMax("1.0") Double clipTop,
    @DecimalMin("0.0") @DecimalMax("1.0") Double clipBottom,
    @Size(max = 20000) String note,
    @Size(max = 64) String fileId,
    @Size(max = 32) String color
) {
}
