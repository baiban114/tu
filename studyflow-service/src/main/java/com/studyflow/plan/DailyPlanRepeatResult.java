package com.studyflow.plan;

import java.time.LocalDate;

/**
 * Result of a repeat operation.
 *
 * @param createdCount number of generated plans
 * @param skippedCount number of dates skipped because a matching plan exists
 * @param endDate inclusive recurrence deadline
 */
public record DailyPlanRepeatResult(
        Integer createdCount,
        Integer skippedCount,
        LocalDate endDate
) {
}
