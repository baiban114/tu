package com.tu.backend.comment.service;

import com.tu.backend.auth.entity.UserEntity;
import com.tu.backend.auth.security.AppUserDetails;
import com.tu.backend.comment.dto.ContentCommentDto;
import com.tu.backend.comment.dto.CreateContentCommentRequest;
import com.tu.backend.comment.entity.ContentCommentEntity;
import com.tu.backend.comment.repository.ContentCommentRepository;
import com.tu.backend.common.BusinessException;
import com.tu.backend.common.PageResponse;
import com.tu.backend.page.repository.PageRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
public class ContentCommentService {

    private static final String ANONYMOUS_USER_ID = "anonymous";
    private static final String ANONYMOUS_DISPLAY_NAME = "匿名用户";

    private final ContentCommentRepository commentRepository;
    private final PageRepository pageRepository;

    public ContentCommentService(
        ContentCommentRepository commentRepository,
        PageRepository pageRepository
    ) {
        this.commentRepository = commentRepository;
        this.pageRepository = pageRepository;
    }

    @Transactional(readOnly = true)
    public PageResponse<ContentCommentDto> listRootComments(
        String pageId,
        String annotationId,
        int page,
        int pageSize
    ) {
        requirePage(pageId);
        String scopeAnnotationId = normalizeBlank(annotationId);
        int safePage = Math.max(0, page);
        int safePageSize = Math.max(1, Math.min(pageSize, 200));
        Page<ContentCommentEntity> entityPage = commentRepository.findRootComments(
            pageId,
            scopeAnnotationId,
            PageRequest.of(safePage, safePageSize, Sort.by(Sort.Direction.DESC, "createdAt"))
        );
        List<ContentCommentDto> items = entityPage.getContent().stream()
            .map(this::toDto)
            .toList();
        return PageResponse.of(items, entityPage.getTotalElements(), safePage, safePageSize);
    }

    @Transactional(readOnly = true)
    public PageResponse<ContentCommentDto> listReplies(
        String pageId,
        String commentId,
        int page,
        int pageSize
    ) {
        requirePage(pageId);
        ContentCommentEntity parent = commentRepository.findById(commentId)
            .orElseThrow(() -> new BusinessException(40001, "comment not found"));
        if (!Objects.equals(parent.getPageId(), pageId)) {
            throw new BusinessException(40000, "comment does not belong to this page");
        }
        int safePage = Math.max(0, page);
        int safePageSize = Math.max(1, Math.min(pageSize, 200));
        Page<ContentCommentEntity> entityPage = commentRepository.findByParentIdOrderByCreatedAtAsc(
            commentId,
            PageRequest.of(safePage, safePageSize)
        );
        List<ContentCommentDto> items = entityPage.getContent().stream()
            .map(this::toDto)
            .toList();
        return PageResponse.of(items, entityPage.getTotalElements(), safePage, safePageSize);
    }

    @Transactional
    public ContentCommentDto create(String pageId, CreateContentCommentRequest request) {
        requirePage(pageId);
        String body = request.body() == null ? "" : request.body().trim();
        if (!StringUtils.hasText(body)) {
            throw new BusinessException(40000, "body is required");
        }
        String annotationId = normalizeBlank(request.annotationId());
        String parentId = normalizeBlank(request.parentId());

        if (parentId != null) {
            ContentCommentEntity parent = commentRepository.findById(parentId)
                .orElseThrow(() -> new BusinessException(40001, "parent comment not found"));
            if (!Objects.equals(parent.getPageId(), pageId)) {
                throw new BusinessException(40000, "parent comment does not belong to this page");
            }
            if (!Objects.equals(normalizeBlank(parent.getAnnotationId()), annotationId)) {
                throw new BusinessException(40000, "parent comment annotation scope mismatch");
            }
        }

        AuthorInfo author = resolveAuthor();
        ContentCommentEntity entity = new ContentCommentEntity();
        entity.setId(UUID.randomUUID().toString().replace("-", ""));
        entity.setPageId(pageId);
        entity.setAnnotationId(annotationId);
        entity.setParentId(parentId);
        entity.setAuthorUserId(author.userId());
        entity.setAuthorDisplayName(author.displayName());
        entity.setBody(body);
        ContentCommentEntity saved = commentRepository.save(entity);
        return toDto(saved);
    }

    @Transactional
    public void delete(String pageId, String commentId) {
        requirePage(pageId);
        ContentCommentEntity entity = commentRepository.findById(commentId)
            .orElseThrow(() -> new BusinessException(40001, "comment not found"));
        if (!Objects.equals(entity.getPageId(), pageId)) {
            throw new BusinessException(40000, "comment does not belong to this page");
        }
        AuthorInfo author = resolveAuthor();
        if (!Objects.equals(entity.getAuthorUserId(), author.userId())) {
            throw new BusinessException(40003, "only the author can delete this comment");
        }
        List<String> toDelete = collectSubtreeIds(commentId);
        commentRepository.deleteAllById(toDelete);
    }

    private List<String> collectSubtreeIds(String rootId) {
        List<String> ids = new ArrayList<>();
        ArrayDeque<String> queue = new ArrayDeque<>();
        queue.add(rootId);
        while (!queue.isEmpty()) {
            String id = queue.removeFirst();
            ids.add(id);
            for (ContentCommentEntity child : commentRepository.findByParentId(id)) {
                queue.add(child.getId());
            }
        }
        return ids;
    }

    private void requirePage(String pageId) {
        if (!StringUtils.hasText(pageId)) {
            throw new BusinessException(40000, "pageId is required");
        }
        if (!pageRepository.existsById(pageId)) {
            throw new BusinessException(40001, "page not found");
        }
    }

    private ContentCommentDto toDto(ContentCommentEntity entity) {
        long replyCount = commentRepository.countByParentId(entity.getId());
        return new ContentCommentDto(
            entity.getId(),
            entity.getPageId(),
            entity.getAnnotationId(),
            entity.getParentId(),
            entity.getAuthorUserId(),
            entity.getAuthorDisplayName(),
            entity.getBody(),
            entity.getCreatedAt(),
            entity.getUpdatedAt(),
            replyCount
        );
    }

    private AuthorInfo resolveAuthor() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof AppUserDetails details) {
            UserEntity user = details.getUser();
            String name = StringUtils.hasText(user.getDisplayName())
                ? user.getDisplayName()
                : user.getUsername();
            return new AuthorInfo(user.getId(), name);
        }
        return new AuthorInfo(ANONYMOUS_USER_ID, ANONYMOUS_DISPLAY_NAME);
    }

    private static String normalizeBlank(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }

    private record AuthorInfo(String userId, String displayName) {
    }
}
