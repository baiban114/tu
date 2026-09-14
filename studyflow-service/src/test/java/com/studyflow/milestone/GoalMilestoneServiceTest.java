package com.studyflow.milestone;

import com.studyflow.common.BusinessException;
import com.studyflow.goal.LearningGoal;
import com.studyflow.goal.LearningGoalRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class GoalMilestoneServiceTest {

    @Mock
    private GoalMilestoneRepository milestoneRepository;

    @Mock
    private LearningGoalRepository goalRepository;

    private GoalMilestoneService service;

    @BeforeEach
    void setUp() {
        service = new GoalMilestoneService(milestoneRepository, goalRepository);
    }

    @Test
    void testCreate_whenSortOrderAbsent_appendToGoal() {
        when(goalRepository.findByIdAndUserId("g1", "u1")).thenReturn(Optional.of(sampleGoal()));
        when(milestoneRepository.nextSortOrder("g1", "u1")).thenReturn(3);
        GoalMilestoneUpsertRequest request = new GoalMilestoneUpsertRequest(
                "  完成基础阶段  ",
                LocalDate.of(2026, 10, 1),
                null,
                null
        );

        GoalMilestone created = service.create("u1", "g1", request);

        ArgumentCaptor<GoalMilestone> captor = ArgumentCaptor.forClass(GoalMilestone.class);
        verify(milestoneRepository).insert(captor.capture());
        assertEquals("完成基础阶段", captor.getValue().title());
        assertEquals(3, captor.getValue().sortOrder());
        assertEquals(LocalDate.of(2026, 10, 1), captor.getValue().deadline());
        assertFalse(Boolean.TRUE.equals(captor.getValue().completed()));
        assertEquals("g1", created.goalId());
    }

    @Test
    void testList_whenPageSizeTooLarge_clampPageSize() {
        when(goalRepository.findByIdAndUserId("g1", "u1")).thenReturn(Optional.of(sampleGoal()));
        when(milestoneRepository.countByGoalIdAndUserId("g1", "u1")).thenReturn(1L);
        when(milestoneRepository.findByGoalIdAndUserId("g1", "u1", 100, 0))
                .thenReturn(List.of(sampleMilestone()));

        GoalMilestonePage page = service.list("u1", "g1", -1, 500);

        assertEquals(0, page.page());
        assertEquals(100, page.pageSize());
        assertEquals(1, page.items().size());
    }

    @Test
    void testCreate_whenGoalDoesNotBelongToUser_rejectRequest() {
        when(goalRepository.findByIdAndUserId("g1", "u2")).thenReturn(Optional.empty());
        GoalMilestoneUpsertRequest request = new GoalMilestoneUpsertRequest("阶段", null, null, null);

        assertThrows(BusinessException.class, () -> service.create("u2", "g1", request));
    }

    @Test
    void testUpdate_whenTitleBlank_rejectRequest() {
        when(goalRepository.findByIdAndUserId("g1", "u1")).thenReturn(Optional.of(sampleGoal()));
        when(milestoneRepository.findByIdAndGoalIdAndUserId("m1", "g1", "u1"))
                .thenReturn(Optional.of(sampleMilestone()));
        GoalMilestoneUpsertRequest request = new GoalMilestoneUpsertRequest(" ", null, null, null);

        assertThrows(BusinessException.class, () -> service.update("u1", "g1", "m1", request));
    }

    private static LearningGoal sampleGoal() {
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
                LocalDate.of(2026, 12, 20),
                now,
                now
        );
    }

    private static GoalMilestone sampleMilestone() {
        OffsetDateTime now = OffsetDateTime.parse("2026-09-08T01:00:00Z");
        return new GoalMilestone(
                "m1",
                "g1",
                "u1",
                "阶段一",
                LocalDate.of(2026, 10, 1),
                Boolean.FALSE,
                1,
                now,
                now
        );
    }
}
