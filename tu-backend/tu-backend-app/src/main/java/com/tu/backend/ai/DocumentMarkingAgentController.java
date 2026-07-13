package com.tu.backend.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tu.backend.ai.dto.AnalyzeDocumentMarkingRequest;
import com.tu.backend.ai.dto.DocumentMarkingResponseDto;
import com.tu.backend.common.BusinessException;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import com.tu.backend.knowledgerelation.service.KnowledgeRelationService;
import com.tu.backend.page.entity.PageEntity;
import com.tu.backend.page.repository.PageRepository;

@RestController
@RequestMapping("/api/ai/document-marking")
public class DocumentMarkingAgentController {

    private static final Logger log = LoggerFactory.getLogger(DocumentMarkingAgentController.class);

    private final DocumentMarkingAgentService service;
    private final ObjectMapper objectMapper;
    private final KnowledgeRelationService knowledgeRelationService;
    private final PageRepository pageRepository;

    public DocumentMarkingAgentController(
        DocumentMarkingAgentService service,
        ObjectMapper objectMapper,
        KnowledgeRelationService knowledgeRelationService,
        PageRepository pageRepository
    ) {
        this.service = service;
        this.objectMapper = objectMapper;
        this.knowledgeRelationService = knowledgeRelationService;
        this.pageRepository = pageRepository;
    }

    @PostMapping("/analyze")
    public com.tu.backend.common.ApiResponse<DocumentMarkingResponseDto> analyze(
        @Valid @RequestBody AnalyzeDocumentMarkingRequest request
    ) {
        return com.tu.backend.common.ApiResponse.success(service.analyze(request));
    }

    @PostMapping(value = "/analyze/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter analyzeStream(@Valid @RequestBody AnalyzeDocumentMarkingRequest request) {
        SseEmitter emitter = new SseEmitter(0L);
        SseAiAgentProgressListener listener = new SseAiAgentProgressListener(objectMapper, emitter);
        Thread.startVirtualThread(() -> {
            try {
                service.analyze(request, listener);
                emitter.complete();
            } catch (BusinessException ex) {
                if (ex.getCode() != 50326) {
                    log.warn("document marking stream failed: {}", ex.getMessage());
                }
                try {
                    emitter.complete();
                } catch (Exception completeEx) {
                    log.debug("failed to complete sse emitter after business error", completeEx);
                }
            } catch (Exception ex) {
                log.error("document marking stream failed", ex);
                emitter.completeWithError(ex);
            }
        });
        return emitter;
    }

    @DeleteMapping("/pages/{pageId}/ai-markers")
    public com.tu.backend.common.ApiResponse<Void> clearAiMarkers(@PathVariable String pageId) {
        PageEntity page = pageRepository.findById(pageId)
            .orElseThrow(() -> new BusinessException(40001, "page not found"));
        knowledgeRelationService.deleteAiForPage(page.getKbId(), pageId);
        return com.tu.backend.common.ApiResponse.success(null);
    }
}
