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
        return sections;
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
