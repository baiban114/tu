package com.tu.backend.rag;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tu.backend.content.entity.PageContentEntity;
import com.tu.backend.content.repository.PageContentRepository;
import com.tu.backend.knowledge.repository.KnowledgeBaseRepository;
import com.tu.backend.page.entity.PageEntity;
import com.tu.backend.page.repository.PageRepository;
import com.tu.backend.rag.dto.RagDeleteRequest;
import com.tu.backend.rag.dto.RagIndexRequest;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class RagIndexServiceTest {

    @Mock
    private PageRepository pageRepository;

    @Mock
    private PageContentRepository pageContentRepository;

    @Mock
    private KnowledgeBaseRepository knowledgeBaseRepository;

    @Mock
    private RagDocumentExtractor documentExtractor;

    @Mock
    private RagStore ragStore;

    private RagIndexService ragIndexService;

    @BeforeEach
    void setUp() {
        ragIndexService = new RagIndexService(
            pageRepository,
            pageContentRepository,
            knowledgeBaseRepository,
            new ObjectMapper(),
            documentExtractor,
            ragStore
        );
    }

    @Test
    void testIndexPage_whenPageIsX6Board_deletesExistingVectorsAndSkipsExtraction() {
        PageEntity page = page("page-1", "kb-1", "x6board");
        when(pageRepository.findById("page-1")).thenReturn(Optional.of(page));

        ragIndexService.indexPage("page-1");

        verify(ragStore).delete(new RagDeleteRequest("kb-1", "page-1", null));
        verify(ragStore, never()).index(any(RagIndexRequest.class));
        verifyNoInteractions(pageContentRepository, documentExtractor);
    }

    @Test
    void testIndexPage_whenPageIsDocument_indexesExtractedContent() {
        PageEntity page = page("page-1", "kb-1", "document");
        PageContentEntity content = new PageContentEntity();
        content.setPageId("page-1");
        content.setBlocksJson("[]");
        when(pageRepository.findById("page-1")).thenReturn(Optional.of(page));
        when(pageContentRepository.findById("page-1")).thenReturn(Optional.of(content));
        when(documentExtractor.extract("kb-1", "page-1", "Page", new ObjectMapper().createArrayNode(), null))
            .thenReturn(java.util.List.of());

        ragIndexService.indexPage("page-1");

        verify(ragStore).index(new RagIndexRequest("kb-1", "page-1", java.util.List.of()));
        verify(ragStore, never()).delete(any(RagDeleteRequest.class));
    }

    private PageEntity page(String pageId, String kbId, String pageType) {
        PageEntity page = new PageEntity();
        page.setId(pageId);
        page.setKbId(kbId);
        page.setTitle("Page");
        page.setPageType(pageType);
        return page;
    }
}
