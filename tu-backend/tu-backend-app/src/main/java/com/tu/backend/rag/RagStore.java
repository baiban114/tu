package com.tu.backend.rag;

import com.tu.backend.rag.dto.RagDeleteRequest;
import com.tu.backend.rag.dto.RagIndexRequest;
import com.tu.backend.rag.dto.RagQueryRequest;
import com.tu.backend.rag.dto.RagQueryResponse;

/**
 * RAG vector storage boundary used by the backend application.
 */
public interface RagStore {

    /**
     * Retrieves semantically related chunks.
     *
     * @param request knowledge-base-scoped query
     * @return synthesized retrieval summary and source chunks
     */
    RagQueryResponse query(RagQueryRequest request);

    /**
     * Replaces all indexed chunks for one page.
     *
     * @param request page documents to index
     */
    void index(RagIndexRequest request);

    /**
     * Deletes vectors selected by knowledge base and optional page identifiers.
     *
     * @param request deletion scope
     */
    void delete(RagDeleteRequest request);
}
