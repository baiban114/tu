package com.tu.backend.tag.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tu.backend.common.PageResponse;
import com.tu.backend.content.entity.PageContentEntity;
import com.tu.backend.content.repository.PageContentRepository;
import com.tu.backend.page.entity.PageEntity;
import com.tu.backend.page.repository.PageRepository;
import com.tu.backend.tag.dto.TagPoolItemDto;
import com.tu.backend.tag.dto.TaggedContentItemDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.lang.reflect.Field;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TaggedContentServiceTest {

    @Mock
    private PageRepository pageRepository;
    @Mock
    private PageContentRepository pageContentRepository;

    private TaggedContentService service;

    @BeforeEach
    void setUp() {
        service = new TaggedContentService(pageRepository, pageContentRepository, new ObjectMapper());
    }

    private String v2PageJson(String document, String metadata) {
        return "[{\"id\":\"page-content\",\"type\":\"richtext\",\"content\":\"\","
            + "\"document\":" + document + ",\"metadata\":" + metadata + "}]";
    }

    private PageEntity page(String id, String kbId, String title) {
        PageEntity page = new PageEntity();
        page.setId(id);
        page.setKbId(kbId);
        page.setTitle(title);
        return page;
    }

    private PageContentEntity contentEntity(String pageId, String blocksJson, LocalDateTime updatedAt) throws Exception {
        PageContentEntity entity = new PageContentEntity();
        setField(entity, "pageId", pageId);
        setField(entity, "blocksJson", blocksJson);
        setField(entity, "createdAt", updatedAt);
        setField(entity, "updatedAt", updatedAt);
        return entity;
    }

    private static void setField(Object target, String name, Object value) throws Exception {
        Field field = PageContentEntity.class.getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }

    private static final String DOCUMENT = "{\"type\":\"doc\",\"content\":["
        + "{\"type\":\"heading\",\"attrs\":{\"blockId\":\"b2\",\"level\":2},\"content\":[{\"type\":\"text\",\"text\":\"核心概念\"}]},"
        + "{\"type\":\"paragraph\",\"attrs\":{\"blockId\":\"b3\",\"metadata\":{\"tags\":[{\"id\":\"t1\",\"label\":\"重点\",\"color\":\"#f00\"}]}},\"content\":[{\"type\":\"text\",\"text\":\"重点段落内容\"}]},"
        + "{\"type\":\"x6Block\",\"attrs\":{\"blockId\":\"b4\",\"title\":\"流程图\",\"metadata\":{\"tags\":[{\"id\":\"t2\",\"label\":\"画板\"}]},\"graphData\":{\"nodes\":[]}}}]}";

    private static final String METADATA = "{\"tags\":[{\"id\":\"pt\",\"label\":\"页面标签\"}],"
        + "\"sectionTags\":{\"local:b2\":[{\"id\":\"st\",\"label\":\"重点\",\"color\":\"#00f\"}]},"
        + "\"textTagSpans\":[{\"id\":\"span1\",\"blockId\":\"b3\","
        + "\"selectedText\":\"重点段落内容\",\"tags\":[{\"id\":\"ts\",\"label\":\"划词\"}]}]}";

    @Test
    void listKbTagsAggregatesAndDeduplicatesAllScopes() throws Exception {
        PageEntity page = page("p1", "kb1", "页面A");
        when(pageRepository.findByKbIdOrderBySortOrderAscCreatedAtAsc("kb1")).thenReturn(List.of(page));
        when(pageContentRepository.findById("p1")).thenReturn(
            Optional.of(contentEntity("p1", v2PageJson(DOCUMENT, METADATA), LocalDateTime.now()))
        );

        List<TagPoolItemDto> pool = service.listKbTags("kb1");

        assertThat(pool).extracting(TagPoolItemDto::label)
            .containsExactlyInAnyOrder("重点", "画板", "页面标签", "划词");
    }

    @Test
    void listTaggedContentMatchesSectionsAndBlocksByLabel() throws Exception {
        PageEntity page = page("p1", "kb1", "页面A");
        when(pageRepository.findByKbIdOrderBySortOrderAscCreatedAtAsc("kb1")).thenReturn(List.of(page));
        when(pageContentRepository.findById("p1")).thenReturn(
            Optional.of(contentEntity("p1", v2PageJson(DOCUMENT, METADATA), LocalDateTime.of(2026, 2, 1, 0, 0)))
        );

        PageResponse<TaggedContentItemDto> response = service.listTaggedContent("kb1", "重点", 0, 10);

        assertThat(response.total()).isEqualTo(2);
        assertThat(response.items()).extracting(TaggedContentItemDto::scope)
            .containsExactlyInAnyOrder("section", "block");

        TaggedContentItemDto section = response.items().stream()
            .filter(item -> "section".equals(item.scope())).findFirst().orElseThrow();
        assertThat(section.pageTitle()).isEqualTo("页面A");
        assertThat(section.sectionKey()).isEqualTo("local:b2");
        assertThat(section.blockId()).isEqualTo("b2");
        assertThat(section.title()).isEqualTo("核心概念");
        assertThat(section.matchedTags()).extracting(TagPoolItemDto::label).containsExactly("重点");

        TaggedContentItemDto block = response.items().stream()
            .filter(item -> "block".equals(item.scope())).findFirst().orElseThrow();
        assertThat(block.blockId()).isEqualTo("b3");
        assertThat(block.snippet()).contains("重点段落内容");
    }

    @Test
    void testListTaggedContent_whenTextSpanMatches_returnsTextHit() throws Exception {
        PageEntity page = page("p1", "kb1", "页面A");
        when(pageRepository.findByKbIdOrderBySortOrderAscCreatedAtAsc("kb1")).thenReturn(List.of(page));
        when(pageContentRepository.findById("p1")).thenReturn(
            Optional.of(contentEntity("p1", v2PageJson(DOCUMENT, METADATA), LocalDateTime.of(2026, 2, 1, 0, 0)))
        );

        PageResponse<TaggedContentItemDto> response = service.listTaggedContent("kb1", "划词", 0, 10);

        assertThat(response.total()).isEqualTo(1);
        TaggedContentItemDto textHit = response.items().get(0);
        assertThat(textHit.scope()).isEqualTo("text");
        assertThat(textHit.blockId()).isEqualTo("b3");
        assertThat(textHit.title()).isEqualTo("重点段落内容");
        assertThat(textHit.snippet()).isEqualTo("重点段落内容");
        assertThat(textHit.matchedTags()).extracting(TagPoolItemDto::label).containsExactly("划词");
    }

    @Test
    void listTaggedContentIsEmptyWhenNoTagMatches() throws Exception {
        PageEntity page = page("p1", "kb1", "页面A");
        when(pageRepository.findByKbIdOrderBySortOrderAscCreatedAtAsc("kb1")).thenReturn(List.of(page));
        when(pageContentRepository.findById("p1")).thenReturn(
            Optional.of(contentEntity("p1", v2PageJson(DOCUMENT, METADATA), LocalDateTime.now()))
        );

        PageResponse<TaggedContentItemDto> response = service.listTaggedContent("kb1", "不存在的标签", 0, 10);

        assertThat(response.total()).isZero();
        assertThat(response.items()).isEmpty();
    }

    @Test
    void listTaggedContentMatchesV1BlocksAndSortsByUpdatedAtDesc() throws Exception {
        String v1Json = "["
            + "{\"id\":\"page-content\",\"type\":\"richtext\",\"content\":\"# 旧页面\",\"metadata\":{\"sectionTags\":{\"local:old-b1\":[{\"id\":\"st1\",\"label\":\"章节\"}]}}},"
            + "{\"id\":\"b-x\",\"type\":\"x6\",\"title\":\"旧画板\",\"metadata\":{\"tags\":[{\"id\":\"bt1\",\"label\":\"画板\"}]}}"
            + "]";

        PageEntity newer = page("p2", "kb1", "新页面");
        PageEntity older = page("p1", "kb1", "旧页面");
        when(pageRepository.findByKbIdOrderBySortOrderAscCreatedAtAsc("kb1")).thenReturn(List.of(newer, older));
        when(pageContentRepository.findById(eq("p2"))).thenReturn(
            Optional.of(contentEntity("p2", v2PageJson(DOCUMENT, METADATA), LocalDateTime.of(2026, 3, 1, 0, 0)))
        );
        when(pageContentRepository.findById(eq("p1"))).thenReturn(
            Optional.of(contentEntity("p1", v1Json, LocalDateTime.of(2026, 1, 1, 0, 0)))
        );

        PageResponse<TaggedContentItemDto> response = service.listTaggedContent("kb1", "画板", 0, 10);

        assertThat(response.items()).hasSize(2);
        assertThat(response.items().get(0).pageId()).isEqualTo("p2");
        assertThat(response.items().get(1).pageId()).isEqualTo("p1");

        TaggedContentItemDto v1Block = response.items().get(1);
        assertThat(v1Block.scope()).isEqualTo("block");
        assertThat(v1Block.blockId()).isEqualTo("b-x");
        assertThat(v1Block.title()).isEqualTo("旧画板");
    }

    @Test
    void listTaggedContentPaginates() throws Exception {
        PageEntity page = page("p1", "kb1", "页面A");
        when(pageRepository.findByKbIdOrderBySortOrderAscCreatedAtAsc("kb1")).thenReturn(List.of(page));
        when(pageContentRepository.findById("p1")).thenReturn(
            Optional.of(contentEntity("p1", v2PageJson(DOCUMENT, METADATA), LocalDateTime.of(2026, 2, 1, 0, 0)))
        );

        PageResponse<TaggedContentItemDto> firstPage = service.listTaggedContent("kb1", "重点", 0, 1);
        assertThat(firstPage.total()).isEqualTo(2);
        assertThat(firstPage.items()).hasSize(1);

        PageResponse<TaggedContentItemDto> secondPage = service.listTaggedContent("kb1", "重点", 1, 1);
        assertThat(secondPage.items()).hasSize(1);
    }
}
