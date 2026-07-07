package com.tu.backend.platform.dubbo;

import com.tu.platform.api.dto.KnowledgeBaseRpcDto;
import com.tu.platform.api.dto.KnowledgePointTreeRpcDto;
import com.tu.backend.knowledge.dto.KnowledgeBaseDto;
import com.tu.backend.knowledgerelation.dto.KnowledgePointDto;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
public class KnowledgePlatformRpcMapper {

    public KnowledgeBaseRpcDto toRpc(KnowledgeBaseDto dto) {
        return new KnowledgeBaseRpcDto(dto.id(), dto.name(), dto.icon(), dto.description());
    }

    public List<KnowledgePointTreeRpcDto> toRpcTree(List<KnowledgePointDto> nodes) {
        if (nodes == null || nodes.isEmpty()) {
            return List.of();
        }
        List<KnowledgePointTreeRpcDto> result = new ArrayList<>(nodes.size());
        for (KnowledgePointDto node : nodes) {
            result.add(toRpcPoint(node));
        }
        return result;
    }

    private KnowledgePointTreeRpcDto toRpcPoint(KnowledgePointDto dto) {
        KnowledgePointTreeRpcDto rpc = new KnowledgePointTreeRpcDto();
        rpc.setId(dto.getId());
        rpc.setKbId(dto.getKbId());
        rpc.setParentId(dto.getParentId());
        rpc.setTitle(dto.getTitle());
        rpc.setSummary(dto.getSummary());
        rpc.setStatus(dto.getStatus());
        rpc.setEstimatedHours(dto.getEstimatedHours());
        rpc.setSortOrder(dto.getSortOrder());
        rpc.setAliases(dto.getAliases() == null ? List.of() : new ArrayList<>(dto.getAliases()));
        if (dto.getChildren() != null) {
            rpc.setChildren(toRpcTree(dto.getChildren()));
        }
        return rpc;
    }
}
