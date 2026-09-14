package com.studyflow.milestone;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

/**
 * JDBC access for goal milestones.
 */
@Repository
public class GoalMilestoneRepository {

    private static final RowMapper<GoalMilestone> ROW_MAPPER = (resultSet, rowNumber) -> new GoalMilestone(
            resultSet.getString("id"),
            resultSet.getString("goal_id"),
            resultSet.getString("user_id"),
            resultSet.getString("title"),
            resultSet.getObject("deadline", LocalDate.class),
            resultSet.getBoolean("completed"),
            resultSet.getInt("sort_order"),
            resultSet.getObject("created_at", OffsetDateTime.class),
            resultSet.getObject("updated_at", OffsetDateTime.class)
    );

    private final JdbcClient jdbcClient;

    public GoalMilestoneRepository(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    public void insert(GoalMilestone milestone) {
        jdbcClient.sql("""
                        INSERT INTO goal_milestone (
                            id, goal_id, user_id, title, deadline, completed,
                            sort_order, created_at, updated_at
                        ) VALUES (
                            :id, :goalId, :userId, :title, :deadline, :completed,
                            :sortOrder, :createdAt, :updatedAt
                        )
                        """)
                .param("id", milestone.id())
                .param("goalId", milestone.goalId())
                .param("userId", milestone.userId())
                .param("title", milestone.title())
                .param("deadline", milestone.deadline())
                .param("completed", Boolean.TRUE.equals(milestone.completed()))
                .param("sortOrder", milestone.sortOrder())
                .param("createdAt", milestone.createdAt())
                .param("updatedAt", milestone.updatedAt())
                .update();
    }

    public boolean update(GoalMilestone milestone) {
        int updated = jdbcClient.sql("""
                        UPDATE goal_milestone
                        SET title = :title,
                            deadline = :deadline,
                            completed = :completed,
                            sort_order = :sortOrder,
                            updated_at = :updatedAt
                        WHERE id = :id AND goal_id = :goalId AND user_id = :userId
                        """)
                .param("title", milestone.title())
                .param("deadline", milestone.deadline())
                .param("completed", Boolean.TRUE.equals(milestone.completed()))
                .param("sortOrder", milestone.sortOrder())
                .param("updatedAt", milestone.updatedAt())
                .param("id", milestone.id())
                .param("goalId", milestone.goalId())
                .param("userId", milestone.userId())
                .update();
        return updated > 0;
    }

    public boolean deleteByIdAndGoalIdAndUserId(String id, String goalId, String userId) {
        int deleted = jdbcClient.sql("""
                        DELETE FROM goal_milestone
                        WHERE id = :id AND goal_id = :goalId AND user_id = :userId
                        """)
                .param("id", id)
                .param("goalId", goalId)
                .param("userId", userId)
                .update();
        return deleted > 0;
    }

    public Optional<GoalMilestone> findByIdAndGoalIdAndUserId(String id, String goalId, String userId) {
        return jdbcClient.sql("""
                        SELECT id, goal_id, user_id, title, deadline, completed,
                               sort_order, created_at, updated_at
                        FROM goal_milestone
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
                        FROM goal_milestone
                        WHERE goal_id = :goalId AND user_id = :userId
                        """)
                .param("goalId", goalId)
                .param("userId", userId)
                .query(Long.class)
                .single();
        return total == null ? 0L : total;
    }

    public List<GoalMilestone> findByGoalIdAndUserId(
            String goalId,
            String userId,
            int limit,
            int offset
    ) {
        return jdbcClient.sql("""
                        SELECT id, goal_id, user_id, title, deadline, completed,
                               sort_order, created_at, updated_at
                        FROM goal_milestone
                        WHERE goal_id = :goalId AND user_id = :userId
                        ORDER BY sort_order ASC, created_at ASC
                        LIMIT :limit OFFSET :offset
                        """)
                .param("goalId", goalId)
                .param("userId", userId)
                .param("limit", limit)
                .param("offset", offset)
                .query(ROW_MAPPER)
                .list();
    }

    public int nextSortOrder(String goalId, String userId) {
        Integer next = jdbcClient.sql("""
                        SELECT COALESCE(MAX(sort_order), 0) + 1
                        FROM goal_milestone
                        WHERE goal_id = :goalId AND user_id = :userId
                        """)
                .param("goalId", goalId)
                .param("userId", userId)
                .query(Integer.class)
                .single();
        return next == null ? 1 : next;
    }
}
