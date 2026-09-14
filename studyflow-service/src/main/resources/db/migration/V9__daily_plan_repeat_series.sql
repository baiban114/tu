ALTER TABLE daily_plan
    ADD COLUMN IF NOT EXISTS repeat_series_id VARCHAR(36);

CREATE INDEX IF NOT EXISTS idx_daily_plan_repeat_series
    ON daily_plan (user_id, repeat_series_id)
    WHERE repeat_series_id IS NOT NULL;
