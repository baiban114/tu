import { isMockDataSource } from '@/dev/dataSource';
import {
  createKnowledgeBaseMock,
  deleteKnowledgeBaseMock,
  importRoadmapMock,
  listKnowledgeBasesMock,
  renameKnowledgeBaseMock,
} from '@/mock/store';
import { request } from './http';
import type { ImportRoadmapPayload, ImportRoadmapResult, KnowledgeBase } from './types';

export type { KnowledgeBase } from './types';

export async function listKnowledgeBases(): Promise<KnowledgeBase[]> {
  if (isMockDataSource()) {
    return listKnowledgeBasesMock();
  }
  return request<KnowledgeBase[]>('/api/kbs');
}

export async function createKnowledgeBase(name: string): Promise<KnowledgeBase> {
  if (isMockDataSource()) {
    return createKnowledgeBaseMock(name);
  }
  return request<KnowledgeBase>('/api/kbs', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function deleteKnowledgeBase(id: string): Promise<void> {
  if (isMockDataSource()) {
    return deleteKnowledgeBaseMock(id);
  }
  return request<void>(`/api/kbs/${id}`, {
    method: 'DELETE',
  });
}

export async function renameKnowledgeBase(id: string, name: string): Promise<KnowledgeBase> {
  if (isMockDataSource()) {
    return renameKnowledgeBaseMock(id, name);
  }
  return request<KnowledgeBase>(`/api/kbs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function importRoadmap(payload: ImportRoadmapPayload): Promise<ImportRoadmapResult> {
  if (isMockDataSource()) {
    return importRoadmapMock(payload);
  }
  return request<ImportRoadmapResult>('/api/kbs/import-roadmap', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
