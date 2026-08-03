package com.tu.backend.ai;

import com.tu.backend.ai.dto.LearningRouteItemDto;
import com.tu.backend.ai.dto.LearningRoutePlanDto;
import com.tu.backend.knowledgerelation.dto.KnowledgePointDto;
import com.tu.backend.knowledgerelation.service.KnowledgePointService;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LearningRouteAgentServiceTest {

    @Mock
    private KnowledgePointService knowledgePointService;

    private LearningRouteAgentService service;

    @BeforeEach
    void setUp() {
        service = new LearningRouteAgentService(
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            knowledgePointService
        );
    }

    @Test
    void validatePlanKeepsExistingIdsAndTitles() {
        KnowledgePointDto existing = new KnowledgePointDto();
        existing.setId("kp-1");
        existing.setKbId("kb-1");
        existing.setTitle("Graph Basics");
        existing.setSummary("intro");
        existing.setEstimatedHours(2.0);
        when(knowledgePointService.getPoint("kp-1")).thenReturn(existing);

        LearningRoutePlanDto parsed = new LearningRoutePlanDto(
            "图算法",
            List.of(
                new LearningRouteItemDto("kp-1", "Graph Basics", null, 2.0, List.of()),
                new LearningRouteItemDto(null, "Dijkstra", "shortest path", 3.0, List.of())
            ),
            List.of()
        );

        LearningRoutePlanDto plan = service.validatePlan("kb-1", "图算法", parsed, List.of("kp-1"));
        assertEquals(2, plan.orderedItems().size());
        assertEquals("kp-1", plan.orderedItems().get(0).pointId());
        assertNull(plan.orderedItems().get(1).pointId());
        assertEquals("Dijkstra", plan.orderedItems().get(1).title());
    }
}
