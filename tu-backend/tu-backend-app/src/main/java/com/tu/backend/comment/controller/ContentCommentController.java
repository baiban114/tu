package com.tu.backend.comment.controller;

import com.tu.backend.comment.dto.ContentCommentDto;
import com.tu.backend.comment.dto.CreateContentCommentRequest;
import com.tu.backend.comment.service.ContentCommentService;
import com.tu.backend.common.ApiResponse;
import com.tu.backend.common.PageResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/pages/{pageId}/comments")
public class ContentCommentController {

    private final ContentCommentService commentService;

    public ContentCommentController(ContentCommentService commentService) {
        this.commentService = commentService;
    }

    @GetMapping
    public ApiResponse<PageResponse<ContentCommentDto>> listRoot(
        @PathVariable String pageId,
        @RequestParam(required = false) String annotationId,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "10") int pageSize
    ) {
        return ApiResponse.success(commentService.listRootComments(pageId, annotationId, page, pageSize));
    }

    @GetMapping("/{commentId}/replies")
    public ApiResponse<PageResponse<ContentCommentDto>> listReplies(
        @PathVariable String pageId,
        @PathVariable String commentId,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "10") int pageSize
    ) {
        return ApiResponse.success(commentService.listReplies(pageId, commentId, page, pageSize));
    }

    @PostMapping
    public ApiResponse<ContentCommentDto> create(
        @PathVariable String pageId,
        @Valid @RequestBody CreateContentCommentRequest request
    ) {
        return ApiResponse.success(commentService.create(pageId, request));
    }

    @DeleteMapping("/{commentId}")
    public ApiResponse<Void> delete(
        @PathVariable String pageId,
        @PathVariable String commentId
    ) {
        commentService.delete(pageId, commentId);
        return ApiResponse.success();
    }
}
