package com.studyflow.plan;

import java.util.List;

/**
 * Paginated plan entries for one calendar date.
 *
 * @param items    current page
 * @param total    total entries on the date
 * @param page     zero-based page
 * @param pageSize page size
 */
public record DailyPlanPage(
        List<DailyPlan> items,
        long total,
        int page,
        int pageSize
) {
}
