package com.tu.backend.kbresourcelink.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.tu.backend.common.BusinessException;
import com.tu.backend.externalresource.entity.ResourceItemEntity;
import com.tu.backend.externalresource.entity.ResourceTypeEntity;
import com.tu.backend.externalresource.repository.ResourceItemRepository;
import com.tu.backend.externalresource.repository.ResourceTypeRepository;
import com.tu.backend.kbresourcelink.dto.CreateKbResourceLinkRequest;
import com.tu.backend.kbresourcelink.entity.KbResourceLinkEntity;
import com.tu.backend.kbresourcelink.repository.KbResourceLinkRepository;
import com.tu.backend.knowledge.repository.KnowledgeBaseRepository;
import com.tu.backend.page.entity.PageEntity;
import com.tu.backend.page.repository.PageRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class KbResourceLinkServiceTest {

    @Test
    void createsLinkForDocumentResource() {
        TestContext context = new TestContext();
        when(context.kbRepository.existsById("kb-1")).thenReturn(true);
        when(context.linkRepository.findByKbIdAndResourceItemId("kb-1", "ri-doc")).thenReturn(Optional.empty());
        when(context.linkRepository.findByKbIdOrderBySortOrderAscCreatedAtAsc("kb-1")).thenReturn(List.of());
        when(context.itemRepository.findById("ri-doc")).thenReturn(Optional.of(item("ri-doc", "rt-doc", "示例文档")));
        when(context.typeRepository.findById("rt-doc")).thenReturn(Optional.of(type("rt-doc", "document", "文档")));
        when(context.linkRepository.save(any(KbResourceLinkEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var dto = context.service.create("kb-1", new CreateKbResourceLinkRequest("ri-doc"));

        assertThat(dto.kbId()).isEqualTo("kb-1");
        assertThat(dto.resourceItemId()).isEqualTo("ri-doc");
        assertThat(dto.parentPageId()).isNull();
        assertThat(dto.title()).isEqualTo("示例文档");
        assertThat(dto.typeCode()).isEqualTo("document");
        assertThat(dto.sortOrder()).isZero();
    }

    @Test
    void createsLinkNestedUnderPage() {
        TestContext context = new TestContext();
        when(context.kbRepository.existsById("kb-1")).thenReturn(true);
        when(context.linkRepository.findByKbIdAndResourceItemId("kb-1", "ri-doc")).thenReturn(Optional.empty());
        when(context.linkRepository.findByKbIdOrderBySortOrderAscCreatedAtAsc("kb-1")).thenReturn(List.of());
        when(context.itemRepository.findById("ri-doc")).thenReturn(Optional.of(item("ri-doc", "rt-doc", "示例文档")));
        when(context.typeRepository.findById("rt-doc")).thenReturn(Optional.of(type("rt-doc", "document", "文档")));
        PageEntity page = new PageEntity();
        page.setId("p-1");
        page.setKbId("kb-1");
        when(context.pageRepository.findById("p-1")).thenReturn(Optional.of(page));
        when(context.linkRepository.save(any(KbResourceLinkEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var dto = context.service.create("kb-1", new CreateKbResourceLinkRequest("ri-doc", "p-1"));

        assertThat(dto.parentPageId()).isEqualTo("p-1");
    }

    @Test
    void updatesParentPageWhenLinkAlreadyExists() {
        TestContext context = new TestContext();
        when(context.kbRepository.existsById("kb-1")).thenReturn(true);
        when(context.itemRepository.findById("ri-doc")).thenReturn(Optional.of(item("ri-doc", "rt-doc", "示例文档")));
        when(context.typeRepository.findById("rt-doc")).thenReturn(Optional.of(type("rt-doc", "document", "文档")));
        PageEntity page = new PageEntity();
        page.setId("p-2");
        page.setKbId("kb-1");
        when(context.pageRepository.findById("p-2")).thenReturn(Optional.of(page));
        KbResourceLinkEntity existing = new KbResourceLinkEntity();
        existing.setId("krl-1");
        existing.setKbId("kb-1");
        existing.setResourceItemId("ri-doc");
        existing.setParentPageId(null);
        existing.setSortOrder(0);
        when(context.linkRepository.findByKbIdAndResourceItemId("kb-1", "ri-doc")).thenReturn(Optional.of(existing));
        when(context.linkRepository.save(any(KbResourceLinkEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var dto = context.service.create("kb-1", new CreateKbResourceLinkRequest("ri-doc", "p-2"));

        assertThat(dto.parentPageId()).isEqualTo("p-2");
        assertThat(existing.getParentPageId()).isEqualTo("p-2");
    }

    @Test
    void rejectsNonDocumentResource() {
        TestContext context = new TestContext();
        when(context.kbRepository.existsById("kb-1")).thenReturn(true);
        when(context.linkRepository.findByKbIdAndResourceItemId("kb-1", "ri-book")).thenReturn(Optional.empty());
        when(context.itemRepository.findById("ri-book")).thenReturn(Optional.of(item("ri-book", "rt-book", "图书")));
        when(context.typeRepository.findById("rt-book")).thenReturn(Optional.of(type("rt-book", "book", "图书")));

        assertThatThrownBy(() -> context.service.create("kb-1", new CreateKbResourceLinkRequest("ri-book")))
            .isInstanceOf(BusinessException.class)
            .hasMessageContaining("only document resources");
    }

    @Test
    void deletesExistingLink() {
        TestContext context = new TestContext();
        when(context.kbRepository.existsById("kb-1")).thenReturn(true);
        KbResourceLinkEntity existing = new KbResourceLinkEntity();
        existing.setId("krl-1");
        existing.setKbId("kb-1");
        existing.setResourceItemId("ri-doc");
        when(context.linkRepository.findByKbIdAndResourceItemId("kb-1", "ri-doc")).thenReturn(Optional.of(existing));

        context.service.delete("kb-1", "ri-doc");
        verify(context.linkRepository).delete(existing);
    }

    private static ResourceItemEntity item(String id, String typeId, String title) {
        ResourceItemEntity entity = new ResourceItemEntity();
        entity.setId(id);
        entity.setTypeId(typeId);
        entity.setTitle(title);
        return entity;
    }

    private static ResourceTypeEntity type(String id, String code, String name) {
        ResourceTypeEntity entity = new ResourceTypeEntity();
        entity.setId(id);
        entity.setCode(code);
        entity.setName(name);
        return entity;
    }

    private static final class TestContext {
        final KbResourceLinkRepository linkRepository = mock(KbResourceLinkRepository.class);
        final KnowledgeBaseRepository kbRepository = mock(KnowledgeBaseRepository.class);
        final PageRepository pageRepository = mock(PageRepository.class);
        final ResourceItemRepository itemRepository = mock(ResourceItemRepository.class);
        final ResourceTypeRepository typeRepository = mock(ResourceTypeRepository.class);
        final KbResourceLinkService service = new KbResourceLinkService(
            linkRepository,
            kbRepository,
            pageRepository,
            itemRepository,
            typeRepository
        );
    }
}
