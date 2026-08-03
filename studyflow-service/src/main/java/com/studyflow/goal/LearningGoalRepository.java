package com.studyflow.goal;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

/**
 * JDBC access for {@link LearningGoal}.
 */
@Repository
public class LearningGoalRepository {

    private static final RowMapper<LearningGoal> ROW_MAPPER = (rs, rowNum) -> new LearningGoal(
            rs.getString("id"),
            rs.getString("user_id"),
            rs.getString("title"),
            rs.getString("kb_id"),
            rs.getString("source_kind"),
            rs.getString("knowledge_point_id"),
            rs.getString("resource_item_id"),
            rs.getString("resource_excerpt_id"),
            rs.getString("snapshot_json"),
            rs.getBoolean("current_flag"),
            rs.getObject("created_at", OffsetDateTime.class),
            rs.getObject("updated_at", OffsetDateTime.class)
    );

    private final JdbcClient jdbcClient;

    public LearningGoalRepository(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    public void insert(LearningGoal goal) {
        jdbcClient.sql("""
                        INSERT INTO learning_goal (
                            id, user_id, title, kb_id, source_kind,
                            knowledge_point_id, resource_item_id, resource_excerpt_id,
                            snapshot_json, current_flag, created_at, updated_at
                        ) VALUES (
                            :id, :userId, :title, :kbId, :sourceKind,
                            :knowledgePointId, :resourceItemId, :resourceExcerptId,
                            :snapshotJson, :currentFlag, :createdAt, :updatedAt
                        )
                        """)
                .param("id", goal.id())
                .param("userId", goal.userId())
                .param("title", goal.title())
                .param("kbId", goal.kbId())
                .param("sourceKind", goal.sourceKind())
                .param("knowledgePointId", goal.knowledgePointId())
                .param("resourceItemId", goal.resourceItemId())
                .param("resourceExcerptId", goal.resourceExcerptId())
                .param("snapshotJson", goal.snapshotJson())
                .param("currentFlag", Boolean.TRUE.equals(goal.currentFlag()))
                .param("createdAt", goal.createdAt())
                .param("updatedAt", goal.updatedAt())
                .update();
    }

    public boolean update(LearningGoal goal) {
        int updated = jdbcClient.sql("""
                        UPDATE learning_goal
                        SET title = :title,
                            kb_id = :kbId,
                            source_kind = :sourceKind,
                            knowledge_point_id = :knowledgePointId,
                            resource_item_id = :resourceItemId,
                            resource_excerpt_id = :resourceExcerptId,
                            snapshot_json = :snapshotJson,
                            current_flag = :currentFlag,
                            updated_at = :updatedAt
                        WHERE id = :id AND user_id = :userId
                        """)
                .param("title", goal.title())
                .param("kbId", goal.kbId())
                .param("sourceKind", goal.sourceKind())
                .param("knowledgePointId", goal.knowledgePointId())
                .param("resourceItemId", goal.resourceItemId())
                .param("resourceExcerptId", goal.resourceExcerptId())
                .param("snapshotJson", goal.snapshotJson())
                .param("currentFlag", Boolean.TRUE.equals(goal.currentFlag()))
                .param("updatedAt", goal.updatedAt())
                .param("id", goal.id())
                .param("userId", goal.userId())
                .update();
        return updated > 0;
    }

    public boolean clearCurrentFlag(String userId, OffsetDateTime updatedAt) {
        int updated = jdbcClient.sql("""
                        UPDATE learning_goal
                        SET current_flag = FALSE, updated_at = :updatedAt
                        WHERE user_id = :userId AND current_flag = TRUE
                        """)
                .param("updatedAt", updatedAt)
                .param("userId", userId)
                .update();
        return updated > 0;
    }

    public boolean setCurrentFlag(String id, String userId, OffsetDateTime updatedAt) {
        int updated = jdbcClient.sql("""
                        UPDATE learning_goal
                        SET current_flag = TRUE, updated_at = :updatedAt
                        WHERE id = :id AND user_id = :userId
                        """)
                .param("updatedAt", updatedAt)
                .param("id", id)
                .param("userId", userId)
                .update();
        return updated > 0;
    }

    public boolean deleteByIdAndUserId(String id, String userId) {
        int deleted = jdbcClient.sql("""
                        DELETE FROM learning_goal
                        WHERE id = :id AND user_id = :userId
                        """)
                .param("id", id)
                .param("userId", userId)
                .update();
        return deleted > 0;
    }

    public Optional<LearningGoal> findByIdAndUserId(String id, String userId) {
        return jdbcClient.sql("""
                        SELECT id, user_id, title, kb_id, source_kind,
                               knowledge_point_id, resource_item_id, resource_excerpt_id,
                               snapshot_json, current_flag, created_at, updated_at
                        FROM learning_goal
                        WHERE id = :id AND user_id = :userId
                        """)
                .param("id", id)
                .param("userId", userId)
                .query(ROW_MAPPER)
                .optional();
    }

    public Optional<LearningGoal> findCurrentByUserId(String userId) {
        return jdbcClient.sql("""
                        SELECT id, user_id, title, kb_id, source_kind,
                               knowledge_point_id, resource_item_id, resource_excerpt_id,
                               snapshot_json, current_flag, created_at, updated_at
                        FROM learning_goal
                        WHERE user_id = :userId AND current_flag = TRUE
                        LIMIT 1
                        """)
                .param("userId", userId)
                .query(ROW_MAPPER)
                .optional();
    }

    public long countByUserId(String userId) {
        Long total = jdbcClient.sql("""
                        SELECT COUNT(*) FROM learning_goal WHERE user_id = :userId
                        """)
                .param("userId", userId)
                .query(Long.class)
                .single();
        return total == null ? 0L : total;
    }

    public List<LearningGoal> findByUserId(String userId, int limit, int offset) {
        return jdbcClient.sql("""
                        SELECT id, user_id, title, kb_id, source_kind,
                               knowledge_point_id, resource_item_id, resource_excerpt_id,
                               snapshot_json, current_flag, created_at, updated_at
                        FROM learning_goal
                        WHERE user_id = :userId
                        ORDER BY current_flag DESC, updated_at DESC
                        LIMIT :limit OFFSET :offset
                        """)
                .param("userId", userId)
                .param("limit", limit)
                .param("offset", offset)
                .query(ROW_MAPPER)
                .list();
    }
}
