package com.tu.backend.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tu.backend.ai.dto.AssembleLearningDocumentRequest;
import com.tu.backend.ai.dto.LearningDocumentAssemblyInsertDto;
import com.tu.backend.ai.dto.LearningDocumentAssemblyPlanDto;
import com.tu.backend.ai.entity.AiAgentRunLogEntity;
import com.tu.backend.common.BusinessException;
import com.tu.backend.externalresource.entity.ResourceExcerptEntity;
import com.tu.backend.externalresource.repository.ResourceExcerptRepository;
import com.tu.backend.externalresource.repository.ResourceItemRepository;
import com.tu.backend.knowledge.repository.KnowledgeBaseRepository;
import com.tu.backend.knowledgerelation.dto.KnowledgePointDto;
import com.tu.backend.knowledgerelation.service.KnowledgePointService;
import com.tu.backend.page.entity.PageEntity;
import com.tu.backend.page.repository.PageRepository;
import com.tu.backend.storage.repository.FileAssetRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class LearningDocumentAssemblyAgentServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AiAgentRuntimeConfig runtimeConfig = new AiAgentRuntimeConfig(
        true, "https://api.example.com", "sk-secret", "model-a", 30, 300, 300
    );

    private KnowledgeBaseRepository knowledgeBaseRepository;
    private KnowledgePointService knowledgePointService;
    private PageRepository pageRepository;
    private ResourceItemRepository resourceItemRepository;
    private ResourceExcerptRepository resourceExcerptRepository;
    private FileAssetRepository fileAssetRepository;

    @BeforeEach
    void setUp() {
        knowledgeBaseRepository = mock(KnowledgeBaseRepository.class);
        knowledgePointService = mock(KnowledgePointService.class);
        pageRepository = mock(PageRepository.class);
        resourceItemRepository = mock(ResourceItemRepository.class);
        resourceExcerptRepository = mock(ResourceExcerptRepository.class);
        fileAssetRepository = mock(FileAssetRepository.class);
        when(knowledgeBaseRepository.existsById("kb-1")).thenReturn(true);
        KnowledgePointDto point = new KnowledgePointDto();
        point.setId("kp-1");
        point.setKbId("kb-1");
        point.setTitle("基础概念");
        when(knowledgePointService.getPoint("kp-1")).thenReturn(point);
        when(knowledgePointService.getPoint("kp-missing")).thenThrow(new BusinessException(40001, "not found"));
        PageEntity page = new PageEntity();
        page.setId("page-1");
        page.setKbId("kb-1");
        when(pageRepository.findById("page-1")).thenReturn(Optional.of(page));
        when(resourceItemRepository.existsById("ri-1")).thenReturn(true);
        ResourceExcerptEntity excerpt = new ResourceExcerptEntity();
        excerpt.setId("re-1");
        excerpt.setResourceItemId("ri-1");
        when(resourceExcerptRepository.findById("re-1")).thenReturn(Optional.of(excerpt));
        when(fileAssetRepository.existsById("file-1")).thenReturn(true);
    }

    @Test
    void validatePlanKeepsOnlyExistingMaterialsAndRewritesHeadingText() {
        LearningDocumentAssemblyAgentService service = service((config, system, user) -> completion("""
            {
              "topic": "学数据结构",
              "orderedPointIds": ["kp-1", "kp-missing"],
              "inserts": [
                { "type": "heading", "forPointId": "kp-1", "level": 2, "text": "AI乱写标题" },
                { "type": "refBlock", "forPointId": "kp-1", "refId": "page-1", "refType": "page", "title": "笔记" },
                { "type": "externalResourceBlock", "forPointId": "kp-1", "itemId": "ri-1", "excerptId": "re-1" },
                { "type": "pdfExcerptBlock", "forPointId": "kp-1", "fileId": "file-1", "startPage": 1, "endPage": 2 },
                { "type": "paragraph", "forPointId": "kp-1", "text": "禁止生成正文" },
                { "type": "refBlock", "forPointId": "kp-1", "refId": "page-gone", "refType": "page" }
              ],
              "warnings": []
            }
            """));

        LearningDocumentAssemblyPlanDto plan = service.assemble(
            new AssembleLearningDocumentRequest("学数据结构", "kb-1")
        );

        assertEquals("学数据结构", plan.topic());
        assertEquals(List.of("kp-1"), plan.orderedPointIds());
        assertEquals(4, plan.inserts().size());
        LearningDocumentAssemblyInsertDto heading = plan.inserts().getFirst();
        assertEquals("heading", heading.type());
        assertEquals("基础概念", heading.text());
        assertTrue(plan.warnings().stream().anyMatch(w -> w.contains("暂无可用引用") || w.contains("丢弃")));
        assertTrue(plan.warnings().stream().anyMatch(w -> w.contains("不支持的插入类型") || w.contains("paragraph") || w.contains("丢弃")));
    }

    @Test
    void assembleRejectsInvalidJson() {
        LearningDocumentAssemblyAgentService service = service((config, system, user) -> completion("{bad"));
        BusinessException ex = assertThrows(
            BusinessException.class,
            () -> service.assemble(new AssembleLearningDocumentRequest("主题", "kb-1"))
        );
        assertEquals(50324, ex.getCode());
    }

    @Test
    void assembleRejectsUnknownKb() {
        when(knowledgeBaseRepository.existsById("kb-x")).thenReturn(false);
        LearningDocumentAssemblyAgentService service = service((config, system, user) -> completion("{}"));
        BusinessException ex = assertThrows(
            BusinessException.class,
            () -> service.assemble(new AssembleLearningDocumentRequest("主题", "kb-x"))
        );
        assertEquals(40001, ex.getCode());
    }

    private LearningDocumentAssemblyAgentService service(AiChatClient chatClient) {
        AiAgentRunLogEntity runLog = new AiAgentRunLogEntity();
        runLog.setId("run-test");
        AiAgentRunLogService runLogService = mock(AiAgentRunLogService.class);
        when(runLogService.start(anyString(), any(AiAgentRuntimeConfig.class), anyString(), anyString())).thenReturn(runLog);
        when(runLogService.markSuccess(anyString(), any(AiChatCompletionResult.class), anyString())).thenReturn(runLog);
        when(runLogService.markFailed(anyString(), any(), any(Throwable.class))).thenReturn(runLog);
        AiAgentProperties properties = new AiAgentProperties();
        properties.getToolLoop().setEnabled(false);
        return new LearningDocumentAssemblyAgentService(
            chatClient,
            (config, system, user, context, listener, tools) -> {
                throw new IllegalStateException("tool loop should not be invoked");
            },
            mock(AiAgentTools.class),
            mock(AiAgentLearningDocumentTools.class),
            properties,
            () -> runtimeConfig,
            runLogService,
            objectMapper,
            knowledgeBaseRepository,
            knowledgePointService,
            pageRepository,
            resourceItemRepository,
            resourceExcerptRepository,
            fileAssetRepository
        );
    }

    private AiChatCompletionResult completion(String content) {
        return new AiChatCompletionResult(
            content,
            "{\"model\":\"model-a\"}",
            "{\"choices\":[{\"message\":{\"content\":\"ok\"}}]}",
            12L,
            null,
            null,
            null
        );
    }
}
