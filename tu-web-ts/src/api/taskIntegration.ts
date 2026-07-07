import { request } from './http';

export interface ExternalProvider {
  id: string;
  name: string;
  license: string;
  configured: boolean;
}

export interface ExternalProject {
  provider: string;
  externalId: string;
  name: string;
  description?: string;
  sourceUrl?: string;
}

export interface ExternalTask {
  provider: string;
  externalId: string;
  projectId: string;
  number?: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  assigneeName?: string;
  dueDate?: string;
  position?: number;
  sourceUrl?: string;
  updatedAt?: string;
}

export interface TaskRelation {
  id: string;
  provider: string;
  externalId: string;
  resourceItemId: string;
  pageId: string;
  blockId: string;
  relationType: string;
}

export interface IntegrationConnection {
  id?: string;
  provider: string;
  baseUrl: string;
  workspaceId?: string;
  adapterProfileJson?: string;
  apiKeyConfigured: boolean;
  enabled: boolean;
}

export interface UpdateIntegrationConnectionPayload {
  baseUrl: string;
  apiKey?: string;
  workspaceId?: string;
  adapterProfileJson?: string;
  enabled?: boolean;
}

export interface IntegrationConnectionTestResult {
  ok: boolean;
  message: string;
}

export interface TaskPayload {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  assigneeId?: string;
  dueDate?: string;
}

export interface MoveTaskPayload {
  status?: string;
  columnId?: string;
  position?: number;
}

export interface CreateRelationPayload {
  pageId: string;
  blockId?: string;
  relationType?: string;
}

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const value = search.toString();
  return value ? `?${value}` : '';
}

export function listTaskProviders(): Promise<ExternalProvider[]> {
  return request<ExternalProvider[]>('/api/task-integrations/providers');
}

export function getIntegrationConnection(): Promise<IntegrationConnection> {
  return request<IntegrationConnection>('/api/task-integrations/connection');
}

export function listIntegrationConnections(): Promise<IntegrationConnection[]> {
  return request<IntegrationConnection[]>('/api/task-integrations/connections');
}

export function createIntegrationConnection(payload: UpdateIntegrationConnectionPayload): Promise<IntegrationConnection> {
  return request<IntegrationConnection>('/api/task-integrations/connections', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateIntegrationConnection(payload: UpdateIntegrationConnectionPayload): Promise<IntegrationConnection> {
  return request<IntegrationConnection>('/api/task-integrations/connection', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function updateIntegrationConnectionById(id: string, payload: UpdateIntegrationConnectionPayload): Promise<IntegrationConnection> {
  return request<IntegrationConnection>(`/api/task-integrations/connections/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteIntegrationConnection(id: string): Promise<void> {
  return request<void>(`/api/task-integrations/connections/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function testIntegrationConnection(): Promise<IntegrationConnectionTestResult> {
  return request<IntegrationConnectionTestResult>('/api/task-integrations/connection/test', {
    method: 'POST',
  });
}

export function listExternalProjects(): Promise<ExternalProject[]> {
  return request<ExternalProject[]>('/api/task-integrations/projects');
}

export function listExternalTasks(projectId: string, params: Record<string, string | undefined> = {}): Promise<ExternalTask[]> {
  return request<ExternalTask[]>(`/api/task-integrations/projects/${encodeURIComponent(projectId)}/tasks${query(params)}`);
}

export function createExternalTask(projectId: string, payload: TaskPayload & { title: string }): Promise<ExternalTask> {
  return request<ExternalTask>(`/api/task-integrations/projects/${encodeURIComponent(projectId)}/tasks`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateExternalTask(taskId: string, payload: TaskPayload): Promise<ExternalTask> {
  return request<ExternalTask>(`/api/task-integrations/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function moveExternalTask(taskId: string, payload: MoveTaskPayload): Promise<ExternalTask> {
  return request<ExternalTask>(`/api/task-integrations/tasks/${encodeURIComponent(taskId)}/move`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listTaskRelations(taskId: string): Promise<TaskRelation[]> {
  return request<TaskRelation[]>(`/api/task-integrations/tasks/${encodeURIComponent(taskId)}/relations`);
}

export function createTaskRelation(taskId: string, payload: CreateRelationPayload): Promise<TaskRelation> {
  return request<TaskRelation>(`/api/task-integrations/tasks/${encodeURIComponent(taskId)}/relations`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteTaskRelation(taskId: string, relationId: string): Promise<void> {
  return request<void>(`/api/task-integrations/tasks/${encodeURIComponent(taskId)}/relations/${encodeURIComponent(relationId)}`, {
    method: 'DELETE',
  });
}
