package com.tu.backend.rag;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.tu.backend.common.BusinessException;
import com.tu.backend.rag.dto.RagQueryRequest;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

class PythonRagStoreTest {

    @Test
    void testQuery_whenRagDisabled_doesNotCallRemoteService() {
        RagProperties properties = new RagProperties();
        properties.setEnabled(false);
        properties.setServiceUrl("http://localhost:19080");
        properties.setTimeout(Duration.ofMillis(100));
        PythonRagStore ragStore = new PythonRagStore(properties, RestClient.builder());

        assertThatThrownBy(() -> ragStore.query(new RagQueryRequest("kb-1", "question", 5)))
            .isInstanceOf(BusinessException.class)
            .hasMessage("rag service disabled");
    }
}
