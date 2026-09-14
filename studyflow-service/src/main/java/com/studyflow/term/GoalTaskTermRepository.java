package com.studyflow.term;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

/**
 * JDBC access for measurable goal task terms.
 */
@Repository
public class GoalTaskTermRepository {

    private static final RowMapper<GoalTaskTerm> ROW_MAPPER = (resultSet, rowNumber) -> new GoalTaskTerm(
            resultSet.getString("id"),
            resultSet.getString("goal_id"),
            resultSet.getString("user_id"),
            resultSet.getString("title"),
            resultSet.getBigDecimal("total_amount"),
            resultSet.getObject("distribution_start_date", LocalDate.class),
            resultSet.getObject("distribution_end_date", LocalDate.class),
            resultSet.getObject("distributed_at", OffsetDateTime.class),
            resultSet.getObject("created_at", OffsetDateTime.class),
            resultSet.getObject("updated_at", OffsetDateTime.class)
    );

    private final JdbcClient jdbcClient;

    public GoalTaskTermRepository(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    public void insert(GoalTaskTerm term) {
        jdbcClient.sql("""
                        INSERT INTO goal_task_term (
                            id, goal_id, user_id, title, total_amount,
                            distribution_start_date, distribution_end_date,
                            distributed_at, created_at, updated_at
                        ) VALUES (
                            :id, :goalId, :userId, :title, :totalAmount,
                            :distributionStartDate, :distributionEndDate,
                            :distributedAt, :createdAt, :updatedAt
                        )
                        """)
                .param("id", term.id())
                .param("goalId", term.goalId())
                .param("userId", term.userId())
                .param("title", term.title())
                .param("totalAmount", term.totalAmount())
                .param("distributionStartDate", term.distributionStartDate())
                .param("distributionEndDate", term.distributionEndDate())
                .param("distributedAt", term.distributedAt())
                .param("createdAt", term.createdAt())
                .param("updatedAt", term.updatedAt())
                .update();
    }

    public boolean update(GoalTaskTerm term) {
        int updated = jdbcClient.sql("""
                        UPDATE goal_task_term
                        SET title = :title,
                            total_amount = :totalAmount,
                            updated_at = :updatedAt
                        WHERE id = :id AND goal_id = :goalId AND user_id = :userId
                        """)
                .param("title", term.title())
                .param("totalAmount", term.totalAmount())
                .param("updatedAt", term.updatedAt())
                .param("id", term.id())
                .param("goalId", term.goalId())
                .param("userId", term.userId())
                .update();
        return updated > 0;
    }

    public boolean markDistributed(
            String id,
            String goalId,
            String userId,
            LocalDate distributionStartDate,
            LocalDate distributionEndDate,
            OffsetDateTime distributedAt
    ) {
        int updated = jdbcClient.sql("""
                        UPDATE goal_task_term
                        SET distribution_start_date = :distributionStartDate,
                            distribution_end_date = :distributionEndDate,
                            distributed_at = :distributedAt,
                            updated_at = :distributedAt
                        WHERE id = :id AND goal_id = :goalId AND user_id = :userId
                        """)
                .param("distributionStartDate", distributionStartDate)
                .param("distributionEndDate", distributionEndDate)
                .param("distributedAt", distributedAt)
                .param("id", id)
                .param("goalId", goalId)
                .param("userId", userId)
                .update();
        return updated > 0;
    }

    public boolean deleteByIdAndGoalIdAndUserId(String id, String goalId, String userId) {
        int deleted = jdbcClient.sql("""
                        DELETE FROM goal_task_term
                        WHERE id = :id AND goal_id = :goalId AND user_id = :userId
                        """)
                .param("id", id)
                .param("goalId", goalId)
                .param("userId", userId)
                .update();
        return deleted > 0;
    }

    public Optional<GoalTaskTerm> findByIdAndGoalIdAndUserId(String id, String goalId, String userId) {
        return jdbcClient.sql("""
                        SELECT id, goal_id, user_id, title, total_amount,
                               distribution_start_date, distribution_end_date,
                               distributed_at, created_at, updated_at
                        FROM goal_task_term
                        WHERE id = :id AND goal_id = :goalId AND user_id = :userId
                        """)
                .param("id", id)
                .param("goalId", goalId)
                .param("userId", userId)
                .query(ROW_MAPPER)
                .optional();
    }

    public long countByGoalIdAndUserId(String goalId, String userId) {
        Long total = jdbcClient.sql("""
                        SELECT COUNT(*)
                        FROM goal_task_term
                        WHERE goal_id = :goalId AND user_id = :userId
                        """)
                .param("goalId", goalId)
                .param("userId", userId)
                .query(Long.class)
                .single();
        return total == null ? 0L : total;
    }

    public List<GoalTaskTerm> findByGoalIdAndUserId(String goalId, String userId, int limit, int offset) {
        return jdbcClient.sql("""
                        SELECT id, goal_id, user_id, title, total_amount,
                               distribution_start_date, distribution_end_date,
                               distributed_at, created_at, updated_at
                        FROM goal_task_term
                        WHERE goal_id = :goalId AND user_id = :userId
                        ORDER BY created_at ASC
                        LIMIT :limit OFFSET :offset
                        """)
                .param("goalId", goalId)
                .param("userId", userId)
                .param("limit", limit)
                .param("offset", offset)
                .query(ROW_MAPPER)
                .list();
    }
}
