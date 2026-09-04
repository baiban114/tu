package com.tu.backend.ai.repository;

import com.tu.backend.ai.entity.KnowledgeChatSessionEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;
import java.util.Optional;

public interface KnowledgeChatSessionRepository extends JpaRepository<KnowledgeChatSessionEntity, String> {

    Page<KnowledgeChatSessionEntity> findByUserIdOrderByCreatedAtDesc(String userId, Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select session from KnowledgeChatSessionEntity session where session.id = :id")
    Optional<KnowledgeChatSessionEntity> findByIdForUpdate(@Param("id") String id);
}
