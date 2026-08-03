package com.studyflow.mastery;

import com.studyflow.common.BusinessException;

/**
 * Learner mastery status for a knowledge point.
 */
public enum MasteryStatus {
    UNKNOWN("unknown"),
    LEARNING("learning"),
    MASTERED("mastered");

    private final String value;

    MasteryStatus(String value) {
        this.value = value;
    }

    public String toValue() {
        return value;
    }

    public static MasteryStatus fromValue(String raw) {
        if (raw == null || raw.isBlank()) {
            return UNKNOWN;
        }
        String normalized = raw.trim().toLowerCase();
        for (MasteryStatus status : values()) {
            if (status.value.equals(normalized)) {
                return status;
            }
        }
        throw new BusinessException(40_000, "invalid mastery status: " + raw);
    }
}
