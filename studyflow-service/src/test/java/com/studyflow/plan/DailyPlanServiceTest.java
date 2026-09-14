package com.studyflow.plan;

import com.studyflow.common.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DailyPlanServiceTest {

    @Mock
    private DailyPlanRepository repository;

    private DailyPlanService service;

    @BeforeEach
    void setUp() {
        service = new DailyPlanService(repository);
    }

    @Test
    void testCreate_whenGoalOwned_shouldPersistNormalizedPlan() {
        LocalDate planDate = LocalDate.of(2026, 9, 8);
        when(repository.goalExistsForUser("g1", "u1")).thenReturn(true);
        when(repository.findByIdAndUserId(any(String.class), any(String.class)))
                .thenAnswer(invocation -> Optional.of(samplePlan(
                        invocation.getArgument(0),
                        invocation.getArgument(1),
                        planDate,
                        false
                )));

        DailyPlan created = service.create(
                "u1",
                new DailyPlanUpsertRequest("  复习最短路径  ", planDate, "g1", null)
        );

        ArgumentCaptor<DailyPlan> captor = ArgumentCaptor.forClass(DailyPlan.class);
        verify(repository).insert(captor.capture());
        assertEquals("复习最短路径", captor.getValue().title());
        assertEquals(planDate, captor.getValue().planDate());
        assertEquals("g1", captor.getValue().goalId());
        assertEquals(planDate, created.planDate());
    }

    @Test
    void testCreate_whenGoalOwnedByAnotherUser_shouldReject() {
        LocalDate planDate = LocalDate.of(2026, 9, 8);
        when(repository.goalExistsForUser("g2", "u1")).thenReturn(false);

        assertThrows(
                BusinessException.class,
                () -> service.create("u1", new DailyPlanUpsertRequest("学习", planDate, "g2", false))
        );
    }

    @Test
    void testList_whenDateAndPageProvided_shouldUseScopedPagination() {
        LocalDate planDate = LocalDate.of(2026, 9, 8);
        when(repository.countByUserIdAndDate("u1", planDate)).thenReturn(11L);
        when(repository.findByUserIdAndDate("u1", planDate, 10, 10))
                .thenReturn(List.of(samplePlan("p1", "u1", planDate, false)));

        DailyPlanPage page = service.list("u1", planDate, 1, 10);

        assertEquals(11L, page.total());
        assertEquals(1, page.page());
        assertEquals(1, page.items().size());
    }

    @Test
    void testSummarize_whenRangeExceedsLimit_shouldReject() {
        assertThrows(
                BusinessException.class,
                () -> service.summarize(
                        "u1",
                        LocalDate.of(2026, 1, 1),
                        LocalDate.of(2026, 4, 1)
                )
        );
    }

    @Test
    void testUpdate_whenCompletingPlan_shouldReturnCompletedPlan() {
        LocalDate planDate = LocalDate.of(2026, 9, 8);
        DailyPlan existing = samplePlan("p1", "u1", planDate, false);
        when(repository.findByIdAndUserId("p1", "u1"))
                .thenReturn(Optional.of(existing))
                .thenReturn(Optional.of(samplePlan("p1", "u1", planDate, true)));
        when(repository.update(any(DailyPlan.class))).thenReturn(true);

        DailyPlan updated = service.update(
                "u1",
                "p1",
                new DailyPlanUpsertRequest(existing.title(), planDate, null, true)
        );

        assertTrue(Boolean.TRUE.equals(updated.completed()));
    }

    @Test
    void testUpdate_whenTaskTermDateConflicts_shouldRejectBeforeDatabaseUpdate() {
        LocalDate planDate = LocalDate.of(2026, 9, 8);
        DailyPlan existing = new DailyPlan(
                "p1", "u1", null, null, null, "term-1", new BigDecimal("1.00"),
                1, 2, null, "学习", planDate, false,
                OffsetDateTime.parse("2026-09-07T10:00:00Z"),
                OffsetDateTime.parse("2026-09-07T10:00:00Z")
        );
        when(repository.findByIdAndUserId("p1", "u1")).thenReturn(Optional.of(existing));
        when(repository.existsByGoalTermIdAndDateExcludingId(
                "term-1", "u1", LocalDate.of(2026, 9, 11), 1, "p1"
        )).thenReturn(true);

        assertThrows(
                BusinessException.class,
                () -> service.update(
                        "u1",
                        "p1",
                        new DailyPlanUpsertRequest("学习", LocalDate.of(2026, 9, 11), null, false)
                )
        );
    }

    @Test
    void testUpdate_whenTaskTermDateHasDifferentSequence_shouldAllowSameDate() {
        LocalDate planDate = LocalDate.of(2026, 9, 8);
        DailyPlan existing = new DailyPlan(
                "p1", "u1", null, null, null, "term-1", new BigDecimal("1.00"),
                1, 2, null, "学习", planDate, false,
                OffsetDateTime.parse("2026-09-07T10:00:00Z"),
                OffsetDateTime.parse("2026-09-07T10:00:00Z")
        );
        when(repository.findByIdAndUserId("p1", "u1")).thenReturn(Optional.of(existing));
        when(repository.existsByGoalTermIdAndDateExcludingId(
                "term-1", "u1", LocalDate.of(2026, 9, 11), 1, "p1"
        )).thenReturn(false);
        when(repository.update(any(DailyPlan.class))).thenReturn(true);
        ArgumentCaptor<DailyPlan> captor = ArgumentCaptor.forClass(DailyPlan.class);

        service.update(
                "u1", "p1",
                new DailyPlanUpsertRequest("学习", LocalDate.of(2026, 9, 11), null, false)
        );

        verify(repository).update(captor.capture());
        assertEquals(LocalDate.of(2026, 9, 11), captor.getValue().planDate());
    }

    @Test
    void testUpdateSeries_whenPlanBelongsToSeries_shouldUpdateWholeSeries() {
        LocalDate planDate = LocalDate.of(2026, 9, 8);
        DailyPlan existing = samplePlan("p1", "u1", planDate, false, "series-1");
        when(repository.findByIdAndUserId("p1", "u1")).thenReturn(Optional.of(existing));
        when(repository.updateRepeatSeriesDetails(
                any(String.class),
                any(String.class),
                any(String.class),
                isNull(),
                any(OffsetDateTime.class)
        )).thenReturn(4);

        DailyPlanSeriesUpdateResult result = service.updateSeries(
                "u1",
                "p1",
                new DailyPlanSeriesUpdateRequest("  新标题  ", null, true)
        );

        assertEquals(4, result.updatedCount());
        verify(repository).updateRepeatSeriesDetails(
                eq("series-1"),
                eq("u1"),
                eq("新标题"),
                isNull(),
                any(OffsetDateTime.class)
        );
    }

    @Test
    void testUpdateSeries_whenLegacyPlanAndWholeSeriesSelected_shouldGroupMatchingPlans() {
        LocalDate planDate = LocalDate.of(2026, 9, 8);
        DailyPlan existing = samplePlan("p1", "u1", planDate, false);
        when(repository.findByIdAndUserId("p1", "u1")).thenReturn(Optional.of(existing));
        when(repository.assignLegacyPlansToRepeatSeries(
                eq("u1"),
                eq("学习"),
                isNull(),
                any(String.class),
                any(OffsetDateTime.class)
        )).thenReturn(3);
        when(repository.updateRepeatSeriesDetails(
                any(String.class),
                eq("u1"),
                eq("新标题"),
                isNull(),
                any(OffsetDateTime.class)
        )).thenReturn(3);

        DailyPlanSeriesUpdateResult result = service.updateSeries(
                "u1",
                "p1",
                new DailyPlanSeriesUpdateRequest("新标题", null, true)
        );

        assertEquals(3, result.updatedCount());
        verify(repository).assignLegacyPlansToRepeatSeries(
                eq("u1"),
                eq("学习"),
                isNull(),
                any(String.class),
                any(OffsetDateTime.class)
        );
    }

    @Test
    void testRepeat_whenMonthlyFromMonthEnd_shouldKeepSourceDayAnchor() {
        LocalDate sourceDate = LocalDate.of(2026, 1, 31);
        when(repository.findByIdAndUserIdForUpdate("p1", "u1"))
                .thenReturn(Optional.of(samplePlan("p1", "u1", sourceDate, false)));
        when(repository.findMatchingDates(
                "u1",
                "学习",
                null,
                LocalDate.of(2026, 2, 28),
                LocalDate.of(2026, 3, 31)
        )).thenReturn(List.of());

        DailyPlanRepeatResult result = service.repeat(
                "u1",
                "p1",
                new DailyPlanRepeatRequest(DailyPlanRepeatUnit.MONTH, 1, LocalDate.of(2026, 3, 31))
        );

        ArgumentCaptor<DailyPlan> captor = ArgumentCaptor.forClass(DailyPlan.class);
        verify(repository, times(2)).insert(captor.capture());
        assertEquals(LocalDate.of(2026, 2, 28), captor.getAllValues().get(0).planDate());
        assertEquals(LocalDate.of(2026, 3, 31), captor.getAllValues().get(1).planDate());
        assertNotNull(captor.getAllValues().get(0).repeatSeriesId());
        assertEquals(
                captor.getAllValues().get(0).repeatSeriesId(),
                captor.getAllValues().get(1).repeatSeriesId()
        );
        assertEquals(2, result.createdCount());
    }

    @Test
    void testRepeat_whenMatchingDateExists_shouldSkipDuplicate() {
        LocalDate sourceDate = LocalDate.of(2026, 9, 7);
        LocalDate firstRepeatDate = LocalDate.of(2026, 9, 8);
        when(repository.findByIdAndUserIdForUpdate("p1", "u1"))
                .thenReturn(Optional.of(samplePlan("p1", "u1", sourceDate, false)));
        when(repository.findMatchingDates("u1", "学习", null, firstRepeatDate, firstRepeatDate))
                .thenReturn(List.of(firstRepeatDate));

        DailyPlanRepeatResult result = service.repeat(
                "u1",
                "p1",
                new DailyPlanRepeatRequest(DailyPlanRepeatUnit.DAY, 1, firstRepeatDate)
        );

        assertEquals(0, result.createdCount());
        assertEquals(1, result.skippedCount());
    }

    @Test
    void testRepeat_whenEndDateNotAfterPlan_shouldReject() {
        LocalDate sourceDate = LocalDate.of(2026, 9, 7);
        when(repository.findByIdAndUserIdForUpdate("p1", "u1"))
                .thenReturn(Optional.of(samplePlan("p1", "u1", sourceDate, false)));

        assertThrows(
                BusinessException.class,
                () -> service.repeat(
                        "u1",
                        "p1",
                        new DailyPlanRepeatRequest(DailyPlanRepeatUnit.DAY, 1, sourceDate)
                )
        );
    }

    private static DailyPlan samplePlan(String id, String userId, LocalDate date, boolean completed) {
        return samplePlan(id, userId, date, completed, null);
    }

    private static DailyPlan samplePlan(
            String id,
            String userId,
            LocalDate date,
            boolean completed,
            String repeatSeriesId
    ) {
        OffsetDateTime now = OffsetDateTime.parse("2026-09-07T10:00:00Z");
        return new DailyPlan(
                id,
                userId,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                repeatSeriesId,
                "学习",
                date,
                completed,
                now,
                now
        );
    }
}
