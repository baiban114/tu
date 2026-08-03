package com.tu.backend.ai;

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
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class LearningDocumentAssemblyAgentService {

    private static final Logger log = LoggerFactory.getLogger(LearningDocumentAssemblyAgentService.class);
    private static final int MAX_POINTS = 40;
    private static final int MAX_INSERTS = 120;
    private static final Set<String> ALLOWED_INSERT_TYPES = Set.of(
        "refBlock",
        "externalResourceBlock",
        "pdfExcerptBlock",
        "heading"
    );

    private final AiChatClient chatClient;
    private final AiAgentToolLoopClient toolLoopClient;
    private final AiAgentTools aiAgentTools;
    private final AiAgentLearningDocumentTools learningDocumentTools;
    private final AiAgentProperties aiAgentProperties;
    private final AiAgentRuntimeConfigResolver configResolver;
    private final AiAgentRunLogService runLogService;
    private final ObjectMapper objectMapper;
    private final KnowledgeBaseRepository knowledgeBaseRepository;
    private final KnowledgePointService knowledgePointService;
    private final PageRepository pageRepository;
    private final ResourceItemRepository resourceItemRepository;
    private final ResourceExcerptRepository resourceExcerptRepository;
    private final FileAssetRepository fileAssetRepository;

    public LearningDocumentAssemblyAgentService(
        AiChatClient chatClient,
        AiAgentToolLoopClient toolLoopClient,
        AiAgentTools aiAgentTools,
        AiAgentLearningDocumentTools learningDocumentTools,
        AiAgentProperties aiAgentProperties,
        AiAgentRuntimeConfigResolver configResolver,
        AiAgentRunLogService runLogService,
        ObjectMapper objectMapper,
        KnowledgeBaseRepository knowledgeBaseRepository,
        KnowledgePointService knowledgePointService,
        PageRepository pageRepository,
        ResourceItemRepository resourceItemRepository,
        ResourceExcerptRepository resourceExcerptRepository,
        FileAssetRepository fileAssetRepository
    ) {
        this.chatClient = chatClient;
        this.toolLoopClient = toolLoopClient;
        this.aiAgentTools = aiAgentTools;
        this.learningDocumentTools = learningDocumentTools;
        this.aiAgentProperties = aiAgentProperties;
        this.configResolver = configResolver;
        this.runLogService = runLogService;
        this.objectMapper = objectMapper;
        this.knowledgeBaseRepository = knowledgeBaseRepository;
        this.knowledgePointService = knowledgePointService;
        this.pageRepository = pageRepository;
        this.resourceItemRepository = resourceItemRepository;
        this.resourceExcerptRepository = resourceExcerptRepository;
        this.fileAssetRepository = fileAssetRepository;
    }

    public LearningDocumentAssemblyPlanDto assemble(AssembleLearningDocumentRequest request) {
        return assemble(request, null);
    }

    public LearningDocumentAssemblyPlanDto assemble(
        AssembleLearningDocumentRequest request,
        AiAgentProgressListener progressListener
    ) {
        String topic = normalize(request.topic());
        if (topic.isBlank()) {
            throw new BusinessException(40000, "topic is required");
        }
        String kbId = normalize(request.kbId());
        if (kbId.isBlank()) {
            throw new BusinessException(40000, "kbId is required");
        }
        if (!knowledgeBaseRepository.existsById(kbId)) {
            throw new BusinessException(40001, "knowledge base not found");
        }

        long startedAt = System.nanoTime();
        emitProgress(progressListener, AiAgentProgressEvent.of(
            AiAgentProgressEvent.phaseStarted(),
            "开始编排学习文档",
            null,
            null,
            startedAt
        ));

        String systemPrompt = systemPrompt();
        String userPrompt = userPrompt(topic, kbId);
        AiAgentRuntimeConfig config = configResolver.runtimeConfig();
        AiAgentRunLogEntity runLog = startRunLog(config, systemPrompt, userPrompt);
        AiChatCompletionResult completion = null;
        try {
            ensureNotCancelled(progressListener);
            if (aiAgentProperties.getToolLoop().isEnabled()) {
                AiAgentToolLoopResult loopResult = toolLoopClient.runToolLoop(
                    config,
                    systemPrompt,
                    userPrompt,
                    new AiAgentExecutionContext(kbId, topic, false),
                    progressListener,
                    new Object[] { aiAgentTools, learningDocumentTools }
                );
                completion = loopResult.toCompletionResult();
            } else {
                completion = chatClient.completeJson(config, systemPrompt, userPrompt);
            }
            ensureNotCancelled(progressListener);
            emitProgress(progressListener, AiAgentProgressEvent.of(
                AiAgentProgressEvent.phaseParsing(),
                "正在校验编排计划…",
                null,
                null,
                startedAt
            ));
            LearningDocumentAssemblyPlanDto parsed = parse(completion.content());
            LearningDocumentAssemblyPlanDto plan = validatePlan(kbId, topic, parsed);
            markRunLogSuccess(runLog, completion, serializeOutput(plan));
            emitProgress(progressListener, AiAgentProgressEvent.completed(
                "学习文档编排完成",
                startedAt,
                objectMapper.valueToTree(plan)
            ));
            return plan;
        } catch (RuntimeException ex) {
            markRunLogFailed(runLog, completion, ex);
            emitFailure(progressListener, ex, startedAt);
            throw ex;
        }
    }

    LearningDocumentAssemblyPlanDto validatePlan(
        String kbId,
        String fallbackTopic,
        LearningDocumentAssemblyPlanDto parsed
    ) {
        List<String> warnings = new ArrayList<>();
        if (parsed.warnings() != null) {
            for (String warning : parsed.warnings()) {
                String normalized = normalize(warning);
                if (!normalized.isBlank()) {
                    warnings.add(normalized);
                }
            }
        }

        String topic = normalize(parsed.topic());
        if (topic.isBlank()) {
            topic = fallbackTopic;
        }

        LinkedHashSet<String> orderedPointIds = new LinkedHashSet<>();
        List<String> rawPointIds = parsed.orderedPointIds() == null ? List.of() : parsed.orderedPointIds();
        for (String rawId : rawPointIds) {
            String pointId = normalize(rawId);
            if (pointId.isBlank()) {
                continue;
            }
            Optional<KnowledgePointDto> point = findPointInKb(kbId, pointId);
            if (point.isEmpty()) {
                warnings.add("丢弃不在本知识库的知识点: " + pointId);
                continue;
            }
            orderedPointIds.add(pointId);
            if (orderedPointIds.size() >= MAX_POINTS) {
                warnings.add("知识点数量超过上限 " + MAX_POINTS + "，已截断");
                break;
            }
        }

        List<LearningDocumentAssemblyInsertDto> inserts = new ArrayList<>();
        Set<String> insertKeys = new HashSet<>();
        List<LearningDocumentAssemblyInsertDto> rawInserts =
            parsed.inserts() == null ? List.of() : parsed.inserts();
        for (LearningDocumentAssemblyInsertDto raw : rawInserts) {
            if (inserts.size() >= MAX_INSERTS) {
                warnings.add("插入项数量超过上限 " + MAX_INSERTS + "，已截断");
                break;
            }
            LearningDocumentAssemblyInsertDto sanitized = sanitizeInsert(kbId, raw, warnings);
            if (sanitized == null) {
                continue;
            }
            String key = insertKey(sanitized);
            if (!insertKeys.add(key)) {
                continue;
            }
            inserts.add(sanitized);
            if (!orderedPointIds.contains(sanitized.forPointId())) {
                orderedPointIds.add(sanitized.forPointId());
            }
        }

        Set<String> pointsWithMaterial = new HashSet<>();
        for (LearningDocumentAssemblyInsertDto insert : inserts) {
            if (!"heading".equals(insert.type())) {
                pointsWithMaterial.add(insert.forPointId());
            }
        }
        for (String pointId : orderedPointIds) {
            if (!pointsWithMaterial.contains(pointId)) {
                Optional<KnowledgePointDto> point = findPointInKb(kbId, pointId);
                String title = point.map(KnowledgePointDto::getTitle).orElse(pointId);
                warnings.add("知识点暂无可用引用: " + title);
            }
        }

        if (orderedPointIds.isEmpty() && inserts.isEmpty()) {
            throw new BusinessException(50324, "ai agent returned empty learning document assembly plan");
        }

        return new LearningDocumentAssemblyPlanDto(
            topic,
            List.copyOf(orderedPointIds),
            List.copyOf(inserts),
            warnings.isEmpty() ? List.of() : List.copyOf(warnings)
        );
    }

    private LearningDocumentAssemblyInsertDto sanitizeInsert(
        String kbId,
        LearningDocumentAssemblyInsertDto raw,
        List<String> warnings
    ) {
        if (raw == null) {
            return null;
        }
        String type = normalize(raw.type());
        if (!ALLOWED_INSERT_TYPES.contains(type)) {
            warnings.add("丢弃不支持的插入类型: " + type);
            return null;
        }
        String forPointId = normalize(raw.forPointId());
        if (forPointId.isBlank()) {
            warnings.add("丢弃缺少 forPointId 的插入项: " + type);
            return null;
        }
        Optional<KnowledgePointDto> point = findPointInKb(kbId, forPointId);
        if (point.isEmpty()) {
            warnings.add("丢弃未知知识点的插入项: " + forPointId);
            return null;
        }

        return switch (type) {
            case "heading" -> {
                String text = normalize(raw.text());
                if (text.isBlank()) {
                    text = normalize(point.get().getTitle());
                } else if (!text.equals(normalize(point.get().getTitle()))) {
                    // Phase 1: heading text must come from existing KP title only.
                    text = normalize(point.get().getTitle());
                    warnings.add("标题已改用知识点原标题: " + text);
                }
                int level = raw.level() == null ? 2 : raw.level();
                if (level < 1 || level > 6) {
                    level = 2;
                }
                yield new LearningDocumentAssemblyInsertDto(
                    "heading", forPointId, null, null, null, null, null, null, null, null, level, text
                );
            }
            case "refBlock" -> {
                String refId = normalize(raw.refId());
                String refType = normalize(raw.refType()).toLowerCase(Locale.ROOT);
                if (refId.isBlank() || (!"page".equals(refType) && !"block".equals(refType))) {
                    warnings.add("丢弃无效引用块: " + forPointId);
                    yield null;
                }
                if ("page".equals(refType)) {
                    Optional<PageEntity> page = pageRepository.findById(refId);
                    if (page.isEmpty() || !kbId.equals(page.get().getKbId())) {
                        warnings.add("丢弃无法访问的页面引用: " + refId);
                        yield null;
                    }
                }
                String title = blankToNull(raw.title());
                yield new LearningDocumentAssemblyInsertDto(
                    "refBlock", forPointId, refId, refType, title, null, null, null, null, null, null, null
                );
            }
            case "externalResourceBlock" -> {
                String itemId = normalize(raw.itemId());
                if (itemId.isBlank() || !resourceItemRepository.existsById(itemId)) {
                    warnings.add("丢弃无效外部资源: " + itemId);
                    yield null;
                }
                String excerptId = blankToNull(raw.excerptId());
                if (excerptId != null) {
                    Optional<ResourceExcerptEntity> excerpt = resourceExcerptRepository.findById(excerptId);
                    if (excerpt.isEmpty() || !itemId.equals(excerpt.get().getResourceItemId())) {
                        warnings.add("丢弃无效资源节选: " + excerptId);
                        yield null;
                    }
                }
                yield new LearningDocumentAssemblyInsertDto(
                    "externalResourceBlock",
                    forPointId,
                    null,
                    null,
                    blankToNull(raw.title()),
                    itemId,
                    excerptId,
                    null,
                    null,
                    null,
                    null,
                    null
                );
            }
            case "pdfExcerptBlock" -> {
                String fileId = normalize(raw.fileId());
                if (fileId.isBlank() || !fileAssetRepository.existsById(fileId)) {
                    warnings.add("丢弃无效 PDF 文件: " + fileId);
                    yield null;
                }
                Integer startPage = sanitizePage(raw.startPage());
                Integer endPage = sanitizePage(raw.endPage());
                if (startPage != null && endPage != null && endPage < startPage) {
                    endPage = startPage;
                }
                yield new LearningDocumentAssemblyInsertDto(
                    "pdfExcerptBlock",
                    forPointId,
                    null,
                    null,
                    blankToNull(raw.title()),
                    null,
                    null,
                    fileId,
                    startPage,
                    endPage,
                    null,
                    null
                );
            }
            default -> null;
        };
    }

    private Optional<KnowledgePointDto> findPointInKb(String kbId, String pointId) {
        try {
            KnowledgePointDto point = knowledgePointService.getPoint(pointId);
            if (point == null || !kbId.equals(point.getKbId())) {
                return Optional.empty();
            }
            return Optional.of(point);
        } catch (RuntimeException ex) {
            return Optional.empty();
        }
    }

    private Integer sanitizePage(Integer value) {
        if (value == null) {
            return null;
        }
        if (value < 1) {
            return 1;
        }
        return value;
    }

    private String insertKey(LearningDocumentAssemblyInsertDto insert) {
        return String.join("|",
            nullToBlank(insert.type()),
            nullToBlank(insert.forPointId()),
            nullToBlank(insert.refId()),
            nullToBlank(insert.refType()),
            nullToBlank(insert.itemId()),
            nullToBlank(insert.excerptId()),
            nullToBlank(insert.fileId()),
            String.valueOf(insert.startPage()),
            String.valueOf(insert.endPage()),
            nullToBlank(insert.text())
        );
    }

    private LearningDocumentAssemblyPlanDto parse(String rawJson) {
        try {
            return objectMapper.readValue(AiAgentJsonContent.extract(rawJson), LearningDocumentAssemblyPlanDto.class);
        } catch (Exception ex) {
            throw new BusinessException(
                50324,
                "ai agent returned invalid learning document assembly json: exception="
                    + ex.getClass().getName()
                    + ": " + nullToBlank(ex.getMessage())
                    + "; rawResponse=" + abbreviate(rawJson)
            );
        }
    }

    private String systemPrompt() {
        return """
            你是知识库学习文档编排助手。一期只做「编排已有材料」，禁止撰写讲解段落、摘要、练习题或虚构资源。

            必须按三阶段思考（可用工具）：
            1) 分析知识点：用 searchKnowledgePoints、searchKnowledgeBasePages、queryKnowledgeBaseRag、getPointNeighborhood 找出与主题相关的知识点。
            2) 整理顺序：用 getPointNeighborhood 读取 prerequisite 边，按前置关系与主题相关度给出 orderedPointIds。
            3) 匹配材料：对每个知识点调用 listPointInsertCandidates，只从候选中挑选 inserts。

            硬约束：
            - 禁止联网；不要调用 searchWeb（本任务未注册该工具）。
            - 禁止输出任何生成正文类字段（如 paragraph、summary、body、generatedText）。
            - inserts.type 仅允许：heading、refBlock、externalResourceBlock、pdfExcerptBlock。
            - heading.text 必须使用候选中的知识点原 title；level 建议 2。
            - refBlock / externalResourceBlock / pdfExcerptBlock 的 id 必须来自工具结果，不得编造。
            - 若某点无材料候选，可只放 heading，并在 warnings 说明。
            - 若前置关系成环，保留你给出的顺序，并在 warnings 说明。

            最终只输出一个 JSON 对象（不要 markdown 围栏），schema：
            {
              "topic": "string",
              "orderedPointIds": ["pointId", ...],
              "inserts": [
                { "type": "heading", "forPointId": "...", "level": 2, "text": "知识点标题" },
                { "type": "refBlock", "forPointId": "...", "refId": "...", "refType": "page|block", "title": "optional" },
                { "type": "externalResourceBlock", "forPointId": "...", "itemId": "...", "excerptId": "optional" },
                { "type": "pdfExcerptBlock", "forPointId": "...", "fileId": "...", "startPage": 1, "endPage": 2 }
              ],
              "warnings": ["optional string"]
            }
            """;
    }

    private String userPrompt(String topic, String kbId) {
        return """
            学习主题：%s
            知识库 ID：%s

            请完成三阶段编排并返回 LearningDocumentAssemblyPlan JSON。
            不要生成正文；只编排库内已有 NodeView 材料。
            """.formatted(topic, kbId);
    }

    private void ensureNotCancelled(AiAgentProgressListener progressListener) {
        if (progressListener != null && progressListener.isCancelled()) {
            throw new BusinessException(50326, "ai agent run cancelled");
        }
    }

    private void emitProgress(AiAgentProgressListener progressListener, AiAgentProgressEvent event) {
        if (progressListener != null) {
            progressListener.onEvent(event);
        }
    }

    private void emitFailure(AiAgentProgressListener progressListener, RuntimeException ex, long startedAt) {
        if (progressListener == null) {
            return;
        }
        if (ex instanceof BusinessException businessException && businessException.getCode() == 50326) {
            emitProgress(progressListener, AiAgentProgressEvent.of(
                AiAgentProgressEvent.phaseCancelled(),
                "已中止编排",
                null,
                null,
                startedAt
            ));
            return;
        }
        emitProgress(progressListener, AiAgentProgressEvent.of(
            AiAgentProgressEvent.phaseFailed(),
            nullToBlank(ex.getMessage()),
            null,
            null,
            startedAt
        ));
    }

    private AiAgentRunLogEntity startRunLog(
        AiAgentRuntimeConfig config,
        String systemPrompt,
        String userPrompt
    ) {
        try {
            return runLogService.start(
                AiAgentRunLogService.TASK_LEARNING_DOCUMENT_ASSEMBLY,
                config,
                systemPrompt,
                userPrompt
            );
        } catch (RuntimeException ex) {
            log.error(
                "failed to start ai agent run log; taskType={}",
                AiAgentRunLogService.TASK_LEARNING_DOCUMENT_ASSEMBLY,
                ex
            );
            return null;
        }
    }

    private void markRunLogSuccess(
        AiAgentRunLogEntity runLog,
        AiChatCompletionResult completion,
        String output
    ) {
        if (runLog == null) {
            return;
        }
        try {
            runLogService.markSuccess(runLog.getId(), completion, output);
        } catch (RuntimeException ex) {
            log.error("failed to persist ai agent run success log; runId={}", runLog.getId(), ex);
        }
    }

    private void markRunLogFailed(
        AiAgentRunLogEntity runLog,
        AiChatCompletionResult completion,
        RuntimeException original
    ) {
        if (runLog == null) {
            return;
        }
        try {
            runLogService.markFailed(runLog.getId(), completion, original);
        } catch (RuntimeException logException) {
            log.error(
                "failed to persist ai agent run failure log; runId={}; originalException={}: {}",
                runLog.getId(),
                original.getClass().getName(),
                nullToBlank(original.getMessage()),
                logException
            );
        }
    }

    private String serializeOutput(LearningDocumentAssemblyPlanDto plan) {
        try {
            return objectMapper.writeValueAsString(plan);
        } catch (Exception ex) {
            return "";
        }
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim();
    }

    private static String blankToNull(String value) {
        String normalized = normalize(value);
        return normalized.isBlank() ? null : normalized;
    }

    private static String nullToBlank(String value) {
        return value == null ? "" : value;
    }

    private static String abbreviate(String value) {
        String normalized = value == null ? "" : value.strip();
        int maxLength = 4000;
        if (normalized.length() <= maxLength) {
            return normalized;
        }
        return normalized.substring(0, maxLength) + "...<truncated>";
    }
}
