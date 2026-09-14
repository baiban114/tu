CREATE TABLE IF NOT EXISTS goal_milestone (
    id          VARCHAR(36) PRIMARY KEY,
    goal_id     VARCHAR(36) NOT NULL,
    user_id     VARCHAR(64) NOT NULL,
    title       VARCHAR(200) NOT NULL,
    deadline    DATE,
    completed   BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order  INTEGER NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_goal_milestone_goal
        FOREIGN KEY (goal_id)
        REFERENCES learning_goal (id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_goal_milestone_goal_order
    ON goal_milestone (goal_id, user_id, sort_order, created_at);
