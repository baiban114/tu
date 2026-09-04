package com.tu.backend.ai.repository;

import com.tu.backend.ai.entity.KnowledgeChatMessageEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface KnowledgeChatMessageRepository extends JpaRepository<KnowledgeChatMessageEntity, String> {

    List<KnowledgeChatMessageEntity> findBySessionIdOrderByMessageIndexAsc(String sessionId);

    long countBySessionId(String sessionId);
}
