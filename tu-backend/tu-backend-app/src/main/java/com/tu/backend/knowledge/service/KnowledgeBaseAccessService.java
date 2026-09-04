package com.tu.backend.knowledge.service;

import com.tu.backend.auth.security.CurrentUserIdResolver;
import com.tu.backend.common.BusinessException;
import com.tu.backend.knowledge.entity.KnowledgeBaseEntity;
import com.tu.backend.knowledge.repository.KnowledgeBaseRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

@Service
public class KnowledgeBaseAccessService {

    private final KnowledgeBaseRepository knowledgeBaseRepository;
    private final CurrentUserIdResolver currentUserIdResolver;

    public KnowledgeBaseAccessService(
        KnowledgeBaseRepository knowledgeBaseRepository,
        CurrentUserIdResolver currentUserIdResolver
    ) {
        this.knowledgeBaseRepository = knowledgeBaseRepository;
        this.currentUserIdResolver = currentUserIdResolver;
    }

    @Transactional(readOnly = true)
    public KnowledgeBaseEntity requireAccessible(String kbId) {
        return requireAccessible(kbId, currentUserIdResolver.resolve());
    }

    @Transactional(readOnly = true)
    public KnowledgeBaseEntity requireAccessible(String kbId, String userId) {
        KnowledgeBaseEntity knowledgeBase = knowledgeBaseRepository.findById(kbId)
            .orElseThrow(() -> new BusinessException(40001, "knowledge base not found"));
        if (userId.equals(knowledgeBase.getOwnerUserId())) {
            return knowledgeBase;
        }
        if (knowledgeBase.getOwnerUserId() == null && currentUserIdResolver.isLocalUser(userId)) {
            return knowledgeBase;
        }
        throw new BusinessException(40300, "knowledge base is not accessible to current user");
    }

    @Transactional(readOnly = true)
    public List<KnowledgeBaseEntity> listAccessible() {
        return listAccessible(currentUserIdResolver.resolve());
    }

    @Transactional(readOnly = true)
    public List<KnowledgeBaseEntity> listAccessible(String userId) {
        List<KnowledgeBaseEntity> knowledgeBases = new ArrayList<>(
            knowledgeBaseRepository.findByOwnerUserIdOrderByUpdatedAtDesc(userId)
        );
        if (currentUserIdResolver.isLocalUser(userId)) {
            knowledgeBases.addAll(knowledgeBaseRepository.findByOwnerUserIdIsNullOrderByUpdatedAtDesc());
        }
        return knowledgeBases;
    }
}
