package com.tu.backend.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tu.backend.ai.dto.KnowledgeChatRequest;
import com.tu.backend.ai.dto.KnowledgeChatResponse;
import com.tu.backend.ai.dto.KnowledgeChatConversationDto;
import com.tu.backend.ai.dto.KnowledgeChatSessionDto;
import com.tu.backend.ai.dto.KnowledgeChatStreamEvent;
import com.tu.backend.auth.security.CurrentUserIdResolver;
import com.tu.backend.common.ApiResponse;
import com.tu.backend.common.BusinessException;
import com.tu.backend.common.PageResponse;
import jakarta.validation.Valid;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/ai/knowledge-chat")
public class KnowledgeChatController {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeChatController.class);

    private final KnowledgeChatService knowledgeChatService;
    private final ObjectMapper objectMapper;
    private final CurrentUserIdResolver currentUserIdResolver;
    private final KnowledgeChatHistoryService historyService;

    public KnowledgeChatController(
        KnowledgeChatService knowledgeChatService,
        ObjectMapper objectMapper,
        CurrentUserIdResolver currentUserIdResolver,
        KnowledgeChatHistoryService historyService
    ) {
        this.knowledgeChatService = knowledgeChatService;
        this.objectMapper = objectMapper;
        this.currentUserIdResolver = currentUserIdResolver;
        this.historyService = historyService;
    }

    @PostMapping
    public ApiResponse<KnowledgeChatResponse> ask(@Valid @RequestBody KnowledgeChatRequest request) {
        return ApiResponse.success(knowledgeChatService.ask(request, currentUserIdResolver.resolve()));
    }

    @GetMapping("/conversations")
    public ApiResponse<PageResponse<KnowledgeChatSessionDto>> listConversations(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int pageSize
    ) {
        return ApiResponse.success(historyService.listSessions(currentUserIdResolver.resolve(), page, pageSize));
    }

    @GetMapping("/conversations/{conversationId}")
    public ApiResponse<KnowledgeChatConversationDto> getConversation(@PathVariable String conversationId) {
        return ApiResponse.success(historyService.getConversation(currentUserIdResolver.resolve(), conversationId));
    }

    @PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter askStream(@Valid @RequestBody KnowledgeChatRequest request) {
        String userId = currentUserIdResolver.resolve();
        SseEmitter emitter = new SseEmitter(0L);
        AtomicBoolean cancelled = new AtomicBoolean(false);
        emitter.onCompletion(() -> cancelled.set(true));
        emitter.onTimeout(() -> cancelled.set(true));
        emitter.onError(ex -> cancelled.set(true));
        Thread.startVirtualThread(() -> {
            try {
                knowledgeChatService.askStream(request, userId, new KnowledgeChatStreamListener() {
                    @Override
                    public void onEvent(KnowledgeChatStreamEvent event) {
                        if (cancelled.get()) {
                            return;
                        }
                        try {
                            emitter.send(SseEmitter.event()
                                .name(event.phase())
                                .data(objectMapper.writeValueAsString(event)));
                        } catch (IOException | IllegalStateException ex) {
                            cancelled.set(true);
                        }
                    }

                    @Override
                    public boolean isCancelled() {
                        return cancelled.get();
                    }
                });
            } catch (BusinessException ex) {
                if (ex.getCode() != 50326 && !cancelled.get()) {
                    log.warn("knowledge chat stream failed: code={}", ex.getCode(), ex);
                    sendFailure(emitter, cancelled, ex.getMessage());
                }
            } catch (RuntimeException ex) {
                log.warn("knowledge chat stream failed", ex);
                sendFailure(emitter, cancelled, "knowledge base question answering failed");
            } finally {
                if (!cancelled.get()) {
                    emitter.complete();
                }
            }
        });
        return emitter;
    }

    private void sendFailure(SseEmitter emitter, AtomicBoolean cancelled, String message) {
        try {
            emitter.send(SseEmitter.event()
                .name("failed")
                .data(objectMapper.writeValueAsString(KnowledgeChatStreamEvent.failed(message))));
        } catch (IOException | IllegalStateException ex) {
            cancelled.set(true);
        }
    }
}
