package com.studyflow.plan;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

/**
 * JDBC access for {@link DailyPlan}.
 */
@Repository
public class DailyPlanRepository {

    private static final RowMapper<DailyPlan> ROW_MAPPER = (rs, rowNum) -> new DailyPlan(
            rs.getString("id"),
            rs.getString("user_id"),
            rs.getString("goal_id"),
            rs.getString("goal_title"),
            rs.getObject("goal_deadline", LocalDate.class),
            rs.getString("goal_term_id"),
            rs.getBigDecimal("planned_amount"),
            rs.getObject("goal_term_sequence_number", Integer.class),
            rs.getObject("goal_term_sequence_total", Integer.class),
            rs.getString("repeat_series_id"),
            rs.getString("title"),
            rs.getObject("plan_date", LocalDate.class),
            rs.getBoolean("completed"),
            rs.getObject("created_at", OffsetDateTime.class),
            rs.getObject("updated_at", OffsetDateTime.class)
    );

    private static final RowMapper<DailyPlanDaySummary> SUMMARY_ROW_MAPPER =
            (rs, rowNum) -> new DailyPlanDaySummary(
                    rs.getObject("plan_date", LocalDate.class),
                    rs.getLong("total"),
                    rs.getLong("completed")
            );

    private static final String SELECT_COLUMNS = """
            SELECT p.id, p.user_id, p.goal_id, g.title AS goal_title,
                   g.deadline AS goal_deadline,
                   p.goal_term_id, p.planned_amount,
                   p.goal_term_sequence_number, p.goal_term_sequence_total,
                   p.repeat_series_id,
                   p.title, p.plan_date, p.completed, p.created_at, p.updated_at
            FROM daily_plan p
            LEFT JOIN learning_goal g ON g.id = p.goal_id AND g.user_id = p.user_id
            """;

    private final JdbcClient jdbcClient;

