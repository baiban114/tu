package com.tu.backend.externalresource.service;

import com.tu.backend.common.BusinessException;
import com.tu.backend.externalresource.crawl.CrawlClient;
import com.tu.backend.externalresource.dto.CrawlFetchResult;
import com.tu.backend.externalresource.dto.ResourceCrawledDocumentDto;
import com.tu.backend.externalresource.entity.ResourceCrawledDocumentEntity;
import com.tu.backend.externalresource.entity.ResourceItemEntity;
import com.tu.backend.externalresource.entity.ResourceTypeEntity;
import com.tu.backend.externalresource.repository.ResourceCrawledDocumentRepository;
import com.tu.backend.externalresource.repository.ResourceItemRepository;
import com.tu.backend.externalresource.repository.ResourceTypeRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.MalformedURLException;
import java.net.URL;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.UUID;

@Service
public class ResourceCrawledDocumentService {

    private static final String WEB_LINK_TYPE_CODE = "web-link";

    private final ResourceItemRepository itemRepository;
    private final ResourceTypeRepository typeRepository;
    private final ResourceCrawledDocumentRepository documentRepository;
    private final CrawlClient crawlClient;

    public ResourceCrawledDocumentService(
        ResourceItemRepository itemRepository,
        ResourceTypeRepository typeRepository,
        ResourceCrawledDocumentRepository documentRepository,
        CrawlClient crawlClient
    ) {
        this.itemRepository = itemRepository;
        this.typeRepository = typeRepository;
        this.documentRepository = documentRepository;
        this.crawlClient = crawlClient;
    }

    @Transactional(readOnly = true)
    public ResourceCrawledDocumentDto get(String resourceItemId) {
        findItem(resourceItemId);
        return documentRepository.findByResourceItemId(resourceItemId)
            .map(this::toDto)
            .orElse(null);
    }

    @Transactional
    public ResourceCrawledDocumentDto crawl(String resourceItemId) {
        ResourceItemEntity item = findItem(resourceItemId);
        ResourceTypeEntity type = findType(item.getTypeId());
        String sourceUrl = blankToNull(item.getSourceUrl());
        if (sourceUrl == null) {
            sourceUrl = blankToNull(item.getIdentityValue());
        }
        // web-link 实体直接支持；其他类型（如标识为网址的 document 实体）需具备合法 http(s) 网址
        boolean webLink = WEB_LINK_TYPE_CODE.equals(type.getCode());
        if (!webLink && !isValidHttpUrl(sourceUrl)) {
            throw new BusinessException(40002, "crawled documents require a web-link resource or a valid http(s) url");
        }
        if (sourceUrl == null) {
            throw new BusinessException(40000, "resource item source url required");
        }

        CrawlFetchResult result = crawlClient.fetch(sourceUrl);

        ResourceCrawledDocumentEntity entity = documentRepository.findByResourceItemId(resourceItemId)
            .orElseGet(() -> {
                ResourceCrawledDocumentEntity created = new ResourceCrawledDocumentEntity();
                created.setId("rcd-" + compactUuid());
                created.setResourceItemId(resourceItemId);
                return created;
            });
        entity.setSourceUrl(sourceUrl);
        String title = blankToNull(result.title());
        entity.setTitle(title != null ? title : item.getTitle());
        entity.setContent(result.markdown());
        entity.setCrawledAt(LocalDateTime.now());
        return toDto(documentRepository.save(entity));
    }

    /** Deleting a missing document is a no-op. */
    @Transactional
    public void delete(String resourceItemId) {
        documentRepository.deleteByResourceItemId(resourceItemId);
    }

    private ResourceItemEntity findItem(String id) {
        return itemRepository.findById(id)
            .orElseThrow(() -> new BusinessException(40001, "resource item not found"));
    }

    private ResourceTypeEntity findType(String id) {
        return typeRepository.findById(id)
            .orElseThrow(() -> new BusinessException(40001, "resource type not found"));
    }

    private static boolean isValidHttpUrl(String value) {
        if (value == null) {
            return false;
        }
        try {
            URL url = new URL(value);
            String protocol = url.getProtocol();
            return "http".equals(protocol) || "https".equals(protocol);
        } catch (MalformedURLException ex) {
            return false;
        }
    }

    private ResourceCrawledDocumentDto toDto(ResourceCrawledDocumentEntity entity) {
        return new ResourceCrawledDocumentDto(
            entity.getId(),
            entity.getResourceItemId(),
            entity.getSourceUrl(),
            entity.getTitle(),
            entity.getContent(),
            entity.getCrawledAt(),
            entity.getUpdatedAt()
        );
    }

    private static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String compactUuid() {
        return UUID.randomUUID().toString().replace("-", "").toLowerCase(Locale.ROOT);
    }
}
