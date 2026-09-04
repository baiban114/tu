package com.tu.backend.ai;

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
import org.springframework.stereotype.Component;

@Component
public class AiAgentTools {

    private static final Logger log = LoggerFactory.getLogger(AiAgentTools.class);
    private static final int DEFAULT_RETRIEVAL_LIMIT = 5;
    private static final int MAX_RETRIEVAL_LIMIT = 10;
    private static final int MAX_RAG_SOURCE_LENGTH = 500;

    private final SearchService searchService;
    private final RagIndexService ragIndexService;
    private final ObjectMapper objectMapper;

    public AiAgentTools(
        SearchService searchService,
        RagIndexService ragIndexService,
        ObjectMapper objectMapper
    ) {
        this.searchService = searchService;
        this.ragIndexService = ragIndexService;
        this.objectMapper = objectMapper;
    }

    @Tool(description = """
        Keyword search across indexed knowledge-base pages (titles and block bodies).
        Use when you need to find existing notes or pages related to the learning topic.
        """)
    public String searchKnowledgeBasePages(
        @ToolParam(description = "Search keywords, at least 2 characters") String query,
        @ToolParam(description = "Maximum number of hits, default 5") Integer limit
    ) {
        int safeLimit = limit == null
            ? DEFAULT_RETRIEVAL_LIMIT
            : Math.clamp(limit, 1, MAX_RETRIEVAL_LIMIT);
        SearchResponseDto response;
        try {
            response = searchService.search(query, safeLimit);
        } catch (RuntimeException ex) {
            log.warn("Keyword search tool unavailable", ex);
            return unavailableKeywordResult();
        }
        List<Map<String, Object>> hits = new ArrayList<>();
        for (SearchHitDto hit : response.hits()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("kbId", hit.kbId());
            item.put("kbName", hit.kbName());
            item.put("pageId", hit.pageId());
            item.put("pageTitle", hit.pageTitle());
            item.put("blockId", hit.blockId());
            item.put("snippet", hit.snippet());
            hits.add(item);
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("enabled", response.enabled());
        payload.put("degraded", !response.enabled() || response.message() != null);
        payload.put("retrievalMode", response.enabled() ? "keyword" : "none");
        payload.put("message", response.message() == null ? "" : response.message());
        payload.put("hits", hits);
        return toJson(payload);
    }

    @Tool(description = """
        Semantic RAG retrieval within the current knowledge base.
        Requires kbId in the agent execution context. Returns relevant page blocks and a synthesized answer.
        """)
    public String queryKnowledgeBaseRag(
        @ToolParam(description = "Natural-language question about the learning topic") String query,
        @ToolParam(description = "Number of source chunks, default 5") Integer topK
    ) {
        AiAgentExecutionContext context = AiAgentExecutionContextHolder.get();
        String kbId = context == null ? "" : normalize(context.kbId());
        if (kbId.isBlank()) {
            return toJson(Map.of(
                "error", "knowledge base id not provided",
                "hint", "Use searchKnowledgeBasePages instead"
            ));
        }
        int safeTopK = topK == null
            ? DEFAULT_RETRIEVAL_LIMIT
            : Math.clamp(topK, 1, MAX_RETRIEVAL_LIMIT);
        try {
            RagQueryResponse response = ragIndexService.query(new RagQueryRequest(kbId, query, safeTopK));
            List<Map<String, Object>> sources = new ArrayList<>();
            if (response.sources() != null) {
                for (RagSourceDto source : response.sources()) {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("pageId", source.pageId());
                    item.put("blockId", source.blockId());
                    item.put("title", source.title());
                    item.put("score", source.score());
                    item.put("content", truncate(source.content(), MAX_RAG_SOURCE_LENGTH));
                    sources.add(item);
                }
            }
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("kbId", kbId);
            payload.put("degraded", false);
            payload.put("retrievalMode", "semantic");
            payload.put("answer", response.answer() == null ? "" : response.answer());
            payload.put("sources", sources);
            return toJson(payload);
        } catch (BusinessException ex) {
            log.warn("Semantic RAG tool unavailable for knowledge base {}", kbId, ex);
            return keywordFallback(kbId, query, safeTopK);
        }
    }

    private String keywordFallback(String kbId, String query, int limit) {
        SearchResponseDto response;
        try {
            response = searchService.searchKnowledgeBase(query, kbId, limit);
        } catch (RuntimeException ex) {
            log.warn("Keyword fallback unavailable for knowledge base {}", kbId, ex);
            return unavailableRetrievalResult(kbId);
        }
        if (!response.enabled() || response.message() != null) {
            return unavailableRetrievalResult(kbId);
        }

        List<Map<String, Object>> sources = new ArrayList<>();
        for (SearchHitDto hit : response.hits()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("pageId", hit.pageId());
            item.put("blockId", hit.blockId());
            item.put("title", hit.pageTitle());
            item.put("content", truncate(hit.snippet(), MAX_RAG_SOURCE_LENGTH));
            sources.add(item);
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("kbId", kbId);
        payload.put("degraded", true);
        payload.put("retrievalMode", "keyword");
        payload.put("message", "semantic retrieval unavailable; continued with keyword search");
        payload.put("sources", sources);
        return toJson(payload);
    }

    private String unavailableRetrievalResult(String kbId) {
        return toJson(Map.of(
            "kbId", kbId,
            "degraded", true,
            "retrievalMode", "none",
            "message", "knowledge retrieval unavailable; continue without external evidence",
            "sources", List.of()
        ));
    }

    private String unavailableKeywordResult() {
        return toJson(Map.of(
            "enabled", false,
            "degraded", true,
            "retrievalMode", "none",
            "message", "keyword search unavailable; continue without external evidence",
            "hits", List.of()
        ));
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim();
    }

    private String truncate(String value, int maxLength) {
        if (value == null) {
            return "";
        }
        if (value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength) + "...";
    }

    private String toJson(Object payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (Exception ex) {
            log.error("Failed to serialize AI agent tool result", ex);
            return "{\"error\":\"serialization failed\"}";
        }
    }
}
