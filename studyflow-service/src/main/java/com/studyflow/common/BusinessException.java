package com.studyflow.common;

/**
 * Business-facing failure with a stable message for API clients.
 */
public class BusinessException extends RuntimeException {

    private final int code;

    public BusinessException(String message) {
        this(40_000, message);
    }

    public BusinessException(int code, String message) {
        super(message);
        this.code = code;
    }

    public int getCode() {
        return code;
    }
}
