package com.studyflow.goal;

import java.util.List;

/**
 * Paginated learning goals.
 *
 * @param items    page items
 * @param total    total count
 * @param page     page index (0-based)
 * @param pageSize page size
 */
public record LearningGoalPage(
        List<LearningGoal> items,
        long total,
        int page,
        int pageSize
) {
}
