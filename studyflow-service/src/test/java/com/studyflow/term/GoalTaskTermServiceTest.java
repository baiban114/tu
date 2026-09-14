package com.studyflow.term;

import com.studyflow.common.BusinessException;
import com.studyflow.goal.LearningGoal;
import com.studyflow.goal.LearningGoalRepository;
import com.studyflow.plan.DailyPlan;
import com.studyflow.plan.DailyPlanRepository;
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
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GoalTaskTermServiceTest {

    @Mock
    private GoalTaskTermRepository termRepository;

    @Mock
    private LearningGoalRepository goalRepository;

    @Mock
    private DailyPlanRepository planRepository;

    private GoalTaskTermService service;

    @BeforeEach
    void setUp() {
        service = new GoalTaskTermService(termRepository, goalRepository, planRepository);
    }

    @Test
    void testAllocateDailyAmounts_whenTotalHasRemainder_preserveExactTotal() {
        List<BigDecimal> amounts = GoalTaskTermService.allocateDailyAmounts(new BigDecimal("10.00"), 3);

        assertEquals(List.of(
                new BigDecimal("3.34"),
                new BigDecimal("3.33"),
                new BigDecimal("3.33")
        ), amounts);
        assertEquals(new BigDecimal("10.00"), amounts.stream().reduce(BigDecimal.ZERO, BigDecimal::add));
    }

    @Test
    void testCreate_whenPayloadValid_normalizeAndPersist() {
        when(goalRepository.findByIdAndUserId("g1", "u1")).thenReturn(Optional.of(sampleGoal(LocalDate.now())));
        GoalTaskTermUpsertRequest request = new GoalTaskTermUpsertRequest(
                "  完成题库  ",
                new BigDecimal("100")
        );

        service.create("u1", "g1", request);

        ArgumentCaptor<GoalTaskTerm> captor = ArgumentCaptor.forClass(GoalTaskTerm.class);
        verify(termRepository).insert(captor.capture());
        assertEquals("完成题库", captor.getValue().title());
        assertEquals(new BigDecimal("100.00"), captor.getValue().totalAmount());
    }

    @Test
    void testDistribute_whenThreeDays_createOnePlanPerDay() {
        LocalDate today = LocalDate.now();
        LocalDate endDate = today.plusDays(2);
        LearningGoal goal = sampleGoal(endDate);
        GoalTaskTerm term = sampleTerm(today, today.minusDays(5));
        when(goalRepository.findByIdAndUserId("g1", "u1")).thenReturn(Optional.of(goal));
        when(termRepository.findByIdAndGoalIdAndUserId("t1", "g1", "u1"))
                .thenReturn(Optional.of(term));
        when(planRepository.findByGoalTermIdAndUserId("t1", "u1")).thenReturn(List.of());
        when(termRepository.markDistributed(
                eq("t1"),
                eq("g1"),
                eq("u1"),
                eq(today),
                eq(endDate),
                any(OffsetDateTime.class)
        )).thenReturn(true);

        GoalTaskTermDistributionResult result = service.distribute(
                "u1",
                "g1",
                "t1",
                new GoalTaskTermDistributionRequest(today, endDate)
        );

        ArgumentCaptor<DailyPlan> captor = ArgumentCaptor.forClass(DailyPlan.class);
        verify(planRepository, org.mockito.Mockito.times(3)).insert(captor.capture());
        assertEquals(3, result.dayCount());
        assertEquals(3, result.createdCount());
        assertEquals(today, result.startDate());
        assertEquals(endDate, result.endDate());
        assertEquals(1, captor.getAllValues().get(0).goalTermSequenceNumber());
        assertEquals(3, captor.getAllValues().get(2).goalTermSequenceNumber());
        assertEquals(3, captor.getAllValues().get(2).goalTermSequenceTotal());
        assertEquals(new BigDecimal("10.00"), captor.getAllValues().stream()
                .map(DailyPlan::plannedAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add));
    }

    @Test
    void testDistribute_whenGoalHasNoDeadline_useRequestedEndDate() {
        LocalDate planDate = LocalDate.of(2026, 9, 10);
        LearningGoal goal = sampleGoal(null);
        when(goalRepository.findByIdAndUserId("g1", "u1")).thenReturn(Optional.of(goal));
        when(termRepository.findByIdAndGoalIdAndUserId("t1", "g1", "u1"))
                .thenReturn(Optional.of(sampleTerm(planDate, null)));
        when(planRepository.findByGoalTermIdAndUserId("t1", "u1")).thenReturn(List.of());
        when(termRepository.markDistributed(
                eq("t1"),
                eq("g1"),
                eq("u1"),
                eq(planDate),
                eq(planDate),
                any(OffsetDateTime.class)
        )).thenReturn(true);

        GoalTaskTermDistributionResult result = service.distribute(
                "u1",
                "g1",
                "t1",
                new GoalTaskTermDistributionRequest(planDate, planDate)
        );

        assertEquals(1, result.dayCount());
        assertEquals(planDate, result.endDate());
    }

    @Test
    void testDistribute_whenStartDateAfterDeadline_rejectRequest() {
        LocalDate deadline = LocalDate.of(2026, 9, 10);
        when(goalRepository.findByIdAndUserId("g1", "u1")).thenReturn(Optional.of(sampleGoal(deadline)));
        when(termRepository.findByIdAndGoalIdAndUserId("t1", "g1", "u1"))
                .thenReturn(Optional.of(sampleTerm(deadline, null)));

        assertThrows(
                BusinessException.class,
                () -> service.distribute(
                        "u1",
                        "g1",
                        "t1",
                        new GoalTaskTermDistributionRequest(deadline.plusDays(1), deadline)
                )
        );
    }

    private static LearningGoal sampleGoal(LocalDate deadline) {
        OffsetDateTime now = OffsetDateTime.parse("2026-09-08T01:00:00Z");
        return new LearningGoal(
                "g1",
                "u1",
                "Goal",
                null,
                "free_text",
                null,
                null,
                null,
                null,
                Boolean.TRUE,
                deadline,
                now,
                now
        );
    }

    private static GoalTaskTerm sampleTerm(LocalDate today, LocalDate distributionStartDate) {
        OffsetDateTime now = today.atStartOfDay().atOffset(java.time.ZoneOffset.UTC);
        return new GoalTaskTerm(
                "t1",
                "g1",
                "u1",
                "完成题库",
                new BigDecimal("10.00"),
                distributionStartDate,
                null,
                null,
                now,
                now
        );
    }
}
