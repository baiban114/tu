package com.tu.backend.ai.dto;

import java.util.List;

/**
 * AI learning route: items in learning order (prerequisites first).
 *
 * @param topic         goal topic
 * @param orderedItems  learning order
 * @param warnings      non-fatal issues
 */
public record LearningRoutePlanDto(
    String topic,
    List<LearningRouteItemDto> orderedItems,
    List<String> warnings
) {
}
