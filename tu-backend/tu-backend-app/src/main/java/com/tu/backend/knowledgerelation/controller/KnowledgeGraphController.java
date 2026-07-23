package com.tu.backend.knowledgerelation.controller;

import com.tu.backend.common.ApiResponse;
import com.tu.backend.knowledgerelation.dto.KnowledgeGraphDto;
import com.tu.backend.knowledgerelation.service.KnowledgeGraphService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class KnowledgeGraphController {

    private final KnowledgeGraphService knowledgeGraphService;

    public KnowledgeGraphController(KnowledgeGraphService knowledgeGraphService) {
        this.knowledgeGraphService = knowledgeGraphService;
    }

    @GetMapping("/kbs/{kbId}/knowledge-graph")
    public ApiResponse<KnowledgeGraphDto> getGraph(
        @PathVariable String kbId,
        @RequestParam(defaultValue = "full") String mode,
        @RequestParam(required = false) String centerPointId,
        @RequestParam(required = false) Integer depth,
        @RequestParam(required = false) String direction,
        @RequestParam(required = false) String relationTypeKeys,
        @RequestParam(required = false) Integer maxNodes
    ) {
        return ApiResponse.success(
            knowledgeGraphService.getGraph(kbId, mode, centerPointId, depth, direction, relationTypeKeys, maxNodes)
        );
    }

    @GetMapping("/kbs/{kbId}/pages/{pageId}/relation-graph")
    public ApiResponse<KnowledgeGraphDto> getPageRelationGraph(
        @PathVariable String kbId,
        @PathVariable String pageId,
        @RequestParam(required = false) Integer maxNodes
    ) {
        return ApiResponse.success(knowledgeGraphService.getPageRelationGraph(kbId, pageId, maxNodes));
    }
}
