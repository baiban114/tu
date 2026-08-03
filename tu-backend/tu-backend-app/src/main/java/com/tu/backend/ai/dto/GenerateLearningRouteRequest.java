package com.tu.backend.ai.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * Request to generate / refine a knowledge-point learning route.
 *
 * @param topic             goal topic
 * @param kbId              knowledge base
 * @param seedPointIds      optional seed KP ids
 * @param messages          multi-turn chat (optional); last user message is the latest instruction
 * @param previousPlanJson  optional prior plan JSON for revision rounds
 */
public record GenerateLearningRouteRequest(
        @NotBlank @Size(max = 512) String topic,
        @NotBlank @Size(max = 64) String kbId,
        List<@Size(max = 64) String> seedPointIds,
        List<@Valid LearningRouteChatMessageDto> messages,
        @Size(max = 100_000) String previousPlanJson
) {
}
