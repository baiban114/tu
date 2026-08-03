package com.tu.backend.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tu.backend.common.PageResponse;
import com.tu.backend.knowledgerelation.dto.KnowledgePointAnchorDto;
import com.tu.backend.knowledgerelation.dto.KnowledgePointDto;
import com.tu.backend.knowledgerelation.dto.KnowledgeRelationDto;
import com.tu.backend.knowledgerelation.dto.RelationsByPointDto;
import com.tu.backend.knowledgerelation.service.KnowledgePointService;
import com.tu.backend.knowledgerelation.service.KnowledgeRelationService;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.stereotype.Component;

@Component
public class AiAgentLearningDocumentTools {

    private static final String PREREQUISITE = "prerequisite";

    private final KnowledgePointService knowledgePointService;
    private final KnowledgeRelationService knowledgeRelationService;
    private final ObjectMapper objectMapper;

    public AiAgentLearningDocumentTools(
        KnowledgePointService knowledgePointService,
        KnowledgeRelationService knowledgeRelationService,
        ObjectMapper objectMapper
    ) {
        this.knowledgePointService = knowledgePointService;
        this.knowledgeRelationService = knowledgeRelationService;
        this.objectMapper = objectMapper;
    }

    @Tool(description = """
        Search knowledge points in the current knowledge base by title or alias.
        Use during phase 1 to discover points related to the learning topic.
        Requires kbId in the agent execution context.
        """)
    public String searchKnowledgePoints(
        @ToolParam(description = "Keyword for knowledge point title or alias") String query,
        @ToolParam(description = "Maximum results, default 10") Integer limit
    ) {
        String kbId = requireKbId();
        if (kbId == null) {
            return toJson(Map.of("error", "knowledge base id not provided"));
        }
        int pageSize = limit == null ? 10 : Math.clamp(limit, 1, 20);
        PageResponse<KnowledgePointDto> page = knowledgePointService.listPoints(kbId, query, 0, pageSize);
        List<Map<String, Object>> items = new ArrayList<>();
        for (KnowledgePointDto point : page.items()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", point.getId());
            item.put("title", point.getTitle());
            item.put("summary", point.getSummary() == null ? "" : point.getSummary());
            item.put("aliases", point.getAliases() == null ? List.of() : point.getAliases());
            items.add(item);
        }
        return toJson(Map.of(
            "kbId", kbId,
            "total", page.total(),
            "items", items
        ));
    }

    @Tool(description = """
        Get a knowledge point with its prerequisite neighborhood (outgoing/incoming prerequisite edges).
        Use during phase 2 to order points by prerequisites.
        """)
    public String getPointNeighborhood(
        @ToolParam(description = "Knowledge point id") String pointId
    ) {
        String kbId = requireKbId();
        if (kbId == null) {
            return toJson(Map.of("error", "knowledge base id not provided"));
        }
        String id = normalize(pointId);
        if (id.isBlank()) {
            return toJson(Map.of("error", "pointId is required"));
        }
        KnowledgePointDto point;
        try {
            point = knowledgePointService.getPoint(id);
        } catch (RuntimeException ex) {
            return toJson(Map.of("error", "knowledge point not found"));
        }
        if (!kbId.equals(point.getKbId())) {
            return toJson(Map.of("error", "point does not belong to current kb"));
        }
        RelationsByPointDto relations = knowledgeRelationService.listByPoint(kbId, id);
        List<Map<String, Object>> prerequisites = new ArrayList<>();
        List<Map<String, Object>> successors = new ArrayList<>();
        for (KnowledgeRelationDto relation : relations.outgoing()) {
            if (!PREREQUISITE.equals(normalize(relation.relationTypeKey()))) {
                continue;
            }
            Map<String, Object> edge = new LinkedHashMap<>();
            edge.put("pointId", relation.toPointId());
            edge.put("title", relation.toPointTitle());
            prerequisites.add(edge);
        }
        for (KnowledgeRelationDto relation : relations.incoming()) {
            if (!PREREQUISITE.equals(normalize(relation.relationTypeKey()))) {
                continue;
            }
            Map<String, Object> edge = new LinkedHashMap<>();
            edge.put("pointId", relation.fromPointId());
            edge.put("title", relation.fromPointTitle());
            successors.add(edge);
        }
        return toJson(Map.of(
            "id", point.getId(),
            "title", point.getTitle(),
            "summary", point.getSummary() == null ? "" : point.getSummary(),
            "prerequisites", prerequisites,
            "successors", successors
        ));
    }

