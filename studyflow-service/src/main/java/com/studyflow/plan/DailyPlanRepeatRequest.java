package com.studyflow.plan;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

/**
 * Request for copying a plan on a calendar interval.
 *
 * @param unit repeat calendar unit
 * @param interval number of units between occurrences
 * @param endDate inclusive recurrence deadline
 */
public record DailyPlanRepeatRequest(
        @NotNull DailyPlanRepeatUnit unit,
        @NotNull @Min(1) @Max(365) Integer interval,
        @NotNull LocalDate endDate
) {
}
