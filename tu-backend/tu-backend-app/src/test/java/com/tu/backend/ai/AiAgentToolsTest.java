package com.tu.backend.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tu.backend.common.BusinessException;
import com.tu.backend.rag.RagIndexService;
import com.tu.backend.rag.dto.RagQueryRequest;
import com.tu.backend.rag.dto.RagQueryResponse;
import com.tu.backend.rag.dto.RagSourceDto;
import com.tu.backend.search.SearchService;
import com.tu.backend.search.dto.SearchHitDto;
import com.tu.backend.search.dto.SearchResponseDto;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class AiAgentToolsTest {

    @Mock
    private SearchService searchService;

    @Mock
    private RagIndexService ragIndexService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @AfterEach
    void tearDown() {
        AiAgentExecutionContextHolder.clear();
    }

    @Test
    void searchKnowledgeBasePagesReturnsHits() {
        when(searchService.search(eq("java"), anyInt())).thenReturn(new SearchResponseDto(
            List.of(new SearchHitDto("kb-1", "Notes", "p-1", "Java Intro", "b-1", "richtext", "Intro", "snippet")),
            true,
            null
        ));
        AiAgentTools tools = new AiAgentTools(searchService, ragIndexService, objectMapper);

        String result = tools.searchKnowledgeBasePages("java", 5);

        assertThat(result).contains("\"pageTitle\":\"Java Intro\"");
        assertThat(result).contains("\"snippet\":\"snippet\"");
    }

    @Test
    void queryKnowledgeBaseRagRequiresKbId() {
        AiAgentTools tools = new AiAgentTools(searchService, ragIndexService, objectMapper);

        String result = tools.queryKnowledgeBaseRag("how to learn java", 5);

        assertThat(result).contains("knowledge base id not provided");
    }

    @Test
    void queryKnowledgeBaseRagUsesExecutionContext() {
        AiAgentExecutionContextHolder.set(new AiAgentExecutionContext("kb-1", "Java", false));
        when(ragIndexService.query(any(RagQueryRequest.class))).thenReturn(new RagQueryResponse(
            "Start with syntax basics.",
            List.of(new RagSourceDto("kb-1", "p-1", "b-1", "Syntax", "content", "richtext", 0.9))
        ));
        AiAgentTools tools = new AiAgentTools(searchService, ragIndexService, objectMapper);

        String result = tools.queryKnowledgeBaseRag("how to learn java", 5);

        assertThat(result).contains("\"answer\":\"Start with syntax basics.\"");
        assertThat(result).contains("\"title\":\"Syntax\"");
    }

    @Test
    void testQueryKnowledgeBaseRag_whenRagUnavailable_fallsBackToKeywordSearch() {
        AiAgentExecutionContextHolder.set(new AiAgentExecutionContext("kb-1", "Java", false));
        when(ragIndexService.query(any(RagQueryRequest.class)))
            .thenThrow(new BusinessException(50300, "rag service unavailable"));
        when(searchService.searchKnowledgeBase("how to learn java", "kb-1", 5)).thenReturn(
            new SearchResponseDto(
                List.of(new SearchHitDto(
                    "kb-1", "Notes", "p-1", "Java Intro", "b-1", "richtext", "Syntax", "keyword snippet"
                )),
                true,
                null
            )
        );
        AiAgentTools tools = new AiAgentTools(searchService, ragIndexService, objectMapper);

        String result = tools.queryKnowledgeBaseRag("how to learn java", 5);

        assertThat(result).contains("\"degraded\":true");
        assertThat(result).contains("\"retrievalMode\":\"keyword\"");
        assertThat(result).contains("\"content\":\"keyword snippet\"");
    }

    @Test
    void testQueryKnowledgeBaseRag_whenAllRetrievalUnavailable_returnsContinuableResult() {
        AiAgentExecutionContextHolder.set(new AiAgentExecutionContext("kb-1", "Java", false));
        when(ragIndexService.query(any(RagQueryRequest.class)))
            .thenThrow(new BusinessException(50300, "rag service unavailable"));
        when(searchService.searchKnowledgeBase("how to learn java", "kb-1", 5))
            .thenThrow(new IllegalStateException("elasticsearch unavailable"));
        AiAgentTools tools = new AiAgentTools(searchService, ragIndexService, objectMapper);

        String result = tools.queryKnowledgeBaseRag("how to learn java", 5);

        assertThat(result).contains("\"degraded\":true");
        assertThat(result).contains("\"retrievalMode\":\"none\"");
        assertThat(result).contains("\"sources\":[]");
    }

    @Test
    void testSearchKnowledgeBasePages_whenSearchUnavailable_returnsContinuableResult() {
        when(searchService.search("java", 5)).thenThrow(new IllegalStateException("elasticsearch unavailable"));
        AiAgentTools tools = new AiAgentTools(searchService, ragIndexService, objectMapper);

        String result = tools.searchKnowledgeBasePages("java", 5);

        assertThat(result).contains("\"degraded\":true");
        assertThat(result).contains("\"retrievalMode\":\"none\"");
        assertThat(result).contains("\"hits\":[]");
    }
}
