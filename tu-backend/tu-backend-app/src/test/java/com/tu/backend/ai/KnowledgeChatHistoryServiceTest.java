package com.tu.backend.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tu.backend.ai.dto.KnowledgeChatResponse;
import com.tu.backend.ai.entity.KnowledgeChatMessageEntity;
import com.tu.backend.ai.entity.KnowledgeChatSessionEntity;
import com.tu.backend.ai.repository.KnowledgeChatMessageRepository;
import com.tu.backend.ai.repository.KnowledgeChatSessionRepository;
import com.tu.backend.common.BusinessException;
import com.tu.backend.common.PageResponse;
import com.tu.backend.rag.dto.RagSourceDto;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class KnowledgeChatHistoryServiceTest {

    @Test
    void testSaveTurn_whenSessionIsNew_persistsBothMessagesInOrder() {
        KnowledgeChatSessionRepository sessionRepository = mock(KnowledgeChatSessionRepository.class);
        KnowledgeChatMessageRepository messageRepository = mock(KnowledgeChatMessageRepository.class);
        when(sessionRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(messageRepository.countBySessionId(any())).thenReturn(0L);
        KnowledgeChatHistoryService service = service(sessionRepository, messageRepository);
        RagSourceDto source = new RagSourceDto(
            "kb-1", "page-1", "block-1", "标题", "内容", "richtext", 0.9
        );
        KnowledgeChatResponse response = new KnowledgeChatResponse(
            "回答",
            List.of(source),
            "推理",
            "kb-1",
            "技术文档"
        );

        String sessionId = service.saveTurn("dev-local-user", null, "第一条问题", response);

        ArgumentCaptor<KnowledgeChatSessionEntity> sessionCaptor =
            ArgumentCaptor.forClass(KnowledgeChatSessionEntity.class);
        verify(sessionRepository).save(sessionCaptor.capture());
        assertThat(sessionId).startsWith("chat-");
        assertThat(sessionCaptor.getValue().getUserId()).isEqualTo("dev-local-user");
        assertThat(sessionCaptor.getValue().getTitle()).isEqualTo("第一条问题");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<KnowledgeChatMessageEntity>> messagesCaptor = ArgumentCaptor.forClass(List.class);
        verify(messageRepository).saveAll(messagesCaptor.capture());
        assertThat(messagesCaptor.getValue()).extracting(KnowledgeChatMessageEntity::getRole)
            .containsExactly("user", "assistant");
        assertThat(messagesCaptor.getValue()).extracting(KnowledgeChatMessageEntity::getMessageIndex)
            .containsExactly(0, 1);
        assertThat(messagesCaptor.getValue().get(1).getSourcesJson()).contains("page-1");
    }

    @Test
    void testSaveTurn_whenSessionBelongsToAnotherUser_rejectsAccess() {
        KnowledgeChatSessionRepository sessionRepository = mock(KnowledgeChatSessionRepository.class);
        KnowledgeChatMessageRepository messageRepository = mock(KnowledgeChatMessageRepository.class);
        KnowledgeChatSessionEntity session = session("chat-1", "user-2", "其他用户会话");
        when(sessionRepository.findByIdForUpdate("chat-1")).thenReturn(Optional.of(session));
        KnowledgeChatHistoryService service = service(sessionRepository, messageRepository);

        assertThatThrownBy(() -> service.saveTurn(
            "user-1",
            "chat-1",
            "问题",
            new KnowledgeChatResponse("回答", List.of(), "", "kb-1", "知识库")
        ))
            .isInstanceOf(BusinessException.class)
            .hasMessage("knowledge chat session is not accessible to current user");
    }

    @Test
    void testListSessions_whenRequested_usesTwentyItemDatabasePage() {
        KnowledgeChatSessionRepository sessionRepository = mock(KnowledgeChatSessionRepository.class);
        KnowledgeChatMessageRepository messageRepository = mock(KnowledgeChatMessageRepository.class);
        KnowledgeChatSessionEntity session = session("chat-1", "dev-local-user", "第一条问题");
        when(sessionRepository.findByUserIdOrderByCreatedAtDesc(any(), any()))
            .thenReturn(new PageImpl<>(List.of(session)));
        KnowledgeChatHistoryService service = service(sessionRepository, messageRepository);

        PageResponse<?> result = service.listSessions("dev-local-user", 0, 20);

        assertThat(result.items()).hasSize(1);
        ArgumentCaptor<Pageable> pageableCaptor = ArgumentCaptor.forClass(Pageable.class);
        verify(sessionRepository).findByUserIdOrderByCreatedAtDesc(
            org.mockito.ArgumentMatchers.eq("dev-local-user"),
            pageableCaptor.capture()
        );
        assertThat(pageableCaptor.getValue().getPageSize()).isEqualTo(20);
    }

    private KnowledgeChatHistoryService service(
        KnowledgeChatSessionRepository sessionRepository,
        KnowledgeChatMessageRepository messageRepository
    ) {
        return new KnowledgeChatHistoryService(sessionRepository, messageRepository, new ObjectMapper());
    }

    private KnowledgeChatSessionEntity session(String id, String userId, String title) {
        KnowledgeChatSessionEntity session = new KnowledgeChatSessionEntity();
        session.setId(id);
        session.setUserId(userId);
        session.setTitle(title);
        return session;
    }
}
