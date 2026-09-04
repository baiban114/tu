package com.tu.backend.rag;

import com.tu.backend.common.BusinessException;
import com.tu.backend.rag.dto.RagDeleteRequest;
import com.tu.backend.rag.dto.RagIndexRequest;
import com.tu.backend.rag.dto.RagQueryRequest;
import com.tu.backend.rag.dto.RagQueryResponse;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * RAG store adapter for the Python tu-rag-service, which owns embedding and Qdrant access.
 */
@Component
public class PythonRagStore implements RagStore {

    private static final int RAG_UNAVAILABLE_CODE = 50300;
    private static final int RAG_DISABLED_CODE = 50301;
    private static final String QUERY_PATH = "/internal/rag/query";
    private static final String INDEX_PATH = "/internal/rag/index";
    private static final String DELETE_PATH = "/internal/rag/delete";

    private final RagProperties properties;
    private final RestClient restClient;

    public PythonRagStore(RagProperties properties, RestClient.Builder restClientBuilder) {
        this.properties = properties;
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(properties.getTimeout());
        requestFactory.setReadTimeout(properties.getTimeout());
        this.restClient = restClientBuilder
            .baseUrl(properties.getServiceUrl())
            .requestFactory(requestFactory)
            .build();
    }

    /**
     * Queries the Python RAG service.
     *
     * @param request knowledge-base-scoped query
     * @return RAG answer and source chunks
     */
    @Override
    public RagQueryResponse query(RagQueryRequest request) {
        RagQueryResponse response = post(QUERY_PATH, request, RagQueryResponse.class);
        if (response == null) {
            throw new BusinessException(RAG_UNAVAILABLE_CODE, "rag service returned an empty response");
        }
        return response;
    }

    /**
     * Replaces all indexed chunks for one page through the Python service.
     *
     * @param request page documents to index
     */
    @Override
    public void index(RagIndexRequest request) {
        post(INDEX_PATH, request, Void.class);
    }

    /**
     * Deletes vectors through the Python service.
     *
     * @param request deletion scope
     */
    @Override
    public void delete(RagDeleteRequest request) {
        post(DELETE_PATH, request, Void.class);
    }

    private <T> T post(String path, Object body, Class<T> responseType) {
        if (!properties.isEnabled()) {
            throw new BusinessException(RAG_DISABLED_CODE, "rag service disabled");
        }
        try {
            return restClient.post()
                .uri(path)
                .body(body)
                .retrieve()
                .body(responseType);
        } catch (RestClientResponseException ex) {
            throw new BusinessException(
                RAG_UNAVAILABLE_CODE,
                "rag service request failed with HTTP " + ex.getStatusCode().value(),
                ex
            );
        } catch (RestClientException ex) {
            throw new BusinessException(RAG_UNAVAILABLE_CODE, "rag service unavailable", ex);
        }
    }
}
