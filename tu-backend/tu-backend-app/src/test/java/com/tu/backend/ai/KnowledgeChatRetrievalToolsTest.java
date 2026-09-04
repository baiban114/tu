package com.tu.backend.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tu.backend.rag.RagIndexService;
import com.tu.backend.rag.dto.RagQueryRequest;
import com.tu.backend.rag.dto.RagQueryResponse;
import com.tu.backend.rag.dto.RagSourceDto;
import com.tu.backend.search.SearchService;
import java.util.List;
import org.junit.jupiter.api.Test;

class KnowledgeChatRetrievalToolsTest {

    @Test
    void testQueryCurrentKnowledgeBase_whenSourcesOverlap_keepsStableCitationNumbers() {
        RagIndexService ragIndexService = mock(RagIndexService.class);
        SearchService searchService = mock(SearchService.class);
        RagSourceDto initialSource = new RagSourceDto(
            "kb-1", "page-1", "block-1", "初始资料", "初始内容", "richtext", 0.9
        );
        RagSourceDto additionalSource = new RagSourceDto(
            "kb-1", "page-2", "block-2", "补充资料", "补充内容", "richtext", 0.8
        );
        when(ragIndexService.query(any(RagQueryRequest.class))).thenReturn(
            new RagQueryResponse("", List.of(initialSource, additionalSource))
        );
        KnowledgeChatRetrievalTools tools = new KnowledgeChatRetrievalTools(
            "kb-1",
            ragIndexService,
            searchService,
            new ObjectMapper(),
            List.of(initialSource)
        );

        String result = tools.queryCurrentKnowledgeBase("分层超时配置");

        assertThat(result).contains("[来源1]", "[来源2]", "补充资料");
        assertThat(tools.sources()).containsExactly(initialSource, additionalSource);
        verify(ragIndexService).query(new RagQueryRequest("kb-1", "分层超时配置", 6));
    }
}
