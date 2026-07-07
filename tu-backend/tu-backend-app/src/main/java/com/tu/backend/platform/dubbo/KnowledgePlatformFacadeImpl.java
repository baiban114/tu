package com.tu.backend.platform.dubbo;

import com.tu.platform.api.KnowledgePlatformFacade;
import com.tu.platform.api.dto.KnowledgeBaseRpcDto;
import com.tu.platform.api.dto.KnowledgePointTreeRpcDto;
import com.tu.backend.knowledge.service.KnowledgeBaseService;
import com.tu.backend.knowledgerelation.service.KnowledgePointService;
import org.apache.dubbo.config.annotation.DubboService;

import java.util.List;

@DubboService(version = "1.0.0", interfaceClass = KnowledgePlatformFacade.class)
public class KnowledgePlatformFacadeImpl implements KnowledgePlatformFacade {

    private final KnowledgeBaseService knowledgeBaseService;
    private final KnowledgePointService knowledgePointService;
    private final KnowledgePlatformRpcMapper mapper;

    public KnowledgePlatformFacadeImpl(
        KnowledgeBaseService knowledgeBaseService,
        KnowledgePointService knowledgePointService,
        KnowledgePlatformRpcMapper mapper
    ) {
        this.knowledgeBaseService = knowledgeBaseService;
        this.knowledgePointService = knowledgePointService;
        this.mapper = mapper;
    }

    @Override
    public List<KnowledgeBaseRpcDto> listKnowledgeBases() {
        return knowledgeBaseService.list().stream().map(mapper::toRpc).toList();
    }

    @Override
    public List<KnowledgePointTreeRpcDto> getKnowledgePointTree(String kbId) {
        return mapper.toRpcTree(knowledgePointService.listTree(kbId));
    }
}
