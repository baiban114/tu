package com.tu.integration.kaneo;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tu.integration.common.BusinessException;
import com.tu.integration.task.dto.CreateExternalTaskRequest;
import com.tu.integration.task.dto.ExternalProjectDto;
import com.tu.integration.task.dto.ExternalTaskDto;
import com.tu.integration.task.dto.MoveExternalTaskRequest;
import com.tu.integration.task.dto.UpdateExternalTaskRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

@Component
public class KaneoClient {

    private static final String PROVIDER = "kaneo";

    private final KaneoProperties properties;
    private final RestClient.Builder restClientBuilder;
    private final ObjectMapper objectMapper;

    public KaneoClient(KaneoProperties properties, RestClient.Builder restClientBuilder, ObjectMapper objectMapper) {
        this.properties = properties;
        this.restClientBuilder = restClientBuilder;
        this.objectMapper = objectMapper;
    }

    public boolean configured() {
        return properties.configured();
    }

    public boolean configured(KaneoConnection connection) {
        return effective(connection).configured();
    }

    public List<ExternalProjectDto> listProjects(KaneoConnection connection) {
        KaneoConnection effective = effective(connection);
        JsonNode body = get(effective, "/api/project" + query("workspaceId", effective.workspaceId()));
        List<ExternalProjectDto> projects = new ArrayList<>();
        for (JsonNode node : asArray(body, "projects")) {
            String id = text(node, "id", "externalId", "uuid");
            if (id.isBlank()) continue;
            projects.add(new ExternalProjectDto(
                PROVIDER,
                id,
                firstNonBlank(text(node, "name"), text(node, "title"), "Untitled project"),
                text(node, "description"),
                sourceUrl(effective, "/projects/" + id)
            ));
        }
        return projects;
    }

    public List<ExternalTaskDto> listTasks(KaneoConnection connection, String projectId, String status, String priority, String assigneeId, String page, String limit, String sortBy, String sortOrder) {
        KaneoConnection effective = effective(connection);
        String path = "/api/task/tasks/" + encode(projectId);
        String query = query(
            "status", normalizeStatus(status),
            "priority", priority,
            "assigneeId", assigneeId,

            "page", page,
            "limit", limit,
            "sortBy", sortBy,
            "sortOrder", sortOrder
        );
        JsonNode body = get(effective, path + query);
        List<ExternalTaskDto> tasks = new ArrayList<>();
        for (JsonNode node : asTaskArray(body)) {
            tasks.add(toTask(effective, node, projectId));
        }
        return tasks;
    }

    public ExternalTaskDto createTask(KaneoConnection connection, String projectId, CreateExternalTaskRequest request) {
        KaneoConnection effective = effective(connection);
        String body = client(effective).post()
            .uri("/api/task/{projectId}", projectId)
            .body(toCreateTaskBody(request))
            .retrieve()
            .body(String.class);
        JsonNode parsedBody = parseBody(body);
        return toTask(effective, unwrap(parsedBody), projectId);
    }

    public ExternalTaskDto updateTask(KaneoConnection connection, String taskId, UpdateExternalTaskRequest request) {
        KaneoConnection effective = effective(connection);
        String body = client(effective).put()
            .uri("/api/task/{taskId}", taskId)
            .body(toUpdateTaskBody(request))
            .retrieve()
            .body(String.class);
        JsonNode parsedBody = parseBody(body);
        return toTask(effective, unwrap(parsedBody), text(unwrap(parsedBody), "projectId", "project_id"));
    }

    public ExternalTaskDto moveTask(KaneoConnection connection, String taskId, MoveExternalTaskRequest request) {
        KaneoConnection effective = effective(connection);
        String body = client(effective).put()
            .uri("/api/task/status/{taskId}", taskId)
            .body(toMoveTaskBody(request))
            .retrieve()
            .body(String.class);
        JsonNode parsedBody = parseBody(body);
        return toTask(effective, unwrap(parsedBody), text(unwrap(parsedBody), "projectId", "project_id"));
    }

    private JsonNode get(KaneoConnection connection, String path) {
        try {
            return parseBody(client(connection).get().uri(path).retrieve().body(String.class));
        } catch (RestClientException ex) {
            throw new BusinessException(50200, "Kaneo request failed: " + ex.getMessage());
        }
    }

    private JsonNode parseBody(String body) {
        if (body == null || body.isBlank()) {
            throw new BusinessException(50200, "Kaneo returned empty response");
        }
        try {
            return objectMapper.readTree(body);
        } catch (JsonProcessingException ex) {
            throw new BusinessException(50200, "Kaneo returned invalid JSON: " + ex.getOriginalMessage());
        }
    }

    private Map<String, Object> toCreateTaskBody(CreateExternalTaskRequest request) {
        Map<String, Object> body = new LinkedHashMap<>();
        putRequired(body, "title", request.title());
        putIfNotBlank(body, "description", request.description());
        putIfNotBlank(body, "status", normalizeStatus(request.status()));
        body.put("priority", firstNonBlank(request.priority(), "no-priority"));
        putIfNotBlank(body, "assigneeId", request.assigneeId());
        putIfNotBlank(body, "dueDate", request.dueDate());
        return body;
    }

    private Map<String, Object> toUpdateTaskBody(UpdateExternalTaskRequest request) {
        Map<String, Object> body = new LinkedHashMap<>();
        putIfNotBlank(body, "title", request.title());
        putIfNotBlank(body, "description", request.description());
        putIfNotBlank(body, "status", normalizeStatus(request.status()));
        if (request.priority() != null) {
            body.put("priority", request.priority().isBlank() ? "no-priority" : request.priority().trim());
        }
        putIfNotBlank(body, "assigneeId", request.assigneeId());
        putIfNotBlank(body, "dueDate", request.dueDate());
        return body;
    }

