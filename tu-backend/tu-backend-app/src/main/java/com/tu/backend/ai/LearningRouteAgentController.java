package com.tu.backend.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tu.backend.ai.dto.GenerateLearningRouteRequest;
import com.tu.backend.ai.dto.LearningRoutePlanDto;
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
@RequestMapping("/api/ai/learning-route")
public class LearningRouteAgentController {

    private static final Logger log = LoggerFactory.getLogger(LearningRouteAgentController.class);

    private final LearningRouteAgentService service;
    private final ObjectMapper objectMapper;

    public LearningRouteAgentController(LearningRouteAgentService service, ObjectMapper objectMapper) {
        this.service = service;
        this.objectMapper = objectMapper;
    }

    @PostMapping("/generate")
    public ApiResponse<LearningRoutePlanDto> generate(@Valid @RequestBody GenerateLearningRouteRequest request) {
        return ApiResponse.success(service.generate(request));
    }

    @PostMapping(value = "/generate/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter generateStream(@Valid @RequestBody GenerateLearningRouteRequest request) {
        SseEmitter emitter = new SseEmitter(0L);
        SseAiAgentProgressListener listener = new SseAiAgentProgressListener(objectMapper, emitter);
        Thread.startVirtualThread(() -> {
            try {
                service.generate(request, listener);
                emitter.complete();
            } catch (BusinessException ex) {
                if (ex.getCode() != 50326) {
                    log.warn("learning route stream failed: {}", ex.getMessage());
                }
                try {
                    emitter.complete();
                } catch (Exception completeEx) {
                    log.debug("failed to complete sse emitter after business error", completeEx);
                }
            } catch (Exception ex) {
                log.error("learning route stream failed", ex);
                emitter.completeWithError(ex);
            }
        });
        return emitter;
    }
}
