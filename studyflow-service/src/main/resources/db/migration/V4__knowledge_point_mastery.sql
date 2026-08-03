-- Per-user knowledge-point mastery (StudyFlow owns learner state).
CREATE TABLE IF NOT EXISTS knowledge_point_mastery (
    id                    VARCHAR(36) PRIMARY KEY,
    user_id               VARCHAR(64) NOT NULL,
    kb_id                 VARCHAR(64),
    knowledge_point_id    VARCHAR(64) NOT NULL,
    status                VARCHAR(32) NOT NULL,
    score                 INTEGER,
    note                  VARCHAR(500),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mastery_user_point
    ON knowledge_point_mastery (user_id, knowledge_point_id);

CREATE INDEX IF NOT EXISTS idx_mastery_user_updated
    ON knowledge_point_mastery (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_mastery_user_kb
    ON knowledge_point_mastery (user_id, kb_id);
