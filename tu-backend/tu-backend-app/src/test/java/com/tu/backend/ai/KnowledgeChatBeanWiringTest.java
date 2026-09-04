package com.tu.backend.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tu.backend.auth.security.CurrentUserIdResolver;
import com.tu.backend.ai.repository.KnowledgeChatMessageRepository;
import com.tu.backend.ai.repository.KnowledgeChatSessionRepository;
import com.tu.backend.knowledge.service.KnowledgeBaseAccessService;
import com.tu.backend.rag.RagIndexService;
import com.tu.backend.search.SearchService;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class KnowledgeChatBeanWiringTest {

    @Test
    void createsKnowledgeChatBeansWithTheirSpringManagedConstructors() {
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.registerBean(KnowledgeBaseAccessService.class, () -> mock(KnowledgeBaseAccessService.class));
            context.registerBean(AiChatClient.class, () -> mock(AiChatClient.class));
            context.registerBean(AiAgentToolLoopClient.class, () -> mock(AiAgentToolLoopClient.class));
            context.registerBean(AiAgentRuntimeConfigResolver.class, () -> mock(AiAgentRuntimeConfigResolver.class));
            context.registerBean(RagIndexService.class, () -> mock(RagIndexService.class));
            context.registerBean(SearchService.class, () -> mock(SearchService.class));
            context.registerBean(ObjectMapper.class, () -> new ObjectMapper());
            context.registerBean(CurrentUserIdResolver.class, () -> mock(CurrentUserIdResolver.class));
            context.registerBean(
                KnowledgeChatSessionRepository.class,
                () -> mock(KnowledgeChatSessionRepository.class)
            );
            context.registerBean(
                KnowledgeChatMessageRepository.class,
                () -> mock(KnowledgeChatMessageRepository.class)
            );
            context.registerBean(KnowledgeBaseIntentRouter.class);
            context.registerBean(KnowledgeChatHistoryService.class);
            context.registerBean(KnowledgeChatService.class);
            context.registerBean(KnowledgeChatController.class);

            context.refresh();

            assertThat(context.getBean(KnowledgeBaseIntentRouter.class)).isNotNull();
            assertThat(context.getBean(KnowledgeChatService.class)).isNotNull();
            assertThat(context.getBean(KnowledgeChatController.class)).isNotNull();
        }
    }
}
