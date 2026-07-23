package com.studyflow.common;

/**
 * Shared constants for StudyFlow APIs.
 */
public final class StudyflowConstants {

    /** Default page size for paginated lists. */
    public static final int DEFAULT_PAGE_SIZE = 10;

    /** Max page size for paginated lists. */
    public static final int MAX_PAGE_SIZE = 100;

    /**
     * Fallback user id until auth is wired.
     * Clients may override with header {@code X-User-Id}.
     */
    public static final String DEFAULT_USER_ID = "local";

    public static final String USER_ID_HEADER = "X-User-Id";

    private StudyflowConstants() {
    }
}
