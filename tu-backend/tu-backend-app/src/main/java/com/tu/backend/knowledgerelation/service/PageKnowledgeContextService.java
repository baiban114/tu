package com.tu.backend.knowledgerelation.service;

import com.tu.backend.knowledgerelation.dto.KnowledgePointDto;
import com.tu.backend.knowledgerelation.dto.KnowledgeRelationDto;
import com.tu.backend.knowledgerelation.dto.PageKnowledgeContextDto;
import com.tu.backend.knowledgerelation.dto.RelationsByPointDto;
import com.tu.backend.knowledgerelation.entity.KnowledgePointAnchorEntity;
import com.tu.backend.knowledgerelation.entity.KnowledgePointEntity;
import com.tu.backend.knowledgerelation.repository.KnowledgePointAnchorRepository;
import com.tu.backend.knowledgerelation.repository.KnowledgePointRepository;
import com.tu.backend.knowledge.repository.KnowledgeBaseRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class PageKnowledgeContextService {

    private static final String PREREQUISITE_TYPE = "prerequisite";

    private final KnowledgePointAnchorRepository knowledgePointAnchorRepository;
    private final KnowledgePointRepository knowledgePointRepository;
    private final KnowledgeRelationService knowledgeRelationService;
    private final KnowledgePointService knowledgePointService;
    private final KnowledgeBaseRepository knowledgeBaseRepository;

    public PageKnowledgeContextService(
        KnowledgePointAnchorRepository knowledgePointAnchorRepository,
        KnowledgePointRepository knowledgePointRepository,
        KnowledgeRelationService knowledgeRelationService,
        KnowledgePointService knowledgePointService,
        KnowledgeBaseRepository knowledgeBaseRepository
    ) {
        this.knowledgePointAnchorRepository = knowledgePointAnchorRepository;
        this.knowledgePointRepository = knowledgePointRepository;
        this.knowledgeRelationService = knowledgeRelationService;
        this.knowledgePointService = knowledgePointService;
        this.knowledgeBaseRepository = knowledgeBaseRepository;
    }

    @Transactional(readOnly = true)
    public PageKnowledgeContextDto getPageKnowledgeContext(String kbId, String pageId) {
        ensureKbExists(kbId);
        if (pageId == null || pageId.isBlank()) {
            return emptyContext("");
        }

        String trimmedPageId = pageId.trim();
        String pageLocator = "page:" + trimmedPageId;
        String pagePrefix = pageLocator + ":";

        PagePointsLoadResult loaded = loadPagePoints(kbId, pageLocator, pagePrefix);
        List<KnowledgePointDto> pagePoints = loaded.pageLevelPoints();
        Set<String> pageRelatedPointIds = loaded.allPageRelatedPointIds();

        Map<String, KnowledgePointDto> prerequisiteMap = new LinkedHashMap<>();
        Map<String, KnowledgePointDto> successorMap = new LinkedHashMap<>();

        for (String pageRelatedPointId : pageRelatedPointIds) {
            RelationsByPointDto relations = knowledgeRelationService.listByPoint(kbId, pageRelatedPointId);
            for (KnowledgeRelationDto relation : relations.outgoing()) {
                if (!PREREQUISITE_TYPE.equals(relation.relationTypeKey())) {
                    continue;
                }
                String targetId = normalize(relation.toPointId());
                if (targetId == null || pageRelatedPointIds.contains(targetId)) {
                    continue;
                }
                loadPointIfAbsent(kbId, targetId, prerequisiteMap);
            }
            for (KnowledgeRelationDto relation : relations.incoming()) {
                if (!PREREQUISITE_TYPE.equals(relation.relationTypeKey())) {
                    continue;
                }
                String sourceId = normalize(relation.fromPointId());
                if (sourceId == null || pageRelatedPointIds.contains(sourceId)) {
                    continue;
                }
                loadPointIfAbsent(kbId, sourceId, successorMap);
            }
        }

        return new PageKnowledgeContextDto(
            trimmedPageId,
            pagePoints,
            List.copyOf(prerequisiteMap.values()),
            List.copyOf(successorMap.values())
        );
    }

    private PagePointsLoadResult loadPagePoints(String kbId, String pageLocator, String pagePrefix) {
        Map<String, KnowledgePointDto> pageLevelPoints = new LinkedHashMap<>();
        Set<String> allPageRelatedPointIds = new LinkedHashSet<>();
        for (KnowledgePointAnchorEntity anchor : knowledgePointAnchorRepository.findByPageLocatorPrefix(pageLocator, pagePrefix)) {
            KnowledgePointEntity entity = knowledgePointRepository.findById(anchor.getKnowledgePointId()).orElse(null);
            if (entity == null || !kbId.equals(entity.getKbId())) {
                continue;
            }
            allPageRelatedPointIds.add(entity.getId());
            if (pageLocator.equals(anchor.getLocator())) {
                pageLevelPoints.putIfAbsent(entity.getId(), knowledgePointService.getPoint(entity.getId()));
            }
        }
        return new PagePointsLoadResult(
            new ArrayList<>(pageLevelPoints.values()),
            allPageRelatedPointIds
        );
    }

    private record PagePointsLoadResult(
        List<KnowledgePointDto> pageLevelPoints,
        Set<String> allPageRelatedPointIds
    ) {}

    private void loadPointIfAbsent(String kbId, String pointId, Map<String, KnowledgePointDto> target) {
        if (target.containsKey(pointId)) {
            return;
        }
        KnowledgePointEntity entity = knowledgePointRepository.findById(pointId).orElse(null);
        if (entity == null || !kbId.equals(entity.getKbId())) {
            return;
        }
        target.put(pointId, knowledgePointService.getPoint(pointId));
    }

    private static PageKnowledgeContextDto emptyContext(String pageId) {
        return new PageKnowledgeContextDto(pageId, List.of(), List.of(), List.of());
    }

    private void ensureKbExists(String kbId) {
        if (!knowledgeBaseRepository.existsById(kbId)) {
            throw new com.tu.backend.common.BusinessException(40001, "knowledge base not found");
        }
    }

    private static String normalize(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
