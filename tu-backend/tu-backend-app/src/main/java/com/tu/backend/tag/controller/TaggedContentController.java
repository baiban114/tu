package com.tu.backend.tag.controller;

import com.tu.backend.common.ApiResponse;
import com.tu.backend.common.PageResponse;
import com.tu.backend.tag.dto.TagPoolItemDto;
import com.tu.backend.tag.dto.TaggedContentItemDto;
import com.tu.backend.tag.service.TaggedContentService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
public class TaggedContentController {

    private final TaggedContentService taggedContentService;

    public TaggedContentController(TaggedContentService taggedContentService) {
        this.taggedContentService = taggedContentService;
    }

    @GetMapping("/kbs/{kbId}/tags")
    public ApiResponse<List<TagPoolItemDto>> listKbTags(@PathVariable String kbId) {
        return ApiResponse.success(taggedContentService.listKbTags(kbId));
    }

    @GetMapping("/kbs/{kbId}/tagged-content")
    public ApiResponse<PageResponse<TaggedContentItemDto>> listTaggedContent(
        @PathVariable String kbId,
        @RequestParam(required = false) String tagLabel,
        @RequestParam(required = false, defaultValue = "0") int page,
        @RequestParam(required = false, defaultValue = "10") int pageSize
    ) {
        return ApiResponse.success(
            taggedContentService.listTaggedContent(kbId, tagLabel, page, pageSize)
        );
    }
}
