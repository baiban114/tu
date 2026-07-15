package com.tu.backend.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.tu.backend.ai.documentmarking.DocumentMarkingContextCollector;
import com.tu.backend.ai.dto.AnalyzeDocumentMarkingRequest;
import com.tu.backend.ai.dto.DocumentMarkingResponseDto;
import com.tu.backend.ai.dto.DocumentMarkingSuggestionDto;
import com.tu.backend.ai.entity.AiAgentRunLogEntity;
import com.tu.backend.common.BusinessException;
import com.tu.backend.content.entity.PageContentEntity;
import com.tu.backend.content.repository.PageContentRepository;
import com.tu.backend.contenttree.OutlineExtractor;
import com.tu.backend.externalresource.entity.ResourceExcerptEntity;
import com.tu.backend.externalresource.entity.ResourceItemEntity;
import com.tu.backend.externalresource.repository.ResourceExcerptRepository;
import com.tu.backend.externalresource.repository.ResourceItemRepository;
import com.tu.backend.knowledgerelation.dto.RelationTypeDefDto;
import com.tu.backend.knowledgerelation.entity.KnowledgeRelationEntity;
import com.tu.backend.knowledgerelation.repository.KnowledgeRelationRepository;
import com.tu.backend.knowledgerelation.service.KnowledgePointService;
import com.tu.backend.knowledgerelation.service.RelationTypeService;
import com.tu.backend.page.entity.PageEntity;
import com.tu.backend.page.repository.PageRepository;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class DocumentMarkingAgentService {

    private static final Logger log = LoggerFactory.getLogger(DocumentMarkingAgentService.class);
    private static final int MAX_SUGGESTIONS = 40;
    private static final int SECTION_TEXT_MAX = 1200;
    private static final int RESOURCE_CATALOG_MAX = 30;
    private static final Set<String> ALLOWED_ACTIONS = Set.of(
        "bindSource", "setBasis", "markExcerpt", "createRelation"
    );

    private final AiChatClient chatClient;
    private final AiAgentToolLoopClient toolLoopClient;
    private final AiAgentTools aiAgentTools;
    private final AiAgentProperties aiAgentProperties;
    private final AiAgentRuntimeConfigResolver configResolver;
    private final AiAgentRunLogService runLogService;
    private final ObjectMapper objectMapper;
    private final PageRepository pageRepository;
    private final PageContentRepository pageContentRepository;
    private final KnowledgeRelationRepository knowledgeRelationRepository;
    private final RelationTypeService relationTypeService;
    private final KnowledgePointService knowledgePointService;
    private final ResourceItemRepository resourceItemRepository;
    private final ResourceExcerptRepository resourceExcerptRepository;

    public DocumentMarkingAgentService(
        AiChatClient chatClient,
        AiAgentToolLoopClient toolLoopClient,
        AiAgentTools aiAgentTools,
        AiAgentProperties aiAgentProperties,
        AiAgentRuntimeConfigResolver configResolver,
        AiAgentRunLogService runLogService,
        ObjectMapper objectMapper,
        PageRepository pageRepository,
        PageContentRepository pageContentRepository,
        KnowledgeRelationRepository knowledgeRelationRepository,
        RelationTypeService relationTypeService,
        KnowledgePointService knowledgePointService,
        ResourceItemRepository resourceItemRepository,
        ResourceExcerptRepository resourceExcerptRepository
    ) {
        this.chatClient = chatClient;
        this.toolLoopClient = toolLoopClient;
        this.aiAgentTools = aiAgentTools;
        this.aiAgentProperties = aiAgentProperties;
        this.configResolver = configResolver;
        this.runLogService = runLogService;
        this.objectMapper = objectMapper;
        this.pageRepository = pageRepository;
        this.pageContentRepository = pageContentRepository;
        this.knowledgeRelationRepository = knowledgeRelationRepository;
        this.relationTypeService = relationTypeService;
        this.knowledgePointService = knowledgePointService;
        this.resourceItemRepository = resourceItemRepository;
        this.resourceExcerptRepository = resourceExcerptRepository;
    }

    public DocumentMarkingResponseDto analyze(AnalyzeDocumentMarkingRequest request) {
        return analyze(request, null);
    }

    public DocumentMarkingResponseDto analyze(AnalyzeDocumentMarkingRequest request, AiAgentProgressListener progressListener) {
        String pageId = normalize(request.pageId());
        if (pageId.isBlank()) {
            throw new BusinessException(40000, "pageId is required");
        }
        PageEntity page = pageRepository.findById(pageId)
            .orElseThrow(() -> new BusinessException(40001, "page not found"));
        String kbId = blankToNull(request.kbId());
        if (kbId == null) {
            kbId = page.getKbId();
        }
        if (!kbId.equals(page.getKbId())) {
            throw new BusinessException(40000, "page does not belong to kb");
        }

        long startedAt = System.nanoTime();
        emitProgress(progressListener, AiAgentProgressEvent.of(
            AiAgentProgressEvent.phaseStarted(),
            "开始分析文档标记",
            null,
            null,
            startedAt
        ));

        PageContentEntity contentEntity = pageContentRepository.findById(pageId).orElse(null);
        ArrayNode blocks = deserializeBlocks(contentEntity == null ? "[]" : contentEntity.getBlocksJson());
        List<KnowledgeRelationEntity> userRelations = knowledgeRelationRepository
            .findByKbIdOrderByUpdatedAtDescCreatedAtDesc(kbId)
            .stream()
            .filter(entity -> "user".equalsIgnoreCase(normalize(entity.getSourceProvenance())))
            .filter(entity -> normalize(entity.getFromLocator()).startsWith("page:" + pageId))
            .toList();
        Set<String> protectedExcerptLocators = collectProtectedExcerptLocators();
        List<DocumentMarkingContextCollector.ProtectedLocatorEntry> protectedEntries =
            DocumentMarkingContextCollector.collectProtected(pageId, blocks, userRelations, protectedExcerptLocators);
        Set<String> protectedLocators = DocumentMarkingContextCollector.protectedLocatorSet(protectedEntries);

        String runId = "dm-" + UUID.randomUUID();
        String systemPrompt = systemPrompt();
        String userPrompt = userPrompt(page, blocks, protectedEntries, kbId, request);
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
                    new AiAgentExecutionContext(kbId, page.getTitle(), false),
                    progressListener,
                    new Object[] { aiAgentTools }
                );
                completion = loopResult.toCompletionResult();
            } else {
                completion = chatClient.completeJson(config, systemPrompt, userPrompt);
            }
            ensureNotCancelled(progressListener);
            emitProgress(progressListener, AiAgentProgressEvent.of(
                AiAgentProgressEvent.phaseParsing(),
                "正在校验标记建议…",
                null,
                null,
                startedAt
            ));
            List<DocumentMarkingSuggestionDto> suggestions = validateSuggestions(
                pageId,
                kbId,
                parse(completion.content()),
                protectedLocators,
                request,
                OutlineExtractor.extractPageOutline(pageId, blocks)
            );
            DocumentMarkingResponseDto response = new DocumentMarkingResponseDto(runId, suggestions);
            markRunLogSuccess(runLog, completion, serializeOutput(response));
            emitProgress(progressListener, AiAgentProgressEvent.completed(
                "文档标记分析完成",
                startedAt,
                objectMapper.valueToTree(response)
            ));
            return response;
        } catch (RuntimeException ex) {
            markRunLogFailed(runLog, completion, ex);
            emitFailure(progressListener, ex, startedAt);
            throw ex;
        }
    }

    private List<DocumentMarkingSuggestionDto> validateSuggestions(
        String pageId,
        String kbId,
        JsonNode root,
        Set<String> protectedLocators,
        AnalyzeDocumentMarkingRequest request,
        List<OutlineExtractor.ExtractedOutlineNode> outline
    ) {
        JsonNode suggestionsNode = root.path("suggestions");
        if (!suggestionsNode.isArray()) {
            throw new BusinessException(50324, "ai agent returned invalid document marking json: missing suggestions array");
        }
        List<RelationTypeDefDto> relationTypes = relationTypeService.listForKb(kbId);
        Set<String> relationTypeKeys = relationTypes.stream()
            .map(RelationTypeDefDto::typeKey)
            .collect(Collectors.toSet());
        String pagePrefix = "page:" + pageId;
        Set<String> allowedHeadingBlockIds = allowedHeadingBlockIdsForScope(
            outline,
            blankToNull(request.sectionHeadingBlockId()),
            blankToNull(request.sectionEmbedBlockId())
        );

        List<DocumentMarkingSuggestionDto> result = new ArrayList<>();
        int index = 0;
        for (JsonNode node : suggestionsNode) {
            if (index >= MAX_SUGGESTIONS) {
                break;
            }
            String action = normalize(node.path("action").asText(""));
            if (!ALLOWED_ACTIONS.contains(action)) {
                continue;
            }
            String locator = normalize(node.path("locator").asText(""));
            if (!locator.startsWith(pagePrefix)) {
                continue;
            }
            if (DocumentMarkingContextCollector.isLocatorProtected(locator, protectedLocators)) {
                continue;
            }
            if (!DocumentMarkingContextCollector.suggestionMatchesSectionScope(
                locator,
                pageId,
                blankToNull(request.sectionHeadingBlockId()),
                blankToNull(request.sectionEmbedBlockId()),
                allowedHeadingBlockIds
            )) {
                continue;
            }
            String relationTypeKey = blankToNull(node.path("relationTypeKey").asText(null));
            if ("createRelation".equals(action)) {
                if (relationTypeKey == null || !relationTypeKeys.contains(relationTypeKey)) {
                    continue;
                }
                String toPointId = blankToNull(node.path("toPointId").asText(null));
                if (toPointId == null) {
                    continue;
                }
                try {
                    knowledgePointService.getPoint(toPointId);
                } catch (BusinessException ex) {
                    continue;
                }
            }
            String resourceItemId = blankToNull(node.path("resourceItemId").asText(null));
            if (Set.of("bindSource", "setBasis", "markExcerpt").contains(action) && resourceItemId == null) {
                continue;
            }
            if ("bindSource".equals(action)) {
                String resourceExcerptId = blankToNull(node.path("resourceExcerptId").asText(null));
                if (resourceExcerptId == null) {
                    continue;
                }
            }
            String id = blankToNull(node.path("id").asText(null));
            if (id == null) {
                id = "sug-" + (index + 1);
            }
            Double confidence = node.path("confidence").isNumber() ? node.path("confidence").asDouble() : null;
            result.add(new DocumentMarkingSuggestionDto(
                id,
                action,
                locator,
                relationTypeKey,
                resourceItemId,
                blankToNull(node.path("resourceExcerptId").asText(null)),
                blankToNull(node.path("excerptText").asText(null)),
                blankToNull(node.path("excerptTitle").asText(null)),
                blankToNull(node.path("toPointId").asText(null)),
                confidence,
                blankToNull(node.path("reason").asText(null)),
                "ai"
            ));
            index += 1;
        }
        return result;
    }

    private JsonNode parse(String rawJson) {
        try {
            return objectMapper.readTree(AiAgentJsonContent.extract(rawJson));
        } catch (Exception ex) {
            throw new BusinessException(
                50324,
                "ai agent returned invalid document marking json: exception="
                    + ex.getClass().getName()
                    + ": "
                    + nullToBlank(ex.getMessage())
                    + "; rawResponse="
                    + abbreviate(rawJson)
            );
        }
    }

    private String systemPrompt() {
        return """
            You analyze document structure and suggest knowledge markers.
            Return ONLY valid JSON with this shape:
            {
              "suggestions": [
                {
                  "id": "sug-1",
                  "action": "bindSource | setBasis | markExcerpt | createRelation",
                  "locator": "page:{pageId}:heading:{blockId} or page:{pageId}:annotation:... or page:{pageId}:block:...",
                  "relationTypeKey": "case|cites|related|association|prerequisite|... (for createRelation only)",
                  "resourceItemId": "...",
                  "resourceExcerptId": "... (bindSource required; setBasis optional)",
                  "excerptText": "... (markExcerpt)",
                  "excerptTitle": "... (markExcerpt)",
                  "toPointId": "... (createRelation)",
                  "confidence": 0.0-1.0,
                  "reason": "brief rationale in Simplified Chinese",
                  "markerSource": "ai"
                }
              ]
            }
            Rules:
            - Never suggest changes on protected locators provided in the user prompt.
            - bindSource = heading source binding; setBasis = basis annotation; markExcerpt = new resource excerpt; createRelation = knowledge point link.
            - Choose relationTypeKey from the allowed list in the user prompt.
            - All user-facing reason text must be Simplified Chinese.
            - markerSource must always be "ai".
            """;
    }

    private String userPrompt(
        PageEntity page,
        ArrayNode blocks,
        List<DocumentMarkingContextCollector.ProtectedLocatorEntry> protectedEntries,
        String kbId,
        AnalyzeDocumentMarkingRequest request
    ) {
        String pageId = page.getId();
        List<OutlineExtractor.ExtractedOutlineNode> outline = filterOutlineForScope(
            OutlineExtractor.extractPageOutline(pageId, blocks),
            blankToNull(request.sectionHeadingBlockId()),
            blankToNull(request.sectionEmbedBlockId())
        );
        List<DocumentMarkingContextCollector.SectionTextEntry> sections =
            DocumentMarkingContextCollector.collectScopedSectionTexts(
                pageId,
                blocks,
                blankToNull(request.sectionHeadingBlockId()),
                blankToNull(request.sectionEmbedBlockId()),
                blankToNull(request.sectionTitle()),
                SECTION_TEXT_MAX
            );
        List<RelationTypeDefDto> relationTypes = relationTypeService.listForKb(kbId);

        StringBuilder builder = new StringBuilder();
        builder.append("Page id: ").append(pageId).append('\n');
        builder.append("Page title: ").append(page.getTitle()).append('\n');
        builder.append("Knowledge base id: ").append(kbId).append('\n');
        String sectionHeadingBlockId = blankToNull(request.sectionHeadingBlockId());
        String sectionEmbedBlockId = blankToNull(request.sectionEmbedBlockId());
        String sectionTitle = blankToNull(request.sectionTitle());
        if (sectionHeadingBlockId != null || sectionEmbedBlockId != null) {
            builder.append("\nSection scope (ONLY suggest markers within this section):\n");
            if (sectionTitle != null) {
                builder.append("- title: ").append(sectionTitle).append('\n');
            }
            if (sectionHeadingBlockId != null) {
                builder.append("- anchor: page:").append(pageId).append(":heading:").append(sectionHeadingBlockId).append('\n');
            }
            if (sectionEmbedBlockId != null) {
                builder.append("- embed block: page:").append(pageId).append(":block:").append(sectionEmbedBlockId).append('\n');
            }
        }
        builder.append("\nAllowed relation types:\n");
        for (RelationTypeDefDto type : relationTypes) {
            builder.append("- ").append(type.typeKey()).append(" (").append(type.label()).append(")\n");
        }
        builder.append("\nOutline:\n");
        for (OutlineExtractor.ExtractedOutlineNode node : outline) {
            builder.append("  ".repeat(Math.max(0, node.level() - 1)))
                .append("- [").append(node.level()).append("] ")
                .append(node.title())
                .append(" | block=").append(node.sourceBlockId())
                .append(" | locator=page:").append(pageId).append(":heading:").append(node.sourceBlockId())
                .append('\n');
        }
        builder.append("\nSection texts:\n");
        for (DocumentMarkingContextCollector.SectionTextEntry section : sections) {
            builder.append("- ").append(section.locator()).append(": ").append(section.text()).append('\n');
        }
        builder.append("\nProtected locators (DO NOT suggest changes here):\n");
        if (protectedEntries.isEmpty()) {
            builder.append("(none)\n");
        } else {
            for (DocumentMarkingContextCollector.ProtectedLocatorEntry entry : protectedEntries) {
                builder.append("- ").append(entry.locator())
                    .append(" [").append(entry.type()).append("] ")
                    .append(entry.label());
                if (entry.bindingSummary() != null && !entry.bindingSummary().isBlank()) {
                    builder.append(" — ").append(entry.bindingSummary());
                }
                builder.append('\n');
            }
        }
        builder.append("\nResource catalog (match existing sources when possible):\n");
        appendResourceCatalog(builder);
        builder.append("\nAnalyze the document and suggest knowledge markers.");
        if (sectionHeadingBlockId != null || sectionEmbedBlockId != null) {
            builder.append(" Limit all suggestions to the section scope above.");
        }
        return builder.toString();
    }

    private List<OutlineExtractor.ExtractedOutlineNode> filterOutlineForScope(
        List<OutlineExtractor.ExtractedOutlineNode> outline,
        String sectionHeadingBlockId,
        String sectionEmbedBlockId
    ) {
        if (sectionHeadingBlockId != null) {
            int startIndex = -1;
            int startLevel = 0;
            for (int i = 0; i < outline.size(); i += 1) {
                if (sectionHeadingBlockId.equals(outline.get(i).sourceBlockId())) {
                    startIndex = i;
                    startLevel = outline.get(i).level();
                    break;
                }
            }
            if (startIndex < 0) {
                return outline;
            }
            List<OutlineExtractor.ExtractedOutlineNode> filtered = new ArrayList<>();
            filtered.add(outline.get(startIndex));
            for (int i = startIndex + 1; i < outline.size(); i += 1) {
                if (outline.get(i).level() <= startLevel) {
                    break;
                }
                filtered.add(outline.get(i));
            }
            return filtered;
        }
        if (sectionEmbedBlockId != null) {
            return outline.stream()
                .filter(node -> sectionEmbedBlockId.equals(node.sourceBlockId()))
                .toList();
        }
        return outline;
    }

    private Set<String> allowedHeadingBlockIdsForScope(
        List<OutlineExtractor.ExtractedOutlineNode> outline,
        String sectionHeadingBlockId,
        String sectionEmbedBlockId
    ) {
        Set<String> ids = new HashSet<>();
        List<OutlineExtractor.ExtractedOutlineNode> scoped = filterOutlineForScope(
            outline,
            sectionHeadingBlockId,
            sectionEmbedBlockId
        );
        for (OutlineExtractor.ExtractedOutlineNode node : scoped) {
            if (node.sourceBlockId() != null && !node.sourceBlockId().isBlank()) {
                ids.add(node.sourceBlockId());
            }
        }
        if (sectionHeadingBlockId != null) {
            ids.add(sectionHeadingBlockId);
        }
        return ids;
    }

    private void appendResourceCatalog(StringBuilder builder) {
        List<ResourceItemEntity> items = resourceItemRepository.findAll().stream()
            .limit(RESOURCE_CATALOG_MAX)
            .toList();
        for (ResourceItemEntity item : items) {
            builder.append("- item ").append(item.getId()).append(": ").append(item.getTitle()).append('\n');
            List<ResourceExcerptEntity> excerpts = resourceExcerptRepository
                .findByResourceItemIdOrderBySortOrderAscCreatedAtAsc(item.getId())
                .stream()
                .limit(5)
                .toList();
            for (ResourceExcerptEntity excerpt : excerpts) {
                builder.append("    excerpt ").append(excerpt.getId()).append(": ").append(excerpt.getTitle()).append('\n');
            }
        }
    }

    private Set<String> collectProtectedExcerptLocators() {
        Set<String> locators = new HashSet<>();
        for (ResourceExcerptEntity excerpt : resourceExcerptRepository.findAll()) {
            String metadataJson = excerpt.getMetadataJson();
            if (metadataJson == null || metadataJson.isBlank()) {
                locators.add("resource:" + excerpt.getResourceItemId() + ":excerpt:" + excerpt.getId());
                continue;
            }
            try {
                JsonNode metadata = objectMapper.readTree(metadataJson);
                if (!"ai".equalsIgnoreCase(text(metadata.path("markerSource")))) {
                    locators.add("resource:" + excerpt.getResourceItemId() + ":excerpt:" + excerpt.getId());
                }
            } catch (Exception ex) {
                locators.add("resource:" + excerpt.getResourceItemId() + ":excerpt:" + excerpt.getId());
            }
        }
        return locators;
    }

    private ArrayNode deserializeBlocks(String blocksJson) {
        try {
            JsonNode node = objectMapper.readTree(blocksJson);
            if (node instanceof ArrayNode array) {
                return array;
            }
            return objectMapper.createArrayNode();
        } catch (Exception ex) {
            return objectMapper.createArrayNode();
        }
    }

    private void ensureNotCancelled(AiAgentProgressListener progressListener) {
        if (progressListener != null && progressListener.isCancelled()) {
            throw new BusinessException(50326, "document marking cancelled");
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
        if (ex instanceof BusinessException business && business.getCode() == 50326) {
            emitProgress(progressListener, AiAgentProgressEvent.of(
                AiAgentProgressEvent.phaseCancelled(),
                nullToBlank(ex.getMessage()),
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

    private AiAgentRunLogEntity startRunLog(AiAgentRuntimeConfig config, String systemPrompt, String userPrompt) {
        try {
            return runLogService.start(AiAgentRunLogService.TASK_DOCUMENT_MARKING, config, systemPrompt, userPrompt);
        } catch (RuntimeException ex) {
            log.error("failed to start ai agent run log; taskType={}", AiAgentRunLogService.TASK_DOCUMENT_MARKING, ex);
            return null;
        }
    }

    private void markRunLogSuccess(AiAgentRunLogEntity runLog, AiChatCompletionResult completion, String output) {
        if (runLog == null) {
            return;
        }
        try {
            runLogService.markSuccess(runLog.getId(), completion, output);
        } catch (RuntimeException ex) {
            log.error("failed to persist ai agent run success log; runId={}", runLog.getId(), ex);
        }
    }

    private void markRunLogFailed(AiAgentRunLogEntity runLog, AiChatCompletionResult completion, RuntimeException original) {
        if (runLog == null) {
            return;
        }
        try {
            runLogService.markFailed(runLog.getId(), completion, original);
        } catch (RuntimeException logException) {
            log.error("failed to persist ai agent run failure log; runId={}", runLog.getId(), logException);
        }
    }

    private String serializeOutput(DocumentMarkingResponseDto response) {
        try {
            return objectMapper.writeValueAsString(response);
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

    private static String text(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return "";
        }
        return node.asText("").trim();
    }
}
