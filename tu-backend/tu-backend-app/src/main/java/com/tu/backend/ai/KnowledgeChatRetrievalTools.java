package com.tu.backend.ai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tu.backend.common.BusinessException;
import com.tu.backend.rag.RagIndexService;
import com.tu.backend.rag.dto.RagQueryRequest;
import com.tu.backend.rag.dto.RagQueryResponse;
import com.tu.backend.rag.dto.RagSourceDto;
import com.tu.backend.search.SearchService;
import com.tu.backend.search.dto.SearchHitDto;
import com.tu.backend.search.dto.SearchResponseDto;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;

final class KnowledgeChatRetrievalTools {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeChatRetrievalTools.class);
    private static final int RETRIEVAL_LIMIT = 6;
    private static final int MAX_SOURCE_CONTENT_LENGTH = 1800;

    private final String knowledgeBaseId;
    private final RagIndexService ragIndexService;
    private final SearchService searchService;
    private final ObjectMapper objectMapper;
    private final Map<String, RagSourceDto> sourcesByKey = new LinkedHashMap<>();

    KnowledgeChatRetrievalTools(
        String knowledgeBaseId,
        RagIndexService ragIndexService,
        SearchService searchService,
        ObjectMapper objectMapper,
        List<RagSourceDto> initialSources
    ) {
        this.knowledgeBaseId = knowledgeBaseId;
        this.ragIndexService = ragIndexService;
        this.searchService = searchService;
        this.objectMapper = objectMapper;
        addSources(initialSources);
    }

    @Tool(description = """
        Search only within the current authorized knowledge base. Use this read-only tool to refine queries,
        gather additional evidence, or verify that the available sources support the answer.
        Returned citation labels must be used exactly as provided.
        """)
    public String queryCurrentKnowledgeBase(
        @ToolParam(description = "A focused natural-language retrieval query") String query
    ) {
        String normalizedQuery = query == null ? "" : query.strip();
        if (normalizedQuery.length() < 2) {
            return toJson(Map.of("error", "query must contain at least 2 characters"));
        }
        List<RagSourceDto> retrievedSources = retrieve(normalizedQuery);
        addSources(retrievedSources);
        return sourcePayload(retrievedSources);
    }

    List<RagSourceDto> sources() {
        return List.copyOf(sourcesByKey.values());
    }

    private List<RagSourceDto> retrieve(String query) {
        try {
            RagQueryResponse response = ragIndexService.query(
                new RagQueryRequest(knowledgeBaseId, query, RETRIEVAL_LIMIT)
            );
            if (response.sources() != null && !response.sources().isEmpty()) {
                return response.sources();
            }
        } catch (BusinessException ex) {
            log.warn("Deep knowledge chat semantic retrieval unavailable for knowledge base {}", knowledgeBaseId, ex);
        }
        try {
            SearchResponseDto response = searchService.searchKnowledgeBase(query, knowledgeBaseId, RETRIEVAL_LIMIT);
            if (!response.enabled() || response.message() != null) {
                return List.of();
            }
            return response.hits().stream().map(this::toRagSource).toList();
        } catch (RuntimeException ex) {
            log.warn("Deep knowledge chat keyword retrieval unavailable for knowledge base {}", knowledgeBaseId, ex);
            return List.of();
        }
    }

    private void addSources(List<RagSourceDto> sources) {
        if (sources == null) {
            return;
        }
        for (RagSourceDto source : sources) {
            if (source != null) {
                sourcesByKey.putIfAbsent(sourceKey(source), source);
            }
        }
    }

    private String sourcePayload(List<RagSourceDto> retrievedSources) {
        List<Map<String, Object>> items = new ArrayList<>();
        for (RagSourceDto source : retrievedSources) {
            if (source == null) {
                continue;
            }
            int citationIndex = citationIndex(source);
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("citation", "[来源" + citationIndex + "]");
            item.put("title", source.title());
            item.put("content", abbreviate(source.content()));
            items.add(item);
        }
        return toJson(Map.of(
            "knowledgeBaseId", knowledgeBaseId,
            "sources", items
        ));
    }

    private int citationIndex(RagSourceDto source) {
        int index = 1;
        for (String registeredSourceKey : sourcesByKey.keySet()) {
            if (registeredSourceKey.equals(sourceKey(source))) {
                return index;
            }
            index++;
        }
        throw new IllegalStateException("knowledge chat source was not registered");
    }

    private RagSourceDto toRagSource(SearchHitDto hit) {
        String title = hit.title() == null || hit.title().isBlank() ? hit.pageTitle() : hit.title();
        return new RagSourceDto(
            hit.kbId(),
            hit.pageId(),
            hit.blockId(),
            title,
            hit.snippet(),
            hit.blockType(),
            null
        );
    }

    private String sourceKey(RagSourceDto source) {
        return source.pageId() + ":" + (source.blockId() == null ? "" : source.blockId());
    }

    private String abbreviate(String content) {
        String normalized = content == null ? "" : content.strip();
        return normalized.length() <= MAX_SOURCE_CONTENT_LENGTH
            ? normalized
            : normalized.substring(0, MAX_SOURCE_CONTENT_LENGTH) + "...";
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(50000, "failed to serialize deep knowledge chat tool result", ex);
        }
    }
}
