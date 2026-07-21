package com.tu.backend.comment.dto;

import java.time.LocalDateTime;

public record ContentCommentDto(
    String id,
    String pageId,
    String annotationId,
    String parentId,
    String authorUserId,
    String authorDisplayName,
    String body,
    LocalDateTime createdAt,
    LocalDateTime updatedAt,
    long replyCount
) {
}
