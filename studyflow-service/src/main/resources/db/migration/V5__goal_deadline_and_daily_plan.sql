ALTER TABLE learning_goal
    ADD COLUMN IF NOT EXISTS deadline DATE;

CREATE TABLE IF NOT EXISTS daily_plan (
    id          VARCHAR(36) PRIMARY KEY,
    user_id     VARCHAR(64) NOT NULL,
    goal_id     VARCHAR(36),
    title       VARCHAR(240) NOT NULL,
    plan_date   DATE NOT NULL,
    completed   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_plan_user_date
    ON daily_plan (user_id, plan_date, completed, created_at);
