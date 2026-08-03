package com.studyflow.goal;

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
 * REST API for StudyFlow learning goals (shared with tu).
 */
@RestController
@RequestMapping("/api/learning/goals")
public class LearningGoalController {

    private final LearningGoalService learningGoalService;

    public LearningGoalController(LearningGoalService learningGoalService) {
        this.learningGoalService = learningGoalService;
    }

    @GetMapping
    public ApiResponse<LearningGoalPage> list(
            @RequestHeader(value = StudyFlowConstants.USER_ID_HEADER, required = false) String userId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int pageSize
    ) {
        return ApiResponse.ok(learningGoalService.list(resolveUserId(userId), page, pageSize));
    }

    @GetMapping("/current")
    public ApiResponse<LearningGoal> getCurrent(
            @RequestHeader(value = StudyFlowConstants.USER_ID_HEADER, required = false) String userId
    ) {
        return ApiResponse.ok(learningGoalService.getCurrent(resolveUserId(userId)));
    }

    @GetMapping("/{id}")
    public ApiResponse<LearningGoal> get(
            @RequestHeader(value = StudyFlowConstants.USER_ID_HEADER, required = false) String userId,
            @PathVariable String id
    ) {
        return ApiResponse.ok(learningGoalService.get(resolveUserId(userId), id));
    }

    @PostMapping
    public ApiResponse<LearningGoal> create(
            @RequestHeader(value = StudyFlowConstants.USER_ID_HEADER, required = false) String userId,
            @Valid @RequestBody LearningGoalUpsertRequest request
    ) {
        return ApiResponse.ok(learningGoalService.create(resolveUserId(userId), request));
    }

    @PutMapping("/{id}")
    public ApiResponse<LearningGoal> update(
            @RequestHeader(value = StudyFlowConstants.USER_ID_HEADER, required = false) String userId,
            @PathVariable String id,
            @Valid @RequestBody LearningGoalUpsertRequest request
    ) {
        return ApiResponse.ok(learningGoalService.update(resolveUserId(userId), id, request));
    }

    @PutMapping("/{id}/current")
    public ApiResponse<LearningGoal> setCurrent(
            @RequestHeader(value = StudyFlowConstants.USER_ID_HEADER, required = false) String userId,
            @PathVariable String id
    ) {
        return ApiResponse.ok(learningGoalService.setCurrent(resolveUserId(userId), id));
    }

    @DeleteMapping("/current")
    public ApiResponse<Void> clearCurrent(
            @RequestHeader(value = StudyFlowConstants.USER_ID_HEADER, required = false) String userId
    ) {
        learningGoalService.clearCurrent(resolveUserId(userId));
        return ApiResponse.ok(null);
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(
            @RequestHeader(value = StudyFlowConstants.USER_ID_HEADER, required = false) String userId,
            @PathVariable String id
    ) {
        learningGoalService.delete(resolveUserId(userId), id);
        return ApiResponse.ok(null);
    }

    private static String resolveUserId(String headerValue) {
        if (!StringUtils.hasText(headerValue)) {
            return StudyFlowConstants.DEFAULT_USER_ID;
        }
        return headerValue.trim();
    }
}
