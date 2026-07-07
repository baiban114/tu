package com.tu.platform.api;

import com.tu.platform.api.dto.KnowledgeBaseRpcDto;
import com.tu.platform.api.dto.KnowledgePointTreeRpcDto;

import java.util.List;

/**
 * Dubbo RPC facade exposed by tu-backend for downstream apps (e.g. StudyFlow).
 */
public interface KnowledgePlatformFacade {

    List<KnowledgeBaseRpcDto> listKnowledgeBases();

    List<KnowledgePointTreeRpcDto> getKnowledgePointTree(String kbId);
}
