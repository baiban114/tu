package com.studyflow.term;

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
 * REST API for measurable task terms nested under a learning goal.
 */
@RestController
@RequestMapping("/api/learning/goals/{goalId}/task-terms")
public class GoalTaskTermController {

    private final GoalTaskTermService termService;

    public GoalTaskTermController(GoalTaskTermService termService) {
        this.termService = termService;
    }

    @GetMapping
    public ApiResponse<GoalTaskTermPage> list(
            @RequestHeader(value = StudyFlowConstants.USER_ID_HEADER, required = false) String userId,
            @PathVariable String goalId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int pageSize
    ) {
        return ApiResponse.ok(termService.list(resolveUserId(userId), goalId, page, pageSize));
    }

    @PostMapping
    public ApiResponse<GoalTaskTerm> create(
            @RequestHeader(value = StudyFlowConstants.USER_ID_HEADER, required = false) String userId,
            @PathVariable String goalId,
            @Valid @RequestBody GoalTaskTermUpsertRequest request
    ) {
        return ApiResponse.ok(termService.create(resolveUserId(userId), goalId, request));
    }

    @PutMapping("/{termId}")
    public ApiResponse<GoalTaskTerm> update(
            @RequestHeader(value = StudyFlowConstants.USER_ID_HEADER, required = false) String userId,
            @PathVariable String goalId,
            @PathVariable String termId,
            @Valid @RequestBody GoalTaskTermUpsertRequest request
    ) {
        return ApiResponse.ok(termService.update(resolveUserId(userId), goalId, termId, request));
    }

    @PostMapping("/{termId}/distribute")
    public ApiResponse<GoalTaskTermDistributionResult> distribute(
            @RequestHeader(value = StudyFlowConstants.USER_ID_HEADER, required = false) String userId,
            @PathVariable String goalId,
            @PathVariable String termId,
            @Valid @RequestBody GoalTaskTermDistributionRequest request
    ) {
        return ApiResponse.ok(termService.distribute(resolveUserId(userId), goalId, termId, request));
    }

    @DeleteMapping("/{termId}")
    public ApiResponse<Void> delete(
            @RequestHeader(value = StudyFlowConstants.USER_ID_HEADER, required = false) String userId,
            @PathVariable String goalId,
            @PathVariable String termId
    ) {
        termService.delete(resolveUserId(userId), goalId, termId);
        return ApiResponse.ok(null);
    }

    private static String resolveUserId(String headerValue) {
        if (!StringUtils.hasText(headerValue)) {
            return StudyFlowConstants.DEFAULT_USER_ID;
        }
        return headerValue.trim();
    }
}
