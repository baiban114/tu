package com.tu.backend.ai.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AnalyzeDocumentMarkingRequest(
    @NotBlank @Size(max = 64) String pageId,
    @Size(max = 64) String kbId,
    Boolean replaceExistingAi,
    /** 本地标题节：page:{pageId}:heading:{blockId} */
    @Size(max = 128) String sectionHeadingBlockId,
    /** 引用组/引用内节：page:{pageId}:block:{embedBlockId} */
    @Size(max = 128) String sectionEmbedBlockId,
    @Size(max = 256) String sectionTitle
) {
}
