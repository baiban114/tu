package com.tu.backend.ai.documentmarking;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.tu.backend.content.tiptap.TiptapDocumentWalker;
import com.tu.backend.knowledgerelation.entity.KnowledgeRelationEntity;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class DocumentMarkingContextCollector {

    private DocumentMarkingContextCollector() {
    }

    public record ProtectedLocatorEntry(
        String locator,
        String type,
        String label,
        String bindingSummary
    ) {
    }

    public record SectionTextEntry(
        String locator,
        String title,
        String text
    ) {
    }

    public static List<ProtectedLocatorEntry> collectProtected(
        String pageId,
        ArrayNode blocks,
        List<KnowledgeRelationEntity> pageUserRelations,
        Set<String> protectedExcerptLocators
    ) {
        List<ProtectedLocatorEntry> entries = new ArrayList<>();
        for (JsonNode block : blocks) {
            collectFromBlock(pageId, block, entries);
        }
        String pagePrefix = "page:" + pageId;
        for (KnowledgeRelationEntity relation : pageUserRelations) {
            if (!"user".equalsIgnoreCase(normalize(relation.getSourceProvenance()))) {
                continue;
            }
            String fromLocator = normalize(relation.getFromLocator());
            if (!fromLocator.startsWith(pagePrefix)) {
                continue;
            }
            entries.add(new ProtectedLocatorEntry(
                fromLocator,
                "relation",
                normalize(relation.getRelationTypeKey()),
                normalize(relation.getNote())
            ));
        }
        for (String locator : protectedExcerptLocators) {
            if (locator == null || locator.isBlank()) {
                continue;
            }
            entries.add(new ProtectedLocatorEntry(locator, "excerpt", "用户节选", null));
        }
        return entries;
    }

    public static Set<String> protectedLocatorSet(List<ProtectedLocatorEntry> entries) {
        Set<String> set = new HashSet<>();
        for (ProtectedLocatorEntry entry : entries) {
            if (entry.locator() != null && !entry.locator().isBlank()) {
                set.add(entry.locator().trim());
            }
        }
        return set;
    }

    public static boolean isLocatorProtected(String suggestionLocator, Set<String> protectedLocators) {
        if (suggestionLocator == null || suggestionLocator.isBlank()) {
            return false;
        }
        String normalized = suggestionLocator.trim();
        for (String protectedLocator : protectedLocators) {
            if (protectedLocator == null || protectedLocator.isBlank()) {
                continue;
            }
            String p = protectedLocator.trim();
            if (normalized.equals(p)) {
                return true;
            }
            if (normalized.startsWith(p + ":")) {
                return true;
            }
            if (p.startsWith(normalized + ":")) {
                return true;
            }
        }
        return false;
    }

    public static List<SectionTextEntry> collectSectionTexts(String pageId, ArrayNode blocks, int maxChars) {
        List<SectionTextEntry> sections = new ArrayList<>();
        for (JsonNode block : blocks) {
            collectSectionTextFromBlock(pageId, block, sections, maxChars);
        }
        List<SectionTextEntry> headingSections = collectHeadingSectionTexts(pageId, blocks, maxChars);
        for (SectionTextEntry entry : headingSections) {
            if (sections.stream().noneMatch(existing -> existing.locator().equals(entry.locator()))) {
                sections.add(entry);
            }
        }
        return sections;
    }

    public static List<SectionTextEntry> collectHeadingSectionTexts(String pageId, ArrayNode blocks, int maxChars) {
        List<SectionTextEntry> sections = new ArrayList<>();
        for (JsonNode block : blocks) {
            collectHeadingSectionsFromBlock(pageId, block, sections, maxChars);
        }
        return sections;
    }

    public static List<SectionTextEntry> collectScopedSectionTexts(
        String pageId,
        ArrayNode blocks,
        String sectionHeadingBlockId,
        String sectionEmbedBlockId,
        String sectionTitle,
        int maxChars
    ) {
        if (sectionHeadingBlockId != null && !sectionHeadingBlockId.isBlank()) {
            for (JsonNode block : blocks) {
                SectionTextEntry entry = collectHeadingSectionFromBlock(
                    pageId, block, sectionHeadingBlockId.trim(), maxChars
                );
                if (entry != null) {
                    return List.of(entry);
                }
            }
            String title = sectionTitle == null || sectionTitle.isBlank() ? "本节" : sectionTitle.trim();
            return List.of(new SectionTextEntry(
                "page:" + pageId + ":heading:" + sectionHeadingBlockId.trim(),
                title,
                title
            ));
        }
        if (sectionEmbedBlockId != null && !sectionEmbedBlockId.isBlank()) {
            String title = sectionTitle == null || sectionTitle.isBlank() ? "引用节" : sectionTitle.trim();
            String locator = "page:" + pageId + ":block:" + sectionEmbedBlockId.trim();
            String text = truncate(collectEmbedBlockText(blocks, sectionEmbedBlockId.trim()), maxChars);
            if (text.isBlank()) {
                text = title;
            }
            return List.of(new SectionTextEntry(locator, title, text));
        }
        return collectSectionTexts(pageId, blocks, maxChars);
    }

    public static boolean suggestionMatchesSectionScope(
        String locator,
        String pageId,
        String sectionHeadingBlockId,
        String sectionEmbedBlockId,
        Set<String> allowedHeadingBlockIds
    ) {
        boolean scoped = (sectionHeadingBlockId != null && !sectionHeadingBlockId.isBlank())
            || (sectionEmbedBlockId != null && !sectionEmbedBlockId.isBlank());
        if (!scoped) {
            return true;
        }
        String normalized = locator == null ? "" : locator.trim();
        if (normalized.isBlank()) {
            return false;
        }
        if (sectionHeadingBlockId != null && !sectionHeadingBlockId.isBlank()) {
            for (String blockId : allowedHeadingBlockIds) {
                if (normalized.contains(":heading:" + blockId)) {
                    return true;
                }
            }
            if (sectionEmbedBlockId != null && normalized.contains(":block:" + sectionEmbedBlockId.trim())) {
                return true;
            }
            return normalized.equals("page:" + pageId + ":heading:" + sectionHeadingBlockId.trim());
        }
        if (sectionEmbedBlockId != null && !sectionEmbedBlockId.isBlank()) {
            return normalized.contains(":block:" + sectionEmbedBlockId.trim())
                || allowedHeadingBlockIds.stream().anyMatch(blockId -> normalized.contains(":heading:" + blockId));
        }
        return true;
    }

    private static void collectHeadingSectionsFromBlock(
        String pageId,
        JsonNode block,
        List<SectionTextEntry> sections,
        int maxChars
    ) {
        if (!block.isObject()) {
            return;
        }
        String blockType = text(block.get("type"));
        if (!"richtext".equalsIgnoreCase(blockType) && !"richText".equals(blockType)) {
            return;
        }
        JsonNode document = block.get("document");
        if (!TiptapDocumentWalker.isDocument(document)) {
            return;
        }
        JsonNode content = document.get("content");
        if (!(content instanceof ArrayNode contentArray)) {
            return;
        }
        for (int i = 0; i < contentArray.size(); i += 1) {
            JsonNode node = contentArray.get(i);
            if (!"heading".equals(text(node.get("type")))) {
                continue;
            }
            String headingBlockId = text(node.path("attrs").get("blockId"));
            if (headingBlockId.isBlank()) {
                continue;
            }
            int level = node.path("attrs").path("level").asInt(1);
            String headingText = truncate(collectNodeText(node), 120);
            StringBuilder body = new StringBuilder();
            for (int j = i + 1; j < contentArray.size(); j += 1) {
                JsonNode sibling = contentArray.get(j);
                if ("heading".equals(text(sibling.get("type"))) && sibling.path("attrs").path("level").asInt(1) <= level) {
                    break;
                }
                String part = collectNodeText(sibling).trim();
                if (!part.isBlank()) {
                    if (body.length() > 0) {
                        body.append("\n\n");
                    }
                    body.append(part);
                }
            }
            String sectionText = headingText;
            if (body.length() > 0) {
                sectionText = headingText + "\n\n" + body;
            }
            sectionText = truncate(sectionText, maxChars);
            if (!sectionText.isBlank()) {
                sections.add(new SectionTextEntry(
                    "page:" + pageId + ":heading:" + headingBlockId,
                    headingText.isBlank() ? "标题节" : headingText,
                    sectionText
                ));
            }
        }
    }

    private static SectionTextEntry collectHeadingSectionFromBlock(
        String pageId,
        JsonNode block,
        String headingBlockId,
        int maxChars
    ) {
        if (!block.isObject()) {
            return null;
        }
        String blockType = text(block.get("type"));
        if (!"richtext".equalsIgnoreCase(blockType) && !"richText".equals(blockType)) {
            return null;
        }
        JsonNode document = block.get("document");
        if (!TiptapDocumentWalker.isDocument(document)) {
            return null;
        }
        JsonNode content = document.get("content");
        if (!(content instanceof ArrayNode contentArray)) {
            return null;
        }
        for (int i = 0; i < contentArray.size(); i += 1) {
            JsonNode node = contentArray.get(i);
            if (!"heading".equals(text(node.get("type")))) {
                continue;
            }
            String blockId = text(node.path("attrs").get("blockId"));
            if (!headingBlockId.equals(blockId)) {
                continue;
            }
            int level = node.path("attrs").path("level").asInt(1);
            String headingText = truncate(collectNodeText(node), 120);
            StringBuilder body = new StringBuilder();
            for (int j = i + 1; j < contentArray.size(); j += 1) {
                JsonNode sibling = contentArray.get(j);
                if ("heading".equals(text(sibling.get("type"))) && sibling.path("attrs").path("level").asInt(1) <= level) {
                    break;
                }
                String part = collectNodeText(sibling).trim();
                if (!part.isBlank()) {
                    if (body.length() > 0) {
                        body.append("\n\n");
                    }
                    body.append(part);
                }
            }
            String sectionText = headingText;
            if (body.length() > 0) {
                sectionText = headingText + "\n\n" + body;
            }
            sectionText = truncate(sectionText, maxChars);
            if (sectionText.isBlank()) {
                return null;
            }
            return new SectionTextEntry(
                "page:" + pageId + ":heading:" + headingBlockId,
                headingText.isBlank() ? "标题节" : headingText,
                sectionText
            );
        }
        return null;
    }

    private static String collectEmbedBlockText(ArrayNode blocks, String embedBlockId) {
        for (JsonNode block : blocks) {
            String text = collectEmbedBlockTextRecursive(block, embedBlockId);
            if (!text.isBlank()) {
                return text;
            }
        }
        return "";
    }

    private static String collectEmbedBlockTextRecursive(JsonNode block, String embedBlockId) {
        if (!block.isObject()) {
            return "";
        }
        String blockId = text(block.get("id"));
        if (embedBlockId.equals(blockId)) {
            return blockToPlainText(block);
        }
        JsonNode children = block.get("children");
        if (children instanceof ArrayNode childArray) {
            for (JsonNode child : childArray) {
                String text = collectEmbedBlockTextRecursive(child, embedBlockId);
                if (!text.isBlank()) {
                    return text;
                }
            }
        }
        return "";
    }

    private static String blockToPlainText(JsonNode block) {
        String blockType = text(block.get("type"));
        if ("richtext".equalsIgnoreCase(blockType) || "richText".equals(blockType)) {
            JsonNode document = block.get("document");
            if (TiptapDocumentWalker.isDocument(document)) {
                return TiptapDocumentWalker.extractPlainText(document);
            }
            return text(block.get("content"));
        }
        if ("externalResource".equals(blockType)) {
            String excerpt = text(block.path("externalResource").path("snapshot").get("excerptText"));
            if (!excerpt.isBlank()) {
                return excerpt;
            }
        }
        String title = text(block.get("title"));
        return title == null ? "" : title;
    }

    private static void collectFromBlock(String pageId, JsonNode block, List<ProtectedLocatorEntry> entries) {
        if (!block.isObject()) {
            return;
        }
        String blockType = text(block.get("type"));
        if (!"richtext".equalsIgnoreCase(blockType) && !"richText".equals(blockType)) {
            return;
        }
        JsonNode document = block.get("document");
        if (TiptapDocumentWalker.isDocument(document)) {
            walkHeadings(pageId, document.get("content"), entries);
        }
        JsonNode metadata = block.get("metadata");
        if (metadata != null && metadata.isObject()) {
            JsonNode annotations = metadata.get("annotations");
            if (annotations instanceof ArrayNode annArray) {
                for (JsonNode ann : annArray) {
                    if (!"basis".equalsIgnoreCase(text(ann.get("kind")))) {
                        continue;
                    }
                    if (isAiMarker(ann.get("markerSource"))) {
                        continue;
                    }
                    String annId = text(ann.get("id"));
                    if (annId.isBlank()) {
                        continue;
                    }
                    JsonNode binding = ann.get("basisBinding");
                    if (binding == null || !binding.isObject() || text(binding.get("resourceItemId")).isBlank()) {
                        continue;
                    }
                    String label = truncate(text(ann.get("selectedText")), 80);
                    String summary = bindingSummary(binding);
                    entries.add(new ProtectedLocatorEntry(
                        "page:" + pageId + ":annotation:" + annId,
                        "basis",
                        label.isBlank() ? "依据标注" : label,
                        summary
                    ));
                }
            }
        }
    }

    private static void walkHeadings(String pageId, JsonNode nodes, List<ProtectedLocatorEntry> entries) {
        if (!(nodes instanceof ArrayNode array)) {
            return;
        }
        for (JsonNode node : array) {
            if (!node.isObject()) {
                continue;
            }
            if ("heading".equals(text(node.get("type")))) {
                JsonNode attrs = node.path("attrs");
                String blockId = text(attrs.get("blockId"));
                JsonNode binding = attrs.path("sourceBinding");
                if (!blockId.isBlank() && binding.isObject() && !text(binding.get("resourceItemId")).isBlank()) {
                    if (!isAiMarker(binding.get("markerSource"))) {
                        String title = truncate(collectNodeText(node), 80);
                        entries.add(new ProtectedLocatorEntry(
                            "page:" + pageId + ":heading:" + blockId,
                            "heading",
                            title.isBlank() ? "标题" : title,
                            bindingSummary(binding)
                        ));
                    }
                }
            }
            walkHeadings(pageId, node.get("content"), entries);
        }
    }

    private static void collectSectionTextFromBlock(
        String pageId,
        JsonNode block,
        List<SectionTextEntry> sections,
        int maxChars
    ) {
        if (!block.isObject()) {
            return;
        }
        String blockType = text(block.get("type"));
        if (!"richtext".equalsIgnoreCase(blockType) && !"richText".equals(blockType)) {
            return;
        }
        JsonNode document = block.get("document");
        if (!TiptapDocumentWalker.isDocument(document)) {
            return;
        }
        String blockId = text(block.get("id"));
        if (blockId.isBlank()) {
            blockId = "page-content";
        }
        String text = truncate(collectNodeText(document), maxChars);
        if (!text.isBlank()) {
            sections.add(new SectionTextEntry(
                "page:" + pageId + ":block:" + blockId,
                "正文",
                text
            ));
        }
    }

    private static boolean isAiMarker(JsonNode markerSource) {
        return "ai".equalsIgnoreCase(text(markerSource));
    }

    private static String bindingSummary(JsonNode binding) {
        JsonNode snapshot = binding.path("snapshot");
        String excerptTitle = text(snapshot.get("excerptTitle"));
        if (!excerptTitle.isBlank()) {
            return excerptTitle;
        }
        return text(snapshot.get("resourceTitle"));
    }

    private static String collectNodeText(JsonNode node) {
        if (node == null || node.isMissingNode()) {
            return "";
        }
        if (node.isTextual()) {
            return node.asText("");
        }
        if (node.isArray()) {
            StringBuilder builder = new StringBuilder();
            for (JsonNode child : node) {
                builder.append(collectNodeText(child));
            }
            return builder.toString();
        }
        if (node.isObject() && "text".equals(text(node.get("type")))) {
            return text(node.get("text"));
        }
        JsonNode content = node.get("content");
        if (content != null) {
            return collectNodeText(content);
        }
        return "";
    }

    private static String text(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return "";
        }
        return node.asText("").trim();
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim();
    }

    private static String truncate(String value, int max) {
        if (value == null) {
            return "";
        }
        String normalized = value.trim();
        if (normalized.length() <= max) {
            return normalized;
        }
        return normalized.substring(0, max) + "…";
    }
}
