CREATE TABLE IF NOT EXISTS goal_task_term (
    id                      VARCHAR(36) PRIMARY KEY,
    goal_id                 VARCHAR(36) NOT NULL,
    user_id                 VARCHAR(64) NOT NULL,
    title                   VARCHAR(200) NOT NULL,
    total_amount            NUMERIC(12, 2) NOT NULL,
    distribution_start_date DATE,
    distributed_at          TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_goal_task_term_total_amount CHECK (total_amount > 0),
    CONSTRAINT fk_goal_task_term_goal
        FOREIGN KEY (goal_id)
        REFERENCES learning_goal (id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_goal_task_term_goal_created
    ON goal_task_term (goal_id, user_id, created_at);

ALTER TABLE daily_plan
    ADD COLUMN IF NOT EXISTS goal_term_id VARCHAR(36),
    ADD COLUMN IF NOT EXISTS planned_amount NUMERIC(12, 2);

ALTER TABLE daily_plan
    ADD CONSTRAINT fk_daily_plan_goal_term
    FOREIGN KEY (goal_term_id)
    REFERENCES goal_task_term (id)
    ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_plan_goal_term_date
    ON daily_plan (goal_term_id, plan_date)
    WHERE goal_term_id IS NOT NULL;
