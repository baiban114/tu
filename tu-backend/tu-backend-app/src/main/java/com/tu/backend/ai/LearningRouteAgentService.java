package com.tu.backend.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tu.backend.ai.dto.GenerateLearningRouteRequest;
import com.tu.backend.ai.dto.LearningRouteChatMessageDto;
import com.tu.backend.ai.dto.LearningRouteItemDto;
import com.tu.backend.ai.dto.LearningRoutePlanDto;
import com.tu.backend.ai.entity.AiAgentRunLogEntity;
import com.tu.backend.common.BusinessException;
import com.tu.backend.knowledge.repository.KnowledgeBaseRepository;
import com.tu.backend.knowledgerelation.dto.KnowledgePointDto;
import com.tu.backend.knowledgerelation.service.KnowledgePointService;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Generates an ordered KnowledgePoint learning route for a goal topic.
 * Prefers existing points (via tools); may propose new titles for missing steps.
 */
@Service
public class LearningRouteAgentService {

    private static final Logger log = LoggerFactory.getLogger(LearningRouteAgentService.class);
    private static final int MAX_ITEMS = 40;

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

    public LearningRouteAgentService(
        AiChatClient chatClient,
        AiAgentToolLoopClient toolLoopClient,
        AiAgentTools aiAgentTools,
        AiAgentLearningDocumentTools learningDocumentTools,
        AiAgentProperties aiAgentProperties,
        AiAgentRuntimeConfigResolver configResolver,
        AiAgentRunLogService runLogService,
        ObjectMapper objectMapper,
        KnowledgeBaseRepository knowledgeBaseRepository,
        KnowledgePointService knowledgePointService
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
    }

    public LearningRoutePlanDto generate(GenerateLearningRouteRequest request) {
        return generate(request, null);
    }

