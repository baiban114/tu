package com.studyflow.mastery;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Upsert mastery for one knowledge point.
 *
 * @param kbId              optional knowledge-base id
 * @param knowledgePointId  required point id
 * @param status            unknown | learning | mastered
 * @param score             optional 0–100
 * @param note              optional short note
 */
public record MasteryUpsertRequest(
        @Size(max = 64) String kbId,
        @NotBlank @Size(max = 64) String knowledgePointId,
        @NotBlank @Size(max = 32) String status,
        @Min(0) @Max(100) Integer score,
        @Size(max = 500) String note
) {
}
