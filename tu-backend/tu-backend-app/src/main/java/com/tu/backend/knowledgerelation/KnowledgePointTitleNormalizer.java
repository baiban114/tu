package com.tu.backend.knowledgerelation;

/**
 * Knowledge point titles derived from marked content should not carry outline ordinals;
 * semantic order is defined by point placement (parentId / sortOrder).
 */
public final class KnowledgePointTitleNormalizer {

    private static final String LEADING_ORDINAL =
        "^(?:"
            + "(?:\\d+(?:\\.\\d+)+\\s+)"
            + "|(?:\\d+(?:\\.\\d+)*)\\s*[.．、)\\]）］]\\s*"
            + "|[（(]\\s*\\d+\\s*[）)]\\s*"
            + "|[一二三四五六七八九十百千零〇两]+\\s*[、．.]\\s*"
            + "|[（(]\\s*[一二三四五六七八九十百千零〇两]+\\s*[）)]\\s*"
            + "|第[一二三四五六七八九十百千零〇两\\d]+\\s*[章节条款部分篇回]\\s*"
            + "|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]\\s*"
            + ")+";

    private KnowledgePointTitleNormalizer() {
    }

    /** Strip leading outline ordinals. Keeps original if strip would empty. */
    public static String stripOrdinalPrefix(String raw) {
        if (raw == null) {
            return "";
        }
        String text = raw.trim();
        if (text.isEmpty()) {
            return text;
        }
        for (int i = 0; i < 8; i++) {
            String next = text.replaceFirst(LEADING_ORDINAL, "").trim();
            if (next.isEmpty() || next.equals(text)) {
                break;
            }
            text = next;
        }
        return text;
    }

    /** Preprocess content text into a knowledge-point title. */
    public static String fromContent(String raw) {
        return fromContent(raw, "未命名知识点");
    }

    public static String fromContent(String raw, String fallback) {
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        String stripped = stripOrdinalPrefix(raw);
        return stripped.isBlank() ? fallback : stripped;
    }
}
