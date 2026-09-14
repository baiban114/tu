package com.studyflow.milestone;

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
 * REST API for milestones nested under a learning goal.
 */
@RestController
@RequestMapping("/api/learning/goals/{goalId}/milestones")
public class GoalMilestoneController {

    private final GoalMilestoneService milestoneService;

    public GoalMilestoneController(GoalMilestoneService milestoneService) {
        this.milestoneService = milestoneService;
    }

    @GetMapping
    public ApiResponse<GoalMilestonePage> list(
            @RequestHeader(value = StudyFlowConstants.USER_ID_HEADER, required = false) String userId,
            @PathVariable String goalId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int pageSize
    ) {
        return ApiResponse.ok(milestoneService.list(resolveUserId(userId), goalId, page, pageSize));
    }

    @PostMapping
    public ApiResponse<GoalMilestone> create(
            @RequestHeader(value = StudyFlowConstants.USER_ID_HEADER, required = false) String userId,
            @PathVariable String goalId,
            @Valid @RequestBody GoalMilestoneUpsertRequest request
    ) {
        return ApiResponse.ok(milestoneService.create(resolveUserId(userId), goalId, request));
    }

    @PutMapping("/{milestoneId}")
    public ApiResponse<GoalMilestone> update(
            @RequestHeader(value = StudyFlowConstants.USER_ID_HEADER, required = false) String userId,
            @PathVariable String goalId,
            @PathVariable String milestoneId,
            @Valid @RequestBody GoalMilestoneUpsertRequest request
    ) {
        return ApiResponse.ok(milestoneService.update(
                resolveUserId(userId),
                goalId,
                milestoneId,
                request
        ));
    }

    @DeleteMapping("/{milestoneId}")
    public ApiResponse<Void> delete(
            @RequestHeader(value = StudyFlowConstants.USER_ID_HEADER, required = false) String userId,
            @PathVariable String goalId,
            @PathVariable String milestoneId
    ) {
        milestoneService.delete(resolveUserId(userId), goalId, milestoneId);
        return ApiResponse.ok(null);
    }

    private static String resolveUserId(String headerValue) {
        if (!StringUtils.hasText(headerValue)) {
            return StudyFlowConstants.DEFAULT_USER_ID;
        }
        return headerValue.trim();
    }
}
