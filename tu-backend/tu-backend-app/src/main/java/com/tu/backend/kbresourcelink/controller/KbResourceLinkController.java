package com.tu.backend.kbresourcelink.controller;

import com.tu.backend.common.ApiResponse;
import com.tu.backend.kbresourcelink.dto.CreateKbResourceLinkRequest;
import com.tu.backend.kbresourcelink.dto.KbResourceLinkDto;
import com.tu.backend.kbresourcelink.service.KbResourceLinkService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
public class KbResourceLinkController {

    private final KbResourceLinkService linkService;

    public KbResourceLinkController(KbResourceLinkService linkService) {
        this.linkService = linkService;
    }

    @GetMapping("/kbs/{kbId}/resource-links")
    public ApiResponse<List<KbResourceLinkDto>> list(@PathVariable String kbId) {
        return ApiResponse.success(linkService.list(kbId));
    }

    @PostMapping("/kbs/{kbId}/resource-links")
    public ApiResponse<KbResourceLinkDto> create(
        @PathVariable String kbId,
        @Valid @RequestBody CreateKbResourceLinkRequest request
    ) {
        return ApiResponse.success(linkService.create(kbId, request));
    }

    @DeleteMapping("/kbs/{kbId}/resource-links/{resourceItemId}")
    public ApiResponse<Void> delete(
        @PathVariable String kbId,
        @PathVariable String resourceItemId
    ) {
        linkService.delete(kbId, resourceItemId);
        return ApiResponse.success();
    }
}
