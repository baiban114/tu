package com.tu.integration.task;

import com.tu.integration.common.ApiResponse;
import com.tu.integration.generic.DefaultGenericRestProfiles;
import com.tu.integration.generic.GenericRestClient;
import com.tu.integration.generic.GenericRestConnection;
import com.tu.integration.task.dto.CreateExternalTaskRequest;
import com.tu.integration.task.dto.ExternalProjectDto;
import com.tu.integration.task.dto.ExternalProviderDto;
import com.tu.integration.task.dto.ExternalTaskDto;
import com.tu.integration.task.dto.MoveExternalTaskRequest;
import com.tu.integration.task.dto.UpdateExternalTaskRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/internal/task-integrations")
public class TaskIntegrationController {

    private final GenericRestClient genericRestClient;

    public TaskIntegrationController(GenericRestClient genericRestClient) {
        this.genericRestClient = genericRestClient;
    }

    @GetMapping("/providers")
    public ApiResponse<List<ExternalProviderDto>> providers(
        @RequestHeader(value = "X-Tu-Kaneo-Base-Url", required = false) String baseUrl,
        @RequestHeader(value = "X-Tu-Kaneo-Api-Key", required = false) String apiKey,
        @RequestHeader(value = "X-Tu-Kaneo-Workspace-Id", required = false) String workspaceId,
        @RequestHeader(value = "X-Tu-Adapter-Profile", required = false) String adapterProfileJson
    ) {
        return ApiResponse.success(List.of(new ExternalProviderDto("kaneo", "Kaneo", "MIT", genericRestClient.configured(connection(baseUrl, apiKey, workspaceId, adapterProfileJson)))));
    }

    @GetMapping("/projects")
    public ApiResponse<List<ExternalProjectDto>> projects(
        @RequestHeader(value = "X-Tu-Kaneo-Base-Url", required = false) String baseUrl,
        @RequestHeader(value = "X-Tu-Kaneo-Api-Key", required = false) String apiKey,
        @RequestHeader(value = "X-Tu-Kaneo-Workspace-Id", required = false) String workspaceId,
        @RequestHeader(value = "X-Tu-Adapter-Profile", required = false) String adapterProfileJson
    ) {
        return ApiResponse.success(genericRestClient.listProjects(connection(baseUrl, apiKey, workspaceId, adapterProfileJson)));
    }

    @GetMapping("/projects/{projectId}/tasks")
    public ApiResponse<List<ExternalTaskDto>> tasks(
        @PathVariable String projectId,
        @RequestParam(required = false) String status,
        @RequestParam(required = false) String priority,
        @RequestParam(required = false) String assigneeId,
        @RequestParam(required = false) String page,
        @RequestParam(required = false) String limit,
        @RequestParam(required = false) String sortBy,
        @RequestParam(required = false) String sortOrder,
        @RequestHeader(value = "X-Tu-Kaneo-Base-Url", required = false) String baseUrl,
        @RequestHeader(value = "X-Tu-Kaneo-Api-Key", required = false) String apiKey,
        @RequestHeader(value = "X-Tu-Kaneo-Workspace-Id", required = false) String workspaceId,
        @RequestHeader(value = "X-Tu-Adapter-Profile", required = false) String adapterProfileJson
    ) {
        return ApiResponse.success(genericRestClient.listTasks(connection(baseUrl, apiKey, workspaceId, adapterProfileJson), projectId, status, priority, assigneeId, page, limit, sortBy, sortOrder));
    }

    @PostMapping("/projects/{projectId}/tasks")
    public ApiResponse<ExternalTaskDto> createTask(
        @PathVariable String projectId,
        @Valid @RequestBody CreateExternalTaskRequest request,
        @RequestHeader(value = "X-Tu-Kaneo-Base-Url", required = false) String baseUrl,
        @RequestHeader(value = "X-Tu-Kaneo-Api-Key", required = false) String apiKey,
        @RequestHeader(value = "X-Tu-Kaneo-Workspace-Id", required = false) String workspaceId,
        @RequestHeader(value = "X-Tu-Adapter-Profile", required = false) String adapterProfileJson
    ) {
        return ApiResponse.success(genericRestClient.createTask(connection(baseUrl, apiKey, workspaceId, adapterProfileJson), projectId, request));
    }

    @PatchMapping("/tasks/{taskId}")
    public ApiResponse<ExternalTaskDto> updateTask(
        @PathVariable String taskId,
        @Valid @RequestBody UpdateExternalTaskRequest request,
        @RequestHeader(value = "X-Tu-Kaneo-Base-Url", required = false) String baseUrl,
        @RequestHeader(value = "X-Tu-Kaneo-Api-Key", required = false) String apiKey,
        @RequestHeader(value = "X-Tu-Kaneo-Workspace-Id", required = false) String workspaceId,
        @RequestHeader(value = "X-Tu-Adapter-Profile", required = false) String adapterProfileJson
    ) {
        return ApiResponse.success(genericRestClient.updateTask(connection(baseUrl, apiKey, workspaceId, adapterProfileJson), taskId, request));
    }

    @PostMapping("/tasks/{taskId}/move")
    public ApiResponse<ExternalTaskDto> moveTask(
        @PathVariable String taskId,
        @Valid @RequestBody MoveExternalTaskRequest request,
        @RequestHeader(value = "X-Tu-Kaneo-Base-Url", required = false) String baseUrl,
        @RequestHeader(value = "X-Tu-Kaneo-Api-Key", required = false) String apiKey,
        @RequestHeader(value = "X-Tu-Kaneo-Workspace-Id", required = false) String workspaceId,
        @RequestHeader(value = "X-Tu-Adapter-Profile", required = false) String adapterProfileJson
    ) {
        return ApiResponse.success(genericRestClient.moveTask(connection(baseUrl, apiKey, workspaceId, adapterProfileJson), taskId, request));
    }

    private GenericRestConnection connection(String baseUrl, String apiKey, String workspaceId, String adapterProfileJson) {
        return new GenericRestConnection(baseUrl, apiKey, workspaceId, adapterProfileJson == null || adapterProfileJson.isBlank() ? DefaultGenericRestProfiles.kaneo() : adapterProfileJson);
    }
}
