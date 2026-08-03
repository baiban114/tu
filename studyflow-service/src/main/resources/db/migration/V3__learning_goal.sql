-- Structured learning goals shared by StudyFlow and tu workspace views.
CREATE TABLE IF NOT EXISTS learning_goal (
    id                    VARCHAR(36) PRIMARY KEY,
    user_id               VARCHAR(64) NOT NULL,
    title                 VARCHAR(200) NOT NULL,
    kb_id                 VARCHAR(64),
    source_kind           VARCHAR(32) NOT NULL,
    knowledge_point_id    VARCHAR(64),
    resource_item_id      VARCHAR(64),
    resource_excerpt_id   VARCHAR(64),
    snapshot_json         TEXT,
    current_flag          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_goal_user_updated
    ON learning_goal (user_id, updated_at DESC);

-- At most one current goal per user.
CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_goal_user_current
    ON learning_goal (user_id)
    WHERE current_flag = TRUE;
