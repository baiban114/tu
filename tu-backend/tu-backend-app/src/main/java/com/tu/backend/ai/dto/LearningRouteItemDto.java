package com.tu.backend.ai.dto;

import java.util.List;

/**
 * One step on an AI-generated learning route.
 *
 * @param pointId         existing KnowledgePoint id when matched in kb; null/blank for new
 * @param title           display / create title
 * @param summary         optional summary for new points
 * @param estimatedHours  optional hours
 * @param children        optional finer-grained sub-steps
 */
public record LearningRouteItemDto(
    String pointId,
    String title,
    String summary,
    Double estimatedHours,
    List<LearningRouteItemDto> children
) {
}
