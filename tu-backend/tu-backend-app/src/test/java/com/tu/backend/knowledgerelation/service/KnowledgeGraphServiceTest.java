package com.tu.backend.knowledgerelation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import com.tu.backend.common.BusinessException;
import com.tu.backend.knowledgerelation.dto.KnowledgeGraphDto;
import com.tu.backend.knowledgerelation.dto.RelationTypeDefDto;
import com.tu.backend.knowledgerelation.entity.KnowledgePointEntity;
import com.tu.backend.knowledgerelation.entity.KnowledgeRelationEntity;
import com.tu.backend.knowledgerelation.repository.KnowledgePointRepository;
import com.tu.backend.knowledgerelation.repository.KnowledgeRelationRepository;
import com.tu.backend.knowledge.repository.KnowledgeBaseRepository;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

class KnowledgeGraphServiceTest {

    private static final String KB_ID = "kb-1";

    private KnowledgePointRepository pointRepository;
    private KnowledgeRelationRepository relationRepository;
    private KnowledgeBaseRepository knowledgeBaseRepository;
    private RelationTypeService relationTypeService;
    private KnowledgeGraphService service;

    @BeforeEach
    void setUp() {
        pointRepository = Mockito.mock(KnowledgePointRepository.class);
        relationRepository = Mockito.mock(KnowledgeRelationRepository.class);
        knowledgeBaseRepository = Mockito.mock(KnowledgeBaseRepository.class);
        relationTypeService = Mockito.mock(RelationTypeService.class);
        service = new KnowledgeGraphService(
            pointRepository,
            relationRepository,
            knowledgeBaseRepository,
            relationTypeService
        );

        when(knowledgeBaseRepository.existsById(KB_ID)).thenReturn(true);
        when(pointRepository.findByKbIdOrderBySortOrderAscTitleAsc(KB_ID)).thenReturn(List.of(
            point("kp-a", "A", null, 0),
            point("kp-b", "B", null, 1),
            point("kp-c", "C", null, 2),
            point("kp-d", "D", null, 3)
        ));
        when(relationRepository.findByKbIdOrderByUpdatedAtDescCreatedAtDesc(KB_ID)).thenReturn(List.of(
            relation("kr-1", "related", "kp-a", "kp-b"),
            relation("kr-2", "prerequisite", "kp-a", "kp-c"),
            relation("kr-3", "prerequisite", "kp-b", "kp-d"),
            relation("kr-4", "case", "kp-c", "kp-d")
        ));
        when(relationTypeService.resolveType(eq(KB_ID), anyString())).thenAnswer(invocation -> {
            String typeKey = invocation.getArgument(1);
            return switch (typeKey) {
                case "related" -> type("related", "相关", "#8c8c8c", true);
                case "prerequisite" -> type("prerequisite", "前置", "#fa8c16", false);
                case "case" -> type("case", "案例", "#1677ff", false);
                default -> type(typeKey, typeKey, "#1677ff", false);
            };
        });
    }

    @Test
    void fullModeReturnsAllPointsAndPointEdges() {
        KnowledgeGraphDto graph = service.getGraph(KB_ID, "full", null, null, null, null, 500);

        assertThat(graph.nodes()).hasSize(4);
        assertThat(graph.edges()).hasSize(4);
        assertThat(graph.meta().mode()).isEqualTo("full");
        assertThat(graph.meta().truncated()).isFalse();
    }

    @Test
    void fullModeTruncatesWhenMaxNodesExceeded() {
        KnowledgeGraphDto graph = service.getGraph(KB_ID, "full", null, null, null, null, 2);

        assertThat(graph.nodes()).hasSize(2);
        assertThat(graph.meta().truncated()).isTrue();
    }

    @Test
    void centeredModeIncludesTaxonomyChildrenWithoutSemanticEdges() {
        when(pointRepository.findByKbIdOrderBySortOrderAscTitleAsc(KB_ID)).thenReturn(List.of(
            point("kp-parent", "Parent", null, 0),
            point("kp-child", "Child", "kp-parent", 1)
        ));
        when(relationRepository.findByKbIdOrderByUpdatedAtDescCreatedAtDesc(KB_ID)).thenReturn(List.of());

        KnowledgeGraphDto graph = service.getGraph(KB_ID, "centered", "kp-parent", 1, null, null, 500);

        assertThat(graph.nodes()).extracting(node -> node.id()).containsExactlyInAnyOrder("kp-parent", "kp-child");
        assertThat(graph.edges()).isEmpty();
    }

    @Test
    void centeredModeReturnsTwoHopNeighborhood() {
        KnowledgeGraphDto graph = service.getGraph(KB_ID, "centered", "kp-a", 2, null, null, 500);

        assertThat(graph.nodes()).extracting(node -> node.id()).contains("kp-a", "kp-b", "kp-c");
        assertThat(graph.meta().centerPointId()).isEqualTo("kp-a");
    }

    @Test
    void prerequisiteModeFollowsDependencyChainBackward() {
        KnowledgeGraphDto graph = service.getGraph(KB_ID, "prerequisite", "kp-c", 3, "out", null, 500);

        assertThat(graph.nodes()).extracting(node -> node.id()).containsExactlyInAnyOrder("kp-c", "kp-a");
        assertThat(graph.edges()).allMatch(edge -> "prerequisite".equals(edge.relationTypeKey()));
    }

    @Test
    void prerequisiteModeRequiresCenterPointId() {
        assertThatThrownBy(() -> service.getGraph(KB_ID, "prerequisite", null, 2, "out", null, 500))
            .isInstanceOf(BusinessException.class)
            .hasMessageContaining("centerPointId is required");
    }

    private KnowledgePointEntity point(String id, String title, String parentId, int sortOrder) {
        KnowledgePointEntity entity = new KnowledgePointEntity();
        entity.setId(id);
        entity.setKbId(KB_ID);
        entity.setParentId(parentId);
        entity.setTitle(title);
        entity.setSortOrder(sortOrder);
        entity.setEstimatedHours(BigDecimal.valueOf(1.5));
        return entity;
    }

    private KnowledgeRelationEntity relation(String id, String typeKey, String from, String to) {
        KnowledgeRelationEntity entity = new KnowledgeRelationEntity();
        entity.setId(id);
        entity.setKbId(KB_ID);
        entity.setRelationTypeKey(typeKey);
        entity.setFromPointId(from);
        entity.setToPointId(to);
        entity.setSourceProvenance("user");
        entity.setStatus("ok");
        return entity;
    }

    private RelationTypeDefDto type(String key, String label, String color, boolean bidirectional) {
        return new RelationTypeDefDto("rt-" + key, KB_ID, key, label, color, null, bidirectional, true, true);
    }
}
