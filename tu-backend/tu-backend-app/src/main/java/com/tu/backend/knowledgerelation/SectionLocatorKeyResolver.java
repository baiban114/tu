package com.tu.backend.knowledgerelation;

/**
 * Mirrors frontend {@code getSectionTagKey} in tu-web-ts/src/utils/sectionMetadata.ts.
 */
public final class SectionLocatorKeyResolver {

    private SectionLocatorKeyResolver() {
    }

    public static String resolve(String nodeId, String sourceBlockId, String sourceType) {
        return resolve(nodeId, sourceBlockId, sourceType, null);
    }

    public static String resolve(
        String nodeId,
        String sourceBlockId,
        String sourceType,
        String contentTreeNodeId
    ) {
        String type = normalize(sourceType);
        String blockId = normalize(sourceBlockId);
        String id = normalize(nodeId);
        String treeNodeId = normalize(contentTreeNodeId);
        if ("local".equals(type)) {
            return "local:" + blockId;
        }
        if ("ref-group".equals(type)) {
            return "ref-group:" + blockId;
        }
        if ("ref-child".equals(type)) {
            if (!treeNodeId.isBlank()) {
                return "ref-child:" + blockId + ":" + treeNodeId;
            }
            return id;
        }
        return id.isBlank() ? blockId : id;
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim();
    }
}
