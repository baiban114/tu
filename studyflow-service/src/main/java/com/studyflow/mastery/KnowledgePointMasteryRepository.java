package com.studyflow.mastery;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

/**
 * JDBC access for {@link KnowledgePointMastery}.
 */
@Repository
public class KnowledgePointMasteryRepository {

    private static final RowMapper<KnowledgePointMastery> ROW_MAPPER = (rs, rowNum) -> new KnowledgePointMastery(
            rs.getString("id"),
            rs.getString("user_id"),
            rs.getString("kb_id"),
            rs.getString("knowledge_point_id"),
            rs.getString("status"),
            (Integer) rs.getObject("score"),
            rs.getString("note"),
            rs.getObject("created_at", OffsetDateTime.class),
            rs.getObject("updated_at", OffsetDateTime.class)
    );

    private final JdbcClient jdbcClient;

    public KnowledgePointMasteryRepository(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    public void insert(KnowledgePointMastery row) {
        jdbcClient.sql("""
                        INSERT INTO knowledge_point_mastery (
                            id, user_id, kb_id, knowledge_point_id, status, score, note, created_at, updated_at
                        ) VALUES (
                            :id, :userId, :kbId, :knowledgePointId, :status, :score, :note, :createdAt, :updatedAt
                        )
                        """)
                .param("id", row.id())
                .param("userId", row.userId())
                .param("kbId", row.kbId())
                .param("knowledgePointId", row.knowledgePointId())
                .param("status", row.status())
                .param("score", row.score())
                .param("note", row.note())
                .param("createdAt", row.createdAt())
                .param("updatedAt", row.updatedAt())
                .update();
    }

    public boolean update(KnowledgePointMastery row) {
        int updated = jdbcClient.sql("""
                        UPDATE knowledge_point_mastery
                        SET kb_id = :kbId,
                            status = :status,
                            score = :score,
                            note = :note,
                            updated_at = :updatedAt
                        WHERE id = :id AND user_id = :userId
                        """)
                .param("kbId", row.kbId())
                .param("status", row.status())
                .param("score", row.score())
                .param("note", row.note())
                .param("updatedAt", row.updatedAt())
                .param("id", row.id())
                .param("userId", row.userId())
                .update();
        return updated > 0;
    }

    public Optional<KnowledgePointMastery> findByUserAndPoint(String userId, String knowledgePointId) {
        return jdbcClient.sql("""
                        SELECT id, user_id, kb_id, knowledge_point_id, status, score, note, created_at, updated_at
                        FROM knowledge_point_mastery
                        WHERE user_id = :userId AND knowledge_point_id = :knowledgePointId
                        """)
                .param("userId", userId)
                .param("knowledgePointId", knowledgePointId)
                .query(ROW_MAPPER)
                .optional();
    }

    public List<KnowledgePointMastery> findByUserAndPoints(String userId, Collection<String> pointIds) {
        if (pointIds == null || pointIds.isEmpty()) {
            return List.of();
        }
        return jdbcClient.sql("""
                        SELECT id, user_id, kb_id, knowledge_point_id, status, score, note, created_at, updated_at
                        FROM knowledge_point_mastery
                        WHERE user_id = :userId AND knowledge_point_id IN (:pointIds)
                        """)
                .param("userId", userId)
                .param("pointIds", pointIds)
                .query(ROW_MAPPER)
                .list();
    }

    public List<KnowledgePointMastery> findByUserId(String userId, String kbId, int limit, int offset) {
        if (kbId != null && !kbId.isBlank()) {
            return jdbcClient.sql("""
                            SELECT id, user_id, kb_id, knowledge_point_id, status, score, note, created_at, updated_at
                            FROM knowledge_point_mastery
                            WHERE user_id = :userId AND kb_id = :kbId
                            ORDER BY updated_at DESC
                            LIMIT :limit OFFSET :offset
                            """)
                    .param("userId", userId)
                    .param("kbId", kbId)
                    .param("limit", limit)
                    .param("offset", offset)
                    .query(ROW_MAPPER)
                    .list();
        }
        return jdbcClient.sql("""
                        SELECT id, user_id, kb_id, knowledge_point_id, status, score, note, created_at, updated_at
                        FROM knowledge_point_mastery
                        WHERE user_id = :userId
                        ORDER BY updated_at DESC
                        LIMIT :limit OFFSET :offset
                        """)
                .param("userId", userId)
                .param("limit", limit)
                .param("offset", offset)
                .query(ROW_MAPPER)
                .list();
    }

    public long countByUserId(String userId, String kbId) {
        if (kbId != null && !kbId.isBlank()) {
            Long count = jdbcClient.sql("""
                            SELECT COUNT(*) FROM knowledge_point_mastery
                            WHERE user_id = :userId AND kb_id = :kbId
                            """)
                    .param("userId", userId)
                    .param("kbId", kbId)
                    .query(Long.class)
                    .single();
            return count == null ? 0L : count;
        }
        Long count = jdbcClient.sql("""
                        SELECT COUNT(*) FROM knowledge_point_mastery WHERE user_id = :userId
                        """)
                .param("userId", userId)
                .query(Long.class)
                .single();
        return count == null ? 0L : count;
    }

    public boolean deleteByUserAndPoint(String userId, String knowledgePointId) {
        int updated = jdbcClient.sql("""
                        DELETE FROM knowledge_point_mastery
                        WHERE user_id = :userId AND knowledge_point_id = :knowledgePointId
                        """)
                .param("userId", userId)
                .param("knowledgePointId", knowledgePointId)
                .update();
        return updated > 0;
    }
}