    public LearningRoutePlanDto generate(
        GenerateLearningRouteRequest request,
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
            "开始分析学习路线",
            null,
            null,
            startedAt
        ));

        List<String> seedPointIds = normalizeIds(request.seedPointIds());
        String systemPrompt = systemPrompt();
        String userPrompt = userPrompt(
            topic,
            kbId,
            seedPointIds,
            request.messages(),
            request.previousPlanJson()
        );
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
                "正在整理学习路线…",
                null,
                null,
                startedAt
            ));
            LearningRoutePlanDto parsed = parse(completion.content());
            LearningRoutePlanDto plan = validatePlan(kbId, topic, parsed, seedPointIds);
            markRunLogSuccess(runLog, completion, serializeOutput(plan));
            emitProgress(progressListener, AiAgentProgressEvent.completed(
                "学习路线分析完成",
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

    LearningRoutePlanDto validatePlan(
        String kbId,
        String fallbackTopic,
        LearningRoutePlanDto parsed,
        List<String> seedPointIds
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

        List<LearningRouteItemDto> items = new ArrayList<>();
        Set<String> seenTitles = new LinkedHashSet<>();
        Set<String> seenIds = new LinkedHashSet<>();
        List<LearningRouteItemDto> rawItems =
            parsed.orderedItems() == null ? List.of() : parsed.orderedItems();
        int[] counter = { 0 };

        for (LearningRouteItemDto raw : rawItems) {
            if (counter[0] >= MAX_ITEMS) {
                warnings.add("路线步骤超过上限 " + MAX_ITEMS + "，已截断");
                break;
            }
            LearningRouteItemDto sanitized = sanitizeItem(kbId, raw, seenTitles, seenIds, warnings, counter, 0);
            if (sanitized != null) {
                items.add(sanitized);
            }
        }

        if (items.isEmpty()) {
            throw new BusinessException(50324, "ai agent returned empty learning route");
        }

        // Ensure seed points appear (append if missing)
        for (String seedId : seedPointIds) {
            if (seenIds.contains(seedId)) {
                continue;
            }
            Optional<KnowledgePointDto> point = findPointInKb(kbId, seedId);
            if (point.isEmpty()) {
                warnings.add("种子知识点不在知识库: " + seedId);
                continue;
            }
            if (counter[0] >= MAX_ITEMS) {
                break;
            }
            counter[0] += 1;
            items.add(new LearningRouteItemDto(
                seedId,
                point.get().getTitle(),
                blankToNull(point.get().getSummary()),
                point.get().getEstimatedHours(),
                List.of()
            ));
            seenIds.add(seedId);
        }

        return new LearningRoutePlanDto(topic, List.copyOf(items), List.copyOf(warnings));
    }

    private LearningRouteItemDto sanitizeItem(
        String kbId,
        LearningRouteItemDto raw,
        Set<String> seenTitles,
        Set<String> seenIds,
        List<String> warnings,
        int[] counter,
        int depth
    ) {
        if (raw == null || counter[0] >= MAX_ITEMS || depth > 3) {
            return null;
        }
        String title = normalize(raw.title());
        if (title.isBlank()) {
            warnings.add("丢弃无标题步骤");
            return null;
        }
        String titleKey = title.toLowerCase(Locale.ROOT);
        if (seenTitles.contains(titleKey)) {
            return null;
        }
        String pointId = normalize(raw.pointId());
        if (!pointId.isBlank()) {
            Optional<KnowledgePointDto> point = findPointInKb(kbId, pointId);
            if (point.isEmpty()) {
                warnings.add("丢弃不在本知识库的知识点: " + pointId);
                pointId = "";
            } else if (seenIds.contains(pointId)) {
                return null;
            } else {
                String resolvedTitle = normalize(point.get().getTitle());
                title = resolvedTitle.isBlank() ? title : resolvedTitle;
                titleKey = title.toLowerCase(Locale.ROOT);
                seenIds.add(pointId);
            }
        }
        seenTitles.add(titleKey);
        counter[0] += 1;

        List<LearningRouteItemDto> children = new ArrayList<>();
        List<LearningRouteItemDto> rawChildren = raw.children() == null ? List.of() : raw.children();
        for (LearningRouteItemDto child : rawChildren) {
            if (counter[0] >= MAX_ITEMS) {
                break;
            }
            LearningRouteItemDto sanitizedChild = sanitizeItem(
                kbId, child, seenTitles, seenIds, warnings, counter, depth + 1
            );
            if (sanitizedChild != null) {
                children.add(sanitizedChild);
            }
        }

        return new LearningRouteItemDto(
            pointId.isBlank() ? null : pointId,
            title,
            blankToNull(raw.summary()),
            sanitizeHours(raw.estimatedHours()),
            List.copyOf(children)
        );
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

    private Double sanitizeHours(Double value) {
        if (value == null) {
            return null;
        }
        if (!Double.isFinite(value) || value < 0) {
            return null;
        }
        return Math.round(value * 100.0) / 100.0;
    }

    private List<String> normalizeIds(List<String> raw) {
        if (raw == null || raw.isEmpty()) {
            return List.of();
        }
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (String item : raw) {
            String id = normalize(item);
            if (!id.isBlank()) {
                ids.add(id);
            }
        }
        return List.copyOf(ids);
    }

    private String systemPrompt() {
        return """
            你是知识库学习路线规划助手。
            目标：产出从先修到学习目标的有序知识点路线。

            语言要求（重要）：
            - 面向用户的字段一律使用简体中文：title、summary、warnings，以及模型思考/推理说明。
            - JSON 的键名保持英文；pointId 等标识符保持原样。
            - 不要用英文撰写步骤标题或摘要（除非专有名词必须保留原文，可中英并列）。

            流程：
            1. 使用 searchKnowledgePoints、getPointNeighborhood 查找已有知识点与 prerequisite 边。
            2. 库内已有匹配点时优先填写已有 pointId。
            3. 缺失步骤可提出新标题（pointId 为 null）并给简短中文 summary。
            4. 按学习顺序排列：靠前的是靠后的前置。
            5. 路线宜聚焦（通常约 3–12 个顶层步骤）；不要虚构网页或插入正文。
            6. 多轮对话时按用户最新指示修订上一版计划，仍合理的 pointId 尽量保留。

            只返回 JSON：
            {
              "topic": string,
              "orderedItems": [
                {
                  "pointId": string|null,
                  "title": string,
                  "summary": string|null,
                  "estimatedHours": number|null,
                  "children": [
                    { "pointId": string|null, "title": string, "summary": string|null, "estimatedHours": number|null }
                  ]
                }
              ],
              "warnings": string[]
            }
            children 表示某粗粒度步骤下的细粒度子步骤（可选，最多 2 层），是软分类子节点，不是并列顶层主题；
            顶层 orderedItems 才是学习主线。
            """;
    }

    private String userPrompt(
        String topic,
        String kbId,
        List<String> seedPointIds,
        List<LearningRouteChatMessageDto> messages,
        String previousPlanJson
    ) {
        StringBuilder sb = new StringBuilder();
        sb.append("学习目标主题：").append(topic).append('\n');
        sb.append("知识库 ID：").append(kbId).append('\n');
        if (!seedPointIds.isEmpty()) {
            sb.append("种子知识点 ID（路线中必须出现，通常靠近末尾）：\n");
            for (String id : seedPointIds) {
                sb.append("- ").append(id).append('\n');
            }
        } else {
            sb.append("尚无种子知识点 ID；请匹配或创建目标点及其前置。\n");
        }

        String prior = normalize(previousPlanJson);
        if (!prior.isBlank()) {
            sb.append("\n上一版学习路线 JSON（按需修订）：\n");
            sb.append(prior).append('\n');
        }

        if (messages != null && !messages.isEmpty()) {
            sb.append("\n对话记录：\n");
            int count = 0;
            for (LearningRouteChatMessageDto message : messages) {
                if (message == null) {
                    continue;
                }
                String role = normalize(message.role()).toLowerCase(Locale.ROOT);
                String content = normalize(message.content());
                if (content.isBlank()) {
                    continue;
                }
                if (!role.equals("user") && !role.equals("assistant")) {
                    role = "user";
                }
                count += 1;
                if (count > 40) {
                    sb.append("…(更早轮次已截断)\n");
                    break;
                }
                sb.append(role).append(": ").append(content).append('\n');
            }
        }

        sb.append("\n请现在返回有序学习路线 JSON；title/summary/warnings 使用简体中文。");
        return sb.toString();
    }

    private LearningRoutePlanDto parse(String rawJson) {
        try {
            return objectMapper.readValue(AiAgentJsonContent.extract(rawJson), LearningRoutePlanDto.class);
        } catch (Exception ex) {
            throw new BusinessException(
                50324,
                "ai agent returned invalid learning route json: exception=" + ex.getClass().getName()
                    + ": " + nullToBlank(ex.getMessage())
                    + "; rawResponse=" + abbreviate(rawJson)
            );
        }
    }

    private String serializeOutput(LearningRoutePlanDto plan) {
        try {
            return objectMapper.writeValueAsString(plan);
        } catch (Exception ex) {
            return String.valueOf(plan);
        }
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
                "已中止分析",
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
                AiAgentRunLogService.TASK_LEARNING_ROUTE,
                config,
                systemPrompt,
                userPrompt
            );
        } catch (RuntimeException ex) {
            log.error("failed to start ai agent run log; taskType={}", AiAgentRunLogService.TASK_LEARNING_ROUTE, ex);
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
        String text = nullToBlank(value);
        if (text.length() <= 400) {
            return text;
        }
        return text.substring(0, 400) + "…";
    }
}
