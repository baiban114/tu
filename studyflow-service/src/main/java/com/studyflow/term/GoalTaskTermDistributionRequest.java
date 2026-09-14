package com.studyflow.term;

import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;

/**
 * Requested date range start for distributing a task term.
 *
 * @param startDate first plan date, included in the distribution
 * @param endDate last plan date, included in the distribution
 */
public record GoalTaskTermDistributionRequest(
        @NotNull LocalDate startDate,
        @NotNull LocalDate endDate
) {
}
