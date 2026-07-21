package com.tu.backend.comment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.tu.backend.comment.dto.ContentCommentDto;
import com.tu.backend.comment.dto.CreateContentCommentRequest;
import com.tu.backend.comment.entity.ContentCommentEntity;
import com.tu.backend.comment.repository.ContentCommentRepository;
import com.tu.backend.common.BusinessException;
import com.tu.backend.common.PageResponse;
import com.tu.backend.page.repository.PageRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.context.SecurityContextHolder;

class ContentCommentServiceTest {

    private ContentCommentRepository commentRepository;
    private PageRepository pageRepository;
    private ContentCommentService service;

    @BeforeEach
    void setUp() {
        commentRepository = mock(ContentCommentRepository.class);
        pageRepository = mock(PageRepository.class);
        service = new ContentCommentService(commentRepository, pageRepository);
        SecurityContextHolder.clearContext();
        when(pageRepository.existsById("page-1")).thenReturn(true);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void createsPageLevelComment() {
        when(commentRepository.save(any(ContentCommentEntity.class)))
            .thenAnswer(invocation -> {
                ContentCommentEntity entity = invocation.getArgument(0);
                entity.setCreatedAt(LocalDateTime.of(2026, 1, 1, 12, 0));
                entity.setUpdatedAt(entity.getCreatedAt());
                return entity;
            });
        when(commentRepository.countByParentId(any())).thenReturn(0L);

        ContentCommentDto dto = service.create(
            "page-1",
            new CreateContentCommentRequest(null, null, "hello page")
        );

        assertThat(dto.body()).isEqualTo("hello page");
        assertThat(dto.pageId()).isEqualTo("page-1");
        assertThat(dto.annotationId()).isNull();
        assertThat(dto.parentId()).isNull();
        assertThat(dto.authorUserId()).isEqualTo("anonymous");
        assertThat(dto.authorDisplayName()).isEqualTo("匿名用户");
        assertThat(dto.replyCount()).isZero();
    }

    @Test
    void createsAnnotationScopedReplyUnderMatchingParent() {
        ContentCommentEntity parent = root("c-root", "page-1", "ann-1");
        when(commentRepository.findById("c-root")).thenReturn(Optional.of(parent));
        when(commentRepository.save(any(ContentCommentEntity.class)))
            .thenAnswer(invocation -> invocation.getArgument(0));
        when(commentRepository.countByParentId(any())).thenReturn(0L);

        ContentCommentDto dto = service.create(
            "page-1",
            new CreateContentCommentRequest("ann-1", "c-root", "reply body")
        );

        ArgumentCaptor<ContentCommentEntity> captor = ArgumentCaptor.forClass(ContentCommentEntity.class);
        verify(commentRepository).save(captor.capture());
        assertThat(captor.getValue().getParentId()).isEqualTo("c-root");
        assertThat(captor.getValue().getAnnotationId()).isEqualTo("ann-1");
        assertThat(dto.parentId()).isEqualTo("c-root");
    }

    @Test
    void rejectsReplyWhenAnnotationScopeMismatches() {
        ContentCommentEntity parent = root("c-root", "page-1", null);
        when(commentRepository.findById("c-root")).thenReturn(Optional.of(parent));

        assertThatThrownBy(() -> service.create(
            "page-1",
            new CreateContentCommentRequest("ann-1", "c-root", "bad")
        ))
            .isInstanceOf(BusinessException.class)
            .hasMessageContaining("annotation scope mismatch");
    }

    @Test
    void listsRootCommentsFilteredByAnnotation() {
        ContentCommentEntity noteRoot = root("c-1", "page-1", "ann-1");
        when(commentRepository.findRootComments(eq("page-1"), eq("ann-1"), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(noteRoot)));
        when(commentRepository.countByParentId("c-1")).thenReturn(2L);

        PageResponse<ContentCommentDto> result = service.listRootComments("page-1", "ann-1", 0, 10);

        assertThat(result.items()).hasSize(1);
        assertThat(result.items().getFirst().id()).isEqualTo("c-1");
        assertThat(result.items().getFirst().replyCount()).isEqualTo(2L);
        assertThat(result.total()).isEqualTo(1);
    }

    @Test
    void deletesCommentSubtreeForAuthor() {
        ContentCommentEntity root = root("c-root", "page-1", null);
        root.setAuthorUserId("anonymous");
        ContentCommentEntity child = reply("c-child", "page-1", null, "c-root");
        ContentCommentEntity grand = reply("c-grand", "page-1", null, "c-child");
        when(commentRepository.findById("c-root")).thenReturn(Optional.of(root));
        when(commentRepository.findByParentId("c-root")).thenReturn(List.of(child));
        when(commentRepository.findByParentId("c-child")).thenReturn(List.of(grand));
        when(commentRepository.findByParentId("c-grand")).thenReturn(List.of());

        service.delete("page-1", "c-root");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Iterable<String>> idsCaptor = ArgumentCaptor.forClass(Iterable.class);
        verify(commentRepository).deleteAllById(idsCaptor.capture());
        assertThat(idsCaptor.getValue()).containsExactlyInAnyOrder("c-root", "c-child", "c-grand");
    }

    @Test
    void rejectsDeleteByNonAuthor() {
        ContentCommentEntity root = root("c-root", "page-1", null);
        root.setAuthorUserId("other-user");
        when(commentRepository.findById("c-root")).thenReturn(Optional.of(root));

        assertThatThrownBy(() -> service.delete("page-1", "c-root"))
            .isInstanceOf(BusinessException.class)
            .hasMessageContaining("only the author");
    }

    @Test
    void rejectsMissingPage() {
        when(pageRepository.existsById("missing")).thenReturn(false);
        assertThatThrownBy(() -> service.listRootComments("missing", null, 0, 10))
            .isInstanceOf(BusinessException.class)
            .hasMessageContaining("page not found");
    }

    private static ContentCommentEntity root(String id, String pageId, String annotationId) {
        ContentCommentEntity entity = new ContentCommentEntity();
        entity.setId(id);
        entity.setPageId(pageId);
        entity.setAnnotationId(annotationId);
        entity.setParentId(null);
        entity.setAuthorUserId("anonymous");
        entity.setAuthorDisplayName("匿名用户");
        entity.setBody("body-" + id);
        entity.setCreatedAt(LocalDateTime.of(2026, 1, 1, 12, 0));
        entity.setUpdatedAt(entity.getCreatedAt());
        return entity;
    }

    private static ContentCommentEntity reply(
        String id,
        String pageId,
        String annotationId,
        String parentId
    ) {
        ContentCommentEntity entity = root(id, pageId, annotationId);
        entity.setParentId(parentId);
        return entity;
    }
}
