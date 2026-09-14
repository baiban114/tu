package com.studyflow.plan;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * A dated learning plan entry.
 *
 * @param id        primary key
 * @param userId    owner
 * @param goalId    optional related learning goal
 * @param goalTitle current title of the related goal, when available
 * @param goalDeadline current deadline of the related goal, when available
 * @param goalTermId optional source task term for automatic distribution
 * @param plannedAmount optional amount assigned to this day
 * @param goalTermSequenceNumber one-based position within a distributed task term
 * @param goalTermSequenceTotal total positions within a distributed task term
 * @param repeatSeriesId optional group identifier shared by recurring plans
 * @param title     plan content
 * @param planDate  local calendar date
 * @param completed completion state
 * @param createdAt created
 * @param updatedAt updated
 */
public record DailyPlan(
        String id,
        String userId,
        String goalId,
        String goalTitle,
        LocalDate goalDeadline,
        String goalTermId,
        BigDecimal plannedAmount,
        Integer goalTermSequenceNumber,
        Integer goalTermSequenceTotal,
        String repeatSeriesId,
        String title,
        LocalDate planDate,
        Boolean completed,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {
}
