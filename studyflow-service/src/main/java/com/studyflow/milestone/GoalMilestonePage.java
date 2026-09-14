package com.studyflow.milestone;

import java.util.List;

/**
 * Paginated milestones for one goal.
 *
 * @param items current page items
 * @param total total matching items
 * @param page zero-based page number
 * @param pageSize requested page size
 */
public record GoalMilestonePage(
        List<GoalMilestone> items,
        long total,
        int page,
        int pageSize
) {
}
