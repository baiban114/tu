package com.studyflow.term;

import com.studyflow.common.BusinessException;
import com.studyflow.common.StudyFlowConstants;
import com.studyflow.goal.LearningGoal;
import com.studyflow.goal.LearningGoalRepository;
import com.studyflow.plan.DailyPlan;
import com.studyflow.plan.DailyPlanRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Measurable task term use cases, including automatic daily distribution.
 */
@Service
public class GoalTaskTermService {

    private static final int NOT_FOUND_CODE = 40_404;
    private static final int BAD_REQUEST_CODE = 40_000;
    private static final int MAX_TITLE_LENGTH = 200;
    private static final int MAX_DISTRIBUTION_DAYS = 366;
    private static final int AMOUNT_SCALE = 2;

    private final GoalTaskTermRepository termRepository;
    private final LearningGoalRepository goalRepository;
    private final DailyPlanRepository planRepository;

    public GoalTaskTermService(
            GoalTaskTermRepository termRepository,
            LearningGoalRepository goalRepository,
            DailyPlanRepository planRepository
    ) {
        this.termRepository = termRepository;
        this.goalRepository = goalRepository;
        this.planRepository = planRepository;
    }

    public GoalTaskTermPage list(String userId, String goalId, int page, int pageSize) {
        String uid = normalizeUserId(userId);
        requireGoal(uid, goalId);
        int safePage = Math.max(page, 0);
        int safeSize = clampPageSize(pageSize);
        long total = termRepository.countByGoalIdAndUserId(goalId, uid);
        int offset = safePage * safeSize;
        List<GoalTaskTerm> items = termRepository.findByGoalIdAndUserId(goalId, uid, safeSize, offset);
        return new GoalTaskTermPage(items, total, safePage, safeSize);
    }

    @Transactional
    public GoalTaskTerm create(String userId, String goalId, GoalTaskTermUpsertRequest request) {
        String uid = normalizeUserId(userId);
        requireGoal(uid, goalId);
        NormalizedPayload payload = normalizePayload(request);
        OffsetDateTime now = OffsetDateTime.now();
        GoalTaskTerm term = new GoalTaskTerm(
                UUID.randomUUID().toString(),
                goalId,
                uid,
                payload.title(),
                payload.totalAmount(),
                null,
                null,
                null,
                now,
                now
        );
        termRepository.insert(term);
        return term;
    }

    public GoalTaskTerm update(
            String userId,
            String goalId,
            String termId,
            GoalTaskTermUpsertRequest request
    ) {
        String uid = normalizeUserId(userId);
        requireGoal(uid, goalId);
        GoalTaskTerm existing = get(uid, goalId, termId);
        NormalizedPayload payload = normalizePayload(request);
        GoalTaskTerm updated = new GoalTaskTerm(
                existing.id(),
                existing.goalId(),
                existing.userId(),
                payload.title(),
                payload.totalAmount(),
                existing.distributionStartDate(),
                existing.distributionEndDate(),
                existing.distributedAt(),
                existing.createdAt(),
                OffsetDateTime.now()
        );
        if (!termRepository.update(updated)) {
            throw new BusinessException(NOT_FOUND_CODE, "task term not found");
        }
        return get(uid, goalId, termId);
    }

    @Transactional
    public void delete(String userId, String goalId, String termId) {
        String uid = normalizeUserId(userId);
        requireGoal(uid, goalId);
        get(uid, goalId, termId);
        planRepository.deleteIncompleteByGoalTermIdAndUserId(termId, uid);
        if (!termRepository.deleteByIdAndGoalIdAndUserId(termId, goalId, uid)) {
            throw new BusinessException(NOT_FOUND_CODE, "task term not found");
        }
    }

