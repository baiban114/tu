package com.studyflow.mastery;

import com.studyflow.common.ApiResponse;
import com.studyflow.common.StudyFlowConstants;
import jakarta.validation.Valid;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST API for knowledge-point mastery (StudyFlow learner state).
 */
@RestController
@RequestMapping("/api/learning/mastery")
public class KnowledgePointMasteryController {

    private final KnowledgePointMasteryService masteryService;

    public KnowledgePointMasteryController(KnowledgePointMasteryService masteryService) {
        this.masteryService = masteryService;
    }

    @GetMapping
    public ApiResponse<KnowledgePointMasteryPage> list(
            @RequestHeader(value = StudyFlowConstants.USER_ID_HEADER, required = false) String userId,
            @RequestParam(required = false) String kbId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int pageSize
    ) {
        return ApiResponse.ok(masteryService.list(resolveUserId(userId), kbId, page, pageSize));
    }

    @PutMapping
    public ApiResponse<KnowledgePointMastery> upsert(
            @RequestHeader(value = StudyFlowConstants.USER_ID_HEADER, required = false) String userId,
            @Valid @RequestBody MasteryUpsertRequest request
    ) {
        return ApiResponse.ok(masteryService.upsert(resolveUserId(userId), request));
    }

    @PostMapping("/projection")
    public ApiResponse<MasteryProjection> project(
            @RequestHeader(value = StudyFlowConstants.USER_ID_HEADER, required = false) String userId,
            @Valid @RequestBody MasteryProjectionRequest request
    ) {
        return ApiResponse.ok(masteryService.project(resolveUserId(userId), request));
    }

    @DeleteMapping("/{knowledgePointId}")
    public ApiResponse<Void> delete(
            @RequestHeader(value = StudyFlowConstants.USER_ID_HEADER, required = false) String userId,
            @PathVariable String knowledgePointId
    ) {
        masteryService.delete(resolveUserId(userId), knowledgePointId);
        return ApiResponse.ok(null);
    }

    private static String resolveUserId(String headerValue) {
        if (!StringUtils.hasText(headerValue)) {
            return StudyFlowConstants.DEFAULT_USER_ID;
        }
        return headerValue.trim();
    }
}
