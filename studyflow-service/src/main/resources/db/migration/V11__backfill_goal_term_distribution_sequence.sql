UPDATE goal_task_term term
SET distribution_end_date = plan_range.end_date
FROM (
    SELECT goal_term_id, MAX(plan_date) AS end_date
    FROM daily_plan
    WHERE goal_term_id IS NOT NULL
    GROUP BY goal_term_id
) plan_range
WHERE term.id = plan_range.goal_term_id
  AND term.distribution_end_date IS NULL;

UPDATE goal_task_term term
SET distribution_end_date = goal.deadline
FROM learning_goal goal
WHERE term.goal_id = goal.id
  AND term.distribution_end_date IS NULL
  AND term.distributed_at IS NOT NULL;

WITH ranked_plan AS (
    SELECT id,
           (ROW_NUMBER() OVER (PARTITION BY goal_term_id ORDER BY plan_date, id))::INTEGER AS sequence_number,
           (COUNT(*) OVER (PARTITION BY goal_term_id))::INTEGER AS sequence_total
    FROM daily_plan
    WHERE goal_term_id IS NOT NULL
)
UPDATE daily_plan plan
SET goal_term_sequence_number = ranked_plan.sequence_number,
    goal_term_sequence_total = ranked_plan.sequence_total
FROM ranked_plan
WHERE plan.id = ranked_plan.id
  AND (plan.goal_term_sequence_number IS NULL OR plan.goal_term_sequence_total IS NULL);
