ALTER TABLE daily_plan
    ADD CONSTRAINT fk_daily_plan_goal
    FOREIGN KEY (goal_id)
    REFERENCES learning_goal (id)
    ON DELETE SET NULL;
