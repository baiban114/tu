package com.tu.backend.externalresource.controller;

import com.tu.backend.common.ApiResponse;
import com.tu.backend.externalresource.dto.ResourceCrawledDocumentDto;
import com.tu.backend.externalresource.service.ResourceCrawledDocumentService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/resource-items/{itemId}/crawled-document")
public class ResourceCrawledDocumentController {

    private final ResourceCrawledDocumentService crawledDocumentService;

    public ResourceCrawledDocumentController(ResourceCrawledDocumentService crawledDocumentService) {
        this.crawledDocumentService = crawledDocumentService;
    }

    /** Triggers a crawl of the web-link source URL (long-running request). */
    @PostMapping
    public ApiResponse<ResourceCrawledDocumentDto> crawl(@PathVariable String itemId) {
        return ApiResponse.success(crawledDocumentService.crawl(itemId));
    }

    /** Returns the stored crawled document, or null data when not crawled yet. */
    @GetMapping
    public ApiResponse<ResourceCrawledDocumentDto> get(@PathVariable String itemId) {
        return ApiResponse.success(crawledDocumentService.get(itemId));
    }

    @DeleteMapping
    public ApiResponse<Void> delete(@PathVariable String itemId) {
        crawledDocumentService.delete(itemId);
        return ApiResponse.success();
    }
}
