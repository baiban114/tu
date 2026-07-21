package com.tu.backend.kbresourcelink.service;

import com.tu.backend.common.BusinessException;
import com.tu.backend.externalresource.entity.ResourceItemEntity;
import com.tu.backend.externalresource.entity.ResourceTypeEntity;
import com.tu.backend.externalresource.repository.ResourceItemRepository;
import com.tu.backend.externalresource.repository.ResourceTypeRepository;
import com.tu.backend.kbresourcelink.dto.CreateKbResourceLinkRequest;
import com.tu.backend.kbresourcelink.dto.KbResourceLinkDto;
import com.tu.backend.kbresourcelink.entity.KbResourceLinkEntity;
import com.tu.backend.kbresourcelink.repository.KbResourceLinkRepository;
import com.tu.backend.knowledge.repository.KnowledgeBaseRepository;
import com.tu.backend.page.entity.PageEntity;
import com.tu.backend.page.repository.PageRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class KbResourceLinkService {

    private static final String DOCUMENT_TYPE_CODE = "document";

    private final KbResourceLinkRepository linkRepository;
    private final KnowledgeBaseRepository knowledgeBaseRepository;
    private final PageRepository pageRepository;
    private final ResourceItemRepository itemRepository;
    private final ResourceTypeRepository typeRepository;

    public KbResourceLinkService(
        KbResourceLinkRepository linkRepository,
        KnowledgeBaseRepository knowledgeBaseRepository,
        PageRepository pageRepository,
        ResourceItemRepository itemRepository,
        ResourceTypeRepository typeRepository
    ) {
        this.linkRepository = linkRepository;
        this.knowledgeBaseRepository = knowledgeBaseRepository;
        this.pageRepository = pageRepository;
        this.itemRepository = itemRepository;
        this.typeRepository = typeRepository;
    }

    @Transactional(readOnly = true)
    public List<KbResourceLinkDto> list(String kbId) {
        ensureKnowledgeBaseExists(kbId);
        List<KbResourceLinkEntity> links = linkRepository.findByKbIdOrderBySortOrderAscCreatedAtAsc(kbId.trim());
        if (links.isEmpty()) {
            return List.of();
        }

        List<String> itemIds = links.stream().map(KbResourceLinkEntity::getResourceItemId).toList();
        Map<String, ResourceItemEntity> items = itemRepository.findAllById(itemIds).stream()
            .collect(Collectors.toMap(ResourceItemEntity::getId, Function.identity()));
        List<String> typeIds = items.values().stream().map(ResourceItemEntity::getTypeId).distinct().toList();
        Map<String, ResourceTypeEntity> types = typeRepository.findAllById(typeIds).stream()
            .collect(Collectors.toMap(ResourceTypeEntity::getId, Function.identity()));

        List<KbResourceLinkDto> result = new ArrayList<>(links.size());
        for (KbResourceLinkEntity link : links) {
            ResourceItemEntity item = items.get(link.getResourceItemId());
            if (item == null) {
                continue;
            }
            ResourceTypeEntity type = types.get(item.getTypeId());
            result.add(toDto(link, item, type));
        }
        return result;
    }

    @Transactional
    public KbResourceLinkDto create(String kbId, CreateKbResourceLinkRequest request) {
        ensureKnowledgeBaseExists(kbId);
        String resourceItemId = request.resourceItemId() == null ? "" : request.resourceItemId().trim();
        if (resourceItemId.isEmpty()) {
            throw new BusinessException(40000, "resourceItemId is required");
        }

        String parentPageId = normalizeParentPageId(request.parentPageId());
        if (parentPageId != null) {
            ensurePageInKnowledgeBase(kbId.trim(), parentPageId);
        }

        ResourceItemEntity item = itemRepository.findById(resourceItemId)
            .orElseThrow(() -> new BusinessException(40001, "resource item not found"));
        ResourceTypeEntity type = typeRepository.findById(item.getTypeId())
            .orElseThrow(() -> new BusinessException(40001, "resource type not found"));
        if (!DOCUMENT_TYPE_CODE.equals(type.getCode())) {
            throw new BusinessException(40000, "only document resources can be linked to a knowledge base");
        }

        Optional<KbResourceLinkEntity> existingOpt =
            linkRepository.findByKbIdAndResourceItemId(kbId.trim(), resourceItemId);
        if (existingOpt.isPresent()) {
            KbResourceLinkEntity existing = existingOpt.get();
            existing.setParentPageId(parentPageId);
            KbResourceLinkEntity saved = linkRepository.save(existing);
            return toDto(saved, item, type);
        }

        int nextOrder = linkRepository.findByKbIdOrderBySortOrderAscCreatedAtAsc(kbId.trim()).stream()
            .mapToInt(KbResourceLinkEntity::getSortOrder)
            .max()
            .orElse(-1) + 1;

        KbResourceLinkEntity entity = new KbResourceLinkEntity();
        entity.setId(newId("krl"));
        entity.setKbId(kbId.trim());
        entity.setResourceItemId(resourceItemId);
        entity.setParentPageId(parentPageId);
        entity.setSortOrder(nextOrder);
        KbResourceLinkEntity saved = linkRepository.save(entity);
        return toDto(saved, item, type);
    }

    @Transactional
    public void delete(String kbId, String resourceItemId) {
        ensureKnowledgeBaseExists(kbId);
        String itemId = resourceItemId == null ? "" : resourceItemId.trim();
        if (itemId.isEmpty()) {
            throw new BusinessException(40000, "resourceItemId is required");
        }
        KbResourceLinkEntity existing = linkRepository.findByKbIdAndResourceItemId(kbId.trim(), itemId)
            .orElseThrow(() -> new BusinessException(40001, "resource link not found"));
        linkRepository.delete(existing);
    }

    private void ensureKnowledgeBaseExists(String kbId) {
        if (kbId == null || kbId.isBlank() || !knowledgeBaseRepository.existsById(kbId.trim())) {
            throw new BusinessException(40001, "knowledge base not found");
        }
    }

    private void ensurePageInKnowledgeBase(String kbId, String pageId) {
        PageEntity page = pageRepository.findById(pageId)
            .orElseThrow(() -> new BusinessException(40001, "page not found"));
        if (!kbId.equals(page.getKbId())) {
            throw new BusinessException(40000, "page does not belong to this knowledge base");
        }
    }

    private static String normalizeParentPageId(String parentPageId) {
        if (parentPageId == null) {
            return null;
        }
        String trimmed = parentPageId.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static KbResourceLinkDto toDto(
        KbResourceLinkEntity link,
        ResourceItemEntity item,
        ResourceTypeEntity type
    ) {
        return new KbResourceLinkDto(
            link.getId(),
            link.getKbId(),
            link.getResourceItemId(),
            link.getParentPageId(),
            link.getSortOrder(),
            item.getTitle(),
            item.getTypeId(),
            type != null ? type.getCode() : null,
            type != null ? type.getName() : null,
            item.getSourceUrl(),
            item.getNote()
        );
    }

    private static String newId(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
    }
}
