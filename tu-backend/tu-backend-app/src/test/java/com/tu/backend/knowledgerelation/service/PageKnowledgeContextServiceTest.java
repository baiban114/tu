package com.tu.backend.knowledgerelation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import com.tu.backend.knowledgerelation.dto.KnowledgePointDto;
import com.tu.backend.knowledgerelation.dto.KnowledgeRelationDto;
import com.tu.backend.knowledgerelation.dto.RelationsByPointDto;
import com.tu.backend.knowledgerelation.entity.KnowledgePointAnchorEntity;
import com.tu.backend.knowledgerelation.entity.KnowledgePointEntity;
import com.tu.backend.knowledgerelation.repository.KnowledgePointAnchorRepository;
import com.tu.backend.knowledgerelation.repository.KnowledgePointRepository;
import com.tu.backend.knowledge.repository.KnowledgeBaseRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class PageKnowledgeContextServiceTest {

    @Test
    void pagePointsIncludeOnlyPageLevelAnchorsNotHeadingOrSectionLocators() {
        KnowledgePointAnchorRepository anchorRepository = org.mockito.Mockito.mock(KnowledgePointAnchorRepository.class);
        KnowledgePointRepository pointRepository = org.mockito.Mockito.mock(KnowledgePointRepository.class);
        KnowledgeRelationService relationService = org.mockito.Mockito.mock(KnowledgeRelationService.class);
        KnowledgePointService pointService = org.mockito.Mockito.mock(KnowledgePointService.class);
        KnowledgeBaseRepository kbRepository = org.mockito.Mockito.mock(KnowledgeBaseRepository.class);

        KnowledgePointEntity pagePoint = point("kp-page", "kb-1", "Page Point");
        KnowledgePointEntity headingPoint = point("kp-heading", "kb-1", "Heading Point");
        KnowledgePointAnchorEntity pageAnchor = anchor("kpa-1", "kp-page", "page:p1");
        KnowledgePointAnchorEntity headingAnchor = anchor("kpa-2", "kp-heading", "page:p1:heading:h1");

        when(kbRepository.existsById("kb-1")).thenReturn(true);
        when(anchorRepository.findByPageLocatorPrefix("page:p1", "page:p1:"))
            .thenReturn(List.of(pageAnchor, headingAnchor));
        when(pointRepository.findById("kp-page")).thenReturn(Optional.of(pagePoint));
        when(pointRepository.findById("kp-heading")).thenReturn(Optional.of(headingPoint));
        when(pointService.getPoint("kp-page")).thenReturn(toDto(pagePoint));
        when(pointService.getPoint("kp-heading")).thenReturn(toDto(headingPoint));
        when(relationService.listByPoint(eq("kb-1"), any())).thenReturn(new RelationsByPointDto("x", List.of(), List.of()));

        PageKnowledgeContextService service = new PageKnowledgeContextService(
            anchorRepository,
            pointRepository,
            relationService,
            pointService,
            kbRepository
        );

        var context = service.getPageKnowledgeContext("kb-1", "p1");

        assertThat(context.pageId()).isEqualTo("p1");
        assertThat(context.pagePoints()).extracting(KnowledgePointDto::getId)
            .containsExactly("kp-page");
        assertThat(context.prerequisites()).isEmpty();
        assertThat(context.successors()).isEmpty();
    }

    @Test
    void includesPrerequisitesFromHeadingLevelPointsOnPage() {
        KnowledgePointAnchorRepository anchorRepository = org.mockito.Mockito.mock(KnowledgePointAnchorRepository.class);
        KnowledgePointRepository pointRepository = org.mockito.Mockito.mock(KnowledgePointRepository.class);
        KnowledgeRelationService relationService = org.mockito.Mockito.mock(KnowledgeRelationService.class);
        KnowledgePointService pointService = org.mockito.Mockito.mock(KnowledgePointService.class);
        KnowledgeBaseRepository kbRepository = org.mockito.Mockito.mock(KnowledgeBaseRepository.class);

        KnowledgePointEntity headingPoint = point("kp-heading", "kb-1", "Heading Point");
        KnowledgePointEntity prereq = point("kp-pre", "kb-1", "Prerequisite");
        KnowledgePointAnchorEntity headingAnchor = anchor("kpa-2", "kp-heading", "page:p1:heading:h1");
        KnowledgeRelationDto outgoing = relation("kr-1", "kp-heading", "kp-pre", "prerequisite");

        when(kbRepository.existsById("kb-1")).thenReturn(true);
        when(anchorRepository.findByPageLocatorPrefix("page:p1", "page:p1:"))
            .thenReturn(List.of(headingAnchor));
        when(pointRepository.findById("kp-heading")).thenReturn(Optional.of(headingPoint));
        when(pointRepository.findById("kp-pre")).thenReturn(Optional.of(prereq));
        when(pointService.getPoint("kp-pre")).thenReturn(toDto(prereq));
        when(relationService.listByPoint("kb-1", "kp-heading"))
            .thenReturn(new RelationsByPointDto("kp-heading", List.of(outgoing), List.of()));

        PageKnowledgeContextService service = new PageKnowledgeContextService(
            anchorRepository,
            pointRepository,
            relationService,
            pointService,
            kbRepository
        );

        var context = service.getPageKnowledgeContext("kb-1", "p1");

        assertThat(context.pagePoints()).isEmpty();
        assertThat(context.prerequisites()).extracting(KnowledgePointDto::getId).containsExactly("kp-pre");
    }

    @Test
    void mapsPrerequisiteOutgoingToPrerequisitesAndIncomingToSuccessors() {
        KnowledgePointAnchorRepository anchorRepository = org.mockito.Mockito.mock(KnowledgePointAnchorRepository.class);
        KnowledgePointRepository pointRepository = org.mockito.Mockito.mock(KnowledgePointRepository.class);
        KnowledgeRelationService relationService = org.mockito.Mockito.mock(KnowledgeRelationService.class);
        KnowledgePointService pointService = org.mockito.Mockito.mock(KnowledgePointService.class);
        KnowledgeBaseRepository kbRepository = org.mockito.Mockito.mock(KnowledgeBaseRepository.class);

        KnowledgePointEntity pagePoint = point("kp-page", "kb-1", "Current");
        KnowledgePointEntity prereq = point("kp-pre", "kb-1", "Prerequisite");
        KnowledgePointEntity succ = point("kp-succ", "kb-1", "Successor");
        KnowledgePointAnchorEntity pageAnchor = anchor("kpa-1", "kp-page", "page:p1");

        KnowledgeRelationDto outgoing = relation("kr-1", "kp-page", "kp-pre", "prerequisite");
        KnowledgeRelationDto incoming = relation("kr-2", "kp-succ", "kp-page", "prerequisite");
        KnowledgeRelationDto duplicateOutgoing = relation("kr-3", "kp-page", "kp-pre", "prerequisite");

        when(kbRepository.existsById("kb-1")).thenReturn(true);
        when(anchorRepository.findByPageLocatorPrefix("page:p1", "page:p1:")).thenReturn(List.of(pageAnchor));
        when(pointRepository.findById("kp-page")).thenReturn(Optional.of(pagePoint));
        when(pointRepository.findById("kp-pre")).thenReturn(Optional.of(prereq));
        when(pointRepository.findById("kp-succ")).thenReturn(Optional.of(succ));
        when(pointService.getPoint("kp-page")).thenReturn(toDto(pagePoint));
        when(pointService.getPoint("kp-pre")).thenReturn(toDto(prereq));
        when(pointService.getPoint("kp-succ")).thenReturn(toDto(succ));
        when(relationService.listByPoint("kb-1", "kp-page"))
            .thenReturn(new RelationsByPointDto("kp-page", List.of(outgoing, duplicateOutgoing), List.of(incoming)));

        PageKnowledgeContextService service = new PageKnowledgeContextService(
            anchorRepository,
            pointRepository,
            relationService,
            pointService,
            kbRepository
        );

        var context = service.getPageKnowledgeContext("kb-1", "p1");

        assertThat(context.prerequisites()).extracting(KnowledgePointDto::getId).containsExactly("kp-pre");
        assertThat(context.successors()).extracting(KnowledgePointDto::getId).containsExactly("kp-succ");
    }

    @Test
    void returnsEmptyListsWhenPageHasNoAnchors() {
        KnowledgePointAnchorRepository anchorRepository = org.mockito.Mockito.mock(KnowledgePointAnchorRepository.class);
        KnowledgePointRepository pointRepository = org.mockito.Mockito.mock(KnowledgePointRepository.class);
        KnowledgeRelationService relationService = org.mockito.Mockito.mock(KnowledgeRelationService.class);
        KnowledgePointService pointService = org.mockito.Mockito.mock(KnowledgePointService.class);
        KnowledgeBaseRepository kbRepository = org.mockito.Mockito.mock(KnowledgeBaseRepository.class);

        when(kbRepository.existsById("kb-1")).thenReturn(true);
        when(anchorRepository.findByPageLocatorPrefix("page:p-empty", "page:p-empty:")).thenReturn(List.of());

        PageKnowledgeContextService service = new PageKnowledgeContextService(
            anchorRepository,
            pointRepository,
            relationService,
            pointService,
            kbRepository
        );

        var context = service.getPageKnowledgeContext("kb-1", "p-empty");

        assertThat(context.pagePoints()).isEmpty();
        assertThat(context.prerequisites()).isEmpty();
        assertThat(context.successors()).isEmpty();
    }

    private static KnowledgePointEntity point(String id, String kbId, String title) {
        KnowledgePointEntity entity = new KnowledgePointEntity();
        entity.setId(id);
        entity.setKbId(kbId);
        entity.setTitle(title);
        entity.setStatus("active");
        entity.setSortOrder(0);
        return entity;
    }

    private static KnowledgePointAnchorEntity anchor(String id, String pointId, String locator) {
        KnowledgePointAnchorEntity entity = new KnowledgePointAnchorEntity();
        entity.setId(id);
        entity.setKnowledgePointId(pointId);
        entity.setAnchorKind("page");
        entity.setLocator(locator);
        entity.setRole("primary");
        entity.setPrimaryAnchor(true);
        return entity;
    }

    private static KnowledgePointDto toDto(KnowledgePointEntity entity) {
        KnowledgePointDto dto = new KnowledgePointDto();
        dto.setId(entity.getId());
        dto.setKbId(entity.getKbId());
        dto.setTitle(entity.getTitle());
        dto.setStatus(entity.getStatus());
        dto.setSortOrder(entity.getSortOrder());
        return dto;
    }

    private static KnowledgeRelationDto relation(
        String id,
        String fromPointId,
        String toPointId,
        String typeKey
    ) {
        return new KnowledgeRelationDto(
            id,
            "kb-1",
            typeKey,
            "前置",
            "#fa8c16",
            false,
            fromPointId,
            toPointId,
            null,
            null,
            null,
            null,
            null,
            "user",
            "ok"
        );
    }
}
