package com.studyflow.note;

import java.time.OffsetDateTime;

/**
 * Free-form personal text note (MVP personal status).
 */
public record PersonalNote(
        String id,
        String userId,
        String body,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {
}
