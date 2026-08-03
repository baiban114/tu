package com.studyflow.goal;

import com.studyflow.common.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LearningGoalServiceTest {

    @Mock
    private LearningGoalRepository repository;

    private LearningGoalService service;

    @BeforeEach
    void setUp() {
        service = new LearningGoalService(repository);
    }

    @Test
    void createKnowledgePointGoalAndSetCurrent() {
        LearningGoalUpsertRequest request = new LearningGoalUpsertRequest(
                "  Dijkstra  ",
                "kb-1",
                "knowledge_point",
                "kp-1",
                null,
                null,
                null,
                Boolean.TRUE
        );

        LearningGoal created = service.create("u1", request);

        ArgumentCaptor<LearningGoal> captor = ArgumentCaptor.forClass(LearningGoal.class);
        verify(repository).clearCurrentFlag(eq("u1"), any(OffsetDateTime.class));
        verify(repository).insert(captor.capture());
        assertEquals("Dijkstra", captor.getValue().title());
        assertEquals("knowledge_point", captor.getValue().sourceKind());
        assertEquals("kp-1", captor.getValue().knowledgePointId());
        assertTrue(Boolean.TRUE.equals(captor.getValue().currentFlag()));
        assertEquals("Dijkstra", created.title());
    }

    @Test
    void createRejectsKnowledgePointWithoutId() {
        LearningGoalUpsertRequest request = new LearningGoalUpsertRequest(
                "x",
                null,
                "knowledge_point",
                null,
                null,
                null,
                null,
                null
        );
        assertThrows(BusinessException.class, () -> service.create("u1", request));
    }

    @Test
    void getCurrentReturnsNullWhenAbsent() {
        when(repository.findCurrentByUserId("local")).thenReturn(Optional.empty());
        assertNull(service.getCurrent(null));
    }

    @Test
    void listOrdersViaRepository() {
        when(repository.countByUserId("u1")).thenReturn(1L);
        when(repository.findByUserId("u1", 10, 0)).thenReturn(List.of(sampleGoal(false)));
        LearningGoalPage page = service.list("u1", 0, 10);
        assertEquals(1, page.items().size());
        assertFalse(Boolean.TRUE.equals(page.items().get(0).currentFlag()));
    }

    @Test
    void setCurrentClearsPrevious() {
        when(repository.findByIdAndUserId("g1", "u1")).thenReturn(Optional.of(sampleGoal(false)));
        when(repository.setCurrentFlag(eq("g1"), eq("u1"), any(OffsetDateTime.class))).thenReturn(true);
        when(repository.findByIdAndUserId("g1", "u1"))
                .thenReturn(Optional.of(sampleGoal(false)))
                .thenReturn(Optional.of(sampleGoal(true)));

        LearningGoal current = service.setCurrent("u1", "g1");
        verify(repository).clearCurrentFlag(eq("u1"), any(OffsetDateTime.class));
        assertTrue(Boolean.TRUE.equals(current.currentFlag()));
    }

    private static LearningGoal sampleGoal(boolean current) {
        OffsetDateTime now = OffsetDateTime.parse("2026-07-31T10:00:00Z");
        return new LearningGoal(
                "g1",
                "u1",
                "Goal",
                "kb-1",
                "free_text",
                null,
                null,
                null,
                null,
                current,
                now,
                now
        );
    }
}
