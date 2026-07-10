CREATE TABLE IF NOT EXISTS study_session (
    id              VARCHAR(36) PRIMARY KEY,
    kb_id           VARCHAR(64) NOT NULL,
    knowledge_point_id VARCHAR(64),
    started_at      TIMESTAMPTZ NOT NULL,
    ended_at        TIMESTAMPTZ,
    duration_minutes INTEGER,
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_session_kb_started
    ON study_session (kb_id, started_at DESC);
