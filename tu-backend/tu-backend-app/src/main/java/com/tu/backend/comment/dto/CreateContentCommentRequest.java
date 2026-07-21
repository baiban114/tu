package com.tu.backend.comment.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateContentCommentRequest(
    String annotationId,
    String parentId,
    @NotBlank @Size(max = 4000) String body
) {
}
