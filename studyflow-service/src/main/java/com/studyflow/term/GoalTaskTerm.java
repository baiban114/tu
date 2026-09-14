package com.studyflow.term;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * A measurable task clause within a learning goal.
 *
 * @param id task term identifier
 * @param goalId owning goal identifier
 * @param userId owner identifier
 * @param title task clause title
 * @param totalAmount total quantity to complete
 * @param distributionStartDate first day used by automatic distribution
 * @param distributionEndDate last day used by automatic distribution
 * @param distributedAt last automatic distribution time
 * @param createdAt creation time
 * @param updatedAt last update time
 */
public record GoalTaskTerm(
        String id,
        String goalId,
        String userId,
        String title,
        BigDecimal totalAmount,
        LocalDate distributionStartDate,
        LocalDate distributionEndDate,
        OffsetDateTime distributedAt,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {
}
