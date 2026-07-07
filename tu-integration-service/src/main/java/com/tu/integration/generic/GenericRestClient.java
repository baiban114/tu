package com.tu.integration.generic;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tu.integration.common.BusinessException;
import com.tu.integration.task.dto.CreateExternalTaskRequest;
import com.tu.integration.task.dto.ExternalProjectDto;
import com.tu.integration.task.dto.ExternalTaskDto;
import com.tu.integration.task.dto.MoveExternalTaskRequest;
import com.tu.integration.task.dto.UpdateExternalTaskRequest;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class GenericRestClient {

    private final RestClient.Builder restClientBuilder;
    private final ObjectMapper objectMapper;

    public GenericRestClient(RestClient.Builder restClientBuilder, ObjectMapper objectMapper) {
        this.restClientBuilder = restClientBuilder;
        this.objectMapper = objectMapper;
    }

    public boolean configured(GenericRestConnection connection) {
        return connection != null && connection.configured();
    }

    public List<ExternalProjectDto> listProjects(GenericRestConnection connection) {
        GenericRestProfile profile = profile(connection);
        JsonNode body = execute(connection, profile, "listProjects", Map.of());
        List<ExternalProjectDto> projects = new ArrayList<>();
        GenericRestProfile.Operation operation = operation(profile, "listProjects");
        for (JsonNode node : selectArray(body, operation.arrayPath())) {
            String id = text(node, fields(operation, "id", "id"));
            if (id.isBlank()) continue;
            projects.add(new ExternalProjectDto(
                provider(profile),
                id,
                firstNonBlank(text(node, fields(operation, "name", "name", "title")), "Untitled project"),
                text(node, fields(operation, "description", "description")),
                sourceUrl(connection, "/projects/" + id)
            ));
        }
        return projects;
    }

    public List<ExternalTaskDto> listTasks(GenericRestConnection connection, String projectId, String status, String priority, String assigneeId, String page, String limit, String sortBy, String sortOrder) {
        GenericRestProfile profile = profile(connection);
        Map<String, Object> input = new LinkedHashMap<>();
        input.put("projectId", projectId);
        input.put("status", status);
        input.put("priority", priority);
        input.put("assigneeId", assigneeId);
        input.put("page", page);
        input.put("limit", limit);
        input.put("sortBy", sortBy);
        input.put("sortOrder", sortOrder);
        JsonNode body = execute(connection, profile, "listTasks", input);
        GenericRestProfile.Operation operation = operation(profile, "listTasks");
        List<ExternalTaskDto> tasks = new ArrayList<>();
        for (JsonNode node : selectArray(body, operation.arrayPath())) {
            tasks.add(toTask(connection, profile, operation, node, projectId));
        }
        return tasks;
    }

    public ExternalTaskDto createTask(GenericRestConnection connection, String projectId, CreateExternalTaskRequest request) {
        GenericRestProfile profile = profile(connection);
        Map<String, Object> input = new LinkedHashMap<>();
        input.put("projectId", projectId);
        input.put("title", request.title());
        input.put("description", request.description());
        input.put("status", request.status());
        input.put("priority", request.priority());
        input.put("assigneeId", request.assigneeId());
        input.put("dueDate", request.dueDate());
        JsonNode body = execute(connection, profile, "createTask", input);
        return toTask(connection, profile, operation(profile, "listTasks"), unwrap(body), projectId);
    }

    public ExternalTaskDto updateTask(GenericRestConnection connection, String taskId, UpdateExternalTaskRequest request) {
        GenericRestProfile profile = profile(connection);
        Map<String, Object> input = new LinkedHashMap<>();
        input.put("taskId", taskId);
        input.put("title", request.title());
        input.put("description", request.description());
        input.put("status", request.status());
        input.put("priority", request.priority());
        input.put("assigneeId", request.assigneeId());
        input.put("dueDate", request.dueDate());
        JsonNode body = execute(connection, profile, "updateTask", input);
        return toTask(connection, profile, operation(profile, "listTasks"), unwrap(body), text(unwrap(body), "projectId", "project_id"));
    }

    public ExternalTaskDto moveTask(GenericRestConnection connection, String taskId, MoveExternalTaskRequest request) {
        GenericRestProfile profile = profile(connection);
        Map<String, Object> input = new LinkedHashMap<>();
        input.put("taskId", taskId);
        input.put("status", request.status());
        input.put("columnId", request.columnId());
        input.put("position", request.position());
        JsonNode body = execute(connection, profile, "moveTask", input);
        return toTask(connection, profile, operation(profile, "listTasks"), unwrap(body), text(unwrap(body), "projectId", "project_id"));
    }

    private JsonNode execute(GenericRestConnection connection, GenericRestProfile profile, String operationName, Map<String, Object> input) {
        if (!configured(connection)) {
            throw new BusinessException(40000, "REST integration requires baseUrl, apiKey and workspaceId");
        }
        GenericRestProfile.Operation operation = operation(profile, operationName);
        Map<String, Object> values = new HashMap<>(input);
        if (operation.defaults() != null) {
            for (Map.Entry<String, String> entry : operation.defaults().entrySet()) {
                Object value = values.get(entry.getKey());
                if (value == null || value.toString().isBlank()) values.put(entry.getKey(), entry.getValue());
            }
        }
        applyEnumMappings(profile, values);

        String path = render(operation.path(), connection, values);
        String query = buildQuery(operation.query(), connection, values, omitBlank(profile));
        Map<String, Object> body = buildBody(operation.body(), operation.defaults(), connection, values, omitBlank(profile));

        try {
            RestClient.RequestBodySpec spec = client(connection)
                .method(HttpMethod.valueOf(firstNonBlank(operation.method(), "GET").toUpperCase()))
                .uri(path + query);
            if (!body.isEmpty()) spec.body(body);
            return parseBody(spec.retrieve().body(String.class));
        } catch (RestClientException ex) {
            throw new BusinessException(50200, "external REST request failed: " + ex.getMessage());
        }
    }

    private RestClient client(GenericRestConnection connection) {
        return restClientBuilder
            .baseUrl(stripTrailingSlash(connection.baseUrl()))
            .defaultHeader("Authorization", "Bearer " + connection.apiKey())
            .build();
    }

    private GenericRestProfile profile(GenericRestConnection connection) {
        String json = firstNonBlank(connection.adapterProfileJson(), DefaultGenericRestProfiles.kaneo());
        try {
            return objectMapper.readValue(json, GenericRestProfile.class);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(40000, "invalid adapter profile JSON: " + ex.getOriginalMessage());
        }
    }

    private GenericRestProfile.Operation operation(GenericRestProfile profile, String name) {
        if (profile.operations() == null || profile.operations().get(name) == null) {
            throw new BusinessException(40000, "adapter operation not configured: " + name);
        }
        return profile.operations().get(name);
    }

    private void applyEnumMappings(GenericRestProfile profile, Map<String, Object> values) {
        if (profile.enumMappings() == null) return;
        for (Map.Entry<String, Map<String, String>> mapping : profile.enumMappings().entrySet()) {
            Object raw = values.get(mapping.getKey());
            if (raw == null) continue;
            String mapped = mapping.getValue().get(raw.toString());
            if (mapped != null) values.put(mapping.getKey(), mapped);
        }
    }

    private String buildQuery(Map<String, String> template, GenericRestConnection connection, Map<String, Object> values, boolean omitBlank) {
        if (template == null || template.isEmpty()) return "";
        StringBuilder builder = new StringBuilder();
        for (Map.Entry<String, String> entry : template.entrySet()) {
            String value = render(entry.getValue(), connection, values);
            if (omitBlank && value.isBlank()) continue;
            builder.append(builder.isEmpty() ? '?' : '&').append(entry.getKey()).append('=').append(encode(value));
        }
        return builder.toString();
    }

    private Map<String, Object> buildBody(Map<String, String> template, Map<String, String> defaults, GenericRestConnection connection, Map<String, Object> values, boolean omitBlank) {
        Map<String, Object> body = new LinkedHashMap<>();
        if (template == null) return body;
        for (Map.Entry<String, String> entry : template.entrySet()) {
            String value = render(entry.getValue(), connection, values);
            boolean hasDefault = defaults != null && defaults.containsKey(entry.getKey());
            if (omitBlank && value.isBlank() && !hasDefault) continue;
            body.put(entry.getKey(), value);
        }
        return body;
    }

    private String render(String template, GenericRestConnection connection, Map<String, Object> values) {
        if (template == null) return "";
        String result = template;
        result = result.replace("{{connection.workspaceId}}", safe(connection.workspaceId()));
        result = result.replace("{{connection.baseUrl}}", safe(connection.baseUrl()));
        for (Map.Entry<String, Object> entry : values.entrySet()) {
            result = result.replace("{{" + entry.getKey() + "}}", safe(entry.getValue()));
        }
        return result;
    }

    private Iterable<JsonNode> selectArray(JsonNode body, String arrayPath) {
        if ("**tasks".equals(arrayPath)) {
            List<JsonNode> tasks = new ArrayList<>();
            collectTaskNodes(body, tasks);
            return tasks;
        }
        JsonNode node = body;
        if (node != null && node.has("data")) node = node.get("data");
        if (arrayPath != null && !arrayPath.isBlank() && !"data".equals(arrayPath)) {
            for (String segment : arrayPath.split("\\.")) {
                if (segment.isBlank() || "data".equals(segment)) continue;
                node = node == null ? null : node.get(segment);
            }
        }
        if (node == null || node.isNull()) return List.of();
        if (node.isArray()) return iterable(node);
        if (node.has("items") && node.get("items").isArray()) return iterable(node.get("items"));
        return List.of();
    }

    private void collectTaskNodes(JsonNode node, List<JsonNode> tasks) {
        if (node == null || node.isNull()) return;
        if (node.isArray()) {
            for (JsonNode item : node) collectTaskNodes(item, tasks);
            return;
        }
        if (!node.isObject()) return;
        if (node.hasNonNull("id") && node.hasNonNull("title")) {
            tasks.add(node);
            return;
        }
        Iterator<JsonNode> iterator = node.elements();
        while (iterator.hasNext()) collectTaskNodes(iterator.next(), tasks);
    }

    private Iterable<JsonNode> iterable(JsonNode array) {
        List<JsonNode> result = new ArrayList<>();
        array.elements().forEachRemaining(result::add);
        return result;
    }

    private ExternalTaskDto toTask(GenericRestConnection connection, GenericRestProfile profile, GenericRestProfile.Operation operation, JsonNode node, String fallbackProjectId) {
        JsonNode task = unwrap(node);
        String id = text(task, fields(operation, "id", "id"));
        String projectId = firstNonBlank(text(task, fields(operation, "projectId", "projectId", "project_id")), fallbackProjectId);
        return new ExternalTaskDto(
            provider(profile),
            id,
            projectId,
            text(task, fields(operation, "number", "number", "key", "identifier")),
            firstNonBlank(text(task, fields(operation, "title", "title", "name")), "Untitled task"),
            text(task, fields(operation, "description", "description", "content")),
            text(task, fields(operation, "status", "status", "state", "column")),
            text(task, fields(operation, "priority", "priority")),
            text(task, fields(operation, "assigneeName", "assigneeName", "assignee_name", "assignee")),
            text(task, fields(operation, "dueDate", "dueDate", "due_date")),
            integer(task, fields(operation, "position", "position", "order")),
            sourceUrl(connection, "/tasks/" + id),
            text(task, fields(operation, "updatedAt", "updatedAt", "updated_at", "modifiedAt"))
        );
    }

    private List<String> fields(GenericRestProfile.Operation operation, String key, String... fallback) {
        if (operation.fields() != null && operation.fields().get(key) != null) return operation.fields().get(key);
        return List.of(fallback);
    }

    private String text(JsonNode node, List<String> keys) {
        return text(node, keys.toArray(String[]::new));
    }

    private Integer integer(JsonNode node, List<String> keys) {
        return integer(node, keys.toArray(String[]::new));
    }

    private JsonNode parseBody(String body) {
        if (body == null || body.isBlank()) throw new BusinessException(50200, "external REST returned empty response");
        try {
            return objectMapper.readTree(body);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(50200, "external REST returned invalid JSON: " + ex.getOriginalMessage());
        }
    }

    private JsonNode unwrap(JsonNode body) {
        if (body == null || body.isNull()) return null;
        for (String key : List.of("data", "task", "project")) {
            JsonNode value = body.get(key);
            if (value != null && value.isObject()) return value;
        }
        return body;
    }

    private String text(JsonNode node, String... keys) {
        if (node == null) return "";
        for (String key : keys) {
            JsonNode value = node.get(key);
            if (value == null || value.isNull()) continue;
            if (value.isTextual() || value.isNumber() || value.isBoolean()) return value.asText();
        }
        return "";
    }

    private Integer integer(JsonNode node, String... keys) {
        if (node == null) return null;
        for (String key : keys) {
            JsonNode value = node.get(key);
            if (value != null && value.isNumber()) return value.asInt();
        }
        return null;
    }

    private String provider(GenericRestProfile profile) {
        return firstNonBlank(profile.provider(), "generic-rest");
    }

    private boolean omitBlank(GenericRestProfile profile) {
        return profile.omitBlank() == null || profile.omitBlank();
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return "";
    }

    private String sourceUrl(GenericRestConnection connection, String path) {
        return stripTrailingSlash(connection.baseUrl()) + path;
    }

    private String stripTrailingSlash(String value) {
        if (value == null || value.isBlank()) return "";
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }

    private String encode(String value) {
        return value == null ? "" : value.replace(" ", "%20");
    }

    private String safe(Object value) {
        return value == null ? "" : value.toString();
    }
}
