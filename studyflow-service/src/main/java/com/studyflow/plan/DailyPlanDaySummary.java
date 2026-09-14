package com.studyflow.plan;

import java.time.LocalDate;

/**
 * Calendar summary for one date.
 *
 * @param date      calendar date
 * @param total     total entries
 * @param completed completed entries
 */
public record DailyPlanDaySummary(
        LocalDate date,
        long total,
        long completed
) {
}
