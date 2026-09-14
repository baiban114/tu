package com.studyflow.term;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/**
 * Create or update goal task term payload.
 *
 * @param title task clause title
 * @param totalAmount positive total quantity with at most two decimal places
 */
public record GoalTaskTermUpsertRequest(
        @NotBlank @Size(max = 200) String title,
        @NotNull @DecimalMin(value = "0.01") @Digits(integer = 10, fraction = 2) BigDecimal totalAmount
) {
}
