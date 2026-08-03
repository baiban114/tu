package com.studyflow.goal;

import java.time.OffsetDateTime;

/**
 * Learning goal owned by StudyFlow (shared with tu workspace views).
 *
 * @param id                 primary key
 * @param userId             owner
 * @param title              display title
 * @param kbId               optional tu knowledge-base id
 * @param sourceKind         how the goal was seeded
 * @param knowledgePointId   optional KP id
 * @param resourceItemId     optional resource item id
 * @param resourceExcerptId  optional excerpt id
 * @param snapshotJson       optional display snapshot JSON
 * @param currentFlag        whether this is the user's active goal
 * @param createdAt          created
 * @param updatedAt          updated
 */
public record LearningGoal(
        String id,
        String userId,
        String title,
        String kbId,
        String sourceKind,
        String knowledgePointId,
        String resourceItemId,
        String resourceExcerptId,
        String snapshotJson,
        Boolean currentFlag,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {
}
