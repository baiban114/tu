package com.studyflow.plan;

import com.studyflow.common.ApiResponse;
import com.studyflow.common.StudyFlowConstants;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
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

import java.time.LocalDate;
import java.util.List;

/**
 * REST API for calendar-based daily plans.
 */
@RestController
@RequestMapping("/api/learning/daily-plans")
public class DailyPlanController {

    private final DailyPlanService dailyPlanService;

    public DailyPlanController(DailyPlanService dailyPlanService) {
        this.dailyPlanService = dailyPlanService;
    }

    @GetMapping
    public ApiResponse<DailyPlanPage> list(
            @RequestHeader(value = StudyFlowConstants.USER_ID_HEADER, required = false) String userId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int pageSize
    ) {
        return ApiResponse.ok(dailyPlanService.list(resolveUserId(userId), date, page, pageSize));
    }

    @GetMapping("/calendar")
    public ApiResponse<List<DailyPlanDaySummary>> summarize(
            @RequestHeader(value = StudyFlowConstants.USER_ID_HEADER, required = false) String userId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate
    ) {
        return ApiResponse.ok(dailyPlanService.summarize(resolveUserId(userId), startDate, endDate));
    }

    @PostMapping
    public ApiResponse<DailyPlan> create(
            @RequestHeader(value = StudyFlowConstants.USER_ID_HEADER, required = false) String userId,
            @Valid @RequestBody DailyPlanUpsertRequest request
    ) {
        return ApiResponse.ok(dailyPlanService.create(resolveUserId(userId), request));
    }

    @PutMapping("/{id}")
    public ApiResponse<DailyPlan> update(
            @RequestHeader(value = StudyFlowConstants.USER_ID_HEADER, required = false) String userId,
            @PathVariable String id,
            @Valid @RequestBody DailyPlanUpsertRequest request
    ) {
        return ApiResponse.ok(dailyPlanService.update(resolveUserId(userId), id, request));
    }

    @PutMapping("/{id}/series")
    public ApiResponse<DailyPlanSeriesUpdateResult> updateSeries(
            @RequestHeader(value = StudyFlowConstants.USER_ID_HEADER, required = false) String userId,
            @PathVariable String id,
            @Valid @RequestBody DailyPlanSeriesUpdateRequest request
    ) {
        return ApiResponse.ok(dailyPlanService.updateSeries(resolveUserId(userId), id, request));
    }

    @PostMapping("/{id}/repeat")
    public ApiResponse<DailyPlanRepeatResult> repeat(
            @RequestHeader(value = StudyFlowConstants.USER_ID_HEADER, required = false) String userId,
            @PathVariable String id,
            @Valid @RequestBody DailyPlanRepeatRequest request
    ) {
        return ApiResponse.ok(dailyPlanService.repeat(resolveUserId(userId), id, request));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(
            @RequestHeader(value = StudyFlowConstants.USER_ID_HEADER, required = false) String userId,
            @PathVariable String id
    ) {
        dailyPlanService.delete(resolveUserId(userId), id);
        return ApiResponse.ok(null);
    }

    private static String resolveUserId(String headerValue) {
        if (!StringUtils.hasText(headerValue)) {
            return StudyFlowConstants.DEFAULT_USER_ID;
        }
        return headerValue.trim();
    }
}
