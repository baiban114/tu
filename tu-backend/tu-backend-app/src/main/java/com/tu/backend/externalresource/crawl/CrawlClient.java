package com.tu.backend.externalresource.crawl;

import com.tu.backend.common.BusinessException;
import com.tu.backend.externalresource.dto.CrawlFetchRequest;
import com.tu.backend.externalresource.dto.CrawlFetchResult;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * Talks to tu-rag-service {@code POST /internal/crawl/fetch}. Crawling renders pages in a
 * headless browser, so the read timeout must exceed the Python-side crawl timeout.
 */
@Component
public class CrawlClient {

    private final CrawlProperties properties;
    private final RestClient restClient;

    public CrawlClient(CrawlProperties properties, RestClient.Builder restClientBuilder) {
        this.properties = properties;
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(properties.getTimeout());
        requestFactory.setReadTimeout(properties.getTimeout());
        this.restClient = restClientBuilder
            .baseUrl(properties.getServiceUrl())
            .requestFactory(requestFactory)
            .build();
    }

    public CrawlFetchResult fetch(String url) {
        if (!properties.isEnabled()) {
            throw new BusinessException(50410, "crawl service disabled");
        }
        try {
            return restClient.post()
                .uri("/internal/crawl/fetch")
                .body(new CrawlFetchRequest(url, null))
                .retrieve()
                .body(CrawlFetchResult.class);
        } catch (RestClientResponseException ex) {
            throw new BusinessException(50411, "crawl failed: HTTP " + ex.getStatusCode().value());
        } catch (RestClientException ex) {
            throw new BusinessException(50412, "crawl service unavailable");
        }
    }
}
