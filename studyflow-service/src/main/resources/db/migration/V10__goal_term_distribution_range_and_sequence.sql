ALTER TABLE goal_task_term
    ADD COLUMN IF NOT EXISTS distribution_end_date DATE;

ALTER TABLE daily_plan
    ADD COLUMN IF NOT EXISTS goal_term_sequence_number INTEGER,
    ADD COLUMN IF NOT EXISTS goal_term_sequence_total INTEGER;
