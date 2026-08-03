package com.studyflow.mastery;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * Batch lookup / projection for an ordered learning route.
 *
 * @param kbId             optional kb scope
 * @param orderedPointIds  learning order (prerequisites first)
 */
public record MasteryProjectionRequest(
        @Size(max = 64) String kbId,
        @NotEmpty List<@Size(max = 64) String> orderedPointIds
) {
}
