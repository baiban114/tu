package com.tu.backend.externalresource.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
import java.util.Optional;
import org.junit.jupiter.api.Test;

class ResourceCrawledDocumentServiceTest {

    @Test
    void crawlStoresMarkdownForWebLinkItem() {
        TestContext context = new TestContext();
        context.stubWebLinkItem();
        when(context.crawlClient.fetch("https://example.com/article")).thenReturn(new CrawlFetchResult(
            200, "https://example.com/article", "示例文章", "# 示例文章\n\n正文。", 12, false, "2025-01-01T00:00:00"));
        when(context.documentRepository.findByResourceItemId("ri-link")).thenReturn(Optional.empty());
        when(context.documentRepository.save(any(ResourceCrawledDocumentEntity.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));

        ResourceCrawledDocumentDto dto = context.service.crawl("ri-link");

        assertThat(dto.id()).startsWith("rcd-");
        assertThat(dto.resourceItemId()).isEqualTo("ri-link");
        assertThat(dto.sourceUrl()).isEqualTo("https://example.com/article");
        assertThat(dto.title()).isEqualTo("示例文章");
        assertThat(dto.content()).contains("正文");
        verify(context.documentRepository).save(any(ResourceCrawledDocumentEntity.class));
    }

    @Test
    void crawlRejectsNonWebLinkItem() {
        TestContext context = new TestContext();
        ResourceTypeEntity bookType = type("rt-book", "book");
        ResourceItemEntity bookItem = item("ri-book", "rt-book", "978-7-111-40701-0");
        when(context.itemRepository.findById("ri-book")).thenReturn(Optional.of(bookItem));
        when(context.typeRepository.findById("rt-book")).thenReturn(Optional.of(bookType));

        assertThatThrownBy(() -> context.service.crawl("ri-book"))
            .isInstanceOf(BusinessException.class)
            .hasMessageContaining("require a web-link resource or a valid http(s) url");
    }

    @Test
    void crawlAcceptsNonWebLinkItemWithHttpUrlIdentity() {
        TestContext context = new TestContext();
        ResourceTypeEntity documentType = type("rt-document", "document");
        ResourceItemEntity documentItem = item("ri-doc", "rt-document", null);
        documentItem.setIdentityValue("https://dev.mysql.com/doc/");
        when(context.itemRepository.findById("ri-doc")).thenReturn(Optional.of(documentItem));
        when(context.typeRepository.findById("rt-document")).thenReturn(Optional.of(documentType));
        when(context.crawlClient.fetch("https://dev.mysql.com/doc/")).thenReturn(new CrawlFetchResult(
            200, "https://dev.mysql.com/doc/", "MySQL 文档", "# MySQL\n\n正文。", 10, false, "2025-01-01T00:00:00"));
        when(context.documentRepository.findByResourceItemId("ri-doc")).thenReturn(Optional.empty());
        when(context.documentRepository.save(any(ResourceCrawledDocumentEntity.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));

        ResourceCrawledDocumentDto dto = context.service.crawl("ri-doc");

        assertThat(dto.sourceUrl()).isEqualTo("https://dev.mysql.com/doc/");
        assertThat(dto.content()).contains("正文");
    }

    @Test
    void getReturnsNullWhenNotCrawled() {
        TestContext context = new TestContext();
        context.stubWebLinkItem();
        when(context.documentRepository.findByResourceItemId("ri-link")).thenReturn(Optional.empty());

        assertThat(context.service.get("ri-link")).isNull();
    }

    private static ResourceTypeEntity type(String id, String code) {
        ResourceTypeEntity entity = new ResourceTypeEntity();
        entity.setId(id);
        entity.setCode(code);
        entity.setName(code);
        return entity;
    }

    private static ResourceItemEntity item(String id, String typeId, String sourceUrl) {
        ResourceItemEntity entity = new ResourceItemEntity();
        entity.setId(id);
        entity.setTypeId(typeId);
        entity.setTitle("示例链接");
        entity.setSourceUrl(sourceUrl);
        return entity;
    }

    private static final class TestContext {
        final ResourceItemRepository itemRepository = mock(ResourceItemRepository.class);
        final ResourceTypeRepository typeRepository = mock(ResourceTypeRepository.class);
        final ResourceCrawledDocumentRepository documentRepository = mock(ResourceCrawledDocumentRepository.class);
        final CrawlClient crawlClient = mock(CrawlClient.class);
        final ResourceCrawledDocumentService service = new ResourceCrawledDocumentService(
            itemRepository,
            typeRepository,
            documentRepository,
            crawlClient
        );

        void stubWebLinkItem() {
            ResourceTypeEntity type = type("rt-link", "web-link");
            ResourceItemEntity item = item("ri-link", "rt-link", "https://example.com/article");
            when(itemRepository.findById("ri-link")).thenReturn(Optional.of(item));
            when(typeRepository.findById("rt-link")).thenReturn(Optional.of(type));
        }
    }
}
