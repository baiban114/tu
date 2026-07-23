package com.studyflow.note;

import java.util.List;

/**
 * Paginated list envelope for personal notes.
 */
public record PersonalNotePage(
        List<PersonalNote> items,
        long total,
        int page,
        int pageSize
) {
}
