package com.tu.backend.knowledgerelation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tu.backend.content.entity.PageContentEntity;
import com.tu.backend.content.repository.PageContentRepository;
import com.tu.backend.contenttree.dto.ContentTreeNodeDto;
import com.tu.backend.contenttree.dto.PageOutlineResponseDto;
import com.tu.backend.contenttree.service.ContentTreeNodeService;
import com.tu.backend.knowledgerelation.dto.GenerateKnowledgePointsRequest;
import com.tu.backend.knowledgerelation.dto.KnowledgeAnchorDto;
import com.tu.backend.knowledgerelation.dto.KnowledgePointDto;
import com.tu.backend.knowledgerelation.dto.KnowledgePointGenerationPreviewDto;
import com.tu.backend.knowledgerelation.dto.KnowledgePointGenerationResultDto;
import com.tu.backend.knowledge.repository.KnowledgeBaseRepository;
import com.tu.backend.page.entity.PageEntity;
import com.tu.backend.page.repository.PageRepository;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class KnowledgePointGenerationServiceTest {

    @Test
    void generatesPageTreeAndSkipsExistingLocator() {
        KnowledgePointGenerationService service = createService(
            pageRepositoryWithPage("p-1", "第一章"),
            emptyContentRepository(),
            knowledgePointServiceForPage("kb-1", "p-1", "kp-1", "第一章"),
            knowledgeBaseExists("kb-1"),
            emptyOutlineService()
        );

        KnowledgePointGenerationResultDto first = service.generate(
            "kb-1",
            new GenerateKnowledgePointsRequest(List.of("pageTree"), null)
        );
        assertThat(first.created()).isEqualTo(1);
        assertThat(first.skipped()).isZero();
        assertThat(first.items()).hasSize(1);
        assertThat(first.items().getFirst().status()).isEqualTo("created");

        KnowledgePointGenerationResultDto second = service.generate(
            "kb-1",
            new GenerateKnowledgePointsRequest(List.of("pageTree"), null)
        );
        assertThat(second.created()).isZero();
        assertThat(second.skipped()).isEqualTo(1);
        assertThat(first.items().getFirst().status()).isEqualTo("created");
    }

    @Test
    void generatesDocumentHeadingsFromRichtextBlocks() {
        PageContentRepository pageContentRepository = org.mockito.Mockito.mock(PageContentRepository.class);
        PageContentEntity content = new PageContentEntity();
        content.setPageId("p-2");
        content.setBlocksJson("""
            [
              {
                "id": "b-1",
                "type": "richtext",
                "document": {
                  "type": "doc",
                  "content": [
                    {
                      "type": "heading",
                      "attrs": { "level": 2, "blockId": "h-1" },
                      "content": [{ "type": "text", "text": "二级标题" }]
                    }
                  ]
                }
              }
            ]
            """);
        when(pageContentRepository.findById("p-2")).thenReturn(Optional.of(content));

        KnowledgePointService knowledgePointService = org.mockito.Mockito.mock(KnowledgePointService.class);
        when(knowledgePointService.findPointsByLocator(eq("kb-1"), eq("page:p-2:heading:h-1"))).thenReturn(List.of());
        when(knowledgePointService.ensurePointForAnchor(eq("kb-1"), any(KnowledgeAnchorDto.class), eq("二级标题"), eq(null)))
            .thenReturn("kp-2");

        KnowledgePointGenerationService service = createService(
            pageRepositoryWithPage("p-2", "文档页"),
            pageContentRepository,
            knowledgePointService,
            knowledgeBaseExists("kb-1"),
            emptyOutlineService()
        );

        KnowledgePointGenerationResultDto result = service.generate(
            "kb-1",
            new GenerateKnowledgePointsRequest(List.of("documentHeadings"), null)
        );

        assertThat(result.created()).isEqualTo(1);
        assertThat(result.items()).hasSize(1);
        assertThat(result.items().getFirst().locator()).isEqualTo("page:p-2:heading:h-1");
        verify(knowledgePointService).ensurePointForAnchor(eq("kb-1"), any(KnowledgeAnchorDto.class), eq("二级标题"), eq(null));
    }

    @Test
    void previewMarksExistingLocatorAsWouldSkip() {
        KnowledgePointService knowledgePointService = org.mockito.Mockito.mock(KnowledgePointService.class);
        when(knowledgePointService.findPointsByLocator("kb-1", "page:p-1")).thenReturn(List.of(pointDto("kp-1", "第一章")));

        KnowledgePointGenerationService service = createService(
            pageRepositoryWithPage("p-1", "第一章"),
            emptyContentRepository(),
            knowledgePointService,
            knowledgeBaseExists("kb-1"),
            emptyOutlineService()
        );

        KnowledgePointGenerationPreviewDto preview = service.preview(
            "kb-1",
            new GenerateKnowledgePointsRequest(List.of("page"), null)
        );

        assertThat(preview.total()).isEqualTo(1);
        assertThat(preview.items().getFirst().status()).isEqualTo("would_skip");
        assertThat(preview.items().getFirst().kind()).isEqualTo("page");
    }

    @Test
    void generatesOnlySelectedLocators() {
        KnowledgePointService knowledgePointService = org.mockito.Mockito.mock(KnowledgePointService.class);
        when(knowledgePointService.findPointsByLocator(eq("kb-1"), eq("page:p-3:heading:h-9"))).thenReturn(List.of());
        when(knowledgePointService.ensurePointForAnchor(eq("kb-1"), any(KnowledgeAnchorDto.class), eq("选中标题"), eq(null)))
            .thenReturn("kp-3");

        PageContentRepository pageContentRepository = org.mockito.Mockito.mock(PageContentRepository.class);
        PageContentEntity content = new PageContentEntity();
        content.setPageId("p-3");
        content.setBlocksJson("""
            [
              {
                "id": "b-1",
                "type": "richtext",
                "document": {
                  "type": "doc",
                  "content": [
                    {
                      "type": "heading",
                      "attrs": { "level": 2, "blockId": "h-9" },
                      "content": [{ "type": "text", "text": "选中标题" }]
                    },
                    {
                      "type": "heading",
                      "attrs": { "level": 2, "blockId": "h-10" },
                      "content": [{ "type": "text", "text": "未选中" }]
                    }
                  ]
                }
              }
            ]
            """);
        when(pageContentRepository.findById("p-3")).thenReturn(Optional.of(content));

        KnowledgePointGenerationService service = createService(
            pageRepositoryWithPage("p-3", "文档页"),
            pageContentRepository,
            knowledgePointService,
            knowledgeBaseExists("kb-1"),
            emptyOutlineService()
        );

        KnowledgePointGenerationResultDto result = service.generate(
            "kb-1",
            new GenerateKnowledgePointsRequest(List.of(), null, List.of("page:p-3:heading:h-9"))
        );

        assertThat(result.created()).isEqualTo(1);
        assertThat(result.items()).hasSize(1);
        assertThat(result.items().getFirst().locator()).isEqualTo("page:p-3:heading:h-9");
    }

    @Test
    void previewIncludesSectionCandidates() {
        ContentTreeNodeService contentTreeNodeService = org.mockito.Mockito.mock(ContentTreeNodeService.class);
        when(contentTreeNodeService.getPageOutline("p-4")).thenReturn(new PageOutlineResponseDto(
            "p-4",
            "kb-1",
            "章节页",
            List.of(new ContentTreeNodeDto(
                "ctn-1",
                "page",
                "p-4",
                null,
                "引言",
                0,
                null,
                BigDecimal.ZERO,
                null,
                null,
                "hs-abc",
                2,
                "local",
                null,
                null
            ))
        ));

        KnowledgePointService knowledgePointService = org.mockito.Mockito.mock(KnowledgePointService.class);
        when(knowledgePointService.findPointsByLocator(eq("kb-1"), eq("page:p-4:section:local:hs-abc"))).thenReturn(List.of());

        KnowledgePointGenerationService service = createService(
            pageRepositoryWithPage("p-4", "章节页"),
            emptyContentRepository(),
            knowledgePointService,
            knowledgeBaseExists("kb-1"),
            contentTreeNodeService
        );

        KnowledgePointGenerationPreviewDto preview = service.preview(
            "kb-1",
            new GenerateKnowledgePointsRequest(List.of("section"), List.of("p-4"))
        );

        assertThat(preview.items()).hasSize(1);
        assertThat(preview.items().getFirst().locator()).isEqualTo("page:p-4:section:local:hs-abc");
        assertThat(preview.items().getFirst().status()).isEqualTo("would_create");
    }

    private static KnowledgePointGenerationService createService(
        PageRepository pageRepository,
        PageContentRepository pageContentRepository,
        KnowledgePointService knowledgePointService,
        KnowledgeBaseRepository knowledgeBaseRepository,
        ContentTreeNodeService contentTreeNodeService
    ) {
        return new KnowledgePointGenerationService(
            pageRepository,
            pageContentRepository,
            knowledgePointService,
            knowledgeBaseRepository,
            contentTreeNodeService,
            new ObjectMapper()
        );
    }

    private static PageRepository pageRepositoryWithPage(String pageId, String title) {
        PageRepository pageRepository = org.mockito.Mockito.mock(PageRepository.class);
        PageEntity page = new PageEntity();
        page.setId(pageId);
        page.setKbId("kb-1");
        page.setTitle(title);
        page.setPageType("document");
        when(pageRepository.findByKbIdOrderBySortOrderAscCreatedAtAsc("kb-1")).thenReturn(List.of(page));
        when(pageRepository.findById(pageId)).thenReturn(Optional.of(page));
        return pageRepository;
    }

    private static PageContentRepository emptyContentRepository() {
        return org.mockito.Mockito.mock(PageContentRepository.class);
    }

    private static KnowledgePointService knowledgePointServiceForPage(
        String kbId,
        String pageId,
        String pointId,
        String title
    ) {
        KnowledgePointService knowledgePointService = org.mockito.Mockito.mock(KnowledgePointService.class);
        when(knowledgePointService.findPointsByLocator(kbId, "page:" + pageId))
            .thenReturn(List.of())
            .thenReturn(List.of(pointDto(pointId, title)));
        when(knowledgePointService.ensurePointForAnchor(eq(kbId), any(KnowledgeAnchorDto.class), eq(title), eq(null)))
            .thenReturn(pointId);
        when(knowledgePointService.getPoint(pointId)).thenReturn(pointDto(pointId, title));
        return knowledgePointService;
    }

    private static KnowledgeBaseRepository knowledgeBaseExists(String kbId) {
        KnowledgeBaseRepository knowledgeBaseRepository = org.mockito.Mockito.mock(KnowledgeBaseRepository.class);
        when(knowledgeBaseRepository.existsById(kbId)).thenReturn(true);
        return knowledgeBaseRepository;
    }

    private static ContentTreeNodeService emptyOutlineService() {
        ContentTreeNodeService contentTreeNodeService = org.mockito.Mockito.mock(ContentTreeNodeService.class);
        when(contentTreeNodeService.getPageOutline(org.mockito.ArgumentMatchers.anyString()))
            .thenReturn(new PageOutlineResponseDto("p", "kb-1", "t", List.of()));
        return contentTreeNodeService;
    }

    private static KnowledgePointDto pointDto(String id, String title) {
        KnowledgePointDto dto = new KnowledgePointDto();
        dto.setId(id);
        dto.setTitle(title);
        return dto;
    }
}
