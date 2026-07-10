package com.studyflow.platform;

import com.tu.platform.api.KnowledgePlatformFacade;
import com.tu.platform.api.dto.KnowledgeBaseRpcDto;
import org.apache.dubbo.config.annotation.DubboReference;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;

/**
 * Dubbo consumer for tu-backend {@link KnowledgePlatformFacade}.
 * Wiring is ready; business APIs will call through this gateway.
 */
@Service
public class KnowledgePlatformGateway {

    @DubboReference(check = false)
    private KnowledgePlatformFacade knowledgePlatformFacade;

    public List<KnowledgeBaseRpcDto> listKnowledgeBases() {
        try {
            return knowledgePlatformFacade.listKnowledgeBases();
        } catch (Exception ex) {
            return Collections.emptyList();
        }
    }
}
