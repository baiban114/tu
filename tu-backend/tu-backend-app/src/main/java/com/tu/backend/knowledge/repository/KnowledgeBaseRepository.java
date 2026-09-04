package com.tu.backend.knowledge.repository;

import com.tu.backend.knowledge.entity.KnowledgeBaseEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface KnowledgeBaseRepository extends JpaRepository<KnowledgeBaseEntity, String> {

    boolean existsByName(String name);

    List<KnowledgeBaseEntity> findByOwnerUserIdOrderByUpdatedAtDesc(String ownerUserId);

    List<KnowledgeBaseEntity> findByOwnerUserIdIsNullOrderByUpdatedAtDesc();
}
