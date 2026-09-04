package com.tu.backend.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tu.backend.ai.dto.KnowledgeChatMessageDto;
import com.tu.backend.ai.dto.KnowledgeChatRequest;
import com.tu.backend.ai.dto.KnowledgeChatResponse;
import com.tu.backend.ai.dto.KnowledgeChatStreamEvent;
import com.tu.backend.knowledge.entity.KnowledgeBaseEntity;
import com.tu.backend.rag.RagIndexService;
import com.tu.backend.rag.dto.RagQueryRequest;
import com.tu.backend.rag.dto.RagQueryResponse;
import com.tu.backend.rag.dto.RagSourceDto;
import com.tu.backend.search.SearchService;
import com.tu.backend.search.dto.SearchHitDto;
import com.tu.backend.search.dto.SearchResponseDto;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class KnowledgeChatServiceTest {

    @Test
    void testAskStream_whenModelStreams_forwardsReasoningAndAnswerDeltas() {
        KnowledgeBaseIntentRouter intentRouter = mock(KnowledgeBaseIntentRouter.class);
        RagIndexService ragIndexService = mock(RagIndexService.class);
        SearchService searchService = mock(SearchService.class);
        AiAgentRuntimeConfigResolver configResolver = mock(AiAgentRuntimeConfigResolver.class);
        KnowledgeChatHistoryService historyService = mock(KnowledgeChatHistoryService.class);
        KnowledgeBaseEntity knowledgeBase = new KnowledgeBaseEntity();
        knowledgeBase.setId("kb-1");
        knowledgeBase.setName("架构知识库");
        RagSourceDto source = new RagSourceDto(
            "kb-1", "page-1", "block-1", "可靠性", "超时需要分层配置。", "richtext", 0.91
        );
        when(intentRouter.resolve(null, "如何设置超时？", "user-1")).thenReturn(knowledgeBase);
        when(ragIndexService.query(any(RagQueryRequest.class)))
            .thenReturn(new RagQueryResponse("", List.of(source)));
        when(configResolver.runtimeConfig()).thenReturn(
            new AiAgentRuntimeConfig(true, "https://example.test", "key", "model", 30, 300, 300)
        );
        when(historyService.saveTurn(any(), any(), any(), any())).thenReturn("chat-1");
        AiChatClient chatClient = new AiChatClient() {
            @Override
            public AiChatCompletionResult completeJson(
                AiAgentRuntimeConfig config,
                String systemPrompt,
                String userPrompt
            ) {
                throw new UnsupportedOperationException();
            }

            @Override
            public AiChatCompletionResult streamText(
                AiAgentRuntimeConfig config,
                String systemPrompt,
                String userPrompt,
                AiChatStreamListener listener
            ) {
                listener.onReasoningDelta("先检索");
                listener.onReasoningDelta("再归纳");
                listener.onAnswerDelta("应设置");
                listener.onAnswerDelta("分层超时。[来源1]");
                return new AiChatCompletionResult(
                    "应设置分层超时。[来源1]", "", "", 1L, 1, 1, 2, "先检索再归纳"
                );
            }
        };
        KnowledgeChatService service = new KnowledgeChatService(
            intentRouter,
            ragIndexService,
            searchService,
            chatClient,
            mock(AiAgentToolLoopClient.class),
            configResolver,
            new ObjectMapper(),
            historyService
        );
        List<KnowledgeChatStreamEvent> events = new ArrayList<>();

        KnowledgeChatResponse response = service.askStream(
            new KnowledgeChatRequest(null, "如何设置超时？", List.of()),
            "user-1",
            events::add
        );

        assertThat(events).extracting(KnowledgeChatStreamEvent::phase)
            .containsExactly(
                "started", "reasoning_delta", "reasoning_delta", "answer_delta", "answer_delta", "completed"
            );
        assertThat(events).extracting(KnowledgeChatStreamEvent::delta)
            .containsExactly(null, "先检索", "再归纳", "应设置", "分层超时。[来源1]", null);
        assertThat(response.answer()).isEqualTo("应设置分层超时。[来源1]");
        assertThat(response.reasoningContent()).isEqualTo("先检索再归纳");
        assertThat(response.selectedKbId()).isEqualTo("kb-1");
        assertThat(response.conversationId()).isEqualTo("chat-1");
    }

    @Test
    void answersFromRetrievedSourcesAndReturnsCitations() {
        KnowledgeBaseIntentRouter intentRouter = mock(KnowledgeBaseIntentRouter.class);
        RagIndexService ragIndexService = mock(RagIndexService.class);
        SearchService searchService = mock(SearchService.class);
        AiChatClient chatClient = mock(AiChatClient.class);
        AiAgentRuntimeConfigResolver configResolver = mock(AiAgentRuntimeConfigResolver.class);
        KnowledgeChatHistoryService historyService = mock(KnowledgeChatHistoryService.class);
        KnowledgeBaseEntity knowledgeBase = new KnowledgeBaseEntity();
        knowledgeBase.setId("kb-1");
        knowledgeBase.setName("架构知识库");
        RagSourceDto source = new RagSourceDto("kb-1", "page-1", "block-1", "可靠性", "超时需要分层配置。", "richtext", 0.91);
        AiAgentRuntimeConfig config = new AiAgentRuntimeConfig(true, "https://example.test", "key", "model", 30, 300, 300);
        when(intentRouter.resolve(null, "如何设置超时？", "user-1")).thenReturn(knowledgeBase);
        when(ragIndexService.query(any(RagQueryRequest.class))).thenReturn(new RagQueryResponse("", List.of(source)));
        when(configResolver.runtimeConfig()).thenReturn(config);
        when(chatClient.completeJson(any(), any(), any())).thenReturn(
            new AiChatCompletionResult(
                "{\"answer\":\"应设置分层超时。[来源1]\"}",
                "",
                "",
                1L,
                1,
                1,
                2,
                "这是模型返回的原始推理过程。"
            )
        );
        when(historyService.saveTurn(any(), any(), any(), any())).thenReturn("chat-1");
        KnowledgeChatService service = new KnowledgeChatService(
            intentRouter,
            ragIndexService,
            searchService,
            chatClient,
            mock(AiAgentToolLoopClient.class),
            configResolver,
            new ObjectMapper(),
            historyService
        );

        KnowledgeChatResponse response = service.ask(new KnowledgeChatRequest(
            null,
            "如何设置超时？",
            List.of(new KnowledgeChatMessageDto("user", "我们讨论的是后端服务"))
        ), "user-1");

        assertThat(response.answer()).isEqualTo("应设置分层超时。[来源1]");
        assertThat(response.sources()).containsExactly(source);
        assertThat(response.reasoningContent()).isEqualTo("这是模型返回的原始推理过程。");
        assertThat(response.selectedKbId()).isEqualTo("kb-1");
        assertThat(response.selectedKbName()).isEqualTo("架构知识库");
        assertThat(response.conversationId()).isEqualTo("chat-1");
        ArgumentCaptor<String> promptCaptor = ArgumentCaptor.forClass(String.class);
        verify(chatClient).completeJson(any(), any(), promptCaptor.capture());
        assertThat(promptCaptor.getValue())
            .contains("<knowledge_sources>", "超时需要分层配置。", "如何设置超时？", "我们讨论的是后端服务");
    }

    @Test
    void doesNotCallModelWhenRetrievalHasNoSources() {
        KnowledgeBaseIntentRouter intentRouter = mock(KnowledgeBaseIntentRouter.class);
        RagIndexService ragIndexService = mock(RagIndexService.class);
        SearchService searchService = mock(SearchService.class);
        KnowledgeBaseEntity knowledgeBase = new KnowledgeBaseEntity();
        knowledgeBase.setName("空知识库");
        knowledgeBase.setId("kb-1");
        when(intentRouter.resolve("kb-1", "问题", "user-1")).thenReturn(knowledgeBase);
        when(ragIndexService.query(any(RagQueryRequest.class))).thenReturn(new RagQueryResponse("", List.of()));
        KnowledgeChatService service = new KnowledgeChatService(
            intentRouter,
            ragIndexService,
            searchService,
            mock(AiChatClient.class),
            mock(AiAgentToolLoopClient.class),
            mock(AiAgentRuntimeConfigResolver.class),
            new ObjectMapper(),
            mock(KnowledgeChatHistoryService.class)
        );

        KnowledgeChatResponse response = service.ask(
            new KnowledgeChatRequest("kb-1", "问题", List.of()),
            "user-1"
        );

        assertThat(response.answer()).contains("没有检索到足够的相关资料");
        assertThat(response.sources()).isEmpty();
    }

    @Test
    void testAsk_whenRagUnavailable_usesKnowledgeBaseKeywordSources() {
        KnowledgeBaseIntentRouter intentRouter = mock(KnowledgeBaseIntentRouter.class);
        RagIndexService ragIndexService = mock(RagIndexService.class);
        SearchService searchService = mock(SearchService.class);
        AiChatClient chatClient = mock(AiChatClient.class);
        AiAgentRuntimeConfigResolver configResolver = mock(AiAgentRuntimeConfigResolver.class);
        KnowledgeBaseEntity knowledgeBase = new KnowledgeBaseEntity();
        knowledgeBase.setName("架构知识库");
        knowledgeBase.setId("kb-1");
        when(intentRouter.resolve("kb-1", "如何设置超时？", "user-1")).thenReturn(knowledgeBase);
        when(ragIndexService.query(any(RagQueryRequest.class)))
            .thenThrow(new com.tu.backend.common.BusinessException(50300, "rag unavailable"));
        when(searchService.searchKnowledgeBase("如何设置超时？", "kb-1", 6)).thenReturn(new SearchResponseDto(
            List.of(new SearchHitDto(
                "kb-1", "架构知识库", "page-1", "可靠性", "block-1", "richtext", "超时", "分层配置超时。"
            )),
            true,
            null
        ));
        when(configResolver.runtimeConfig()).thenReturn(
            new AiAgentRuntimeConfig(true, "https://example.test", "key", "model", 30, 300, 300)
        );
        when(chatClient.completeJson(any(), any(), any())).thenReturn(
            new AiChatCompletionResult("{\"answer\":\"应设置分层超时。[来源1]\"}", "", "", 1L, 1, 1, 2)
        );
        KnowledgeChatService service = new KnowledgeChatService(
            intentRouter,
            ragIndexService,
            searchService,
            chatClient,
            mock(AiAgentToolLoopClient.class),
            configResolver,
            new ObjectMapper(),
            mock(KnowledgeChatHistoryService.class)
        );

        KnowledgeChatResponse response = service.ask(
            new KnowledgeChatRequest("kb-1", "如何设置超时？", List.of()),
            "user-1"
        );

        assertThat(response.answer()).contains("分层超时");
        assertThat(response.sources()).hasSize(1);
        assertThat(response.sources().get(0).kbId()).isEqualTo("kb-1");
        assertThat(response.sources().get(0).content()).isEqualTo("分层配置超时。");
    }

    @Test
    void testAskStream_whenDeepMode_usesLimitedToolLoopAndEmitsObservableProgress() {
        KnowledgeBaseIntentRouter intentRouter = mock(KnowledgeBaseIntentRouter.class);
        RagIndexService ragIndexService = mock(RagIndexService.class);
        SearchService searchService = mock(SearchService.class);
        AiChatClient chatClient = mock(AiChatClient.class);
        AiAgentToolLoopClient toolLoopClient = mock(AiAgentToolLoopClient.class);
        AiAgentRuntimeConfigResolver configResolver = mock(AiAgentRuntimeConfigResolver.class);
        KnowledgeChatHistoryService historyService = mock(KnowledgeChatHistoryService.class);
        KnowledgeBaseEntity knowledgeBase = new KnowledgeBaseEntity();
        knowledgeBase.setId("kb-1");
        knowledgeBase.setName("架构知识库");
        RagSourceDto source = new RagSourceDto(
            "kb-1", "page-1", "block-1", "可靠性", "超时需要分层配置。", "richtext", 0.91
        );
        when(intentRouter.resolve("kb-1", "如何设置超时？", "user-1")).thenReturn(knowledgeBase);
        when(ragIndexService.query(any(RagQueryRequest.class)))
            .thenReturn(new RagQueryResponse("", List.of(source)));
        when(configResolver.runtimeConfig()).thenReturn(
            new AiAgentRuntimeConfig(true, "https://example.test", "key", "model", 30, 300, 300)
        );
        when(historyService.saveTurn(any(), any(), any(), any())).thenReturn("chat-1");
        when(toolLoopClient.runToolLoopLimited(
            any(), any(), any(), any(), any(), eq(3), any(Object[].class)
        )).thenAnswer(invocation -> {
            AiAgentProgressListener listener = invocation.getArgument(4);
            listener.onEvent(new AiAgentProgressEvent("model_call", "正在调用模型（第 1 轮）", 1, null, 1L, null));
            listener.onEvent(new AiAgentProgressEvent(
                "tool_call", "正在检索当前知识库…", null, "queryCurrentKnowledgeBase", 2L, null
            ));
            listener.onEvent(new AiAgentProgressEvent(
                "tool_done", "检索当前知识库完成", null, "queryCurrentKnowledgeBase", 3L, null
            ));
            listener.onEvent(new AiAgentProgressEvent(
                "thinking", "根据检索结果核对身份信息。", 2, null, 4L, null
            ));
            return new AiAgentToolLoopResult(
                "应设置分层超时。[来源1]", "", "", 4L, 10, 5, 15, 2, 1
            );
        });
        KnowledgeChatService service = new KnowledgeChatService(
            intentRouter,
            ragIndexService,
            searchService,
            chatClient,
            toolLoopClient,
            configResolver,
            new ObjectMapper(),
            historyService
        );
        List<KnowledgeChatStreamEvent> events = new ArrayList<>();

        KnowledgeChatResponse response = service.askStream(
            new KnowledgeChatRequest("kb-1", "如何设置超时？", List.of(), null, "deep"),
            "user-1",
            events::add
        );

        assertThat(events).extracting(KnowledgeChatStreamEvent::phase)
            .containsExactly(
                "started", "model_call", "tool_call", "tool_done", "reasoning_delta", "answer_delta", "completed"
            );
        assertThat(events).extracting(KnowledgeChatStreamEvent::message)
            .contains("正在调用模型（第 1 轮）", "正在检索当前知识库…", "检索当前知识库完成");
        assertThat(response.answer()).isEqualTo("应设置分层超时。[来源1]");
        assertThat(response.sources()).containsExactly(source);
        assertThat(response.reasoningContent()).isEqualTo("根据检索结果核对身份信息。");
        verify(toolLoopClient).runToolLoopLimited(
            any(), any(), any(), any(), any(), eq(3), any(Object[].class)
        );
    }
}
