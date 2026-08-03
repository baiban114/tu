package com.studyflow.goal;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Create / update learning goal payload.
 *
 * @param title              display title
 * @param kbId               optional knowledge base
 * @param sourceKind         free_text / knowledge_point / resource_item / resource_excerpt
 * @param knowledgePointId   optional
 * @param resourceItemId     optional
 * @param resourceExcerptId  optional
 * @param snapshotJson       optional JSON string
 * @param setCurrent         when true, mark as current after write
 */
public record LearningGoalUpsertRequest(
        @NotBlank @Size(max = 200) String title,
        @Size(max = 64) String kbId,
        @Size(max = 32) String sourceKind,
        @Size(max = 64) String knowledgePointId,
        @Size(max = 64) String resourceItemId,
        @Size(max = 64) String resourceExcerptId,
        @Size(max = 20_000) String snapshotJson,
        Boolean setCurrent
) {
}
