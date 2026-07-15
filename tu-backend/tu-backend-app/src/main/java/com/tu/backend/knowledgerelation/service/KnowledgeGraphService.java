package com.tu.backend.knowledgerelation.service;

import com.tu.backend.common.BusinessException;
import com.tu.backend.knowledgerelation.dto.KnowledgeGraphDto;
import com.tu.backend.knowledgerelation.dto.KnowledgeGraphEdgeDto;
import com.tu.backend.knowledgerelation.dto.KnowledgeGraphMetaDto;
import com.tu.backend.knowledgerelation.dto.KnowledgeGraphNodeDto;
import com.tu.backend.knowledgerelation.dto.RelationTypeDefDto;
import com.tu.backend.knowledgerelation.entity.KnowledgePointEntity;
import com.tu.backend.knowledgerelation.entity.KnowledgeRelationEntity;
import com.tu.backend.knowledgerelation.repository.KnowledgePointRepository;
import com.tu.backend.knowledgerelation.repository.KnowledgeRelationRepository;
import com.tu.backend.knowledge.repository.KnowledgeBaseRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class KnowledgeGraphService {

    private static final String PREREQUISITE_TYPE = "prerequisite";
    private static final int DEFAULT_MAX_NODES = 500;
    private static final int DEFAULT_DEPTH = 2;

    private final KnowledgePointRepository knowledgePointRepository;
    private final KnowledgeRelationRepository knowledgeRelationRepository;
    private final KnowledgeBaseRepository knowledgeBaseRepository;
    private final RelationTypeService relationTypeService;

    public KnowledgeGraphService(
        KnowledgePointRepository knowledgePointRepository,
        KnowledgeRelationRepository knowledgeRelationRepository,
        KnowledgeBaseRepository knowledgeBaseRepository,
        RelationTypeService relationTypeService
    ) {
        this.knowledgePointRepository = knowledgePointRepository;
        this.knowledgeRelationRepository = knowledgeRelationRepository;
        this.knowledgeBaseRepository = knowledgeBaseRepository;
        this.relationTypeService = relationTypeService;
    }

    @Transactional(readOnly = true)
    public KnowledgeGraphDto getGraph(
        String kbId,
        String mode,
        String centerPointId,
        Integer depth,
        String direction,
        String relationTypeKeys,
        Integer maxNodes
    ) {
        ensureKbExists(kbId);
        String normalizedMode = normalizeMode(mode);
        int safeMaxNodes = Math.clamp(maxNodes == null ? DEFAULT_MAX_NODES : maxNodes, 1, 2000);
        int safeDepth = Math.clamp(depth == null ? DEFAULT_DEPTH : depth, 1, 10);
        Set<String> typeFilter = parseTypeKeys(relationTypeKeys);

        Map<String, KnowledgePointEntity> allPoints = loadPointMap(kbId);
        List<PointEdge> allEdges = loadPointEdges(kbId, allPoints.keySet(), typeFilter, normalizedMode);

        Set<String> selectedPointIds;
        List<String> warnings = new ArrayList<>();
        boolean truncated = false;

        switch (normalizedMode) {
            case "centered" -> {
                String center = requireCenterPointId(centerPointId);
                if (!allPoints.containsKey(center)) {
                    throw new BusinessException(40001, "center point not found: " + center);
                }
                BfsResult bfs = bfsCentered(center, safeDepth, safeMaxNodes, allEdges);
                selectedPointIds = bfs.pointIds;
                truncated = bfs.truncated;
            }
            case "prerequisite" -> {
                String center = requireCenterPointId(centerPointId);
                if (!allPoints.containsKey(center)) {
                    throw new BusinessException(40001, "center point not found: " + center);
                }
                List<PointEdge> prereqEdges = loadPointEdges(kbId, allPoints.keySet(), Set.of(PREREQUISITE_TYPE), "prerequisite");
                BfsResult bfs = bfsPrerequisite(center, safeDepth, safeMaxNodes, prereqEdges, normalizeDirection(direction));
                selectedPointIds = bfs.pointIds;
                truncated = bfs.truncated;
                if (bfs.cycleDetected) {
                    warnings.add("prerequisite chain contains a cycle; traversal stopped at revisits");
                }
            }
            default -> {
                selectedPointIds = new LinkedHashSet<>();
                for (KnowledgePointEntity entity : allPoints.values().stream()
                    .sorted(java.util.Comparator.comparing(KnowledgePointEntity::getSortOrder)
                        .thenComparing(KnowledgePointEntity::getTitle))
                    .toList()) {
                    if (selectedPointIds.size() >= safeMaxNodes) {
                        truncated = true;
                        break;
                    }
                    selectedPointIds.add(entity.getId());
                }
                if (allPoints.size() > selectedPointIds.size()) {
                    truncated = true;
                }
            }
        }

        List<KnowledgeGraphNodeDto> nodes = selectedPointIds.stream()
            .map(id -> toNodeDto(allPoints.get(id)))
            .filter(java.util.Objects::nonNull)
            .toList();

        Set<String> nodeIdSet = new HashSet<>(selectedPointIds);
        List<KnowledgeGraphEdgeDto> edges = allEdges.stream()
            .filter(edge -> nodeIdSet.contains(edge.fromPointId()) && nodeIdSet.contains(edge.toPointId()))
            .map(this::toEdgeDto)
            .toList();

        KnowledgeGraphMetaDto meta = new KnowledgeGraphMetaDto(
            normalizedMode,
            normalize(centerPointId),
            allPoints.size(),
            allEdges.size(),
            truncated,
            warnings
        );
        return new KnowledgeGraphDto(nodes, edges, meta);
    }

    private BfsResult bfsCentered(String center, int depth, int maxNodes, List<PointEdge> edges) {
        Map<String, Set<String>> neighbors = buildUndirectedAdjacency(edges);
        Set<String> visited = new LinkedHashSet<>();
        ArrayDeque<String> queue = new ArrayDeque<>();
        Map<String, Integer> hop = new HashMap<>();

        queue.add(center);
        hop.put(center, 0);
        visited.add(center);
        boolean truncated = false;

        while (!queue.isEmpty()) {
            String current = queue.poll();
            int currentHop = hop.getOrDefault(current, 0);
            if (currentHop >= depth) {
                continue;
            }
            for (String next : neighbors.getOrDefault(current, Set.of())) {
                if (visited.contains(next)) {
                    continue;
                }
                if (visited.size() >= maxNodes) {
                    truncated = true;
                    return new BfsResult(visited, truncated, false);
                }
                visited.add(next);
                hop.put(next, currentHop + 1);
                queue.add(next);
            }
        }
        return new BfsResult(visited, truncated, false);
    }

    private BfsResult bfsPrerequisite(
        String center,
        int depth,
        int maxNodes,
        List<PointEdge> edges,
        String direction
    ) {
        Map<String, Set<String>> outAdj = new HashMap<>();
        Map<String, Set<String>> inAdj = new HashMap<>();
        for (PointEdge edge : edges) {
            outAdj.computeIfAbsent(edge.fromPointId(), key -> new LinkedHashSet<>()).add(edge.toPointId());
            inAdj.computeIfAbsent(edge.toPointId(), key -> new LinkedHashSet<>()).add(edge.fromPointId());
        }

        Set<String> visited = new LinkedHashSet<>();
        ArrayDeque<String> queue = new ArrayDeque<>();
        Map<String, Integer> hop = new HashMap<>();
        boolean cycleDetected = false;
        boolean truncated = false;

        queue.add(center);
        hop.put(center, 0);
        visited.add(center);

        while (!queue.isEmpty()) {
            String current = queue.poll();
            int currentHop = hop.getOrDefault(current, 0);
            if (currentHop >= depth) {
                continue;
            }

            Set<String> nextNodes = new LinkedHashSet<>();
            if ("out".equals(direction) || "both".equals(direction)) {
                nextNodes.addAll(inAdj.getOrDefault(current, Set.of()));
            }
            if ("in".equals(direction) || "both".equals(direction)) {
                nextNodes.addAll(outAdj.getOrDefault(current, Set.of()));
            }

            for (String next : nextNodes) {
                if (visited.contains(next)) {
                    cycleDetected = true;
                    continue;
                }
                if (visited.size() >= maxNodes) {
                    truncated = true;
                    return new BfsResult(visited, truncated, cycleDetected);
                }
                visited.add(next);
                hop.put(next, currentHop + 1);
                queue.add(next);
            }
        }
        return new BfsResult(visited, truncated, cycleDetected);
    }

    private Map<String, Set<String>> buildUndirectedAdjacency(List<PointEdge> edges) {
        Map<String, Set<String>> neighbors = new HashMap<>();
        for (PointEdge edge : edges) {
            neighbors.computeIfAbsent(edge.fromPointId(), key -> new LinkedHashSet<>()).add(edge.toPointId());
            neighbors.computeIfAbsent(edge.toPointId(), key -> new LinkedHashSet<>()).add(edge.fromPointId());
        }
        return neighbors;
    }

    private List<PointEdge> loadPointEdges(
        String kbId,
        Set<String> validPointIds,
        Set<String> typeFilter,
        String mode
    ) {
        return knowledgeRelationRepository.findByKbIdOrderByUpdatedAtDescCreatedAtDesc(kbId).stream()
            .filter(entity -> isPointEdge(entity, validPointIds))
            .filter(entity -> matchesTypeFilter(entity.getRelationTypeKey(), typeFilter, mode))
            .map(this::toPointEdge)
            .toList();
    }

    private boolean matchesTypeFilter(String typeKey, Set<String> typeFilter, String mode) {
        if ("prerequisite".equals(mode)) {
            return PREREQUISITE_TYPE.equals(typeKey);
        }
        if (typeFilter.isEmpty()) {
            return true;
        }
        return typeFilter.contains(typeKey);
    }

    private boolean isPointEdge(KnowledgeRelationEntity entity, Set<String> validPointIds) {
        String from = normalize(entity.getFromPointId());
        String to = normalize(entity.getToPointId());
        return from != null && to != null && validPointIds.contains(from) && validPointIds.contains(to);
    }

    private PointEdge toPointEdge(KnowledgeRelationEntity entity) {
        RelationTypeDefDto type = relationTypeService.resolveType(entity.getKbId(), entity.getRelationTypeKey());
        return new PointEdge(
            entity.getId(),
            entity.getFromPointId(),
            entity.getToPointId(),
            entity.getRelationTypeKey(),
            type.label(),
            type.color(),
            type.bidirectional()
        );
    }

    private KnowledgeGraphEdgeDto toEdgeDto(PointEdge edge) {
        return new KnowledgeGraphEdgeDto(
            edge.id(),
            edge.fromPointId(),
            edge.toPointId(),
            edge.relationTypeKey(),
            edge.label(),
            edge.color(),
            edge.bidirectional()
        );
    }

    private KnowledgeGraphNodeDto toNodeDto(KnowledgePointEntity entity) {
        if (entity == null) {
            return null;
        }
        Double hours = entity.getEstimatedHours() == null ? null : entity.getEstimatedHours().doubleValue();
        return new KnowledgeGraphNodeDto(
            entity.getId(),
            entity.getTitle(),
            entity.getParentId(),
            hours,
            entity.getSummary(),
            entity.getSortOrder() == null ? 0 : entity.getSortOrder()
        );
    }

    private Map<String, KnowledgePointEntity> loadPointMap(String kbId) {
        return knowledgePointRepository.findByKbIdOrderBySortOrderAscTitleAsc(kbId).stream()
            .collect(Collectors.toMap(KnowledgePointEntity::getId, entity -> entity, (a, b) -> a, HashMap::new));
    }

    private Set<String> parseTypeKeys(String raw) {
        if (raw == null || raw.isBlank()) {
            return Set.of();
        }
        return java.util.Arrays.stream(raw.split(","))
            .map(String::trim)
            .filter(item -> !item.isEmpty())
            .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private String normalizeMode(String mode) {
        if (mode == null || mode.isBlank()) {
            return "full";
        }
        String normalized = mode.trim().toLowerCase(Locale.ROOT);
        if (!Set.of("full", "centered", "prerequisite").contains(normalized)) {
            throw new BusinessException(40000, "invalid graph mode: " + mode);
        }
        return normalized;
    }

    private String normalizeDirection(String direction) {
        if (direction == null || direction.isBlank()) {
            return "out";
        }
        String normalized = direction.trim().toLowerCase(Locale.ROOT);
        if (!Set.of("out", "in", "both").contains(normalized)) {
            throw new BusinessException(40000, "invalid graph direction: " + direction);
        }
        return normalized;
    }

    private String requireCenterPointId(String centerPointId) {
        String normalized = normalize(centerPointId);
        if (normalized == null) {
            throw new BusinessException(40000, "centerPointId is required for this graph mode");
        }
        return normalized;
    }

    private String normalize(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private void ensureKbExists(String kbId) {
        if (!knowledgeBaseRepository.existsById(kbId)) {
            throw new BusinessException(40001, "knowledge base not found");
        }
    }

    private record PointEdge(
        String id,
        String fromPointId,
        String toPointId,
        String relationTypeKey,
        String label,
        String color,
        boolean bidirectional
    ) {
    }

    private record BfsResult(Set<String> pointIds, boolean truncated, boolean cycleDetected) {
    }
}
