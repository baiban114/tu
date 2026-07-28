package com.tu.backend.externalresource.util;

import java.util.Locale;

/**
 * Canonical PDF clip locator strings: {@code page:12&clip=0.2-0.75}, {@code page:3-5&clip=0.2-0.8}.
 */
public final class PdfClipLocator {

    private PdfClipLocator() {
    }

    public static String format(int startPage, int endPage, double clipTop, double clipBottom) {
        int start = Math.max(1, startPage);
        int end = Math.max(start, endPage);
        double top = clampRatio(clipTop);
        double bottom = clampRatio(clipBottom);
        boolean clipped = top > 0.001d || bottom < 0.999d;
        String pagePart = start == end
            ? "page:" + start
            : "page:" + start + "-" + end;
        if (!clipped) {
            return pagePart;
        }
        return pagePart + "&clip=" + formatRatio(top) + "-" + formatRatio(bottom);
    }

    public static String normalizeKey(String locator) {
        if (locator == null) {
            return "";
        }
        return locator.trim().toLowerCase(Locale.ROOT);
    }

    public static String titleFor(int startPage, int endPage, double clipTop, double clipBottom) {
        int start = Math.max(1, startPage);
        int end = Math.max(start, endPage);
        double top = clampRatio(clipTop);
        double bottom = clampRatio(clipBottom);
        boolean clipped = top > 0.001d || bottom < 0.999d;
        if (start == end) {
            if (!clipped) {
                return "第 " + start + " 页";
            }
            return "第 " + start + " 页 " + Math.round(top * 100) + "%–" + Math.round(bottom * 100) + "%";
        }
        if (!clipped) {
            return "第 " + start + "–" + end + " 页";
        }
        return "第 " + start + " 页 " + Math.round(top * 100) + "% → 第 " + end + " 页 " + Math.round(bottom * 100) + "%";
    }

    private static double clampRatio(double value) {
        if (Double.isNaN(value) || Double.isInfinite(value)) {
            return 0d;
        }
        double clamped = Math.min(1d, Math.max(0d, value));
        return Math.round(clamped * 1000d) / 1000d;
    }

    private static String formatRatio(double value) {
        double rounded = clampRatio(value);
        if (Math.abs(rounded - Math.rint(rounded)) < 0.0005d) {
            return String.valueOf((long) Math.rint(rounded));
        }
        String text = String.format(Locale.ROOT, "%.3f", rounded);
        while (text.contains(".") && (text.endsWith("0") || text.endsWith("."))) {
            text = text.substring(0, text.length() - 1);
        }
        return text;
    }
}
