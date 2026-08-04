package com.tu.backend.externalresource.dto;

/** Response body from tu-rag-service POST /internal/crawl/fetch. */
public record CrawlFetchResult(
    int status,
    String finalUrl,
    String title,
    String markdown,
    int charCount,
    boolean truncated,
    String crawledAt
) {
}
