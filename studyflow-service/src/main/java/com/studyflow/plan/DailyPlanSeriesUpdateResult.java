package com.studyflow.plan;

/**
 * Result of updating one task or a recurring series.
 *
 * @param updatedCount number of plans updated
 */
public record DailyPlanSeriesUpdateResult(int updatedCount) {
}
