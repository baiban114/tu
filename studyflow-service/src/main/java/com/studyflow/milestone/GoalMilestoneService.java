package com.studyflow.milestone;

import com.studyflow.common.BusinessException;
import com.studyflow.common.StudyFlowConstants;
import com.studyflow.goal.LearningGoalRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Goal milestone use cases.
 */
@Service
public class GoalMilestoneService {

    private static final int NOT_FOUND_CODE = 40_404;
    private static final int BAD_REQUEST_CODE = 40_000;
    private static final int MAX_TITLE_LENGTH = 200;
    private static final int MAX_SORT_ORDER = 100_000;

    private final GoalMilestoneRepository milestoneRepository;
    private final LearningGoalRepository goalRepository;

    public GoalMilestoneService(
            GoalMilestoneRepository milestoneRepository,
            LearningGoalRepository goalRepository
    ) {
        this.milestoneRepository = milestoneRepository;
        this.goalRepository = goalRepository;
    }

    public GoalMilestonePage list(String userId, String goalId, int page, int pageSize) {
        String uid = normalizeUserId(userId);
        requireGoal(uid, goalId);
        int safePage = Math.max(page, 0);
        int safeSize = clampPageSize(pageSize);
        long total = milestoneRepository.countByGoalIdAndUserId(goalId, uid);
        int offset = safePage * safeSize;
        List<GoalMilestone> items = milestoneRepository.findByGoalIdAndUserId(
                goalId,
                uid,
                safeSize,
                offset
        );
        return new GoalMilestonePage(items, total, safePage, safeSize);
    }

    @Transactional
    public GoalMilestone create(String userId, String goalId, GoalMilestoneUpsertRequest request) {
        String uid = normalizeUserId(userId);
        requireGoal(uid, goalId);
        int defaultSortOrder = milestoneRepository.nextSortOrder(goalId, uid);
        NormalizedPayload payload = normalizePayload(request, defaultSortOrder);
        OffsetDateTime now = OffsetDateTime.now();
        GoalMilestone milestone = new GoalMilestone(
                UUID.randomUUID().toString(),
                goalId,
                uid,
                payload.title(),
                payload.deadline(),
                payload.completed(),
                payload.sortOrder(),
                now,
                now
        );
        milestoneRepository.insert(milestone);
        return milestone;
    }

    public GoalMilestone update(
            String userId,
            String goalId,
            String milestoneId,
            GoalMilestoneUpsertRequest request
    ) {
        String uid = normalizeUserId(userId);
        requireGoal(uid, goalId);
        GoalMilestone existing = get(uid, goalId, milestoneId);
        NormalizedPayload payload = normalizePayload(request, existing.sortOrder());
        GoalMilestone updated = new GoalMilestone(
                existing.id(),
                existing.goalId(),
                existing.userId(),
                payload.title(),
                payload.deadline(),
                payload.completed(),
                payload.sortOrder(),
                existing.createdAt(),
                OffsetDateTime.now()
        );
        if (!milestoneRepository.update(updated)) {
            throw new BusinessException(NOT_FOUND_CODE, "milestone not found");
        }
        return get(uid, goalId, milestoneId);
    }

    public void delete(String userId, String goalId, String milestoneId) {
        String uid = normalizeUserId(userId);
        requireGoal(uid, goalId);
        if (!milestoneRepository.deleteByIdAndGoalIdAndUserId(milestoneId, goalId, uid)) {
            throw new BusinessException(NOT_FOUND_CODE, "milestone not found");
        }
    }

    private GoalMilestone get(String userId, String goalId, String milestoneId) {
        return milestoneRepository.findByIdAndGoalIdAndUserId(milestoneId, goalId, userId)
                .orElseThrow(() -> new BusinessException(NOT_FOUND_CODE, "milestone not found"));
    }

    private void requireGoal(String userId, String goalId) {
        if (!StringUtils.hasText(goalId)
                || goalRepository.findByIdAndUserId(goalId, userId).isEmpty()) {
            throw new BusinessException(NOT_FOUND_CODE, "goal not found");
        }
    }

    private NormalizedPayload normalizePayload(GoalMilestoneUpsertRequest request, int defaultSortOrder) {
        if (request == null || !StringUtils.hasText(request.title())) {
            throw new BusinessException(BAD_REQUEST_CODE, "milestone title must not be blank");
        }
        String title = request.title().trim();
        if (title.length() > MAX_TITLE_LENGTH) {
            throw new BusinessException(BAD_REQUEST_CODE, "milestone title is too long");
        }
        int sortOrder = request.sortOrder() == null ? defaultSortOrder : request.sortOrder();
        if (sortOrder < 1 || sortOrder > MAX_SORT_ORDER) {
            throw new BusinessException(BAD_REQUEST_CODE, "milestone sortOrder is invalid");
        }
        return new NormalizedPayload(
                title,
                request.deadline(),
                Boolean.TRUE.equals(request.completed()),
                sortOrder
        );
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

    private record NormalizedPayload(
            String title,
            LocalDate deadline,
            Boolean completed,
            Integer sortOrder
    ) {
    }
}
