package com.tu.backend.knowledgerelation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tu.backend.common.BusinessException;
import com.tu.backend.knowledgerelation.entity.KnowledgePointAliasEntity;
import com.tu.backend.knowledgerelation.entity.KnowledgePointAnchorEntity;
import com.tu.backend.knowledgerelation.entity.KnowledgePointEntity;
import com.tu.backend.knowledgerelation.entity.KnowledgeRelationEntity;
import com.tu.backend.knowledgerelation.repository.KnowledgePointAliasRepository;
import com.tu.backend.knowledgerelation.repository.KnowledgePointAnchorRepository;
import com.tu.backend.knowledgerelation.repository.KnowledgePointRepository;
import com.tu.backend.knowledgerelation.repository.KnowledgeRelationRepository;
import com.tu.backend.knowledge.repository.KnowledgeBaseRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class KnowledgePointServiceMergeTest {

    @Test
    void mergesSourceIntoTargetAndMigratesChildrenAnchorsAliasesAndRelations() {
        KnowledgePointRepository pointRepository = org.mockito.Mockito.mock(KnowledgePointRepository.class);
        KnowledgePointAnchorRepository anchorRepository = org.mockito.Mockito.mock(KnowledgePointAnchorRepository.class);
        KnowledgePointAliasRepository aliasRepository = org.mockito.Mockito.mock(KnowledgePointAliasRepository.class);
        KnowledgeRelationRepository relationRepository = org.mockito.Mockito.mock(KnowledgeRelationRepository.class);
        KnowledgeBaseRepository kbRepository = org.mockito.Mockito.mock(KnowledgeBaseRepository.class);
        ObjectMapper objectMapper = new ObjectMapper();

        KnowledgePointEntity target = point("kp-target", "kb-1", null, "Target", 0);
        KnowledgePointEntity source = point("kp-source", "kb-1", null, "Source", 1);
        KnowledgePointEntity child = point("kp-child", "kb-1", "kp-source", "Child", 0);
        List<KnowledgePointEntity> allPoints = new ArrayList<>(List.of(target, source, child));

        KnowledgePointAnchorEntity targetAnchor = anchor("kpa-t", "kp-target", "page:p1", false);
        KnowledgePointAnchorEntity sourceAnchor = anchor("kpa-s", "kp-source", "page:p2", true);
        KnowledgePointAnchorEntity duplicateAnchor = anchor("kpa-dup", "kp-source", "page:p1", false);
        List<KnowledgePointAnchorEntity> anchors = new ArrayList<>(List.of(targetAnchor, sourceAnchor, duplicateAnchor));

        KnowledgePointAliasEntity sourceAlias = alias("kpal-s", "kp-source", "别名A");
        List<KnowledgePointAliasEntity> aliases = new ArrayList<>(List.of(sourceAlias));

        KnowledgeRelationEntity outgoing = relation("kr-1", "kb-1", "prerequisite", "kp-source", "kp-other");
        KnowledgeRelationEntity incoming = relation("kr-2", "kb-1", "prerequisite", "kp-other", "kp-source");
        KnowledgeRelationEntity duplicateAfterMerge = relation("kr-3", "kb-1", "prerequisite", "kp-target", "kp-other");
        List<KnowledgeRelationEntity> relations = new ArrayList<>(List.of(outgoing, incoming, duplicateAfterMerge));

        when(pointRepository.findById("kp-source")).thenReturn(Optional.of(source));
        when(pointRepository.findById("kp-target")).thenReturn(Optional.of(target));
        when(pointRepository.findByKbIdOrderBySortOrderAscTitleAsc("kb-1")).thenAnswer(invocation -> List.copyOf(allPoints));
        when(pointRepository.save(any(KnowledgePointEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(anchorRepository.findByKnowledgePointIdOrderByPrimaryAnchorDescCreatedAtAsc("kp-target"))
            .thenAnswer(invocation -> anchors.stream().filter(a -> "kp-target".equals(a.getKnowledgePointId())).toList());
        when(anchorRepository.findByKnowledgePointIdOrderByPrimaryAnchorDescCreatedAtAsc("kp-source"))
            .thenAnswer(invocation -> anchors.stream().filter(a -> "kp-source".equals(a.getKnowledgePointId())).toList());
        when(anchorRepository.save(any(KnowledgePointAnchorEntity.class))).thenAnswer(invocation -> {
            KnowledgePointAnchorEntity saved = invocation.getArgument(0);
            anchors.removeIf(item -> item.getId().equals(saved.getId()));
            anchors.add(saved);
            return saved;
        });
        when(aliasRepository.findByKnowledgePointIdOrderByAliasAsc("kp-target")).thenReturn(List.of());
        when(aliasRepository.findByKnowledgePointIdOrderByAliasAsc("kp-source")).thenReturn(List.of(sourceAlias));
        when(aliasRepository.save(any(KnowledgePointAliasEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(relationRepository.findByKbIdAndFromPointIdOrderByUpdatedAtDesc("kb-1", "kp-source"))
            .thenAnswer(invocation -> relations.stream().filter(r -> "kp-source".equals(r.getFromPointId())).toList());
        when(relationRepository.findByKbIdAndToPointIdOrderByUpdatedAtDesc("kb-1", "kp-source"))
            .thenAnswer(invocation -> relations.stream().filter(r -> "kp-source".equals(r.getToPointId())).toList());
        when(relationRepository.findByKbIdOrderByUpdatedAtDescCreatedAtDesc("kb-1"))
            .thenAnswer(invocation -> List.copyOf(relations));
        when(relationRepository.save(any(KnowledgeRelationEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        KnowledgePointService service = new KnowledgePointService(
            pointRepository,
            anchorRepository,
            aliasRepository,
            relationRepository,
            kbRepository,
            objectMapper
        );

        var merged = service.mergePoints("kp-source", "kp-target");

        assertThat(merged.getId()).isEqualTo("kp-target");
        assertThat(child.getParentId()).isEqualTo("kp-target");
        assertThat(sourceAnchor.getKnowledgePointId()).isEqualTo("kp-target");
        assertThat(sourceAnchor.getPrimaryAnchor()).isTrue();
        org.mockito.Mockito.verify(anchorRepository).delete(duplicateAnchor);
        org.mockito.Mockito.verify(pointRepository).delete(source);

        ArgumentCaptor<KnowledgePointAliasEntity> aliasCaptor = ArgumentCaptor.forClass(KnowledgePointAliasEntity.class);
        org.mockito.Mockito.verify(aliasRepository, org.mockito.Mockito.atLeastOnce()).save(aliasCaptor.capture());
        assertThat(aliasCaptor.getAllValues())
            .anyMatch(item -> "kp-target".equals(item.getKnowledgePointId()) && "Source".equals(item.getAlias()));
        assertThat(aliasCaptor.getAllValues())
            .anyMatch(item -> "kp-target".equals(item.getKnowledgePointId()) && "别名A".equals(item.getAlias()));

        assertThat(outgoing.getFromPointId()).isEqualTo("kp-target");
        assertThat(incoming.getToPointId()).isEqualTo("kp-target");
        org.mockito.Mockito.verify(relationRepository).delete(duplicateAfterMerge);
    }

    @Test
    void rejectsMergeIntoSelf() {
        KnowledgePointService service = serviceWithPoints(List.of(point("kp-1", "kb-1", null, "A", 0)));

        assertThatThrownBy(() -> service.mergePoints("kp-1", "kp-1"))
            .isInstanceOf(BusinessException.class)
            .hasMessageContaining("itself");
    }

    @Test
    void rejectsMergeIntoDescendant() {
        KnowledgePointEntity parent = point("kp-parent", "kb-1", null, "Parent", 0);
        KnowledgePointEntity child = point("kp-child", "kb-1", "kp-parent", "Child", 0);
        KnowledgePointService service = serviceWithPoints(List.of(parent, child));

        assertThatThrownBy(() -> service.mergePoints("kp-parent", "kp-child"))
            .isInstanceOf(BusinessException.class)
            .hasMessageContaining("descendant");
    }

    private static KnowledgePointService serviceWithPoints(List<KnowledgePointEntity> points) {
        KnowledgePointRepository pointRepository = org.mockito.Mockito.mock(KnowledgePointRepository.class);
        KnowledgePointAnchorRepository anchorRepository = org.mockito.Mockito.mock(KnowledgePointAnchorRepository.class);
        KnowledgePointAliasRepository aliasRepository = org.mockito.Mockito.mock(KnowledgePointAliasRepository.class);
        KnowledgeRelationRepository relationRepository = org.mockito.Mockito.mock(KnowledgeRelationRepository.class);
        KnowledgeBaseRepository kbRepository = org.mockito.Mockito.mock(KnowledgeBaseRepository.class);

        for (KnowledgePointEntity point : points) {
            when(pointRepository.findById(point.getId())).thenReturn(Optional.of(point));
        }
        when(pointRepository.findByKbIdOrderBySortOrderAscTitleAsc("kb-1")).thenReturn(points);
        when(pointRepository.save(any(KnowledgePointEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(anchorRepository.findByKnowledgePointIdOrderByPrimaryAnchorDescCreatedAtAsc(any())).thenReturn(List.of());
        when(aliasRepository.findByKnowledgePointIdOrderByAliasAsc(any())).thenReturn(List.of());
        when(relationRepository.findByKbIdAndFromPointIdOrderByUpdatedAtDesc(any(), any())).thenReturn(List.of());
        when(relationRepository.findByKbIdAndToPointIdOrderByUpdatedAtDesc(any(), any())).thenReturn(List.of());
        when(relationRepository.findByKbIdOrderByUpdatedAtDescCreatedAtDesc(any())).thenReturn(List.of());

        return new KnowledgePointService(
            pointRepository,
            anchorRepository,
            aliasRepository,
            relationRepository,
            kbRepository,
            new ObjectMapper()
        );
    }

    private static KnowledgePointEntity point(
        String id,
        String kbId,
        String parentId,
        String title,
        int sortOrder
    ) {
        KnowledgePointEntity entity = new KnowledgePointEntity();
        entity.setId(id);
        entity.setKbId(kbId);
        entity.setParentId(parentId);
        entity.setTitle(title);
        entity.setSortOrder(sortOrder);
        entity.setStatus("active");
        return entity;
    }

    private static KnowledgePointAnchorEntity anchor(
        String id,
        String pointId,
        String locator,
        boolean primary
    ) {
        KnowledgePointAnchorEntity entity = new KnowledgePointAnchorEntity();
        entity.setId(id);
        entity.setKnowledgePointId(pointId);
        entity.setAnchorKind("page");
        entity.setLocator(locator);
        entity.setRole("primary");
        entity.setPrimaryAnchor(primary);
        return entity;
    }

    private static KnowledgePointAliasEntity alias(String id, String pointId, String alias) {
        KnowledgePointAliasEntity entity = new KnowledgePointAliasEntity();
        entity.setId(id);
        entity.setKnowledgePointId(pointId);
        entity.setAlias(alias);
        return entity;
    }

    private static KnowledgeRelationEntity relation(
        String id,
        String kbId,
        String typeKey,
        String fromPointId,
        String toPointId
    ) {
        KnowledgeRelationEntity entity = new KnowledgeRelationEntity();
        entity.setId(id);
        entity.setKbId(kbId);
        entity.setRelationTypeKey(typeKey);
        entity.setFromPointId(fromPointId);
        entity.setToPointId(toPointId);
        entity.setSourceProvenance("user");
        entity.setStatus("ok");
        return entity;
    }
}
