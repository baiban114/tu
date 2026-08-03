package com.studyflow.mastery;

import java.util.List;

/**
 * Progress projection for a learning-route order.
 *
 * @param items                 status per requested point (missing → unknown)
 * @param suggestedNextPointId  first non-mastered point in order, or null if all mastered
 */
public record MasteryProjection(
        List<KnowledgePointMastery> items,
        String suggestedNextPointId
) {
}