    public DailyPlanRepository(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    public void insert(DailyPlan plan) {
        jdbcClient.sql("""
                        INSERT INTO daily_plan (
                            id, user_id, goal_id, goal_term_id, planned_amount,
                            goal_term_sequence_number, goal_term_sequence_total, repeat_series_id,
                            title, plan_date, completed, created_at, updated_at
                        ) VALUES (
                            :id, :userId, :goalId, :goalTermId, :plannedAmount,
                            :goalTermSequenceNumber, :goalTermSequenceTotal, :repeatSeriesId,
                            :title, :planDate, :completed, :createdAt, :updatedAt
                        )
                        """)
                .param("id", plan.id())
                .param("userId", plan.userId())
                .param("goalId", plan.goalId())
                .param("goalTermId", plan.goalTermId())
                .param("plannedAmount", plan.plannedAmount())
                .param("goalTermSequenceNumber", plan.goalTermSequenceNumber())
                .param("goalTermSequenceTotal", plan.goalTermSequenceTotal())
                .param("repeatSeriesId", plan.repeatSeriesId())
                .param("title", plan.title())
                .param("planDate", plan.planDate())
                .param("completed", Boolean.TRUE.equals(plan.completed()))
                .param("createdAt", plan.createdAt())
                .param("updatedAt", plan.updatedAt())
                .update();
    }

    public boolean update(DailyPlan plan) {
        int updated = jdbcClient.sql("""
                        UPDATE daily_plan
                        SET goal_id = :goalId,
                            title = :title,
                            plan_date = :planDate,
                            completed = :completed,
                            updated_at = :updatedAt
                        WHERE id = :id AND user_id = :userId
                        """)
                .param("goalId", plan.goalId())
                .param("title", plan.title())
                .param("planDate", plan.planDate())
                .param("completed", Boolean.TRUE.equals(plan.completed()))
                .param("updatedAt", plan.updatedAt())
                .param("id", plan.id())
                .param("userId", plan.userId())
                .update();
        return updated > 0;
    }

    public boolean deleteByIdAndUserId(String id, String userId) {
        int deleted = jdbcClient.sql("""
                        DELETE FROM daily_plan
                        WHERE id = :id AND user_id = :userId
                        """)
                .param("id", id)
                .param("userId", userId)
                .update();
        return deleted > 0;
    }

    public Optional<DailyPlan> findByIdAndUserId(String id, String userId) {
        return jdbcClient.sql(SELECT_COLUMNS + " WHERE p.id = :id AND p.user_id = :userId")
                .param("id", id)
                .param("userId", userId)
                .query(ROW_MAPPER)
                .optional();
    }

    public Optional<DailyPlan> findByIdAndUserIdForUpdate(String id, String userId) {
        return jdbcClient.sql(SELECT_COLUMNS + " WHERE p.id = :id AND p.user_id = :userId FOR UPDATE OF p")
                .param("id", id)
                .param("userId", userId)
                .query(ROW_MAPPER)
                .optional();
    }

    public boolean existsByGoalTermIdAndDateExcludingId(
            String goalTermId,
            String userId,
            LocalDate planDate,
            Integer goalTermSequenceNumber,
            String excludedId
    ) {
        Long total = jdbcClient.sql("""
                        SELECT COUNT(*)
                        FROM daily_plan
                        WHERE goal_term_id = :goalTermId
                          AND user_id = :userId
                          AND plan_date = :planDate
                          AND goal_term_sequence_number IS NOT DISTINCT FROM :goalTermSequenceNumber
                          AND id <> :excludedId
                        """)
                .param("goalTermId", goalTermId)
                .param("userId", userId)
                .param("planDate", planDate)
                .param("goalTermSequenceNumber", goalTermSequenceNumber)
                .param("excludedId", excludedId)
                .query(Long.class)
                .single();
        return total != null && total > 0L;
    }

    public boolean goalExistsForUser(String goalId, String userId) {
        Long total = jdbcClient.sql("""
                        SELECT COUNT(*)
                        FROM learning_goal
                        WHERE id = :goalId AND user_id = :userId
                        """)
                .param("goalId", goalId)
                .param("userId", userId)
                .query(Long.class)
                .single();
        return total != null && total > 0;
    }

    public long countByUserIdAndDate(String userId, LocalDate planDate) {
        Long total = jdbcClient.sql("""
                        SELECT COUNT(*)
                        FROM daily_plan
                        WHERE user_id = :userId AND plan_date = :planDate
                        """)
                .param("userId", userId)
                .param("planDate", planDate)
                .query(Long.class)
                .single();
        return total == null ? 0L : total;
    }

    public List<LocalDate> findMatchingDates(
            String userId,
            String title,
            String goalId,
            LocalDate startDate,
            LocalDate endDate
    ) {
        String goalCondition = goalId == null ? "goal_id IS NULL" : "goal_id = :goalId";
        String sql = """
                        SELECT plan_date
                        FROM daily_plan
                        WHERE user_id = :userId
                          AND title = :title
                          AND plan_date BETWEEN :startDate AND :endDate
                          AND %s
                        """.formatted(goalCondition);
        JdbcClient.StatementSpec statement = jdbcClient.sql(sql)
                .param("userId", userId)
                .param("title", title)
                .param("startDate", startDate)
                .param("endDate", endDate);
        if (goalId != null) {
            statement = statement.param("goalId", goalId);
        }
        return statement.query(LocalDate.class).list();
    }

    public List<DailyPlan> findByGoalTermIdAndUserId(String goalTermId, String userId) {
        return jdbcClient.sql(SELECT_COLUMNS + """
                        WHERE p.goal_term_id = :goalTermId AND p.user_id = :userId
                        ORDER BY p.plan_date ASC
                        """)
                .param("goalTermId", goalTermId)
                .param("userId", userId)
                .query(ROW_MAPPER)
                .list();
    }

    public int assignRepeatSeriesToMatchingPlans(
            String userId,
            String title,
            String goalId,
            LocalDate startDate,
            LocalDate endDate,
            String repeatSeriesId,
            OffsetDateTime updatedAt
    ) {
        return jdbcClient.sql("""
                        UPDATE daily_plan
                        SET repeat_series_id = :repeatSeriesId,
                            updated_at = :updatedAt
                        WHERE user_id = :userId
                          AND title = :title
                          AND goal_id IS NOT DISTINCT FROM :goalId
                          AND plan_date BETWEEN :startDate AND :endDate
                          AND (repeat_series_id IS NULL OR repeat_series_id = :repeatSeriesId)
                        """)
                .param("repeatSeriesId", repeatSeriesId)
                .param("updatedAt", updatedAt)
                .param("userId", userId)
                .param("title", title)
                .param("goalId", goalId)
                .param("startDate", startDate)
                .param("endDate", endDate)
                .update();
    }

    public int updateRepeatSeriesDetails(
            String repeatSeriesId,
            String userId,
            String title,
            String goalId,
            OffsetDateTime updatedAt
    ) {
        return jdbcClient.sql("""
                        UPDATE daily_plan
                        SET title = :title,
                            goal_id = :goalId,
                            updated_at = :updatedAt
                        WHERE repeat_series_id = :repeatSeriesId AND user_id = :userId
                        """)
                .param("title", title)
                .param("goalId", goalId)
                .param("updatedAt", updatedAt)
                .param("repeatSeriesId", repeatSeriesId)
                .param("userId", userId)
                .update();
    }

    public int assignLegacyPlansToRepeatSeries(
            String userId,
            String title,
            String goalId,
            String repeatSeriesId,
            OffsetDateTime updatedAt
    ) {
        return jdbcClient.sql("""
                        UPDATE daily_plan
                        SET repeat_series_id = :repeatSeriesId,
                            updated_at = :updatedAt
                        WHERE user_id = :userId
                          AND title = :title
                          AND goal_id IS NOT DISTINCT FROM :goalId
                          AND repeat_series_id IS NULL
                        """)
                .param("repeatSeriesId", repeatSeriesId)
                .param("updatedAt", updatedAt)
                .param("userId", userId)
                .param("title", title)
                .param("goalId", goalId)
                .update();
    }

    public int deleteIncompleteByGoalTermIdAndUserId(String goalTermId, String userId) {
        return jdbcClient.sql("""
                        DELETE FROM daily_plan
                        WHERE goal_term_id = :goalTermId
                          AND user_id = :userId
                          AND completed = FALSE
                        """)
                .param("goalTermId", goalTermId)
                .param("userId", userId)
                .update();
    }

    public boolean updateDistributedPlan(
            DailyPlan plan,
            String title,
            BigDecimal plannedAmount,
            Integer goalTermSequenceNumber,
            Integer goalTermSequenceTotal,
            OffsetDateTime updatedAt
    ) {
        int updated = jdbcClient.sql("""
                        UPDATE daily_plan
                        SET title = :title,
                            planned_amount = :plannedAmount,
                            goal_term_sequence_number = :goalTermSequenceNumber,
                            goal_term_sequence_total = :goalTermSequenceTotal,
                            updated_at = :updatedAt
                        WHERE id = :id
                          AND user_id = :userId
                          AND goal_term_id = :goalTermId
                        """)
                .param("title", title)
                .param("plannedAmount", plannedAmount)
                .param("goalTermSequenceNumber", goalTermSequenceNumber)
                .param("goalTermSequenceTotal", goalTermSequenceTotal)
                .param("updatedAt", updatedAt)
                .param("id", plan.id())
                .param("userId", plan.userId())
                .param("goalTermId", plan.goalTermId())
                .update();
        return updated > 0;
    }

    public List<DailyPlan> findByUserIdAndDate(String userId, LocalDate planDate, int limit, int offset) {
        return jdbcClient.sql(SELECT_COLUMNS + """
                        WHERE p.user_id = :userId AND p.plan_date = :planDate
                        ORDER BY p.completed ASC, p.created_at ASC
                        LIMIT :limit OFFSET :offset
                        """)
                .param("userId", userId)
                .param("planDate", planDate)
                .param("limit", limit)
                .param("offset", offset)
                .query(ROW_MAPPER)
                .list();
    }

    public List<DailyPlanDaySummary> summarize(
            String userId,
            LocalDate startDate,
            LocalDate endDate
    ) {
        return jdbcClient.sql("""
                        SELECT plan_date,
                               COUNT(*) AS total,
                               COUNT(*) FILTER (WHERE completed = TRUE) AS completed
                        FROM daily_plan
                        WHERE user_id = :userId
                          AND plan_date BETWEEN :startDate AND :endDate
                        GROUP BY plan_date
                        ORDER BY plan_date
                        """)
                .param("userId", userId)
                .param("startDate", startDate)
                .param("endDate", endDate)
                .query(SUMMARY_ROW_MAPPER)
                .list();
    }
}
