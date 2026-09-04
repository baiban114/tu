package com.tu.backend.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tu.backend.common.BusinessException;
import com.tu.backend.knowledge.entity.KnowledgeBaseEntity;
import com.tu.backend.knowledge.service.KnowledgeBaseAccessService;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class KnowledgeBaseIntentRouterTest {

    @Test
    void validatesAnExplicitKnowledgeBaseAgainstCurrentUserAccess() {
        KnowledgeBaseAccessService accessService = mock(KnowledgeBaseAccessService.class);
        KnowledgeBaseEntity selected = knowledgeBase("kb-1", "架构", "后端架构");
        when(accessService.requireAccessible("kb-1")).thenReturn(selected);
        AiChatClient chatClient = mock(AiChatClient.class);
        KnowledgeBaseIntentRouter router = router(accessService, chatClient, mock(AiAgentRuntimeConfigResolver.class));

        assertThat(router.resolve(" kb-1 ", "问题")).isSameAs(selected);
        verify(accessService).requireAccessible("kb-1");
        verify(chatClient, never()).completeJson(any(), any(), any());
    }

    @Test
    void testResolve_whenUserIdProvided_usesExplicitIdentityAccessMethods() {
        KnowledgeBaseAccessService accessService = mock(KnowledgeBaseAccessService.class);
        KnowledgeBaseEntity selected = knowledgeBase("kb-1", "架构", "后端架构");
        when(accessService.requireAccessible("kb-1", "user-1")).thenReturn(selected);
        KnowledgeBaseIntentRouter router = router(
            accessService,
            mock(AiChatClient.class),
            mock(AiAgentRuntimeConfigResolver.class)
        );

        assertThat(router.resolve("kb-1", "问题", "user-1")).isSameAs(selected);
        verify(accessService).requireAccessible("kb-1", "user-1");
        verify(accessService, never()).requireAccessible("kb-1");
    }

    @Test
    void selectsTheOnlyAccessibleKnowledgeBaseWithoutCallingTheModel() {
        KnowledgeBaseAccessService accessService = mock(KnowledgeBaseAccessService.class);
        KnowledgeBaseEntity selected = knowledgeBase("kb-1", "架构", "后端架构");
        when(accessService.listAccessible()).thenReturn(List.of(selected));
        AiChatClient chatClient = mock(AiChatClient.class);
        KnowledgeBaseIntentRouter router = router(accessService, chatClient, mock(AiAgentRuntimeConfigResolver.class));

        assertThat(router.resolve(null, "问题")).isSameAs(selected);
        verify(chatClient, never()).completeJson(any(), any(), any());
    }

    @Test
    void usesTheModelToChooseOnlyFromAccessibleCandidates() {
        KnowledgeBaseAccessService accessService = mock(KnowledgeBaseAccessService.class);
        KnowledgeBaseEntity architecture = knowledgeBase("kb-architecture", "架构", "服务设计");
        KnowledgeBaseEntity database = knowledgeBase("kb-database", "数据库", "数据存储");
        when(accessService.listAccessible()).thenReturn(List.of(architecture, database));
        AiAgentRuntimeConfigResolver configResolver = mock(AiAgentRuntimeConfigResolver.class);
        when(configResolver.runtimeConfig()).thenReturn(runtimeConfig());
        AiChatClient chatClient = mock(AiChatClient.class);
        when(chatClient.completeJson(any(), any(), any())).thenReturn(completion("{\"kbId\":\"kb-database\"}"));
        KnowledgeBaseIntentRouter router = router(accessService, chatClient, configResolver);

        assertThat(router.resolve(null, "怎样做好事务隔离？")).isSameAs(database);
    }

    @Test
    void rejectsAnUnknownModelIdAndFallsBackInsideTheAccessibleSet() {
        KnowledgeBaseAccessService accessService = mock(KnowledgeBaseAccessService.class);
        KnowledgeBaseEntity architecture = knowledgeBase("kb-architecture", "架构", "服务设计");
        KnowledgeBaseEntity database = knowledgeBase("kb-database", "数据库", "事务隔离并发控制");
        when(accessService.listAccessible()).thenReturn(List.of(architecture, database));
        AiAgentRuntimeConfigResolver configResolver = mock(AiAgentRuntimeConfigResolver.class);
        when(configResolver.runtimeConfig()).thenReturn(runtimeConfig());
        AiChatClient chatClient = mock(AiChatClient.class);
        when(chatClient.completeJson(any(), any(), any())).thenReturn(completion("{\"kbId\":\"kb-other-user\"}"));
        KnowledgeBaseIntentRouter router = router(accessService, chatClient, configResolver);

        KnowledgeBaseEntity selected = router.resolve(null, "事务隔离如何处理并发？");

        assertThat(selected).isSameAs(database);
        assertThat(List.of(architecture, database)).contains(selected);
    }

    @Test
    void failsWhenTheCurrentUserHasNoAccessibleKnowledgeBase() {
        KnowledgeBaseAccessService accessService = mock(KnowledgeBaseAccessService.class);
        when(accessService.listAccessible()).thenReturn(List.of());
        KnowledgeBaseIntentRouter router = router(
            accessService,
            mock(AiChatClient.class),
            mock(AiAgentRuntimeConfigResolver.class)
        );

        assertThatThrownBy(() -> router.resolve(null, "问题"))
            .isInstanceOf(BusinessException.class)
            .hasMessage("no accessible knowledge base is available");
    }

    @Test
    void doesNotUseTheFirstCandidateAsAnImplicitDefaultWhenIntentIsUnknown() {
        KnowledgeBaseAccessService accessService = mock(KnowledgeBaseAccessService.class);
        KnowledgeBaseEntity architecture = knowledgeBase("kb-architecture", "架构", "服务设计");
        KnowledgeBaseEntity database = knowledgeBase("kb-database", "数据库", "事务管理");
        when(accessService.listAccessible()).thenReturn(List.of(architecture, database));
        AiAgentRuntimeConfigResolver configResolver = mock(AiAgentRuntimeConfigResolver.class);
        when(configResolver.runtimeConfig()).thenReturn(runtimeConfig());
        AiChatClient chatClient = mock(AiChatClient.class);
        when(chatClient.completeJson(any(), any(), any())).thenThrow(new BusinessException(50320, "ai unavailable"));
        KnowledgeBaseIntentRouter router = router(accessService, chatClient, configResolver);

        assertThatThrownBy(() -> router.resolve(null, "请回答这个问题"))
            .isInstanceOf(BusinessException.class)
            .hasMessage("unable to determine a knowledge base; please select one explicitly");
    }

    private KnowledgeBaseIntentRouter router(
        KnowledgeBaseAccessService accessService,
        AiChatClient chatClient,
        AiAgentRuntimeConfigResolver configResolver
    ) {
        return new KnowledgeBaseIntentRouter(accessService, chatClient, configResolver, new ObjectMapper());
    }

    private KnowledgeBaseEntity knowledgeBase(String id, String name, String description) {
        KnowledgeBaseEntity knowledgeBase = new KnowledgeBaseEntity();
        knowledgeBase.setId(id);
        knowledgeBase.setName(name);
        knowledgeBase.setDescription(description);
        return knowledgeBase;
    }

    private AiAgentRuntimeConfig runtimeConfig() {
        return new AiAgentRuntimeConfig(true, "https://example.test", "key", "model", 30, 300, 300);
    }

    private AiChatCompletionResult completion(String content) {
        return new AiChatCompletionResult(content, "", "", 1L, 1, 1, 2);
    }
}
