package com.tu.backend.rag;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tu.backend.ai.AiAgentTools;
import com.tu.backend.content.repository.PageContentRepository;
import com.tu.backend.knowledge.repository.KnowledgeBaseRepository;
import com.tu.backend.page.repository.PageRepository;
import com.tu.backend.search.SearchService;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.web.client.RestClient;

class RagBeanWiringTest {

    @Test
    void testRagBeans_whenRegistered_createSuccessfully() {
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.registerBean(PageRepository.class, () -> mock(PageRepository.class));
            context.registerBean(PageContentRepository.class, () -> mock(PageContentRepository.class));
            context.registerBean(KnowledgeBaseRepository.class, () -> mock(KnowledgeBaseRepository.class));
            context.registerBean(ObjectMapper.class, () -> new ObjectMapper());
            context.registerBean(RagDocumentExtractor.class);
            context.registerBean(RagProperties.class);
            context.registerBean(RestClient.Builder.class, () -> RestClient.builder());
            context.registerBean(PythonRagStore.class);
            context.registerBean(RagIndexService.class);
            context.registerBean(SearchService.class, () -> mock(SearchService.class));
            context.registerBean(AiAgentTools.class);

            context.refresh();

            assertThat(context.getBean(RagIndexService.class)).isNotNull();
            assertThat(context.getBean(RagStore.class)).isInstanceOf(PythonRagStore.class);
            assertThat(context.getBean(AiAgentTools.class)).isNotNull();
        }
    }
}
