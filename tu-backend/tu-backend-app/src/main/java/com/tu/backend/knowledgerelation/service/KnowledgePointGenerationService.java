package com.tu.backend.knowledgerelation.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.tu.backend.common.BusinessException;
import com.tu.backend.content.entity.PageContentEntity;
import com.tu.backend.content.repository.PageContentRepository;
import com.tu.backend.content.tiptap.TiptapDocumentWalker;
import com.tu.backend.contenttree.dto.ContentTreeNodeDto;
import com.tu.backend.contenttree.dto.PageOutlineResponseDto;
import com.tu.backend.contenttree.service.ContentTreeNodeService;
import com.tu.backend.knowledge.repository.KnowledgeBaseRepository;
import com.tu.backend.knowledgerelation.SectionLocatorKeyResolver;
import com.tu.backend.knowledgerelation.KnowledgePointTitleNormalizer;
import com.tu.backend.knowledgerelation.dto.GenerateKnowledgePointsRequest;
import com.tu.backend.knowledgerelation.dto.KnowledgeAnchorDto;
import com.tu.backend.knowledgerelation.dto.KnowledgePointGenerationItemDto;
import com.tu.backend.knowledgerelation.dto.KnowledgePointGenerationPreviewDto;
import com.tu.backend.knowledgerelation.dto.KnowledgePointGenerationPreviewItemDto;
import com.tu.backend.knowledgerelation.dto.KnowledgePointGenerationResultDto;
import com.tu.backend.page.entity.PageEntity;
import com.tu.backend.page.repository.PageRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class KnowledgePointGenerationService {

    private final PageRepository pageRepository;
    private final PageContentRepository pageContentRepository;
    private final KnowledgePointService knowledgePointService;
    private final KnowledgeBaseRepository knowledgeBaseRepository;
    private final ContentTreeNodeService contentTreeNodeService;
    private final ObjectMapper objectMapper;

    public KnowledgePointGenerationService(
        PageRepository pageRepository,
        PageContentRepository pageContentRepository,
        KnowledgePointService knowledgePointService,
        KnowledgeBaseRepository knowledgeBaseRepository,
        ContentTreeNodeService contentTreeNodeService,
        ObjectMapper objectMapper
    ) {
        this.pageRepository = pageRepository;
        this.pageContentRepository = pageContentRepository;
        this.knowledgePointService = knowledgePointService;
        this.knowledgeBaseRepository = knowledgeBaseRepository;
        this.contentTreeNodeService = contentTreeNodeService;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public KnowledgePointGenerationPreviewDto preview(String kbId, GenerateKnowledgePointsRequest request) {
        ensureKbExists(kbId);
        Set<String> sources = normalizeSources(request.sources());
        if (sources.isEmpty()) {
            throw new BusinessException(40000, "sources is required for preview");
        }
        Set<String> pageFilter = normalizePageFilter(request.pageIds());
        List<GenerationCandidate> candidates = collectCandidates(kbId, sources, pageFilter);
        List<KnowledgePointGenerationPreviewItemDto> items = new ArrayList<>();
        for (GenerationCandidate candidate : candidates) {
            boolean existed = !knowledgePointService.findPointsByLocator(kbId, candidate.locator()).isEmpty();
            items.add(new KnowledgePointGenerationPreviewItemDto(
                candidate.locator(),
                candidate.kind(),
                candidate.title(),
                candidate.pageId(),
                candidate.pageTitle(),
                existed ? "would_skip" : "would_create"
            ));
        }
        return new KnowledgePointGenerationPreviewDto(items, items.size());
    }

    @Transactional
    public KnowledgePointGenerationResultDto generate(String kbId, GenerateKnowledgePointsRequest request) {
        ensureKbExists(kbId);
        List<String> locators = request.locators() == null
            ? List.of()
            : request.locators().stream().filter(id -> id != null && !id.isBlank()).map(String::trim).toList();
        if (!locators.isEmpty()) {
            return generateByLocators(kbId, locators);
        }

        Set<String> sources = normalizeSources(request.sources());
        if (sources.isEmpty()) {
            throw new BusinessException(40000, "sources or locators is required");
        }
        Set<String> pageFilter = normalizePageFilter(request.pageIds());
        List<GenerationCandidate> candidates = collectCandidates(kbId, sources, pageFilter);

        List<KnowledgePointGenerationItemDto> items = new ArrayList<>();
        int created = 0;
        int skipped = 0;
        int failed = 0;
        for (GenerationCandidate candidate : candidates) {
            KnowledgePointGenerationItemDto item = applyCandidate(kbId, candidate);
            items.add(item);
            switch (item.status()) {
                case "created" -> created++;
                case "skipped" -> skipped++;
                default -> failed++;
            }
        }
        return new KnowledgePointGenerationResultDto(created, skipped, failed, items);
    }

    private KnowledgePointGenerationResultDto generateByLocators(String kbId, List<String> locators) {
        Set<String> locatorSet = new LinkedHashSet<>(locators);
        Set<String> pageIds = extractPageIds(locators);
        verifyPagesBelongToKb(kbId, pageIds);

        Set<String> allSources = Set.of("page", "heading", "section", "block");
        List<GenerationCandidate> candidates = collectCandidates(kbId, allSources, pageIds);
        Map<String, GenerationCandidate> byLocator = new LinkedHashMap<>();
        for (GenerationCandidate candidate : candidates) {
            byLocator.putIfAbsent(candidate.locator(), candidate);
        }

        List<KnowledgePointGenerationItemDto> items = new ArrayList<>();
        int created = 0;
        int skipped = 0;
        int failed = 0;
        for (String locator : locatorSet) {
            GenerationCandidate candidate = byLocator.get(locator);
            if (candidate == null) {
                items.add(new KnowledgePointGenerationItemDto(locator, null, locator, "failed"));
                failed++;
                continue;
            }
            KnowledgePointGenerationItemDto item = applyCandidate(kbId, candidate);
            items.add(item);
            switch (item.status()) {
                case "created" -> created++;
                case "skipped" -> skipped++;
                default -> failed++;
            }
        }
        return new KnowledgePointGenerationResultDto(created, skipped, failed, items);
    }

    private List<GenerationCandidate> collectCandidates(String kbId, Set<String> sources, Set<String> pageFilter) {
        List<PageEntity> pages = pageRepository.findByKbIdOrderBySortOrderAscCreatedAtAsc(kbId)
            .stream()
            .filter(page -> pageFilter.isEmpty() || pageFilter.contains(page.getId()))
            .toList();

        Map<String, GenerationCandidate> deduped = new LinkedHashMap<>();
        for (PageEntity page : pages) {
            if (sources.contains("page")) {
                putCandidate(deduped, pageCandidate(page));
            }
            if (sources.contains("heading") && isDocumentPage(page)) {
                for (GenerationCandidate candidate : headingCandidates(page)) {
                    putCandidate(deduped, candidate);
                }
            }
            if (sources.contains("section") && isDocumentPage(page)) {
                for (GenerationCandidate candidate : sectionCandidates(page)) {
                    putCandidate(deduped, candidate);
                }
            }
            if (sources.contains("block") && isDocumentPage(page)) {
                for (GenerationCandidate candidate : blockCandidates(page)) {
                    putCandidate(deduped, candidate);
                }
            }
        }
        return List.copyOf(deduped.values());
    }

    private static void putCandidate(Map<String, GenerationCandidate> deduped, GenerationCandidate candidate) {
        if (candidate == null || candidate.locator() == null || candidate.locator().isBlank()) {
            return;
        }
        deduped.putIfAbsent(candidate.locator(), candidate);
    }

    private GenerationCandidate pageCandidate(PageEntity page) {
        String locator = "page:" + page.getId();
        String title = KnowledgePointTitleNormalizer.fromContent(nullToBlank(page.getTitle()), "未命名页面");
        return new GenerationCandidate(locator, "page", title, page.getId(), title, pageAnchor(page));
    }

    private List<GenerationCandidate> headingCandidates(PageEntity page) {
        List<GenerationCandidate> items = new ArrayList<>();
        PageContentEntity content = pageContentRepository.findById(page.getId()).orElse(null);
        if (content == null || content.getBlocksJson() == null || content.getBlocksJson().isBlank()) {
            return items;
        }
        ArrayNode blocks = deserializeBlocks(content.getBlocksJson());
        String pageTitle = nullToBlank(page.getTitle());
        for (JsonNode block : blocks) {
            if (!block.isObject()) {
                continue;
            }
            String blockType = text(block.get("type"));
            if (!"richtext".equalsIgnoreCase(blockType) && !"richText".equals(blockType)) {
                continue;
            }
            JsonNode document = block.get("document");
            if (!TiptapDocumentWalker.isDocument(document)) {
                continue;
            }
            String defaultBlockId = text(block.get("id"));
            for (TiptapDocumentWalker.TiptapHeading heading : TiptapDocumentWalker.extractHeadings(document, defaultBlockId)) {
                String headingBlockId = heading.blockId();
                String rawTitle = heading.text() == null ? "" : heading.text().trim();
                String title = KnowledgePointTitleNormalizer.fromContent(rawTitle, "");
                if (headingBlockId == null || headingBlockId.isBlank() || title.isBlank()) {
                    continue;
                }
                String locator = "page:" + page.getId() + ":heading:" + headingBlockId;
                items.add(new GenerationCandidate(
                    locator,
                    "heading",
                    title,
                    page.getId(),
                    pageTitle,
                    headingAnchor(page.getId(), headingBlockId, title)
                ));
            }
        }
        return items;
    }

    private List<GenerationCandidate> sectionCandidates(PageEntity page) {
        List<GenerationCandidate> items = new ArrayList<>();
        PageOutlineResponseDto outline = contentTreeNodeService.getPageOutline(page.getId());
        String pageTitle = nullToBlank(page.getTitle());
        for (ContentTreeNodeDto node : outline.nodes()) {
            if (node == null) {
                continue;
            }
            String title = KnowledgePointTitleNormalizer.fromContent(nullToBlank(node.title()), "");
            if (title.isBlank()) {
                continue;
            }
            String sectionKey = SectionLocatorKeyResolver.resolve(
                node.id(),
                node.sourceBlockId(),
                node.sourceType(),
                "ref-child".equalsIgnoreCase(nullToBlank(node.sourceType())) ? node.id() : null
            );
            if (sectionKey.isBlank()) {
                continue;
            }
            String locator = "page:" + page.getId() + ":section:" + sectionKey;
            items.add(new GenerationCandidate(
                locator,
                "section",
                title,
                page.getId(),
                pageTitle,
                sectionAnchor(page.getId(), sectionKey, title)
            ));
        }
        return items;
    }

    private List<GenerationCandidate> blockCandidates(PageEntity page) {
        List<GenerationCandidate> items = new ArrayList<>();
        PageContentEntity content = pageContentRepository.findById(page.getId()).orElse(null);
        if (content == null || content.getBlocksJson() == null || content.getBlocksJson().isBlank()) {
            return items;
        }
        ArrayNode blocks = deserializeBlocks(content.getBlocksJson());
        String pageTitle = nullToBlank(page.getTitle());
        for (JsonNode block : blocks) {
            if (!block.isObject()) {
                continue;
            }
            String blockType = text(block.get("type"));
            if ("richtext".equalsIgnoreCase(blockType) || "richText".equalsIgnoreCase(blockType)) {
                continue;
            }
            String blockId = text(block.get("id"));
            if (blockId.isBlank()) {
                continue;
            }
            String title = KnowledgePointTitleNormalizer.fromContent(blockPreviewLabel(block), "");
            if (title.isBlank()) {
                title = blockType.isBlank() ? "内容块" : blockType;
            }
            String locator = "page:" + page.getId() + ":block:" + blockId;
            items.add(new GenerationCandidate(
                locator,
                "block",
                title,
                page.getId(),
                pageTitle,
                blockAnchor(page.getId(), blockId, title)
            ));
        }
        return items;
    }

    private KnowledgePointGenerationItemDto applyCandidate(String kbId, GenerationCandidate candidate) {
        try {
            return ensureAnchorPoint(kbId, candidate.anchor(), candidate.title(), candidate.locator());
        } catch (Exception ex) {
            return new KnowledgePointGenerationItemDto(candidate.locator(), null, candidate.title(), "failed");
        }
    }

    private KnowledgePointGenerationItemDto ensureAnchorPoint(
        String kbId,
        KnowledgeAnchorDto anchor,
        String title,
        String locator
    ) {
        boolean existed = !knowledgePointService.findPointsByLocator(kbId, locator).isEmpty();
        String pointId = knowledgePointService.ensurePointForAnchor(kbId, anchor, title, null);
        String resolvedTitle = title == null || title.isBlank()
            ? knowledgePointService.getPoint(pointId).getTitle()
            : title.trim();
        return new KnowledgePointGenerationItemDto(locator, pointId, resolvedTitle, existed ? "skipped" : "created");
    }

    private void verifyPagesBelongToKb(String kbId, Set<String> pageIds) {
        for (String pageId : pageIds) {
            PageEntity page = pageRepository.findById(pageId)
                .orElseThrow(() -> new BusinessException(40001, "page not found"));
            if (!kbId.equals(page.getKbId())) {
                throw new BusinessException(40000, "page does not belong to knowledge base");
            }
        }
    }

    private static Set<String> extractPageIds(List<String> locators) {
        Set<String> pageIds = new HashSet<>();
        for (String locator : locators) {
            if (locator == null || locator.isBlank()) {
                continue;
            }
            String normalized = locator.trim();
            if (!normalized.startsWith("page:")) {
                continue;
            }
            String rest = normalized.substring("page:".length());
            int colon = rest.indexOf(':');
            String pageId = colon < 0 ? rest : rest.substring(0, colon);
            if (!pageId.isBlank()) {
                pageIds.add(pageId);
            }
        }
        return pageIds;
    }

    private static Set<String> normalizeSources(List<String> rawSources) {
        Set<String> sources = new LinkedHashSet<>();
        for (String source : rawSources) {
            if (source == null || source.isBlank()) {
                continue;
            }
            String normalized = source.trim();
            if ("pageTree".equals(normalized)) {
                sources.add("page");
            } else if ("documentHeadings".equals(normalized)) {
                sources.add("heading");
            } else {
                sources.add(normalized);
            }
        }
        return sources;
    }

    private static Set<String> normalizePageFilter(List<String> pageIds) {
        if (pageIds == null || pageIds.isEmpty()) {
            return Set.of();
        }
        Set<String> filter = new LinkedHashSet<>();
        for (String pageId : pageIds) {
            if (pageId != null && !pageId.isBlank()) {
                filter.add(pageId.trim());
            }
        }
        return filter;
    }

    private KnowledgeAnchorDto pageAnchor(PageEntity page) {
        Map<String, Object> snapshot = new HashMap<>();
        if (page.getTitle() != null && !page.getTitle().isBlank()) {
            snapshot.put("title", page.getTitle().trim());
        }
        snapshot.put("pageId", page.getId());
        return new KnowledgeAnchorDto("page", "page:" + page.getId(), snapshot);
    }

    private KnowledgeAnchorDto headingAnchor(String pageId, String headingBlockId, String title) {
        Map<String, Object> snapshot = new HashMap<>();
        snapshot.put("title", title);
        snapshot.put("pageId", pageId);
        return new KnowledgeAnchorDto("heading", "page:" + pageId + ":heading:" + headingBlockId, snapshot);
    }

    private KnowledgeAnchorDto sectionAnchor(String pageId, String sectionKey, String title) {
        Map<String, Object> snapshot = new HashMap<>();
        snapshot.put("title", title);
        snapshot.put("pageId", pageId);
        return new KnowledgeAnchorDto("section", "page:" + pageId + ":section:" + sectionKey, snapshot);
    }

    private KnowledgeAnchorDto blockAnchor(String pageId, String blockId, String title) {
        Map<String, Object> snapshot = new HashMap<>();
        snapshot.put("title", title);
        snapshot.put("blockId", blockId);
        snapshot.put("pageId", pageId);
        return new KnowledgeAnchorDto("block", "page:" + pageId + ":block:" + blockId, snapshot);
    }

    private boolean isDocumentPage(PageEntity page) {
        String pageType = page.getPageType();
        return pageType == null || pageType.isBlank() || "document".equalsIgnoreCase(pageType);
    }

    private String blockPreviewLabel(JsonNode block) {
        String title = text(block.get("title"));
        if (!title.isBlank()) {
            return title;
        }
        String type = text(block.get("type"));
        if ("x6".equals(type)) {
            return "画板";
        }
        if ("table".equals(type)) {
            return "表格";
        }
        if ("line".equals(type)) {
            return "时间轴";
        }
        if ("externalResource".equals(type)) {
            JsonNode snapshot = block.path("externalResource").path("snapshot");
            String excerptTitle = text(snapshot.get("excerptTitle"));
            if (!excerptTitle.isBlank()) {
                return excerptTitle;
            }
            String resourceTitle = text(snapshot.get("resourceTitle"));
            if (!resourceTitle.isBlank()) {
                return resourceTitle;
            }
        }
        if ("ref".equals(type)) {
            return "引用块";
        }
        return type;
    }

    private ArrayNode deserializeBlocks(String blocksJson) {
        try {
            JsonNode root = objectMapper.readTree(blocksJson);
            if (root instanceof ArrayNode arrayNode) {
                return arrayNode;
            }
            return objectMapper.createArrayNode();
        } catch (Exception ex) {
            return objectMapper.createArrayNode();
        }
    }

    private void ensureKbExists(String kbId) {
        if (!knowledgeBaseRepository.existsById(kbId)) {
            throw new BusinessException(40001, "knowledge base not found");
        }
    }

    private static String text(JsonNode node) {
        if (node == null || node.isNull()) {
            return "";
        }
        return node.asText("").trim();
    }

    private static String nullToBlank(String value) {
        return value == null ? "" : value.trim();
    }

    private record GenerationCandidate(
        String locator,
        String kind,
        String title,
        String pageId,
        String pageTitle,
        KnowledgeAnchorDto anchor
    ) {
    }
}
