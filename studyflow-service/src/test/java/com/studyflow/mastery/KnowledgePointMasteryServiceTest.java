package com.studyflow.mastery;

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
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class KnowledgePointMasteryServiceTest {

    @Mock
    private KnowledgePointMasteryRepository repository;

    private KnowledgePointMasteryService service;

    @BeforeEach
    void setUp() {
        service = new KnowledgePointMasteryService(repository);
    }

    @Test
    void upsertInsertsWhenAbsent() {
        when(repository.findByUserAndPoint("u1", "kp-1")).thenReturn(Optional.empty());

        KnowledgePointMastery saved = service.upsert("u1", new MasteryUpsertRequest(
                "kb-1",
                "kp-1",
                "learning",
                40,
                null
        ));

        ArgumentCaptor<KnowledgePointMastery> captor = ArgumentCaptor.forClass(KnowledgePointMastery.class);
        verify(repository).insert(captor.capture());
        assertEquals("learning", captor.getValue().status());
        assertEquals("kp-1", saved.knowledgePointId());
        assertEquals(40, saved.score());
    }

    @Test
    void projectSuggestsFirstNonMastered() {
        OffsetDateTime now = OffsetDateTime.now();
        when(repository.findByUserAndPoints(eq("u1"), any())).thenReturn(List.of(
                new KnowledgePointMastery("m1", "u1", "kb", "a", "mastered", 100, null, now, now),
                new KnowledgePointMastery("m2", "u1", "kb", "b", "learning", 50, null, now, now)
        ));

        MasteryProjection projection = service.project("u1", new MasteryProjectionRequest(
                "kb",
                List.of("a", "b", "c")
        ));

        assertEquals(3, projection.items().size());
        assertEquals("unknown", projection.items().get(2).status());
        assertEquals("b", projection.suggestedNextPointId());
    }

    @Test
    void projectAllMasteredSuggestsNull() {
        OffsetDateTime now = OffsetDateTime.now();
        when(repository.findByUserAndPoints(eq("u1"), any())).thenReturn(List.of(
                new KnowledgePointMastery("m1", "u1", null, "a", "mastered", null, null, now, now)
        ));

        MasteryProjection projection = service.project("u1", new MasteryProjectionRequest(
                null,
                List.of("a")
        ));

        assertNull(projection.suggestedNextPointId());
    }
}
