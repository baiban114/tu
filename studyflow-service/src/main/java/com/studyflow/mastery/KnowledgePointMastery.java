package com.studyflow.mastery;

import java.time.OffsetDateTime;

/**
 * One mastery row for a user × knowledge point.
 */
public record KnowledgePointMastery(
        String id,
        String userId,
        String kbId,
        String knowledgePointId,
        String status,
        Integer score,
        String note,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {
}
