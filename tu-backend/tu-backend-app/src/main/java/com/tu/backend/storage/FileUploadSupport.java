package com.tu.backend.storage;

import java.util.Locale;
import java.util.Set;

import org.springframework.util.StringUtils;

final class FileUploadSupport {

    static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/gif",
        "image/webp",
        "image/svg+xml",
        "application/pdf"
    );

    /** S3 multipart requires non-final parts to be at least 5 MiB. */
    static final long MIN_MULTIPART_PART_BYTES = 5L * 1024 * 1024;

    private FileUploadSupport() {
    }

    static String normalizeContentType(String contentType) {
        if (!StringUtils.hasText(contentType)) {
            return "application/octet-stream";
        }
        return contentType.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
    }

    static String extensionForContentType(String contentType) {
        return switch (contentType) {
            case "image/png" -> ".png";
            case "image/jpeg", "image/jpg" -> ".jpg";
            case "image/gif" -> ".gif";
            case "image/webp" -> ".webp";
            case "image/svg+xml" -> ".svg";
            case "application/pdf" -> ".pdf";
            default -> "";
        };
    }

    static String safeFilename(String filename) {
        if (!StringUtils.hasText(filename)) {
            return "upload";
        }
        String cleaned = StringUtils.cleanPath(filename.trim());
        int slash = Math.max(cleaned.lastIndexOf('/'), cleaned.lastIndexOf('\\'));
        return slash >= 0 ? cleaned.substring(slash + 1) : cleaned;
    }

    static long resolveMaxFileSize(FileStorageProperties properties, String contentType) {
        if ("application/pdf".equals(contentType)) {
            return properties.getMaxPdfFileSize();
        }
        return properties.getMaxFileSize();
    }
}