    @Transactional
    public GoalTaskTermDistributionResult distribute(
            String userId,
            String goalId,
            String termId,
            GoalTaskTermDistributionRequest request
    ) {
        String uid = normalizeUserId(userId);
        LearningGoal goal = requireGoal(uid, goalId);
        GoalTaskTerm term = get(uid, goalId, termId);
        if (request == null || request.startDate() == null || request.endDate() == null) {
            throw new BusinessException(BAD_REQUEST_CODE, "distribution start date and end date are required");
        }
        LocalDate startDate = request.startDate();
        LocalDate endDate = request.endDate();
        if (endDate.isBefore(startDate)) {
            throw new BusinessException(BAD_REQUEST_CODE, "distribution end date must not be before start date");
        }
        long dayCountValue = ChronoUnit.DAYS.between(startDate, endDate) + 1L;
        if (dayCountValue > MAX_DISTRIBUTION_DAYS) {
            throw new BusinessException(BAD_REQUEST_CODE, "distribution must not exceed 366 days");
        }
        int dayCount = Math.toIntExact(dayCountValue);
        List<BigDecimal> dailyAmounts = allocateDailyAmounts(term.totalAmount(), dayCount);
        List<DailyPlan> existingPlans = planRepository.findByGoalTermIdAndUserId(termId, uid);
        Map<LocalDate, DailyPlan> existingByDate = new HashMap<>(existingPlans.size());
        existingPlans.forEach(plan -> existingByDate.put(plan.planDate(), plan));
        Set<LocalDate> desiredDates = new HashSet<>(dayCount);
        OffsetDateTime now = OffsetDateTime.now();
        int createdCount = 0;
        int updatedCount = 0;

        for (int dayIndex = 0; dayIndex < dayCount; dayIndex++) {
            LocalDate planDate = startDate.plusDays(dayIndex);
            desiredDates.add(planDate);
            BigDecimal plannedAmount = dailyAmounts.get(dayIndex);
            DailyPlan existingPlan = existingByDate.get(planDate);
            if (existingPlan == null) {
                planRepository.insert(new DailyPlan(
                        UUID.randomUUID().toString(),
                        uid,
                        goal.id(),
                        goal.title(),
                        goal.deadline(),
                        term.id(),
                        plannedAmount,
                        dayIndex + 1,
                        dayCount,
                        null,
                        term.title(),
                        planDate,
                        Boolean.FALSE,
                        now,
                        now
                ));
                createdCount++;
            } else {
                if (!planRepository.updateDistributedPlan(
                        existingPlan,
                        term.title(),
                        plannedAmount,
                        dayIndex + 1,
                        dayCount,
                        now
                )) {
                    throw new BusinessException(NOT_FOUND_CODE, "distributed daily plan not found");
                }
                updatedCount++;
            }
        }

        int removedCount = 0;
        for (DailyPlan existingPlan : existingPlans) {
            if (!desiredDates.contains(existingPlan.planDate())
                    && !Boolean.TRUE.equals(existingPlan.completed())
                    && planRepository.deleteByIdAndUserId(existingPlan.id(), uid)) {
                removedCount++;
            }
        }
        if (!termRepository.markDistributed(term.id(), goal.id(), uid, startDate, endDate, now)) {
            throw new BusinessException(NOT_FOUND_CODE, "task term not found");
        }
        return new GoalTaskTermDistributionResult(
                startDate,
                endDate,
                dayCount,
                createdCount,
                updatedCount,
                removedCount
        );
    }

    static List<BigDecimal> allocateDailyAmounts(BigDecimal totalAmount, int dayCount) {
        if (dayCount < 1) {
            throw new IllegalArgumentException("dayCount must be positive");
        }
        long totalMinorUnits = totalAmount.setScale(AMOUNT_SCALE, RoundingMode.HALF_UP)
                .movePointRight(AMOUNT_SCALE)
                .longValueExact();
        long baseAmount = totalMinorUnits / dayCount;
        long remainder = totalMinorUnits % dayCount;
        List<BigDecimal> amounts = new ArrayList<>(dayCount);
        for (int dayIndex = 0; dayIndex < dayCount; dayIndex++) {
            long minorUnits = baseAmount + (dayIndex < remainder ? 1L : 0L);
            amounts.add(BigDecimal.valueOf(minorUnits, AMOUNT_SCALE));
        }
        return amounts;
    }

    private GoalTaskTerm get(String userId, String goalId, String termId) {
        return termRepository.findByIdAndGoalIdAndUserId(termId, goalId, userId)
                .orElseThrow(() -> new BusinessException(NOT_FOUND_CODE, "task term not found"));
    }

    private LearningGoal requireGoal(String userId, String goalId) {
        if (!StringUtils.hasText(goalId)) {
            throw new BusinessException(NOT_FOUND_CODE, "goal not found");
        }
        return goalRepository.findByIdAndUserId(goalId, userId)
                .orElseThrow(() -> new BusinessException(NOT_FOUND_CODE, "goal not found"));
    }

    private NormalizedPayload normalizePayload(GoalTaskTermUpsertRequest request) {
        if (request == null || !StringUtils.hasText(request.title()) || request.totalAmount() == null) {
            throw new BusinessException(BAD_REQUEST_CODE, "task term title and totalAmount are required");
        }
        String title = request.title().trim();
        if (title.length() > MAX_TITLE_LENGTH) {
            throw new BusinessException(BAD_REQUEST_CODE, "task term title is too long");
        }
        BigDecimal totalAmount = request.totalAmount().setScale(AMOUNT_SCALE, RoundingMode.HALF_UP);
        if (totalAmount.signum() <= 0 || totalAmount.precision() - totalAmount.scale() > 10) {
            throw new BusinessException(BAD_REQUEST_CODE, "task term totalAmount is invalid");
        }
        return new NormalizedPayload(title, totalAmount);
    }

    private static String normalizeUserId(String userId) {
        if (!StringUtils.hasText(userId)) {
            return StudyFlowConstants.DEFAULT_USER_ID;
        }
        return userId.trim();
    }

    private static int clampPageSize(int pageSize) {
        if (pageSize <= 0) {
            return StudyFlowConstants.DEFAULT_PAGE_SIZE;
        }
        return Math.min(pageSize, StudyFlowConstants.MAX_PAGE_SIZE);
    }

    private record NormalizedPayload(String title, BigDecimal totalAmount) {
    }
}
