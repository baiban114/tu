package com.tu.backend.externalresource.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateResourcePdfRegionNoteRequest(
    @NotNull @Min(1) Integer startPage,
    @NotNull @Min(1) Integer endPage,
    @NotNull @DecimalMin("0.0") @DecimalMax("1.0") Double clipTop,
    @NotNull @DecimalMin("0.0") @DecimalMax("1.0") Double clipBottom,
    @NotBlank @Size(max = 20000) String note,
    @Size(max = 64) String fileId,
    @Size(max = 32) String color
) {
}
