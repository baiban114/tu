package com.tu.backend.ai.dto;

import java.util.List;

public record DocumentMarkingResponseDto(
    String runId,
    List<DocumentMarkingSuggestionDto> suggestions
) {
}
