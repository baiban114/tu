package com.studyflow.note;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

/**
 * JDBC access for {@link PersonalNote}.
 */
@Repository
public class PersonalNoteRepository {

    private static final RowMapper<PersonalNote> ROW_MAPPER = (rs, rowNum) -> new PersonalNote(
            rs.getString("id"),
            rs.getString("user_id"),
            rs.getString("body"),
            rs.getObject("created_at", OffsetDateTime.class),
            rs.getObject("updated_at", OffsetDateTime.class)
    );

    private final JdbcClient jdbcClient;

    public PersonalNoteRepository(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    public void insert(PersonalNote note) {
        jdbcClient.sql("""
                        INSERT INTO personal_note (id, user_id, body, created_at, updated_at)
                        VALUES (:id, :userId, :body, :createdAt, :updatedAt)
                        """)
                .param("id", note.id())
                .param("userId", note.userId())
                .param("body", note.body())
                .param("createdAt", note.createdAt())
                .param("updatedAt", note.updatedAt())
                .update();
    }

    public boolean updateBody(String id, String userId, String body, OffsetDateTime updatedAt) {
        int updated = jdbcClient.sql("""
                        UPDATE personal_note
                        SET body = :body, updated_at = :updatedAt
                        WHERE id = :id AND user_id = :userId
                        """)
                .param("body", body)
                .param("updatedAt", updatedAt)
                .param("id", id)
                .param("userId", userId)
                .update();
        return updated > 0;
    }

    public boolean deleteByIdAndUserId(String id, String userId) {
        int deleted = jdbcClient.sql("""
                        DELETE FROM personal_note
                        WHERE id = :id AND user_id = :userId
                        """)
                .param("id", id)
                .param("userId", userId)
                .update();
        return deleted > 0;
    }

    public Optional<PersonalNote> findByIdAndUserId(String id, String userId) {
        return jdbcClient.sql("""
                        SELECT id, user_id, body, created_at, updated_at
                        FROM personal_note
                        WHERE id = :id AND user_id = :userId
                        """)
                .param("id", id)
                .param("userId", userId)
                .query(ROW_MAPPER)
                .optional();
    }

    public long countByUserId(String userId) {
        Long total = jdbcClient.sql("""
                        SELECT COUNT(*) FROM personal_note WHERE user_id = :userId
                        """)
                .param("userId", userId)
                .query(Long.class)
                .single();
        return total == null ? 0L : total;
    }

    public List<PersonalNote> findByUserId(String userId, int limit, int offset) {
        return jdbcClient.sql("""
                        SELECT id, user_id, body, created_at, updated_at
                        FROM personal_note
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
}
