package com.studyflow.mastery;

import com.studyflow.common.BusinessException;
import com.studyflow.common.StudyFlowConstants;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Mastery upsert / list / route projection.
 */
@Service
public class KnowledgePointMasteryService {

    private static final int NOT_FOUND_CODE = 40_404;
    private static final int BAD_REQUEST_CODE = 40_000;
    private static final int MAX_PROJECTION_POINTS = 200;

    private final KnowledgePointMasteryRepository repository;

    public KnowledgePointMasteryService(KnowledgePointMasteryRepository repository) {
        this.repository = repository;
    }

    public KnowledgePointMasteryPage list(String userId, String kbId, int page, int pageSize) {
        String uid = normalizeUserId(userId);
        String kb = blankToNull(kbId);
        int safePage = Math.max(page, 0);
        int safeSize = clampPageSize(pageSize);
        long total = repository.countByUserId(uid, kb);
        List<KnowledgePointMastery> items = repository.findByUserId(uid, kb, safeSize, safePage * safeSize);
        return new KnowledgePointMasteryPage(items, total, safePage, safeSize);
    }

    @Transactional
    public KnowledgePointMastery upsert(String userId, MasteryUpsertRequest request) {
        if (request == null || !StringUtils.hasText(request.knowledgePointId())) {
            throw new BusinessException(BAD_REQUEST_CODE, "knowledgePointId must not be blank");
        }
        String uid = normalizeUserId(userId);
        String pointId = request.knowledgePointId().trim();
        MasteryStatus status = MasteryStatus.fromValue(request.status());
        String kbId = blankToNull(request.kbId());
        String note = blankToNull(request.note());
        Integer score = request.score();
        OffsetDateTime now = OffsetDateTime.now();

        return repository.findByUserAndPoint(uid, pointId)
                .map(existing -> {
                    KnowledgePointMastery updated = new KnowledgePointMastery(
                            existing.id(),
                            uid,
                            kbId != null ? kbId : existing.kbId(),
                            pointId,
                            status.toValue(),
                            score,
                            note,
                            existing.createdAt(),
                            now
                    );
                    repository.update(updated);
                    return updated;
                })
                .orElseGet(() -> {
                    KnowledgePointMastery created = new KnowledgePointMastery(
                            UUID.randomUUID().toString(),
                            uid,
                            kbId,
                            pointId,
                            status.toValue(),
                            score,
                            note,
                            now,
                            now
                    );
                    repository.insert(created);
                    return created;
                });
    }

    public void delete(String userId, String knowledgePointId) {
        if (!StringUtils.hasText(knowledgePointId)) {
            throw new BusinessException(BAD_REQUEST_CODE, "knowledgePointId must not be blank");
        }
        boolean ok = repository.deleteByUserAndPoint(normalizeUserId(userId), knowledgePointId.trim());
        if (!ok) {
            throw new BusinessException(NOT_FOUND_CODE, "mastery not found");
        }
    }

    /**
     * Return status for each ordered point (default unknown) and suggest the first non-mastered.
     */
    public MasteryProjection project(String userId, MasteryProjectionRequest request) {
        if (request == null || request.orderedPointIds() == null || request.orderedPointIds().isEmpty()) {
            throw new BusinessException(BAD_REQUEST_CODE, "orderedPointIds must not be empty");
        }
        String uid = normalizeUserId(userId);
        LinkedHashSet<String> ordered = new LinkedHashSet<>();
        for (String raw : request.orderedPointIds()) {
            if (!StringUtils.hasText(raw)) {
                continue;
            }
            ordered.add(raw.trim());
            if (ordered.size() >= MAX_PROJECTION_POINTS) {
                break;
            }
        }
        if (ordered.isEmpty()) {
            throw new BusinessException(BAD_REQUEST_CODE, "orderedPointIds must not be empty");
        }

        Map<String, KnowledgePointMastery> byPoint = new LinkedHashMap<>();
        for (KnowledgePointMastery row : repository.findByUserAndPoints(uid, ordered)) {
            byPoint.put(row.knowledgePointId(), row);
        }

        OffsetDateTime now = OffsetDateTime.now();
        List<KnowledgePointMastery> items = new ArrayList<>(ordered.size());
        String suggested = null;
        for (String pointId : ordered) {
            KnowledgePointMastery row = byPoint.get(pointId);
            if (row == null) {
                row = new KnowledgePointMastery(
                        null,
                        uid,
                        blankToNull(request.kbId()),
                        pointId,
                        MasteryStatus.UNKNOWN.toValue(),
                        null,
                        null,
                        now,
                        now
                );
            }
            items.add(row);
            if (suggested == null && !MasteryStatus.MASTERED.toValue().equals(row.status())) {
                suggested = pointId;
            }
        }
        return new MasteryProjection(List.copyOf(items), suggested);
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
}
