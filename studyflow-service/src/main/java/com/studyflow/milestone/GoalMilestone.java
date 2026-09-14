package com.studyflow.milestone;

import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * A staged task within a learning goal.
 *
 * @param id milestone identifier
 * @param goalId owning goal identifier
 * @param userId owner identifier
 * @param title stage task title
 * @param deadline optional stage deadline
 * @param completed completion state
 * @param sortOrder display order within the goal
 * @param createdAt creation time
 * @param updatedAt last update time
 */
public record GoalMilestone(
        String id,
        String goalId,
        String userId,
        String title,
        LocalDate deadline,
        Boolean completed,
        Integer sortOrder,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {
}
