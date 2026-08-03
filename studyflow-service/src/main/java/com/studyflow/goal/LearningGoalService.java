package com.studyflow.goal;

import com.studyflow.common.BusinessException;
import com.studyflow.common.StudyFlowConstants;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Learning goal use cases (list / current / upsert / activate).
 */
@Service
public class LearningGoalService {

    private static final int NOT_FOUND_CODE = 40_404;
    private static final int BAD_REQUEST_CODE = 40_000;
    private static final int MAX_TITLE_LENGTH = 200;

    private final LearningGoalRepository repository;

    public LearningGoalService(LearningGoalRepository repository) {
        this.repository = repository;
    }

    public LearningGoalPage list(String userId, int page, int pageSize) {
        String uid = normalizeUserId(userId);
        int safePage = Math.max(page, 0);
        int safeSize = clampPageSize(pageSize);
        long total = repository.countByUserId(uid);
        int offset = safePage * safeSize;
        List<LearningGoal> items = repository.findByUserId(uid, safeSize, offset);
        return new LearningGoalPage(items, total, safePage, safeSize);
    }

    public LearningGoal get(String userId, String id) {
        return repository.findByIdAndUserId(id, normalizeUserId(userId))
                .orElseThrow(() -> new BusinessException(NOT_FOUND_CODE, "goal not found"));
    }

    public LearningGoal getCurrent(String userId) {
        return repository.findCurrentByUserId(normalizeUserId(userId)).orElse(null);
    }

    @Transactional
    public LearningGoal create(String userId, LearningGoalUpsertRequest request) {
        String uid = normalizeUserId(userId);
        NormalizedPayload payload = normalizePayload(request);
        OffsetDateTime now = OffsetDateTime.now();
        boolean setCurrent = Boolean.TRUE.equals(request.setCurrent());
        if (setCurrent) {
            repository.clearCurrentFlag(uid, now);
        }
        LearningGoal goal = new LearningGoal(
                UUID.randomUUID().toString(),
                uid,
                payload.title(),
                payload.kbId(),
                payload.sourceKind().toValue(),
                payload.knowledgePointId(),
                payload.resourceItemId(),
                payload.resourceExcerptId(),
                payload.snapshotJson(),
                setCurrent,
                now,
                now
        );
        repository.insert(goal);
        return goal;
    }

    @Transactional
    public LearningGoal update(String userId, String id, LearningGoalUpsertRequest request) {
        String uid = normalizeUserId(userId);
        LearningGoal existing = get(uid, id);
        NormalizedPayload payload = normalizePayload(request);
        OffsetDateTime now = OffsetDateTime.now();
        boolean setCurrent = Boolean.TRUE.equals(request.setCurrent());
        boolean currentFlag = setCurrent || Boolean.TRUE.equals(existing.currentFlag());
        if (setCurrent) {
            repository.clearCurrentFlag(uid, now);
            currentFlag = true;
        }
        LearningGoal updated = new LearningGoal(
                existing.id(),
                uid,
                payload.title(),
                payload.kbId(),
                payload.sourceKind().toValue(),
                payload.knowledgePointId(),
                payload.resourceItemId(),
                payload.resourceExcerptId(),
                payload.snapshotJson(),
                currentFlag,
                existing.createdAt(),
                now
        );
        if (!repository.update(updated)) {
            throw new BusinessException(NOT_FOUND_CODE, "goal not found");
        }
        return get(uid, id);
    }

    @Transactional
    public LearningGoal setCurrent(String userId, String id) {
        String uid = normalizeUserId(userId);
        get(uid, id);
        OffsetDateTime now = OffsetDateTime.now();
        repository.clearCurrentFlag(uid, now);
        if (!repository.setCurrentFlag(id, uid, now)) {
            throw new BusinessException(NOT_FOUND_CODE, "goal not found");
        }
        return get(uid, id);
    }

    @Transactional
    public void clearCurrent(String userId) {
        repository.clearCurrentFlag(normalizeUserId(userId), OffsetDateTime.now());
    }

    public void delete(String userId, String id) {
        boolean ok = repository.deleteByIdAndUserId(id, normalizeUserId(userId));
        if (!ok) {
            throw new BusinessException(NOT_FOUND_CODE, "goal not found");
        }
    }

    private NormalizedPayload normalizePayload(LearningGoalUpsertRequest request) {
        if (request == null || !StringUtils.hasText(request.title())) {
            throw new BusinessException(BAD_REQUEST_CODE, "title must not be blank");
        }
        String title = request.title().trim();
        if (title.length() > MAX_TITLE_LENGTH) {
            throw new BusinessException(BAD_REQUEST_CODE, "title is too long");
        }
        LearningGoalSourceKind kind = LearningGoalSourceKind.fromValue(request.sourceKind());
        String kbId = blankToNull(request.kbId());
        String knowledgePointId = blankToNull(request.knowledgePointId());
        String resourceItemId = blankToNull(request.resourceItemId());
        String resourceExcerptId = blankToNull(request.resourceExcerptId());
        String snapshotJson = blankToNull(request.snapshotJson());

        if (kind == LearningGoalSourceKind.KNOWLEDGE_POINT && knowledgePointId == null) {
            throw new BusinessException(BAD_REQUEST_CODE, "knowledgePointId is required for knowledge_point goals");
        }
        if (kind == LearningGoalSourceKind.RESOURCE_ITEM && resourceItemId == null) {
            throw new BusinessException(BAD_REQUEST_CODE, "resourceItemId is required for resource_item goals");
        }
        if (kind == LearningGoalSourceKind.RESOURCE_EXCERPT) {
            if (resourceItemId == null || resourceExcerptId == null) {
                throw new BusinessException(
                        BAD_REQUEST_CODE,
                        "resourceItemId and resourceExcerptId are required for resource_excerpt goals"
                );
            }
        }
        return new NormalizedPayload(
                title,
                kbId,
                kind,
                knowledgePointId,
                resourceItemId,
                resourceExcerptId,
                snapshotJson
        );
    }

    private static String blankToNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
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
            String kbId,
            LearningGoalSourceKind sourceKind,
            String knowledgePointId,
            String resourceItemId,
            String resourceExcerptId,
            String snapshotJson
    ) {
    }
}
