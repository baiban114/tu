package com.tu.backend.externalresource.dto;

/** Request body for tu-rag-service POST /internal/crawl/fetch. */
public record CrawlFetchRequest(
    String url,
    Integer timeoutSeconds
) {
}
