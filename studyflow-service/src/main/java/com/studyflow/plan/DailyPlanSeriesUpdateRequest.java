package com.studyflow.plan;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Update task details for one plan or its complete recurring series.
 *
 * @param title task title applied to the series
 * @param goalId optional related learning goal applied to the series
 * @param updateWholeSeries whether to update the complete recurring series
 */
public record DailyPlanSeriesUpdateRequest(
        @NotBlank @Size(max = 240) String title,
        @Size(max = 36) String goalId,
        Boolean updateWholeSeries
) {
}
