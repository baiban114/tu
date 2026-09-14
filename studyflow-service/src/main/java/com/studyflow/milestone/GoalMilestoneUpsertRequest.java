package com.studyflow.milestone;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * Create or update milestone payload.
 *
 * @param title stage task title
 * @param deadline optional stage deadline
 * @param completed completion state
 * @param sortOrder optional display order; create appends when absent
 */
public record GoalMilestoneUpsertRequest(
        @NotBlank @Size(max = 200) String title,
        LocalDate deadline,
        Boolean completed,
        @Min(1) @Max(100_000) Integer sortOrder
) {
}
