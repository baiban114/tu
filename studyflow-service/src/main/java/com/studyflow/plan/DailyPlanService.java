package com.studyflow.plan;

import com.studyflow.common.BusinessException;
import com.studyflow.common.StudyFlowConstants;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Daily plan use cases.
 */
@Service
public class DailyPlanService {

    private static final int NOT_FOUND_CODE = 40_404;
    private static final int BAD_REQUEST_CODE = 40_000;
    private static final int MAX_TITLE_LENGTH = 240;
    private static final long MAX_CALENDAR_RANGE_DAYS = 62L;
    private static final int MAX_REPEAT_OCCURRENCES = 366;

    private final DailyPlanRepository repository;

    public DailyPlanService(DailyPlanRepository repository) {
        this.repository = repository;
    }

    public DailyPlanPage list(String userId, LocalDate planDate, int page, int pageSize) {
        if (planDate == null) {
            throw new BusinessException(BAD_REQUEST_CODE, "date is required");
        }
        String uid = normalizeUserId(userId);
        int safePage = Math.max(page, 0);
        int safeSize = clampPageSize(pageSize);
        long total = repository.countByUserIdAndDate(uid, planDate);
        int offset = safePage * safeSize;
        List<DailyPlan> items = repository.findByUserIdAndDate(uid, planDate, safeSize, offset);
        return new DailyPlanPage(items, total, safePage, safeSize);
    }

    public List<DailyPlanDaySummary> summarize(
            String userId,
            LocalDate startDate,
            LocalDate endDate
    ) {
        if (startDate == null || endDate == null || endDate.isBefore(startDate)) {
            throw new BusinessException(BAD_REQUEST_CODE, "invalid calendar date range");
        }
        long rangeDays = ChronoUnit.DAYS.between(startDate, endDate) + 1L;
        if (rangeDays > MAX_CALENDAR_RANGE_DAYS) {
            throw new BusinessException(BAD_REQUEST_CODE, "calendar date range must not exceed 62 days");
        }
        return repository.summarize(normalizeUserId(userId), startDate, endDate);
    }

    public DailyPlan create(String userId, DailyPlanUpsertRequest request) {
        String uid = normalizeUserId(userId);
        NormalizedPayload payload = normalizePayload(uid, request);
        OffsetDateTime now = OffsetDateTime.now();
        DailyPlan plan = new DailyPlan(
                UUID.randomUUID().toString(),
                uid,
                payload.goalId(),
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                payload.title(),
                payload.planDate(),
                payload.completed(),
                now,
                now
        );
        repository.insert(plan);
        return get(uid, plan.id());
    }

    public DailyPlan update(String userId, String id, DailyPlanUpsertRequest request) {
        String uid = normalizeUserId(userId);
        DailyPlan existing = get(uid, id);
        NormalizedPayload payload = normalizePayload(uid, request);
        if (existing.goalTermId() != null
                && repository.existsByGoalTermIdAndDateExcludingId(
                        existing.goalTermId(), uid, payload.planDate(),
                        existing.goalTermSequenceNumber(), existing.id()
                )) {
            throw new BusinessException(
                    BAD_REQUEST_CODE,
                    "a task-term plan already exists on the selected date"
            );
        }
        DailyPlan updated = new DailyPlan(
                existing.id(),
                uid,
                payload.goalId(),
                existing.goalTitle(),
                existing.goalDeadline(),
                existing.goalTermId(),
                existing.plannedAmount(),
                existing.goalTermSequenceNumber(),
                existing.goalTermSequenceTotal(),
                existing.repeatSeriesId(),
                payload.title(),
                payload.planDate(),
                payload.completed(),
                existing.createdAt(),
                OffsetDateTime.now()
        );
        if (!repository.update(updated)) {
            throw new BusinessException(NOT_FOUND_CODE, "daily plan not found");
        }
        return get(uid, id);
    }

    @Transactional
    public DailyPlanSeriesUpdateResult updateSeries(
            String userId,
            String id,
            DailyPlanSeriesUpdateRequest request
    ) {
        String uid = normalizeUserId(userId);
        DailyPlan existing = get(uid, id);
        SeriesDetails details = normalizeSeriesDetails(uid, request);
        boolean updateWholeSeries = Boolean.TRUE.equals(request.updateWholeSeries());
        if (!updateWholeSeries) {
            DailyPlan updated = new DailyPlan(
                    existing.id(),
                    uid,
                    details.goalId(),
                    existing.goalTitle(),
                    existing.goalDeadline(),
                    existing.goalTermId(),
                    existing.plannedAmount(),
                    existing.goalTermSequenceNumber(),
                    existing.goalTermSequenceTotal(),
                    null,
                    details.title(),
                    existing.planDate(),
                    existing.completed(),
                    existing.createdAt(),
                    OffsetDateTime.now()
            );
            if (!repository.update(updated)) {
                throw new BusinessException(NOT_FOUND_CODE, "daily plan not found");
            }
            return new DailyPlanSeriesUpdateResult(1);
        }
        String repeatSeriesId = existing.repeatSeriesId();
        OffsetDateTime updatedAt = OffsetDateTime.now();
        if (repeatSeriesId == null) {
            repeatSeriesId = UUID.randomUUID().toString();
            repository.assignLegacyPlansToRepeatSeries(
                    uid,
                    existing.title(),
                    existing.goalId(),
                    repeatSeriesId,
                    updatedAt
            );
        }
        int updatedCount = repository.updateRepeatSeriesDetails(
                repeatSeriesId,
                uid,
                details.title(),
                details.goalId(),
                updatedAt
        );
        if (updatedCount < 1) {
            throw new BusinessException(NOT_FOUND_CODE, "daily plan series not found");
        }
        return new DailyPlanSeriesUpdateResult(updatedCount);
    }