    @Tool(description = """
        List insertable NodeView candidates for a knowledge point from its evidence anchors.
        Returns only existing materials: page/block refs and external resource embeds.
        Use during phase 3. Do not invent titles or locators not present in the result.
        """)
    public String listPointInsertCandidates(
        @ToolParam(description = "Knowledge point id") String pointId
    ) {
        String kbId = requireKbId();
        if (kbId == null) {
            return toJson(Map.of("error", "knowledge base id not provided"));
        }
        String id = normalize(pointId);
        if (id.isBlank()) {
            return toJson(Map.of("error", "pointId is required"));
        }
        KnowledgePointDto point;
        try {
            point = knowledgePointService.getPoint(id);
        } catch (RuntimeException ex) {
            return toJson(Map.of("error", "knowledge point not found"));
        }
        if (!kbId.equals(point.getKbId())) {
            return toJson(Map.of("error", "point does not belong to current kb"));
        }

        List<Map<String, Object>> candidates = new ArrayList<>();
        Map<String, Object> heading = new LinkedHashMap<>();
        heading.put("type", "heading");
        heading.put("forPointId", point.getId());
        heading.put("level", 2);
        heading.put("text", point.getTitle());
        heading.put("label", "知识点标题：" + point.getTitle());
        candidates.add(heading);

        for (KnowledgePointAnchorDto anchor : knowledgePointService.listAnchors(id)) {
            Map<String, Object> mapped = mapAnchor(point.getId(), anchor);
            if (mapped != null) {
                candidates.add(mapped);
            }
        }
        return toJson(Map.of(
            "pointId", point.getId(),
            "title", point.getTitle(),
            "candidates", candidates
        ));
    }

    private Map<String, Object> mapAnchor(String pointId, KnowledgePointAnchorDto anchor) {
        String kind = normalize(anchor.kind());
        String locator = normalize(anchor.locator());
        if (locator.isBlank()) {
            return null;
        }
        String label = snapshotTitle(anchor);
        if (kind.equals("page") || locator.matches("^page:[^:]+$")) {
            String pageId = locator.substring("page:".length());
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "refBlock");
            item.put("forPointId", pointId);
            item.put("refId", pageId);
            item.put("refType", "page");
            item.put("title", label.isBlank() ? pageId : label);
            item.put("label", "引用页面：" + (label.isBlank() ? pageId : label));
            return item;
        }
        if (kind.equals("block") || locator.contains(":block:")) {
            String blockId = extractAfter(locator, ":block:");
            if (blockId == null || blockId.isBlank()) {
                return null;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "refBlock");
            item.put("forPointId", pointId);
            item.put("refId", blockId);
            item.put("refType", "block");
            item.put("title", label.isBlank() ? blockId : label);
            item.put("label", "引用块：" + (label.isBlank() ? blockId : label));
            return item;
        }
        if (kind.equals("heading") || locator.contains(":heading:")) {
            // Page-level ref is the safest insert for heading evidence in phase 1.
            String pageId = extractPageId(locator);
            if (pageId == null) {
                return null;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "refBlock");
            item.put("forPointId", pointId);
            item.put("refId", pageId);
            item.put("refType", "page");
            item.put("title", label.isBlank() ? pageId : label);
            item.put("label", "引用页面（含标题证据）：" + (label.isBlank() ? pageId : label));
            return item;
        }
        if (kind.equals("resourceItem") || locator.matches("^resource:[^:]+$")) {
            String itemId = locator.startsWith("resource:")
                ? locator.substring("resource:".length())
                : locator;
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "externalResourceBlock");
            item.put("forPointId", pointId);
            item.put("itemId", itemId);
            item.put("title", label.isBlank() ? itemId : label);
            item.put("label", "外部资源：" + (label.isBlank() ? itemId : label));
            return item;
        }
        if (kind.equals("resourceExcerpt") || locator.contains(":excerpt:")) {
            String itemId = extractResourceItemId(locator);
            String excerptId = extractAfter(locator, ":excerpt:");
            if (itemId == null || excerptId == null) {
                return null;
            }
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", "externalResourceBlock");
            item.put("forPointId", pointId);
            item.put("itemId", itemId);
            item.put("excerptId", excerptId);
            item.put("title", label.isBlank() ? excerptId : label);
            item.put("label", "资源节选：" + (label.isBlank() ? excerptId : label));
            return item;
        }
        return null;
    }

    private String snapshotTitle(KnowledgePointAnchorDto anchor) {
        if (anchor.snapshot() == null) {
            return "";
        }
        Object title = anchor.snapshot().get("title");
        return title == null ? "" : String.valueOf(title).trim();
    }

    private String extractPageId(String locator) {
        if (!locator.startsWith("page:")) {
            return null;
        }
        String rest = locator.substring("page:".length());
        int colon = rest.indexOf(':');
        return colon < 0 ? rest : rest.substring(0, colon);
    }

    private String extractResourceItemId(String locator) {
        if (!locator.startsWith("resource:")) {
            return null;
        }
        String rest = locator.substring("resource:".length());
        int colon = rest.indexOf(':');
        return colon < 0 ? rest : rest.substring(0, colon);
    }

    private String extractAfter(String locator, String marker) {
        int idx = locator.indexOf(marker);
        if (idx < 0) {
            return null;
        }
        String rest = locator.substring(idx + marker.length());
        int colon = rest.indexOf(':');
        return colon < 0 ? rest : rest.substring(0, colon);
    }

    /** @return kbId or null when missing */
    private String requireKbId() {
        AiAgentExecutionContext context = AiAgentExecutionContextHolder.get();
        String kbId = context == null ? "" : normalize(context.kbId());
        return kbId.isBlank() ? null : kbId;
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim();
    }

    private String toJson(Object payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (Exception ex) {
            return "{\"error\":\"failed to serialize tool result\"}";
        }
    }
}
