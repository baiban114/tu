package com.studyflow.note;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Create / update body for a personal note.
 */
public record PersonalNoteUpsertRequest(
        @NotBlank(message = "body must not be blank")
        @Size(max = 50_000, message = "body too long")
        String body
) {
}