    @Transactional
    public DailyPlanRepeatResult repeat(String userId, String id, DailyPlanRepeatRequest request) {
        String uid = normalizeUserId(userId);
        DailyPlan source = repository.findByIdAndUserIdForUpdate(id, uid)
                .orElseThrow(() -> new BusinessException(NOT_FOUND_CODE, "daily plan not found"));
        validateRepeatRequest(source, request);
        List<LocalDate> occurrenceDates = createOccurrenceDates(source.planDate(), request);
        if (occurrenceDates.isEmpty()) {
            return new DailyPlanRepeatResult(0, 0, request.endDate());
        }

        String repeatSeriesId = source.repeatSeriesId() == null
                ? UUID.randomUUID().toString()
                : source.repeatSeriesId();
        OffsetDateTime now = OffsetDateTime.now();
        repository.assignRepeatSeriesToMatchingPlans(
                uid,
                source.title(),
                source.goalId(),
                source.planDate(),
                request.endDate(),
                repeatSeriesId,
                now
        );
        Set<LocalDate> existingDates = new HashSet<>(repository.findMatchingDates(
                uid,
                source.title(),
                source.goalId(),
                occurrenceDates.get(0),
                request.endDate()
        ));
        int createdCount = 0;
        for (LocalDate occurrenceDate : occurrenceDates) {
            if (existingDates.contains(occurrenceDate)) {
                continue;
            }
            repository.insert(new DailyPlan(
                    UUID.randomUUID().toString(),
                    uid,
                    source.goalId(),
                    source.goalTitle(),
                    source.goalDeadline(),
                    null,
                    null,
                    null,
                    null,
                    repeatSeriesId,
                    source.title(),
                    occurrenceDate,
                    Boolean.FALSE,
                    now,
                    now
            ));
            createdCount++;
        }
        return new DailyPlanRepeatResult(
                createdCount,
                occurrenceDates.size() - createdCount,
                request.endDate()
        );
    }

    public void delete(String userId, String id) {
        if (!repository.deleteByIdAndUserId(id, normalizeUserId(userId))) {
            throw new BusinessException(NOT_FOUND_CODE, "daily plan not found");
        }
    }

    private DailyPlan get(String userId, String id) {
        return repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new BusinessException(NOT_FOUND_CODE, "daily plan not found"));
    }

    private NormalizedPayload normalizePayload(String userId, DailyPlanUpsertRequest request) {
        if (request == null || !StringUtils.hasText(request.title())) {
            throw new BusinessException(BAD_REQUEST_CODE, "title must not be blank");
        }
        if (request.planDate() == null) {
            throw new BusinessException(BAD_REQUEST_CODE, "planDate is required");
        }
        String title = request.title().trim();
        if (title.length() > MAX_TITLE_LENGTH) {
            throw new BusinessException(BAD_REQUEST_CODE, "title is too long");
        }
        String goalId = blankToNull(request.goalId());
        if (goalId != null && !repository.goalExistsForUser(goalId, userId)) {
            throw new BusinessException(BAD_REQUEST_CODE, "goal does not belong to user");
        }
        return new NormalizedPayload(
                title,
                request.planDate(),
                goalId,
                Boolean.TRUE.equals(request.completed())
        );
    }

    private SeriesDetails normalizeSeriesDetails(String userId, DailyPlanSeriesUpdateRequest request) {
        if (request == null || !StringUtils.hasText(request.title())) {
            throw new BusinessException(BAD_REQUEST_CODE, "title must not be blank");
        }
        String title = request.title().trim();
        if (title.length() > MAX_TITLE_LENGTH) {
            throw new BusinessException(BAD_REQUEST_CODE, "title is too long");
        }
        String goalId = blankToNull(request.goalId());
        if (goalId != null && !repository.goalExistsForUser(goalId, userId)) {
            throw new BusinessException(BAD_REQUEST_CODE, "goal does not belong to user");
        }
        return new SeriesDetails(title, goalId);
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

    private static void validateRepeatRequest(DailyPlan source, DailyPlanRepeatRequest request) {
        if (request == null || request.unit() == null || request.interval() == null || request.endDate() == null) {
            throw new BusinessException(BAD_REQUEST_CODE, "repeat unit, interval and endDate are required");
        }
        if (request.interval() < 1 || request.interval() > 365) {
            throw new BusinessException(BAD_REQUEST_CODE, "repeat interval must be between 1 and 365");
        }
        if (!request.endDate().isAfter(source.planDate())) {
            throw new BusinessException(BAD_REQUEST_CODE, "repeat endDate must be after planDate");
        }
    }

    private static List<LocalDate> createOccurrenceDates(
            LocalDate sourceDate,
            DailyPlanRepeatRequest request
    ) {
        List<LocalDate> dates = new ArrayList<>(MAX_REPEAT_OCCURRENCES);
        for (int occurrence = 1; ; occurrence++) {
            long amount = (long) request.interval() * occurrence;
            LocalDate occurrenceDate = switch (request.unit()) {
                case DAY -> sourceDate.plusDays(amount);
                case WEEK -> sourceDate.plusWeeks(amount);
                case MONTH -> sourceDate.plusMonths(amount);
            };
            if (occurrenceDate.isAfter(request.endDate())) {
                return dates;
            }
            if (dates.size() >= MAX_REPEAT_OCCURRENCES) {
                throw new BusinessException(BAD_REQUEST_CODE, "repeat operation must not exceed 366 occurrences");
            }
            dates.add(occurrenceDate);
        }
    }

    private record NormalizedPayload(
            String title,
            LocalDate planDate,
            String goalId,
            Boolean completed
    ) {
    }

    private record SeriesDetails(String title, String goalId) {
    }
}
