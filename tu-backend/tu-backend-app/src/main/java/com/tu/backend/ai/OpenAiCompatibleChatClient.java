package com.tu.backend.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.openai.core.Timeout;
import com.tu.backend.common.BusinessException;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Spliterator;
import java.util.Spliterators;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;
import java.util.stream.StreamSupport;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okio.BufferedSource;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.metadata.ChatResponseMetadata;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.model.tool.ToolCallingManager;
import org.springframework.ai.model.tool.ToolExecutionResult;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class OpenAiCompatibleChatClient implements AiChatClient, AiAgentConnectionTester, AiAgentToolLoopClient {

    private static final String REASONING_CONTENT_METADATA_KEY = "reasoningContent";
    private static final String REASONING_CONTENT_JSON_KEY = "reasoning_content";
    private static final String REASONING_JSON_KEY = "reasoning";
    private static final String SSE_DATA_PREFIX = "data:";
    private static final String SSE_DONE_MARKER = "[DONE]";
    private static final double DEFAULT_TEMPERATURE = 0.2;
    private static final MediaType JSON_MEDIA_TYPE = MediaType.get("application/json; charset=utf-8");

    private final ObjectMapper objectMapper;
    private final ChatModelFactory chatModelFactory;
    private final RawChatStreamFactory rawChatStreamFactory;
    private final ToolCallingManager toolCallingManager;
    private final AiAgentProperties aiAgentProperties;

    @Autowired
    public OpenAiCompatibleChatClient(
        ObjectMapper objectMapper,
        ToolCallingManager toolCallingManager,
        AiAgentProperties aiAgentProperties
    ) {
        this(
            objectMapper,
            (config, options) -> createOpenAiChatModel(config, options),
            (config, systemPrompt, userPrompt) -> createRawChatStream(
                objectMapper, config, systemPrompt, userPrompt
            ),
            toolCallingManager,
            aiAgentProperties
        );
    }

    OpenAiCompatibleChatClient(
        ObjectMapper objectMapper,
        ChatModelFactory chatModelFactory
    ) {
        this(
            objectMapper,
            chatModelFactory,
            (config, systemPrompt, userPrompt) -> createRawChatStream(
                objectMapper, config, systemPrompt, userPrompt
            ),
            ToolCallingManager.builder().build(),
            new AiAgentProperties()
        );
    }

    OpenAiCompatibleChatClient(
        ObjectMapper objectMapper,
        ChatModelFactory chatModelFactory,
        RawChatStreamFactory rawChatStreamFactory
    ) {
        this(
            objectMapper,
            chatModelFactory,
            rawChatStreamFactory,
            ToolCallingManager.builder().build(),
            new AiAgentProperties()
        );
    }

    OpenAiCompatibleChatClient(
        ObjectMapper objectMapper,
        ChatModelFactory chatModelFactory,
        ToolCallingManager toolCallingManager,
        AiAgentProperties aiAgentProperties
    ) {
        this(
            objectMapper,
            chatModelFactory,
            (config, systemPrompt, userPrompt) -> createRawChatStream(
                objectMapper, config, systemPrompt, userPrompt
            ),
            toolCallingManager,
            aiAgentProperties
        );
    }

    OpenAiCompatibleChatClient(
        ObjectMapper objectMapper,
        ChatModelFactory chatModelFactory,
        RawChatStreamFactory rawChatStreamFactory,
        ToolCallingManager toolCallingManager,
        AiAgentProperties aiAgentProperties
    ) {
        this.objectMapper = objectMapper;
        this.chatModelFactory = chatModelFactory;
        this.rawChatStreamFactory = rawChatStreamFactory;
        this.toolCallingManager = toolCallingManager;
        this.aiAgentProperties = aiAgentProperties;
    }

    @Override
    public AiChatCompletionResult completeJson(AiAgentRuntimeConfig config, String systemPrompt, String userPrompt) {
        ensureConfigured(config);
        String requestBodyJson = "";
        String rawResponseBody = null;
        long startedAt = System.nanoTime();
        try {
            OpenAiChatOptions options = OpenAiChatOptions.builder()
                .baseUrl(stripTrailingSlash(config.baseUrl()))
                .apiKey(config.apiKey())
                .model(config.model())
                .temperature(0.2)
                .timeout(requestTimeoutDuration(config))
                .responseFormat(OpenAiChatModel.ResponseFormat.builder()
                    .type(OpenAiChatModel.ResponseFormat.Type.JSON_OBJECT)
                    .build())
                .build();
            Map<String, Object> requestBody = Map.of(
                "baseUrl", stripTrailingSlash(config.baseUrl()),
                "model", config.model(),
                "temperature", 0.2,
                "response_format", Map.of("type", "json_object"),
                "messages", List.of(
                    Map.of("role", "system", "content", systemPrompt),
                    Map.of("role", "user", "content", userPrompt)
                )
            );
            requestBodyJson = objectMapper.writeValueAsString(requestBody);
            ChatModel chatModel = chatModelFactory.create(config, options);
            ChatResponse response = ChatClient.create(chatModel)
                .prompt(new Prompt(List.of(new SystemMessage(systemPrompt), new UserMessage(userPrompt)), options))
                .call()
                .chatResponse();
            rawResponseBody = serializeChatResponse(response);
            UsageSnapshot usage = usageFromResponse(response);
            String content = contentFromResponse(response);
            String reasoningContent = reasoningContentFromResponse(response);
            if (content.isBlank()) {
                throw new AiChatException(
                    50323,
                    "ai agent returned empty response: " + requestContext(config)
                        + "; response=" + abbreviate(rawResponseBody),
                    requestBodyJson,
                    rawResponseBody,
                    elapsedMillis(startedAt),
                    usage.promptTokens(),
                    usage.completionTokens(),
                    usage.totalTokens()
                );
            }
            return new AiChatCompletionResult(
                AiAgentJsonContent.extract(content),
                requestBodyJson,
                rawResponseBody,
                elapsedMillis(startedAt),
                usage.promptTokens(),
                usage.completionTokens(),
                usage.totalTokens(),
                reasoningContent
            );
        } catch (BusinessException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new AiChatException(
                50322,
                "ai agent request failed: " + requestContext(config) + "; " + exceptionDetail(ex),
                requestBodyJson,
                rawResponseBody,
                elapsedMillis(startedAt),
                null,
                null,
                null
            );
        }
    }

    @Override
    public AiChatCompletionResult streamText(
        AiAgentRuntimeConfig config,
        String systemPrompt,
        String userPrompt,
        AiChatStreamListener listener
    ) {
        ensureConfigured(config);
        String requestBodyJson = "";
        long startedAt = System.nanoTime();
        StringBuilder content = new StringBuilder();
        StringBuilder reasoningContent = new StringBuilder();
        Integer promptTokens = null;
        Integer completionTokens = null;
        Integer totalTokens = null;
        try {
            Map<String, Object> requestBody = Map.of(
                "baseUrl", stripTrailingSlash(config.baseUrl()),
                "model", config.model(),
                "temperature", 0.2,
                "stream", true,
                "messages", List.of(
                    Map.of("role", "system", "content", systemPrompt),
                    Map.of("role", "user", "content", userPrompt)
                )
            );
            requestBodyJson = objectMapper.writeValueAsString(requestBody);
            try (RawChatStream rawStream = rawChatStreamFactory.open(config, systemPrompt, userPrompt)) {
                var iterator = rawStream.stream().iterator();
                while (!listener.isCancelled() && iterator.hasNext()) {
                    RawChatChunk chunk = iterator.next();
                    String reasoningDelta = appendStreamChunk(reasoningContent, chunk.reasoningContent());
                    if (!reasoningDelta.isEmpty()) {
                        listener.onReasoningDelta(reasoningDelta);
                    }
                    String answerDelta = appendStreamChunk(content, chunk.content());
                    if (!answerDelta.isEmpty()) {
                        listener.onAnswerDelta(answerDelta);
                    }
                    if (chunk.totalTokens() != null) {
                        promptTokens = chunk.promptTokens();
                        completionTokens = chunk.completionTokens();
                        totalTokens = chunk.totalTokens();
                    }
                }
            }
            if (listener.isCancelled()) {
                throw new BusinessException(50326, "ai request cancelled");
            }
            if (content.isEmpty()) {
                throw new AiChatException(
                    50323,
                    "ai agent returned empty response: " + requestContext(config),
                    requestBodyJson,
                    serializeStreamResponse(content, reasoningContent),
                    elapsedMillis(startedAt),
                    null,
                    null,
                    null
                );
            }
            return new AiChatCompletionResult(
                content.toString(),
                requestBodyJson,
                serializeStreamResponse(content, reasoningContent),
                elapsedMillis(startedAt),
                promptTokens,
                completionTokens,
                totalTokens,
                reasoningContent.toString()
            );
        } catch (BusinessException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new AiChatException(
                50322,
                "ai agent streaming request failed: " + requestContext(config) + "; " + exceptionDetail(ex),
                requestBodyJson,
                serializeStreamResponse(content, reasoningContent),
                elapsedMillis(startedAt),
                null,
                null,
                null
            );
        }
    }

    private String appendStreamChunk(StringBuilder accumulated, String chunk) {
        if (chunk == null || chunk.isEmpty()) {
            return "";
        }
        String delta = chunk.startsWith(accumulated.toString())
            ? chunk.substring(accumulated.length())
            : chunk;
        accumulated.append(delta);
        return delta;
    }

    private String serializeStreamResponse(StringBuilder content, StringBuilder reasoningContent) {
        try {
            return objectMapper.writeValueAsString(Map.of(
                "content", content.toString(),
                REASONING_CONTENT_METADATA_KEY, reasoningContent.toString()
            ));
        } catch (Exception ex) {
            return content.toString();
        }
    }

    @Override
    public AiAgentToolLoopResult runToolLoop(
        AiAgentRuntimeConfig config,
        String systemPrompt,
        String userPrompt,
        AiAgentExecutionContext executionContext,
        AiAgentProgressListener progressListener,
        Object... toolProviders
    ) {
        int configuredMaxToolRounds = Math.max(1, aiAgentProperties.getToolLoop().getMaxToolRounds());
        return runToolLoopInternal(
            config,
            systemPrompt,
            userPrompt,
            executionContext,
            progressListener,
            configuredMaxToolRounds,
            toolProviders
        );
    }

    @Override
    public AiAgentToolLoopResult runToolLoopLimited(
        AiAgentRuntimeConfig config,
        String systemPrompt,
        String userPrompt,
        AiAgentExecutionContext executionContext,
        AiAgentProgressListener progressListener,
        int maxToolRounds,
        Object... toolProviders
    ) {
        int configuredMaxToolRounds = Math.max(1, aiAgentProperties.getToolLoop().getMaxToolRounds());
        int effectiveMaxToolRounds = Math.min(configuredMaxToolRounds, Math.max(1, maxToolRounds));
        return runToolLoopInternal(
            config,
            systemPrompt,
            userPrompt,
            executionContext,
            progressListener,
            effectiveMaxToolRounds,
            toolProviders
        );
    }

    private AiAgentToolLoopResult runToolLoopInternal(
        AiAgentRuntimeConfig config,
        String systemPrompt,
        String userPrompt,
        AiAgentExecutionContext executionContext,
        AiAgentProgressListener progressListener,
        int maxToolRounds,
        Object... toolProviders
    ) {
        ensureConfigured(config);
        AiAgentExecutionContextHolder.set(executionContext);
        String requestBodyJson = "";
        String rawResponseBody = null;
        long startedAt = System.nanoTime();
        int modelCallCount = 0;
        int toolRoundCount = 0;
        try {
            List<ToolCallback> toolCallbacks = AiAgentToolCallbackSupport.fromProviders(toolProviders);
            OpenAiChatOptions options = OpenAiChatOptions.builder()
                .baseUrl(stripTrailingSlash(config.baseUrl()))
                .apiKey(config.apiKey())
                .model(config.model())
                .temperature(0.2)
                .timeout(requestTimeoutDuration(config))
                .toolCallbacks(toolCallbacks)
                .build();
            Map<String, Object> requestBody = new LinkedHashMap<>();
            requestBody.put("baseUrl", stripTrailingSlash(config.baseUrl()));
            requestBody.put("model", config.model());
            requestBody.put("temperature", 0.2);
            requestBody.put("toolLoop", true);
            requestBody.put("maxToolRounds", maxToolRounds);
            requestBody.put("messages", List.of(
                Map.of("role", "system", "content", systemPrompt),
                Map.of("role", "user", "content", userPrompt)
            ));
            requestBodyJson = objectMapper.writeValueAsString(requestBody);

            ChatModel chatModel = chatModelFactory.create(config, options);
            ChatOptions chatOptions = options;
            Prompt prompt = new Prompt(
                List.of(new SystemMessage(systemPrompt), new UserMessage(userPrompt)),
                chatOptions
            );

            ensureNotCancelled(progressListener);
            emitProgress(progressListener, AiAgentProgressEvent.of(
                AiAgentProgressEvent.phaseModelCall(),
                "正在调用模型（第 1 轮）",
                1,
                null,
                startedAt
            ));
            ChatResponse chatResponse = chatModel.call(prompt);
            modelCallCount++;
            emitModelThinkingProgress(progressListener, chatResponse, modelCallCount, startedAt);

            while (chatResponse.hasToolCalls() && toolRoundCount < maxToolRounds) {
                toolRoundCount++;
                emitToolCallProgress(progressListener, chatResponse, startedAt);
                ToolExecutionResult toolExecutionResult = toolCallingManager.executeToolCalls(prompt, chatResponse);
                emitToolDoneProgress(progressListener, chatResponse, startedAt);
                prompt = new Prompt(toolExecutionResult.conversationHistory(), chatOptions);
                ensureNotCancelled(progressListener);
                int nextRound = modelCallCount + 1;
                emitProgress(progressListener, AiAgentProgressEvent.of(
                    AiAgentProgressEvent.phaseModelCall(),
                    "正在调用模型（第 " + nextRound + " 轮）",
                    nextRound,
                    null,
                    startedAt
                ));
                chatResponse = chatModel.call(prompt);
                modelCallCount++;
                emitModelThinkingProgress(progressListener, chatResponse, modelCallCount, startedAt);
            }

            rawResponseBody = serializeChatResponse(chatResponse);
            if (chatResponse.hasToolCalls()) {
                throw new BusinessException(
                    50325,
                    "ai agent exceeded max tool loop rounds: " + maxToolRounds
                );
            }

            UsageSnapshot usage = usageFromResponse(chatResponse);
            String content = AiAgentJsonContent.extract(contentFromResponse(chatResponse));
            if (content.isBlank()) {
                throw new AiChatException(
                    50323,
                    "ai agent returned empty response: " + requestContext(config)
                        + "; response=" + abbreviate(rawResponseBody),
                    requestBodyJson,
                    rawResponseBody,
                    elapsedMillis(startedAt),
                    usage.promptTokens(),
                    usage.completionTokens(),
                    usage.totalTokens()
                );
            }
            return new AiAgentToolLoopResult(
                content,
                requestBodyJson,
                rawResponseBody,
                elapsedMillis(startedAt),
                usage.promptTokens(),
                usage.completionTokens(),
                usage.totalTokens(),
                modelCallCount,
                toolRoundCount
            );
        } catch (BusinessException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new AiChatException(
                50322,
                "ai agent tool loop failed: " + requestContext(config) + "; " + exceptionDetail(ex),
                requestBodyJson,
                rawResponseBody,
                elapsedMillis(startedAt),
                null,
                null,
                null
            );
        } finally {
            AiAgentExecutionContextHolder.clear();
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

    private void emitModelThinkingProgress(
        AiAgentProgressListener progressListener,
        ChatResponse chatResponse,
        int round,
        long startedAt
    ) {
        if (progressListener == null) {
            return;
        }
        String reasoningText = reasoningContentFromResponse(chatResponse).strip();
        boolean hasReasoningContent = !reasoningText.isBlank();
        String text = hasReasoningContent
            ? reasoningText
            : intermediateToolCallText(chatResponse);
        if (text.isBlank()) {
            return;
        }
        if (!hasReasoningContent && looksLikeFinalPlanJson(text)) {
            return;
        }
        emitProgress(progressListener, AiAgentProgressEvent.of(
            AiAgentProgressEvent.phaseThinking(),
            hasReasoningContent ? text : abbreviateThinking(text),
            round,
            null,
            startedAt
        ));
    }

    private String intermediateToolCallText(ChatResponse chatResponse) {
        return chatResponse != null && chatResponse.hasToolCalls()
            ? contentFromResponse(chatResponse).strip()
            : "";
    }

    private static boolean looksLikeFinalPlanJson(String text) {
        String trimmed = text.trim();
        if (!trimmed.startsWith("{")) {
            return false;
        }
        String lower = trimmed.toLowerCase(Locale.ROOT);
        return lower.contains("\"ordereditems\"")
            || lower.contains("\"orderedpointids\"")
            || lower.contains("\"suggestions\"");
    }

    private String abbreviateThinking(String value) {
        String normalized = value == null ? "" : value.strip();
        int maxLength = 2000;
        if (normalized.length() <= maxLength) {
            return normalized;
        }
        return normalized.substring(0, maxLength) + "...<truncated>";
    }

    private void emitToolCallProgress(
        AiAgentProgressListener progressListener,
        ChatResponse chatResponse,
        long startedAt
    ) {
        if (progressListener == null) {
            return;
        }
        for (String toolName : toolNamesFromResponse(chatResponse)) {
            emitProgress(progressListener, AiAgentProgressEvent.of(
                AiAgentProgressEvent.phaseToolCall(),
                AiAgentToolLabels.toolCallMessage(toolName),
                null,
                toolName,
                startedAt
            ));
        }
    }

    private void emitToolDoneProgress(
        AiAgentProgressListener progressListener,
        ChatResponse chatResponse,
        long startedAt
    ) {
        if (progressListener == null) {
            return;
        }
        for (String toolName : toolNamesFromResponse(chatResponse)) {
            emitProgress(progressListener, AiAgentProgressEvent.of(
                AiAgentProgressEvent.phaseToolDone(),
                AiAgentToolLabels.toolDoneMessage(toolName),
                null,
                toolName,
                startedAt
            ));
        }
    }

    private List<String> toolNamesFromResponse(ChatResponse chatResponse) {
        if (chatResponse == null || chatResponse.getResult() == null) {
            return List.of();
        }
        AssistantMessage output = chatResponse.getResult().getOutput();
        if (output == null || output.getToolCalls() == null) {
            return List.of();
        }
        return output.getToolCalls().stream()
            .map(AssistantMessage.ToolCall::name)
            .filter(name -> name != null && !name.isBlank())
            .distinct()
            .toList();
    }

    private static ChatModel createOpenAiChatModel(
        AiAgentRuntimeConfig config,
        OpenAiChatOptions options
    ) {
        Timeout timeout = httpTimeout(config);
        return OpenAiChatModel.builder()
            .options(options)
            .httpClientBuilderCustomizer(builder -> builder.timeout(timeout))
            .build();
    }

    private static RawChatStream createRawChatStream(
        ObjectMapper objectMapper,
        AiAgentRuntimeConfig config,
        String systemPrompt,
        String userPrompt
    ) {
        OkHttpClient client = new OkHttpClient.Builder()
            .connectTimeout(Math.max(1, config.connectTimeoutSeconds()), TimeUnit.SECONDS)
            .readTimeout(Math.max(1, config.readTimeoutSeconds()), TimeUnit.SECONDS)
            .callTimeout(Math.max(1, config.requestTimeoutSeconds()), TimeUnit.SECONDS)
            .build();
        Map<String, Object> requestPayload = Map.of(
            "model", config.model(),
            "temperature", DEFAULT_TEMPERATURE,
            "stream", true,
            "stream_options", Map.of("include_usage", true),
            "messages", List.of(
                Map.of("role", "system", "content", systemPrompt),
                Map.of("role", "user", "content", userPrompt)
            )
        );
        String requestBodyJson;
        try {
            requestBodyJson = objectMapper.writeValueAsString(requestPayload);
        } catch (IOException ex) {
            closeOkHttpClient(client);
            throw new UncheckedIOException("failed to serialize ai streaming request", ex);
        }
        Request request = new Request.Builder()
            .url(stripTrailingSlash(config.baseUrl()) + "/chat/completions")
            .header("Authorization", "Bearer " + config.apiKey())
            .header("Accept", "text/event-stream")
            .post(RequestBody.create(requestBodyJson, JSON_MEDIA_TYPE))
            .build();
        try {
            Response response = client.newCall(request).execute();
            if (!response.isSuccessful()) {
                int statusCode = response.code();
                String statusMessage = response.message();
                response.close();
                closeOkHttpClient(client);
                throw new IllegalStateException(
                    "ai streaming endpoint returned HTTP " + statusCode + " " + statusMessage
                );
            }
            return new OkHttpRawChatStream(objectMapper, client, response);
        } catch (IOException ex) {
            closeOkHttpClient(client);
            throw new UncheckedIOException("failed to open ai streaming response", ex);
        }
    }

    static RawChatChunk rawChunkFromJson(ObjectMapper objectMapper, String payload) {
        JsonNode root;
        try {
            root = objectMapper.readTree(payload);
        } catch (IOException ex) {
            throw new UncheckedIOException("failed to parse ai streaming chunk", ex);
        }
        StringBuilder content = new StringBuilder();
        StringBuilder reasoningContent = new StringBuilder();
        JsonNode choices = root.path("choices");
        if (choices.isArray()) {
            for (JsonNode choice : choices) {
                JsonNode delta = choice.path("delta");
                content.append(textValue(delta, "content"));
                String reasoningDelta = textValue(delta, REASONING_CONTENT_JSON_KEY);
                reasoningContent.append(reasoningDelta.isEmpty()
                    ? textValue(delta, REASONING_JSON_KEY)
                    : reasoningDelta);
            }
        }
        JsonNode usage = root.path("usage");
        return new RawChatChunk(
            content.toString(),
            reasoningContent.toString(),
            tokenCount(usage, "prompt_tokens"),
            tokenCount(usage, "completion_tokens"),
            tokenCount(usage, "total_tokens")
        );
    }

    private static String textValue(JsonNode parent, String fieldName) {
        JsonNode value = parent.path(fieldName);
        return value.isTextual() ? value.textValue() : "";
    }

    private static Integer tokenCount(JsonNode usage, String fieldName) {
        JsonNode value = usage.path(fieldName);
        return value.isIntegralNumber() ? safeTokenCount(value.longValue()) : null;
    }

    private static int safeTokenCount(long tokenCount) {
        return (int) Math.min(Integer.MAX_VALUE, Math.max(0L, tokenCount));
    }

    static Timeout httpTimeout(AiAgentRuntimeConfig config) {
        Duration connect = Duration.ofSeconds(Math.max(1, config.connectTimeoutSeconds()));
        Duration read = Duration.ofSeconds(Math.max(1, config.readTimeoutSeconds()));
        Duration request = requestTimeoutDuration(config);
        return Timeout.builder()
            .connect(connect)
            .read(read)
            .write(read)
            .request(request)
            .build();
    }

    private static Duration requestTimeoutDuration(AiAgentRuntimeConfig config) {
        return Duration.ofSeconds(Math.max(1, config.requestTimeoutSeconds()));
    }

    static Timeout httpTimeout(AiAgentProperties.HttpClient httpClient) {
        Duration connect = positiveDuration(httpClient.getConnectTimeout(), Duration.ofSeconds(30));
        Duration read = positiveDuration(httpClient.getReadTimeout(), Duration.ofMinutes(5));
        Duration request = positiveDuration(httpClient.getRequestTimeout(), Duration.ofMinutes(5));
        return Timeout.builder()
            .connect(connect)
            .read(read)
            .write(read)
            .request(request)
            .build();
    }

    private static Duration positiveDuration(Duration value, Duration fallback) {
        if (value == null || value.isZero() || value.isNegative()) {
            return fallback;
        }
        return value;
    }

    private String contentFromResponse(ChatResponse response) {
        if (response == null || response.getResult() == null || response.getResult().getOutput() == null) {
            return "";
        }
        return nullToBlank(response.getResult().getOutput().getText());
    }

    private String reasoningContentFromResponse(ChatResponse response) {
        if (response == null || response.getResult() == null || response.getResult().getOutput() == null) {
            return "";
        }
        Object reasoningContent = response.getResult()
            .getOutput()
            .getMetadata()
            .get(REASONING_CONTENT_METADATA_KEY);
        return reasoningContent == null ? "" : reasoningContent.toString();
    }

    private UsageSnapshot usageFromResponse(ChatResponse response) {
        Usage usage = response == null || response.getMetadata() == null
            ? null
            : response.getMetadata().getUsage();
        if (usage == null) {
            return new UsageSnapshot(null, null, null);
        }
        return new UsageSnapshot(
            usage.getPromptTokens(),
            usage.getCompletionTokens(),
            usage.getTotalTokens()
        );
    }

    private String serializeChatResponse(ChatResponse response) {
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("metadata", metadataMap(response == null ? null : response.getMetadata()));
            payload.put("results", response == null
                ? List.of()
                : response.getResults().stream().map(this::generationMap).toList());
            return objectMapper.writeValueAsString(payload);
        } catch (Exception ex) {
            return response == null ? "" : response.toString();
        }
    }

    private Map<String, Object> metadataMap(ChatResponseMetadata metadata) {
        if (metadata == null) {
            return Map.of();
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", metadata.getId());
        payload.put("model", metadata.getModel());
        Usage usage = metadata.getUsage();
        if (usage != null) {
            Map<String, Object> usagePayload = new LinkedHashMap<>();
            usagePayload.put("promptTokens", usage.getPromptTokens());
            usagePayload.put("completionTokens", usage.getCompletionTokens());
            usagePayload.put("totalTokens", usage.getTotalTokens());
            payload.put("usage", usagePayload);
            if (usage.getNativeUsage() != null) {
                payload.put("nativeUsage", usage.getNativeUsage().toString());
            }
        }
        return payload;
    }

    private Map<String, Object> generationMap(Generation generation) {
        Map<String, Object> payload = new LinkedHashMap<>();
        AssistantMessage output = generation == null ? null : generation.getOutput();
        payload.put("content", output == null ? "" : output.getText());
        payload.put("reasoningContent", output == null
            ? ""
            : nullToBlank(output.getMetadata().get(REASONING_CONTENT_METADATA_KEY)));
        payload.put("metadata", generation == null || generation.getMetadata() == null
            ? Map.of()
            : generation.getMetadata().toString());
        return payload;
    }

    private String nullToBlank(Object value) {
        return value == null ? "" : value.toString();
    }

    private Long elapsedMillis(long startedAt) {
        return Math.max(0, Math.round((System.nanoTime() - startedAt) / 1_000_000.0));
    }

    private void ensureConfigured(AiAgentRuntimeConfig config) {
        if (!config.enabled()) {
            throw new BusinessException(50320, "ai agent disabled");
        }
        if (isBlank(config.baseUrl()) || isBlank(config.apiKey()) || isBlank(config.model())) {
            throw new BusinessException(50321, "ai agent configuration incomplete");
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static String stripTrailingSlash(String value) {
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    private String requestContext(AiAgentRuntimeConfig config) {
        return "POST " + stripTrailingSlash(config.baseUrl()) + "/chat/completions; model=" + config.model();
    }

    private String exceptionDetail(Exception ex) {
        String detail = "exception=" + ex.getClass().getName()
            + ": " + nullToBlank(ex.getMessage())
            + causeDetail(ex);
        if (isTimeoutException(ex)) {
            detail += "; hint=模型响应超时，可在系统配置 > AI Agent 调大读超时/请求超时后重试";
        }
        return detail;
    }

    private boolean isTimeoutException(Throwable throwable) {
        Throwable current = throwable;
        while (current != null) {
            String name = current.getClass().getName();
            String message = nullToBlank(current.getMessage()).toLowerCase();
            if (name.contains("Timeout") || name.contains("InterruptedIOException") || message.contains("timeout")) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    private String causeDetail(Throwable throwable) {
        List<String> causes = new ArrayList<>();
        Throwable cause = throwable.getCause();
        while (cause != null && causes.size() < 6) {
            causes.add(cause.getClass().getName() + ": " + nullToBlank(cause.getMessage()));
            cause = cause.getCause();
        }
        return causes.isEmpty() ? "" : "; causes=" + String.join(" <- ", causes);
    }

    private String nullToBlank(String value) {
        return value == null ? "" : value;
    }

    private String abbreviate(String value) {
        String normalized = value == null ? "" : value.strip();
        int maxLength = 4000;
        if (normalized.length() <= maxLength) {
            return normalized;
        }
        return normalized.substring(0, maxLength) + "...<truncated " + (normalized.length() - maxLength) + " chars>";
    }

    interface ChatModelFactory {
        ChatModel create(AiAgentRuntimeConfig config, OpenAiChatOptions options);
    }

    interface RawChatStreamFactory {
        RawChatStream open(AiAgentRuntimeConfig config, String systemPrompt, String userPrompt);
    }

    interface RawChatStream extends AutoCloseable {
        Stream<RawChatChunk> stream();

        @Override
        void close();
    }

    record RawChatChunk(
        String content,
        String reasoningContent,
        Integer promptTokens,
        Integer completionTokens,
        Integer totalTokens
    ) {
    }

    private record OkHttpRawChatStream(
        ObjectMapper objectMapper,
        OkHttpClient client,
        Response response
    ) implements RawChatStream {
        @Override
        public Stream<RawChatChunk> stream() {
            BufferedSource source = response.body().source();
            Iterator<RawChatChunk> iterator = new SseChunkIterator(objectMapper, source);
            return StreamSupport.stream(
                Spliterators.spliteratorUnknownSize(iterator, Spliterator.ORDERED),
                false
            );
        }

        @Override
        public void close() {
            try {
                response.close();
            } finally {
                closeOkHttpClient(client);
            }
        }
    }

    private static final class SseChunkIterator implements Iterator<RawChatChunk> {

        private final ObjectMapper objectMapper;
        private final BufferedSource source;
        private RawChatChunk nextChunk;
        private boolean finished;

        private SseChunkIterator(ObjectMapper objectMapper, BufferedSource source) {
            this.objectMapper = objectMapper;
            this.source = source;
        }

        @Override
        public boolean hasNext() {
            loadNextChunk();
            return nextChunk != null;
        }

        @Override
        public RawChatChunk next() {
            loadNextChunk();
            if (nextChunk == null) {
                throw new NoSuchElementException();
            }
            RawChatChunk currentChunk = nextChunk;
            nextChunk = null;
            return currentChunk;
        }

        private void loadNextChunk() {
            if (nextChunk != null || finished) {
                return;
            }
            try {
                String line;
                while ((line = source.readUtf8Line()) != null) {
                    String normalizedLine = line.strip();
                    if (!normalizedLine.startsWith(SSE_DATA_PREFIX)) {
                        continue;
                    }
                    String payload = normalizedLine.substring(SSE_DATA_PREFIX.length()).stripLeading();
                    if (SSE_DONE_MARKER.equals(payload)) {
                        finished = true;
                        return;
                    }
                    if (!payload.isEmpty()) {
                        nextChunk = rawChunkFromJson(objectMapper, payload);
                        return;
                    }
                }
                finished = true;
            } catch (IOException ex) {
                finished = true;
                throw new UncheckedIOException("failed to read ai streaming response", ex);
            }
        }
    }

    private static void closeOkHttpClient(OkHttpClient client) {
        client.dispatcher().executorService().shutdown();
        client.connectionPool().evictAll();
        if (client.cache() != null) {
            try {
                client.cache().close();
            } catch (IOException ignored) {
                // The response failure remains the primary error.
            }
        }
    }

    private record UsageSnapshot(Integer promptTokens, Integer completionTokens, Integer totalTokens) {
    }
}