    private Map<String, Object> toMoveTaskBody(MoveExternalTaskRequest request) {
        Map<String, Object> body = new LinkedHashMap<>();
        putIfNotBlank(body, "status", normalizeStatus(request.status()));
        putIfNotBlank(body, "columnId", request.columnId());
        if (request.position() != null) body.put("position", request.position());
        return body;
    }

    private void putRequired(Map<String, Object> body, String key, String value) {
        if (value == null || value.isBlank()) {
            throw new BusinessException(40000, key + " is required");
        }
        body.put(key, value.trim());
    }

    private void putIfNotBlank(Map<String, Object> body, String key, String value) {
        if (value != null && !value.isBlank()) {
            body.put(key, value.trim());
        }
    }

    private String normalizeStatus(String status) {
        if (status == null || status.isBlank()) return status;
        return switch (status.trim()) {
            case "todo" -> "to-do";
            case "doing" -> "in-progress";
            case "review" -> "in-review";
            default -> status.trim();
        };
    }

    private RestClient client(KaneoConnection connection) {
        if (!connection.configured()) {
            throw new BusinessException(40000, "Kaneo integration requires baseUrl, apiKey and workspaceId");
        }
        return restClientBuilder
            .baseUrl(stripTrailingSlash(connection.baseUrl()))
            .defaultHeader("Authorization", "Bearer " + connection.apiKey())
            .build();
    }

    private ExternalTaskDto toTask(KaneoConnection connection, JsonNode node, String fallbackProjectId) {
        JsonNode task = unwrap(node);
        String id = text(task, "id", "externalId", "uuid");
        String projectId = firstNonBlank(text(task, "projectId", "project_id"), fallbackProjectId);
        return new ExternalTaskDto(
            PROVIDER,
            id,
            projectId,
            text(task, "number", "key", "identifier"),
            firstNonBlank(text(task, "title", "name"), "Untitled task"),
            text(task, "description", "content"),
            text(task, "status", "state", "column"),
            text(task, "priority"),
            text(task, "assigneeName", "assignee_name", "assignee"),
            text(task, "dueDate", "due_date"),
            integer(task, "position", "order"),
            sourceUrl(connection, "/tasks/" + id),
            text(task, "updatedAt", "updated_at", "modifiedAt")
        );
    }

    private KaneoConnection effective(KaneoConnection connection) {
        if (connection != null && connection.configured()) return connection;
        return new KaneoConnection(properties.getBaseUrl(), properties.getApiKey(), properties.getWorkspaceId());
    }

    private JsonNode unwrap(JsonNode body) {
        if (body == null || body.isNull()) return null;
        for (String key : List.of("data", "task", "project")) {
            JsonNode value = body.get(key);
            if (value != null && value.isObject()) return value;
        }
        return body;
    }

    private Iterable<JsonNode> asArray(JsonNode body, String domainKey) {
        JsonNode node = body;
        if (node == null || node.isNull()) return List.of();
        if (node.has("data")) node = node.get("data");
        if (node != null && node.has(domainKey)) node = node.get(domainKey);
        if (node != null && node.has("items")) node = node.get("items");
        if (node == null || !node.isArray()) return List.of();
        List<JsonNode> nodes = new ArrayList<>();
        Iterator<JsonNode> iterator = node.elements();
        while (iterator.hasNext()) nodes.add(iterator.next());
        return nodes;
    }

    private Iterable<JsonNode> asTaskArray(JsonNode body) {
        List<JsonNode> tasks = new ArrayList<>();
        collectTaskNodes(body, tasks);
        return tasks;
    }

    private void collectTaskNodes(JsonNode node, List<JsonNode> tasks) {
        if (node == null || node.isNull()) return;
        if (node.isArray()) {
            for (JsonNode item : node) {
                collectTaskNodes(item, tasks);
            }
            return;
        }
        if (!node.isObject()) return;
        if (isTaskNode(node)) {
            tasks.add(node);
            return;
        }
        for (String key : List.of("data", "tasks", "items", "columns", "to-do", "in-progress", "in-review", "done", "planned", "archived")) {
            JsonNode child = node.get(key);
            if (child != null) collectTaskNodes(child, tasks);
        }
    }

    private boolean isTaskNode(JsonNode node) {
        return node.hasNonNull("id")
            && node.hasNonNull("title")
            && (node.has("status") || node.has("projectId") || node.has("project_id"));
    }

    private String text(JsonNode node, String... keys) {
        if (node == null) return "";
        for (String key : keys) {
            JsonNode value = node.get(key);
            if (value == null || value.isNull()) continue;
            if (value.isTextual()) return value.asText();
            if (value.isNumber() || value.isBoolean()) return value.asText();
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

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return "";
    }

    private String query(String... pairs) {
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i + 1 < pairs.length; i += 2) {
            String value = pairs[i + 1];
            if (value == null || value.isBlank()) continue;
            builder.append(builder.isEmpty() ? '?' : '&')
                .append(pairs[i])
                .append('=')
                .append(encode(value));
        }
        return builder.toString();
    }

    private String encode(String value) {
        return value == null ? "" : value.replace(" ", "%20");
    }

    private String sourceUrl(KaneoConnection connection, String path) {
        return stripTrailingSlash(connection.baseUrl()) + path;
    }

    private String stripTrailingSlash(String value) {
        if (value == null || value.isBlank()) return "";
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }
}
