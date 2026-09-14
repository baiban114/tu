package com.studyflow.term;

import java.util.List;

/**
 * Paginated task terms for one goal.
 *
 * @param items current page items
 * @param total total matching items
 * @param page zero-based page number
 * @param pageSize requested page size
 */
public record GoalTaskTermPage(
        List<GoalTaskTerm> items,
        long total,
        int page,
        int pageSize
) {
}
