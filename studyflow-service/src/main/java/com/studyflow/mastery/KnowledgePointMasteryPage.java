package com.studyflow.mastery;

import java.util.List;

/**
 * Paginated mastery list.
 */
public record KnowledgePointMasteryPage(
        List<KnowledgePointMastery> items,
        long total,
        int page,
        int pageSize
) {
}
