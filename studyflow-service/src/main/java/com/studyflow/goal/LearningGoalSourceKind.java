package com.studyflow.goal;

/**
 * How a learning goal was established.
 */
public enum LearningGoalSourceKind {

    /** Free-form title only (StudyFlow composer). */
    FREE_TEXT,

    /** Seeded from a KnowledgePoint id in a tu knowledge base. */
    KNOWLEDGE_POINT,

    /** Seeded from an external resource item. */
    RESOURCE_ITEM,

    /** Seeded from a resource excerpt. */
    RESOURCE_EXCERPT;

    /**
     * Parse API/DB value; unknown values become {@link #FREE_TEXT}.
     *
     * @param raw raw kind
     * @return normalized kind
     */
    public static LearningGoalSourceKind fromValue(String raw) {
        if (raw == null || raw.isBlank()) {
            return FREE_TEXT;
        }
        String normalized = raw.trim().toUpperCase().replace('-', '_');
        for (LearningGoalSourceKind kind : values()) {
            if (kind.name().equals(normalized)) {
                return kind;
            }
        }
        return FREE_TEXT;
    }

    /**
     * Wire / DB value (lower snake).
     *
     * @return stable string
     */
    public String toValue() {
        return name().toLowerCase();
    }
}
