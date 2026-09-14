package com.studyflow.term;

import java.time.LocalDate;

/**
 * Result of distributing a task term into daily plans.
 *
 * @param startDate first distributed date
 * @param endDate goal deadline used as the last date
 * @param dayCount number of distributed calendar days
 * @param createdCount newly created daily plans
 * @param updatedCount existing generated plans updated in place
 * @param removedCount obsolete incomplete generated plans removed
 */
public record GoalTaskTermDistributionResult(
        LocalDate startDate,
        LocalDate endDate,
        int dayCount,
        int createdCount,
        int updatedCount,
        int removedCount
) {
}
