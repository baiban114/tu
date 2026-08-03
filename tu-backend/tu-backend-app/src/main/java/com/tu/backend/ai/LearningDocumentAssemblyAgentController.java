package com.tu.backend.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tu.backend.ai.dto.AssembleLearningDocumentRequest;
import com.tu.backend.ai.dto.LearningDocumentAssemblyPlanDto;
import com.tu.backend.common.ApiResponse;
import com.tu.backend.common.BusinessException;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/ai/learning-document")
public class LearningDocumentAssemblyAgentController {

    private static final Logger log = LoggerFactory.getLogger(LearningDocumentAssemblyAgentController.class);

    private final LearningDocumentAssemblyAgentService service;
    private final ObjectMapper objectMapper;

    public LearningDocumentAssemblyAgentController(
        LearningDocumentAssemblyAgentService service,
        ObjectMapper objectMapper
    ) {
        this.service = service;
        this.objectMapper = objectMapper;
    }

    @PostMapping("/assemble")
    public ApiResponse<LearningDocumentAssemblyPlanDto> assemble(
        @Valid @RequestBody AssembleLearningDocumentRequest request
    ) {
        return ApiResponse.success(service.assemble(request));
    }

    @PostMapping(value = "/assemble/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter assembleStream(@Valid @RequestBody AssembleLearningDocumentRequest request) {
        SseEmitter emitter = new SseEmitter(0L);
        SseAiAgentProgressListener listener = new SseAiAgentProgressListener(objectMapper, emitter);
        Thread.startVirtualThread(() -> {
            try {
                service.assemble(request, listener);
                emitter.complete();
            } catch (BusinessException ex) {
                if (ex.getCode() != 50326) {
                    log.warn("learning document assembly stream failed: {}", ex.getMessage());
                }
                try {
                    emitter.complete();
                } catch (Exception completeEx) {
                    log.debug("failed to complete sse emitter after business error", completeEx);
                }
            } catch (Exception ex) {
                log.error("learning document assembly stream failed", ex);
                emitter.completeWithError(ex);
            }
        });
        return emitter;
    }
}
