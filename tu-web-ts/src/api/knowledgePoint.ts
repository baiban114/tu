import type {
  KnowledgeAnchor,
  KnowledgePoint,
  KnowledgePointAlias,
  KnowledgePointAnchor,
  KnowledgePointGenerationPreview,
  KnowledgePointGenerationResult,
  PageKnowledgeContext,
} from '@/api/types';
import { request } from './http';
import { isMockDataSource } from '@/dev/dataSource';
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination';
import type { PageResult } from '@/constants/pagination';
import {
  addKnowledgePointAliasMock,
  addKnowledgePointAnchorMock,
  createKnowledgePointMock,
  deleteKnowledgePointAliasMock,
  deleteKnowledgePointMock,
  generateKnowledgePointsMock,
  getPageKnowledgeContextMock,
  mergeKnowledgePointsMock,
  previewKnowledgePointsMock,
  getKnowledgePointTreeMock,
  listKnowledgePointAliasesMock,
  listKnowledgePointAnchorsMock,
  listKnowledgePointsByLocatorMock,
  listKnowledgePointsMock,
  updateKnowledgePointMock,
} from '@/mock/knowledgePoint';

export async function getKnowledgePointTree(kbId: string): Promise<KnowledgePoint[]> {
  if (isMockDataSource()) return getKnowledgePointTreeMock(kbId);
  return request<KnowledgePoint[]>(`/api/kbs/${kbId}/knowledge-points/tree`);
}

export async function listKnowledgePoints(
  kbId: string,
  params: { q?: string; page?: number; pageSize?: number } = {},
): Promise<PageResult<KnowledgePoint>> {
  if (isMockDataSource()) return listKnowledgePointsMock(kbId, params);
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  query.set('page', String(params.page ?? 0));
  query.set('pageSize', String(params.pageSize ?? DEFAULT_PAGE_SIZE));
  return request<PageResult<KnowledgePoint>>(`/api/kbs/${kbId}/knowledge-points?${query.toString()}`);
}

export async function listKnowledgePointsByLocator(kbId: string, locator: string): Promise<KnowledgePoint[]> {
  if (isMockDataSource()) return listKnowledgePointsByLocatorMock(kbId, locator);
  const query = new URLSearchParams({ locator });
  return request<KnowledgePoint[]>(`/api/kbs/${kbId}/knowledge-points/by-locator?${query.toString()}`);
}

export async function getPageKnowledgeContext(kbId: string, pageId: string): Promise<PageKnowledgeContext> {
  if (isMockDataSource()) return getPageKnowledgeContextMock(kbId, pageId);
  return request<PageKnowledgeContext>(`/api/kbs/${kbId}/pages/${encodeURIComponent(pageId)}/knowledge-context`);
}

export async function createKnowledgePoint(
  kbId: string,
  payload: {
    parentId?: string | null;
    title: string;
    summary?: string;
    estimatedHours?: number | null;
    sourceAnchor?: KnowledgeAnchor;
  },
): Promise<KnowledgePoint> {
  if (isMockDataSource()) return createKnowledgePointMock(kbId, payload);
  return request<KnowledgePoint>(`/api/kbs/${kbId}/knowledge-points`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateKnowledgePoint(
  id: string,
  payload: {
    parentId?: string | null;
    title?: string;
    summary?: string | null;
    status?: string;
    estimatedHours?: number | null;
    sortOrder?: number;
  },
): Promise<KnowledgePoint> {
  if (isMockDataSource()) return updateKnowledgePointMock(id, payload);
  return request<KnowledgePoint>(`/api/knowledge-points/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteKnowledgePoint(id: string): Promise<void> {
  if (isMockDataSource()) {
    deleteKnowledgePointMock(id);
    return;
  }
  await request<void>(`/api/knowledge-points/${id}`, { method: 'DELETE' });
}

export async function mergeKnowledgePoints(
  sourcePointId: string,
  targetPointId: string,
): Promise<KnowledgePoint> {
  if (isMockDataSource()) return mergeKnowledgePointsMock(sourcePointId, targetPointId);
  return request<KnowledgePoint>('/api/knowledge-points/merge', {
    method: 'POST',
    body: JSON.stringify({ sourcePointId, targetPointId }),
  });
}

export async function listKnowledgePointAnchors(pointId: string): Promise<KnowledgePointAnchor[]> {
  if (isMockDataSource()) return listKnowledgePointAnchorsMock(pointId);
  return request<KnowledgePointAnchor[]>(`/api/knowledge-points/${pointId}/anchors`);
}

export async function addKnowledgePointAnchor(
  pointId: string,
  payload: { anchor: KnowledgeAnchor; role?: string; primary?: boolean },
): Promise<KnowledgePointAnchor> {
  if (isMockDataSource()) return addKnowledgePointAnchorMock(pointId, payload);
  return request<KnowledgePointAnchor>(`/api/knowledge-points/${pointId}/anchors`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listKnowledgePointAliases(pointId: string): Promise<KnowledgePointAlias[]> {
  if (isMockDataSource()) return listKnowledgePointAliasesMock(pointId);
  return request<KnowledgePointAlias[]>(`/api/knowledge-points/${pointId}/aliases`);
}

export async function addKnowledgePointAlias(pointId: string, alias: string): Promise<KnowledgePointAlias> {
  if (isMockDataSource()) return addKnowledgePointAliasMock(pointId, alias);
  return request<KnowledgePointAlias>(`/api/knowledge-points/${pointId}/aliases`, {
    method: 'POST',
    body: JSON.stringify({ alias }),
  });
}

export async function deleteKnowledgePointAlias(aliasId: string): Promise<void> {
  if (isMockDataSource()) {
    deleteKnowledgePointAliasMock(aliasId);
    return;
  }
  await request<void>(`/api/knowledge-point-aliases/${aliasId}`, { method: 'DELETE' });
}

export async function previewKnowledgePoints(
  kbId: string,
  payload: { sources: string[]; pageIds?: string[] },
): Promise<KnowledgePointGenerationPreview> {
  if (isMockDataSource()) return previewKnowledgePointsMock(kbId, payload);
  return request<KnowledgePointGenerationPreview>(`/api/kbs/${kbId}/knowledge-points/generate/preview`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function generateKnowledgePoints(
  kbId: string,
  payload: { sources?: string[]; pageIds?: string[]; locators?: string[] },
): Promise<KnowledgePointGenerationResult> {
  if (isMockDataSource()) return generateKnowledgePointsMock(kbId, payload);
  return request<KnowledgePointGenerationResult>(`/api/kbs/${kbId}/knowledge-points/generate`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
