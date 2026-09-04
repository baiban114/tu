package com.tu.backend.ai;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tu.backend.ai.dto.KnowledgeChatConversationDto;
import com.tu.backend.ai.dto.KnowledgeChatHistoryMessageDto;
import com.tu.backend.ai.dto.KnowledgeChatResponse;
import com.tu.backend.ai.dto.KnowledgeChatSessionDto;
import com.tu.backend.ai.entity.KnowledgeChatMessageEntity;
import com.tu.backend.ai.entity.KnowledgeChatSessionEntity;
import com.tu.backend.ai.repository.KnowledgeChatMessageRepository;
import com.tu.backend.ai.repository.KnowledgeChatSessionRepository;
import com.tu.backend.common.BusinessException;
import com.tu.backend.common.PageResponse;
import com.tu.backend.rag.dto.RagSourceDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
public class KnowledgeChatHistoryService {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeChatHistoryService.class);
    private static final int DEFAULT_PAGE_SIZE = 20;
    private static final int MAX_PAGE_SIZE = 100;
    private static final int MAX_TITLE_LENGTH = 80;
    private static final String USER_ROLE = "user";
    private static final String ASSISTANT_ROLE = "assistant";
    private static final TypeReference<List<RagSourceDto>> SOURCE_LIST_TYPE = new TypeReference<>() {
    };

    private final KnowledgeChatSessionRepository sessionRepository;
    private final KnowledgeChatMessageRepository messageRepository;
    private final ObjectMapper objectMapper;

    public KnowledgeChatHistoryService(
        KnowledgeChatSessionRepository sessionRepository,
        KnowledgeChatMessageRepository messageRepository,
        ObjectMapper objectMapper
    ) {
        this.sessionRepository = sessionRepository;
        this.messageRepository = messageRepository;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public PageResponse<KnowledgeChatSessionDto> listSessions(String userId, int page, int pageSize) {
        int safePage = Math.max(0, page);
        int requestedPageSize = pageSize <= 0 ? DEFAULT_PAGE_SIZE : pageSize;
        int safePageSize = Math.min(MAX_PAGE_SIZE, requestedPageSize);
        Page<KnowledgeChatSessionEntity> entityPage = sessionRepository.findByUserIdOrderByCreatedAtDesc(
            userId,
            PageRequest.of(safePage, safePageSize)
        );
        List<KnowledgeChatSessionDto> items = entityPage.getContent().stream()
            .map(this::toSessionDto)
            .toList();
        return PageResponse.of(items, entityPage.getTotalElements(), safePage, safePageSize);
    }

    @Transactional(readOnly = true)
    public KnowledgeChatConversationDto getConversation(String userId, String sessionId) {
        KnowledgeChatSessionEntity session = requireOwnedSession(userId, sessionId);
        List<KnowledgeChatHistoryMessageDto> messages = messageRepository
            .findBySessionIdOrderByMessageIndexAsc(sessionId)
            .stream()
            .map(this::toMessageDto)
            .toList();
        return new KnowledgeChatConversationDto(
            session.getId(),
            session.getTitle(),
            session.getCreatedAt(),
            messages
        );
    }

    @Transactional
    public String saveTurn(
        String userId,
        String requestedSessionId,
        String question,
        KnowledgeChatResponse response
    ) {
        KnowledgeChatSessionEntity session = resolveSession(userId, requestedSessionId, question);
        session.setSelectedKbId(response.selectedKbId());
        session.setSelectedKbName(response.selectedKbName());
        sessionRepository.save(session);

        int firstMessageIndex = Math.toIntExact(messageRepository.countBySessionId(session.getId()));
        KnowledgeChatMessageEntity userMessage = createMessage(
            session.getId(),
            firstMessageIndex,
            USER_ROLE,
            question
        );
        KnowledgeChatMessageEntity assistantMessage = createMessage(
            session.getId(),
            firstMessageIndex + 1,
            ASSISTANT_ROLE,
            response.answer()
        );
        assistantMessage.setReasoningContent(response.reasoningContent());
        assistantMessage.setSourcesJson(writeSources(response.sources()));
        assistantMessage.setSelectedKbId(response.selectedKbId());
        assistantMessage.setSelectedKbName(response.selectedKbName());
        messageRepository.saveAll(List.of(userMessage, assistantMessage));
        return session.getId();
    }

    private KnowledgeChatSessionEntity resolveSession(String userId, String requestedSessionId, String question) {
        if (requestedSessionId != null && !requestedSessionId.isBlank()) {
            KnowledgeChatSessionEntity session = sessionRepository.findByIdForUpdate(requestedSessionId.trim())
                .orElseThrow(() -> new BusinessException(40001, "knowledge chat session not found"));
            requireOwner(userId, session);
            return session;
        }
        KnowledgeChatSessionEntity session = new KnowledgeChatSessionEntity();
        session.setId("chat-" + UUID.randomUUID().toString().replace("-", ""));
        session.setUserId(userId);
        session.setTitle(abbreviateTitle(question));
        return session;
    }

    private KnowledgeChatSessionEntity requireOwnedSession(String userId, String sessionId) {
        KnowledgeChatSessionEntity session = sessionRepository.findById(sessionId)
            .orElseThrow(() -> new BusinessException(40001, "knowledge chat session not found"));
        requireOwner(userId, session);
        return session;
    }

    private void requireOwner(String userId, KnowledgeChatSessionEntity session) {
        if (!Objects.equals(session.getUserId(), userId)) {
            throw new BusinessException(40300, "knowledge chat session is not accessible to current user");
        }
    }

    private KnowledgeChatMessageEntity createMessage(
        String sessionId,
        int messageIndex,
        String role,
        String content
    ) {
        KnowledgeChatMessageEntity message = new KnowledgeChatMessageEntity();
        message.setId("chatmsg-" + UUID.randomUUID().toString().replace("-", ""));
        message.setSessionId(sessionId);
        message.setMessageIndex(messageIndex);
        message.setRole(role);
        message.setContent(content);
        return message;
    }

    private KnowledgeChatSessionDto toSessionDto(KnowledgeChatSessionEntity session) {
        return new KnowledgeChatSessionDto(
            session.getId(),
            session.getTitle(),
            session.getSelectedKbId(),
            session.getSelectedKbName(),
            session.getCreatedAt(),
            session.getUpdatedAt()
        );
    }

    private KnowledgeChatHistoryMessageDto toMessageDto(KnowledgeChatMessageEntity message) {
        return new KnowledgeChatHistoryMessageDto(
            message.getId(),
            message.getRole(),
            message.getContent(),
            message.getReasoningContent(),
            readSources(message.getSourcesJson()),
            message.getSelectedKbId(),
            message.getSelectedKbName(),
            message.getCreatedAt()
        );
    }

    private String writeSources(List<RagSourceDto> sources) {
        try {
            return objectMapper.writeValueAsString(sources == null ? List.of() : sources);
        } catch (Exception ex) {
            throw new BusinessException(50000, "failed to serialize knowledge chat sources", ex);
        }
    }

    private List<RagSourceDto> readSources(String sourcesJson) {
        if (sourcesJson == null || sourcesJson.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(sourcesJson, SOURCE_LIST_TYPE);
        } catch (Exception ex) {
            log.warn("Failed to parse persisted knowledge chat sources", ex);
            return List.of();
        }
    }

    private String abbreviateTitle(String question) {
        String title = question == null ? "新对话" : question.strip();
        return title.length() <= MAX_TITLE_LENGTH ? title : title.substring(0, MAX_TITLE_LENGTH);
    }
}
