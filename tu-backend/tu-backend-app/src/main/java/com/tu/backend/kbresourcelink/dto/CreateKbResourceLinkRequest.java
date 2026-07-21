package com.tu.backend.kbresourcelink.dto;

import jakarta.validation.constraints.NotBlank;

public record CreateKbResourceLinkRequest(
    @NotBlank String resourceItemId,
    /** Optional page id: nest under this page in the KB page tree; omit/null for KB root. */
    String parentPageId
) {
    public CreateKbResourceLinkRequest(String resourceItemId) {
        this(resourceItemId, null);
    }
}
