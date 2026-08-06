package com.tu.backend.tag.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.tu.backend.common.PageResponse;
import com.tu.backend.content.entity.PageContentEntity;
import com.tu.backend.content.repository.PageContentRepository;
import com.tu.backend.page.entity.PageEntity;
import com.tu.backend.page.repository.PageRepository;
import com.tu.backend.tag.dto.TagPoolItemDto;
import com.tu.backend.tag.dto.TaggedContentItemDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class TaggedContentService {

    private static final Logger log = LoggerFactory.getLogger(TaggedContentService.class);

    private static final int DEFAULT_PAGE_SIZE = 10;
    private static final int MAX_PAGE_SIZE = 200;
    private static final int SNIPPET_MAX_LENGTH = 120;

    private static final Pattern ATX_HEADING_RE = Pattern.compile("^#{1,6}\\s+(.+)$");
    private static final String HEADING_ID_COMMENT_RE = "<!--tu:heading-id\\s+id=\"([^\"]+)\"-->";

    private final PageRepository pageRepository;
    private final PageContentRepository pageContentRepository;
    private final ObjectMapper objectMapper;

    public TaggedContentService(
        PageRepository pageRepository,
        PageContentRepository pageContentRepository,
        ObjectMapper objectMapper
    ) {
        this.pageRepository = pageRepository;
        this.pageContentRepository = pageContentRepository;
        this.objectMapper = objectMapper;
    }

    private record BlockTag(String id, String label, String color) {
    }

    private record PageTagContext(
        List<BlockTag> pageTags,
        List<TextTagSpan> textTagSpans,
        Map<String, List<BlockTag>> sectionTags,
        JsonNode document,
        List<JsonNode> topLevelBlocks
    ) {
    }

    private record TextTagSpan(
        String id,
        String blockId,
        String selectedText,
        List<BlockTag> tags
    ) {
    }

    private record BlockTagHit(String blockId, String title, List<BlockTag> tags, JsonNode node) {
    }

    @Transactional(readOnly = true)
    public List<TagPoolItemDto> listKbTags(String kbId) {
        Map<String, TagPoolItemDto> pool = new LinkedHashMap<>();

        for (PageEntity page : pageRepository.findByKbIdOrderBySortOrderAscCreatedAtAsc(kbId)) {
            PageTagContext ctx = loadContext(page.getId());
            collectPageTags(ctx.pageTags(), pool);
            collectTextTagSpanTags(ctx.textTagSpans(), pool);
            collectSectionTags(ctx.sectionTags(), pool);
            collectNodeTags(ctx.document(), ctx.topLevelBlocks(), pool);
        }

        return new ArrayList<>(pool.values());
    }

    @Transactional(readOnly = true)
    public PageResponse<TaggedContentItemDto> listTaggedContent(
        String kbId,
        String tagLabel,
        int pageIndex,
        int pageSize
    ) {
        String normalizedLabel = normalizeLabel(tagLabel);
        int safePage = Math.max(0, pageIndex);
        int safePageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize == 0 ? DEFAULT_PAGE_SIZE : pageSize));
        List<TaggedContentItemDto> all = new ArrayList<>();

        if (normalizedLabel.isEmpty()) {
            return PageResponse.of(List.of(), 0, safePage, safePageSize);
        }

        for (PageEntity page : pageRepository.findByKbIdOrderBySortOrderAscCreatedAtAsc(kbId)) {
            LocalDateTime updatedAt = resolveUpdatedAt(page);
            PageTagContext ctx = loadContext(page.getId());

            for (Map.Entry<String, List<BlockTag>> entry : ctx.sectionTags().entrySet()) {
                List<BlockTag> matched = matchingTags(entry.getValue(), normalizedLabel);
                if (matched.isEmpty()) {
                    continue;
                }
                all.add(toSectionItem(page, ctx, entry.getKey(), matched, updatedAt));
            }

            for (TextTagSpan textTagSpan : ctx.textTagSpans()) {
                List<BlockTag> matched = matchingTags(textTagSpan.tags(), normalizedLabel);
                if (!matched.isEmpty()) {
                    all.add(toTextItem(page, textTagSpan, matched, updatedAt));
                }
            }

            for (BlockTagHit hit : collectBlockHits(ctx.document(), ctx.topLevelBlocks(), normalizedLabel)) {
                all.add(toBlockItem(page, hit, updatedAt));
            }
        }

        all.sort(Comparator
            .comparing(TaggedContentItemDto::updatedAt, Comparator.nullsLast(Comparator.reverseOrder()))
            .thenComparing(TaggedContentItemDto::pageId)
            .thenComparing(TaggedContentItemDto::id));

        long total = all.size();
        int fromIndex = safePage * safePageSize;
        if (fromIndex >= total) {
            return PageResponse.of(List.of(), total, safePage, safePageSize);
        }
        int toIndex = Math.min(fromIndex + safePageSize, (int) total);
        return PageResponse.of(all.subList(fromIndex, toIndex), total, safePage, safePageSize);
    }

    // ─── item assembly ───────────────────────────────────────────────────────

    private TaggedContentItemDto toSectionItem(
        PageEntity page,
        PageTagContext ctx,
        String sectionKey,
        List<BlockTag> matched,
        LocalDateTime updatedAt
    ) {
        String blockId = resolveSectionBlockId(sectionKey);
        String title = resolveHeadingTitle(ctx.document(), ctx.topLevelBlocks(), blockId);
        if (title.isEmpty()) {
            title = matched.isEmpty() ? sectionKey : matched.get(0).label();
        }
        return new TaggedContentItemDto(
            "section:" + page.getId() + ":" + sectionKey,
            "section",
            page.getId(),
            page.getTitle(),
            blockId,
            sectionKey,
            title,
            clip(title),
            toTagPoolItems(matched),
            updatedAt
        );
    }

    private TaggedContentItemDto toBlockItem(PageEntity page, BlockTagHit hit, LocalDateTime updatedAt) {
        String title = hit.title();
        if (title.isEmpty() && !hit.tags().isEmpty()) {
            title = hit.tags().get(0).label();
        }
        String snippet = extractSnippet(hit.node(), hit.title());
        return new TaggedContentItemDto(
            "block:" + page.getId() + ":" + hit.blockId(),
            "block",
            page.getId(),
            page.getTitle(),
            hit.blockId(),
            null,
            title,
            clip(snippet),
            toTagPoolItems(hit.tags()),
            updatedAt
        );
    }

    private TaggedContentItemDto toTextItem(
        PageEntity page,
        TextTagSpan textTagSpan,
        List<BlockTag> matched,
        LocalDateTime updatedAt
    ) {
        String selectedText = textTagSpan.selectedText().trim();
        String title = selectedText.isEmpty() ? matched.get(0).label() : clip(selectedText);
        String spanId = textTagSpan.id().isEmpty()
            ? Integer.toUnsignedString((textTagSpan.blockId() + selectedText).hashCode())
            : textTagSpan.id();
        return new TaggedContentItemDto(
            "text:" + page.getId() + ":" + spanId,
            "text",
            page.getId(),
            page.getTitle(),
            textTagSpan.blockId().isEmpty() ? null : textTagSpan.blockId(),
            null,
            title,
            clip(selectedText),
            toTagPoolItems(matched),
            updatedAt
        );
    }

    // ─── context loading ─────────────────────────────────────────────────────

    private PageTagContext loadContext(String pageId) {
        PageContentEntity content = pageContentRepository.findById(pageId).orElse(null);
        if (content == null) {
            return new PageTagContext(List.of(), List.of(), Map.of(), null, List.of());
        }
        try {
            JsonNode root = objectMapper.readTree(content.getBlocksJson());
            ArrayNode blocks = root instanceof ArrayNode array ? array : objectMapper.createArrayNode();

            ObjectNode pageRichText = findPageRichText(blocks);
            JsonNode pageMeta = pageRichText != null ? pageRichText.get("metadata") : null;

            List<BlockTag> pageTags = readTags(pageMeta, "tags");
            List<TextTagSpan> textTagSpans = readTextTagSpans(pageMeta);
            Map<String, List<BlockTag>> sectionTags = readSectionTags(pageMeta);

            JsonNode document = null;
            if (pageRichText != null) {
                JsonNode doc = pageRichText.get("document");
                if (doc != null && doc.isObject()) {
                    document = doc;
                }
            }

            List<JsonNode> topLevelBlocks = new ArrayList<>();
            if (document == null) {
                for (JsonNode block : blocks) {
                    if (!isPageRichText(block)) {
                        topLevelBlocks.add(block);
                    }
                }
            }
            return new PageTagContext(pageTags, textTagSpans, sectionTags, document, topLevelBlocks);
        } catch (Exception ex) {
            log.warn("skip unreadable page content for tag indexing: {}", pageId, ex);
            return new PageTagContext(List.of(), List.of(), Map.of(), null, List.of());
        }
    }

    private ObjectNode findPageRichText(ArrayNode blocks) {
        for (JsonNode block : blocks) {
            if (isPageRichText(block)) {
                return (ObjectNode) block;
            }
        }
        return null;
    }

    private boolean isPageRichText(JsonNode block) {
        if (!block.isObject()) {
            return false;
        }
        String type = block.path("type").asText("");
        if (!"richtext".equalsIgnoreCase(type) && !"richText".equals(type)) {
            return false;
        }
        String id = block.path("id").asText("");
        return id.isEmpty() || "page-content".equals(id);
    }

    private LocalDateTime resolveUpdatedAt(PageEntity page) {
        return pageContentRepository.findById(page.getId())
            .map(PageContentEntity::getUpdatedAt)
            .orElseGet(() -> {
                LocalDateTime pageUpdated = page.getUpdatedAt();
                return pageUpdated != null ? pageUpdated : page.getCreatedAt();
            });
    }

    // ─── node traversal (block / embed tags) ────────────────────────────────

    private void collectNodeTags(
        JsonNode document,
        List<JsonNode> topLevelBlocks,
        Map<String, TagPoolItemDto> pool
    ) {
        if (document != null) {
            walkDocumentNodes(document, node -> collectPageTags(readNodeTags(node), pool));
            return;
        }
        for (JsonNode block : topLevelBlocks) {
            walkBlockRecursive(block, node -> collectPageTags(readBlockMetaTags(node), pool));
        }
    }

    private List<BlockTagHit> collectBlockHits(
        JsonNode document,
        List<JsonNode> topLevelBlocks,
        String normalizedLabel
    ) {
        List<BlockTagHit> hits = new ArrayList<>();
        if (document != null) {
            walkDocumentNodes(document, node -> {
                String blockId = node.path("attrs").path("blockId").asText("");
                if (blockId.isEmpty()) {
                    return;
                }
                List<BlockTag> matched = matchingTags(readNodeTags(node), normalizedLabel);
                if (!matched.isEmpty()) {
                    hits.add(new BlockTagHit(blockId, nodeTitle(node), matched, node));
                }
            });
            return hits;
        }

        for (JsonNode block : topLevelBlocks) {
            walkBlockRecursive(block, node -> {
                String blockId = node.path("id").asText("");
                if (blockId.isEmpty()) {
                    return;
                }
                List<BlockTag> matched = matchingTags(readBlockMetaTags(node).stream().toList(), normalizedLabel);
                if (!matched.isEmpty()) {
                    hits.add(new BlockTagHit(blockId, blockTitle(node), matched, node));
                }
            });
        }
        return hits;
    }

    private interface NodeConsumer {
        void accept(ObjectNode node);
    }

    private void walkDocumentNodes(JsonNode doc, NodeConsumer consumer) {
        walkDocumentNodesRecursive(doc, consumer);
    }

    private void walkDocumentNodesRecursive(JsonNode node, NodeConsumer consumer) {
        if (node instanceof ObjectNode objectNode) {
            consumer.accept(objectNode);
        }
        JsonNode children = node.get("content");
        if (children instanceof ArrayNode array) {
            for (JsonNode child : array) {
                walkDocumentNodesRecursive(child, consumer);
            }
        }
    }

    private void walkBlockRecursive(JsonNode block, NodeConsumer consumer) {
        if (block instanceof ObjectNode objectNode) {
            consumer.accept(objectNode);
        }
        JsonNode children = block.get("children");
        if (children instanceof ArrayNode array) {
            for (JsonNode child : array) {
                walkBlockRecursive(child, consumer);
            }
        }
    }

    // ─── tag readers ─────────────────────────────────────────────────────────

    private List<BlockTag> readTags(JsonNode container, String field) {
        List<BlockTag> tags = new ArrayList<>();
        if (container == null || !container.has(field)) {
            return tags;
        }
        JsonNode node = container.get(field);
        if (!(node instanceof ArrayNode array)) {
            return tags;
        }
        for (JsonNode item : array) {
            if (!(item instanceof ObjectNode tag)) {
                continue;
            }
            LabelExtracted extracted = readLabel(tag);
            tags.add(new BlockTag(
                tag.path("id").asText(""),
                extracted.label(),
                extracted.color()
            ));
        }
        return tags;
    }

    private List<BlockTag> readNodeTags(JsonNode node) {
        JsonNode meta = node.path("attrs").get("metadata");
        if (meta == null || !meta.isObject()) {
            return List.of();
        }
        return readTags(meta, "tags");
    }

    private List<BlockTag> readBlockMetaTags(JsonNode block) {
        return readTags(block.get("metadata"), "tags");
    }

    private List<TextTagSpan> readTextTagSpans(JsonNode pageMeta) {
        List<TextTagSpan> result = new ArrayList<>();
        if (pageMeta == null || !pageMeta.has("textTagSpans")) {
            return result;
        }
        JsonNode spans = pageMeta.get("textTagSpans");
        if (!(spans instanceof ArrayNode array)) {
            return result;
        }
        for (JsonNode span : array) {
            List<BlockTag> tags = readTags(span, "tags");
            if (tags.isEmpty()) {
                continue;
            }
            result.add(new TextTagSpan(
                span.path("id").asText(""),
                span.path("blockId").asText(""),
                span.path("selectedText").asText(""),
                tags
            ));
        }
        return result;
    }

    private Map<String, List<BlockTag>> readSectionTags(JsonNode pageMeta) {
        Map<String, List<BlockTag>> result = new LinkedHashMap<>();
        if (pageMeta == null || !pageMeta.has("sectionTags")) {
            return result;
        }
        JsonNode sectionTags = pageMeta.get("sectionTags");
        if (!sectionTags.isObject()) {
            return result;
        }
        sectionTags.fields().forEachRemaining(entry -> {
            List<BlockTag> tags = new ArrayList<>();
            if (entry.getValue() instanceof ArrayNode array) {
                for (JsonNode item : array) {
                    if (item instanceof ObjectNode tag) {
                        LabelExtracted extracted = readLabel(tag);
                        tags.add(new BlockTag(
                            tag.path("id").asText(""),
                            extracted.label(),
                            extracted.color()
                        ));
                    }
                }
            }
            if (!tags.isEmpty()) {
                result.put(entry.getKey(), tags);
            }
        });
        return result;
    }

    private record LabelExtracted(String label, String color) {
    }

    private LabelExtracted readLabel(ObjectNode tag) {
        String label = tag.path("label").asText("");
        String color = tag.path("color").asText("");
        return new LabelExtracted(label, color);
    }

    // ─── title / snippet ─────────────────────────────────────────────────────

    private String resolveHeadingTitle(JsonNode document, List<JsonNode> topLevelBlocks, String blockId) {
        if (blockId.isEmpty()) {
            return "";
        }
        if (document != null) {
            return resolveDocumentHeadingTitle(document, blockId);
        }
        for (JsonNode block : topLevelBlocks) {
            String text = resolveBlockHeadingTitle(block, blockId);
            if (!text.isEmpty()) {
                return text;
            }
        }
        return "";
    }

    private String resolveDocumentHeadingTitle(JsonNode doc, String blockId) {
        if (!(doc instanceof ObjectNode objectNode)) {
            return "";
        }
        String id = objectNode.path("attrs").path("blockId").asText("");
        if (blockId.equals(id)) {
            return nodeText(objectNode);
        }
        JsonNode children = doc.get("content");
        if (children instanceof ArrayNode array) {
            for (JsonNode child : array) {
                String text = resolveDocumentHeadingTitle(child, blockId);
                if (!text.isEmpty()) {
                    return text;
                }
            }
        }
        return "";
    }

    private String resolveBlockHeadingTitle(JsonNode block, String blockId) {
        if (!(block instanceof ObjectNode objectNode)) {
            return "";
        }
        if (blockId.equals(objectNode.path("id").asText(""))) {
            return headingTextFromContent(objectNode);
        }
        JsonNode children = block.get("children");
        if (children instanceof ArrayNode array) {
            for (JsonNode child : array) {
                String text = resolveBlockHeadingTitle(child, blockId);
                if (!text.isEmpty()) {
                    return text;
                }
            }
        }
        return "";
    }

    private String headingTextFromContent(ObjectNode block) {
        String content = block.path("content").asText("");
        String line = firstNonMetaLine(content);
        Matcher matcher = ATX_HEADING_RE.matcher(line);
        return matcher.matches() ? matcher.group(1).trim() : "";
    }

    private String firstNonMetaLine(String content) {
        if (content.isEmpty()) {
            return "";
        }
        String[] lines = content.split("\n");
        for (String rawLine : lines) {
            String line = rawLine.trim();
            if (line.isEmpty()) {
                continue;
            }
            if (line.matches("^<!--tu:.*-->$")) {
                continue;
            }
            return line;
        }
        return "";
    }

    private String nodeTitle(JsonNode node) {
        String title = node.path("attrs").path("title").asText("");
        if (!title.isEmpty()) {
            return title;
        }
        return nodeText(node);
    }

    private String blockTitle(JsonNode block) {
        String title = block.path("title").asText("");
        if (!title.isEmpty()) {
            return title;
        }
        String line = firstNonMetaLine(block.path("content").asText(""));
        if (line.isEmpty()) {
            return "";
        }
        Matcher matcher = ATX_HEADING_RE.matcher(line);
        if (matcher.matches()) {
            return matcher.group(1).trim();
        }
        return line;
    }

    private String nodeText(JsonNode node) {
        StringBuilder sb = new StringBuilder();
        nodeTextRecursive(node, sb, 0);
        return sb.toString().trim();
    }

    private void nodeTextRecursive(JsonNode node, StringBuilder sb, int depth) {
        if (depth > 32) {
            return;
        }
        String text = node.path("text").asText();
        if (!text.isEmpty()) {
            if (sb.length() > 0) {
                sb.append(' ');
            }
            sb.append(text);
            return;
        }
        JsonNode content = node.get("content");
        if (content instanceof ArrayNode array) {
            for (JsonNode child : array) {
                nodeTextRecursive(child, sb, depth + 1);
            }
        }
    }

    private String extractSnippet(JsonNode node, String title) {
        String text = nodeText(node);
        if (text.isEmpty()) {
            return title;
        }
        return text;
    }

    // ─── helpers ─────────────────────────────────────────────────────────────

    private String resolveSectionBlockId(String sectionKey) {
        if (sectionKey.startsWith("local:")) {
            return sectionKey.substring("local:".length());
        }
        if (sectionKey.startsWith("ref-group:")) {
            return sectionKey.substring("ref-group:".length());
        }
        if (sectionKey.startsWith("ref-child:")) {
            String rest = sectionKey.substring("ref-child:".length());
            int colon = rest.indexOf(':');
            return colon > 0 ? rest.substring(0, colon) : rest;
        }
        if (sectionKey.startsWith("heading-")) {
            return sectionKey;
        }
        return sectionKey;
    }

    private List<BlockTag> matchingTags(List<BlockTag> tags, String normalizedLabel) {
        List<BlockTag> result = new ArrayList<>();
        for (BlockTag tag : tags) {
            if (!tag.label().isEmpty() && normalizeLabel(tag.label()).equals(normalizedLabel)) {
                result.add(tag);
            }
        }
        return result;
    }

    private void collectPageTags(List<BlockTag> tags, Map<String, TagPoolItemDto> pool) {
        for (BlockTag tag : tags) {
            String label = tag.label().trim();
            if (label.isEmpty()) {
                continue;
            }
            String key = normalizeLabel(label);
            if (!pool.containsKey(key)) {
                String id = tag.id().isEmpty() ? "tag-" + Math.abs(key.hashCode()) : tag.id();
                pool.put(key, new TagPoolItemDto(id, label, tag.color()));
            }
        }
    }

    private void collectSectionTags(Map<String, List<BlockTag>> sectionTags, Map<String, TagPoolItemDto> pool) {
        for (List<BlockTag> tags : sectionTags.values()) {
            collectPageTags(tags, pool);
        }
    }

    private void collectTextTagSpanTags(List<TextTagSpan> textTagSpans, Map<String, TagPoolItemDto> pool) {
        for (TextTagSpan textTagSpan : textTagSpans) {
            collectPageTags(textTagSpan.tags(), pool);
        }
    }

    private List<TagPoolItemDto> toTagPoolItems(List<BlockTag> tags) {
        List<TagPoolItemDto> result = new ArrayList<>();
        for (BlockTag tag : tags) {
            result.add(new TagPoolItemDto(tag.id(), tag.label(), tag.color()));
        }
        return result;
    }

    private String normalizeLabel(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }

    private String clip(String text) {
        if (text == null) {
            return "";
        }
        String normalized = text.replaceAll("\\s+", " ").trim();
        if (normalized.length() <= SNIPPET_MAX_LENGTH) {
            return normalized;
        }
        return normalized.substring(0, SNIPPET_MAX_LENGTH) + "…";
    }
}
