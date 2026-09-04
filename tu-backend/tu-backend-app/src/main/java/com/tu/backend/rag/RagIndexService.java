package com.tu.backend.rag;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.tu.backend.common.BusinessException;
import com.tu.backend.content.entity.PageContentEntity;
import com.tu.backend.content.repository.PageContentRepository;
import com.tu.backend.knowledge.repository.KnowledgeBaseRepository;
import com.tu.backend.page.entity.PageEntity;
import com.tu.backend.page.repository.PageRepository;
import com.tu.backend.rag.dto.RagDeleteRequest;
import com.tu.backend.rag.dto.RagIndexDocument;
import com.tu.backend.rag.dto.RagIndexRequest;
import com.tu.backend.rag.dto.RagQueryRequest;
import com.tu.backend.rag.dto.RagQueryResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class RagIndexService {

    private static final Logger log = LoggerFactory.getLogger(RagIndexService.class);
    private static final String PAGE_TYPE_X6_BOARD = "x6board";

    private final PageRepository pageRepository;
    private final PageContentRepository pageContentRepository;
    private final KnowledgeBaseRepository knowledgeBaseRepository;
    private final ObjectMapper objectMapper;
    private final RagDocumentExtractor documentExtractor;
    private final RagStore ragStore;

    public RagIndexService(
        PageRepository pageRepository,
        PageContentRepository pageContentRepository,
        KnowledgeBaseRepository knowledgeBaseRepository,
        ObjectMapper objectMapper,
        RagDocumentExtractor documentExtractor,
        RagStore ragStore
    ) {
        this.pageRepository = pageRepository;
        this.pageContentRepository = pageContentRepository;
        this.knowledgeBaseRepository = knowledgeBaseRepository;
        this.objectMapper = objectMapper;
        this.documentExtractor = documentExtractor;
        this.ragStore = ragStore;
    }

    public RagQueryResponse query(RagQueryRequest request) {
        if (!knowledgeBaseRepository.existsById(request.kbId())) {
            throw new BusinessException(40001, "knowledge base not found");
        }
        return ragStore.query(request);
    }

    public void reindexPage(String pageId) {
        indexPage(pageId);
    }

    public void reindexKnowledgeBase(String kbId) {
        if (!knowledgeBaseRepository.existsById(kbId)) {
            throw new BusinessException(40001, "knowledge base not found");
        }
        for (PageEntity page : pageRepository.findByKbIdOrderBySortOrderAscCreatedAtAsc(kbId)) {
            indexPage(page.getId());
        }
    }

    public void indexPage(String pageId) {
        PageEntity page = pageRepository.findById(pageId)
            .orElseThrow(() -> new BusinessException(40001, "page not found"));
        if (PAGE_TYPE_X6_BOARD.equalsIgnoreCase(page.getPageType())) {
            ragStore.delete(new RagDeleteRequest(page.getKbId(), pageId, null));
            return;
        }
        PageContentEntity content = pageContentRepository.findById(pageId)
            .orElse(null);
        if (content == null) {
            ragStore.delete(new RagDeleteRequest(page.getKbId(), pageId, null));
            return;
        }

        ArrayNode blocks = deserializeBlocks(content.getBlocksJson());
        List<RagIndexDocument> documents = documentExtractor.extract(
            page.getKbId(),
            page.getId(),
            page.getTitle(),
            blocks,
            content.getUpdatedAt() == null ? page.getUpdatedAt() : content.getUpdatedAt()
        );
        ragStore.index(new RagIndexRequest(page.getKbId(), page.getId(), documents));
    }

    public void indexPageBestEffort(String pageId) {
        try {
            indexPage(pageId);
        } catch (RuntimeException ex) {
            log.warn("Failed to index page {} for RAG", pageId, ex);
        }
    }

    public void deletePageBestEffort(String kbId, String pageId) {
        try {
            ragStore.delete(new RagDeleteRequest(kbId, pageId, null));
        } catch (RuntimeException ex) {
            log.warn("Failed to delete page {} from RAG", pageId, ex);
        }
    }

    public void deletePagesBestEffort(String kbId, List<String> pageIds) {
        try {
            ragStore.delete(new RagDeleteRequest(kbId, null, pageIds));
        } catch (RuntimeException ex) {
            log.warn("Failed to delete pages from RAG for kb {}", kbId, ex);
        }
    }

    public void deleteKnowledgeBaseBestEffort(String kbId) {
        try {
            ragStore.delete(new RagDeleteRequest(kbId, null, null));
        } catch (RuntimeException ex) {
            log.warn("Failed to delete knowledge base {} from RAG", kbId, ex);
        }
    }

    private ArrayNode deserializeBlocks(String blocksJson) {
        try {
            JsonNode node = objectMapper.readTree(blocksJson);
            if (node instanceof ArrayNode arrayNode) {
                return arrayNode;
            }
            throw new BusinessException(50000, "invalid page content structure");
        } catch (JsonProcessingException ex) {
            throw new BusinessException(50000, "failed to deserialize page content");
        }
    }
}
