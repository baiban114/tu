package com.studyflow.plan;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * Create or update payload for a daily plan entry.
 *
 * @param title     plan content
 * @param planDate  local calendar date
 * @param goalId    optional related learning goal
 * @param completed completion state
 */
public record DailyPlanUpsertRequest(
        @NotBlank @Size(max = 240) String title,
        @NotNull LocalDate planDate,
        @Size(max = 36) String goalId,
        Boolean completed
) {
}
