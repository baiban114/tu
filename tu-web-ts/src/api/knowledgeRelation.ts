import type { KnowledgeAnchor, KnowledgeRelation, RelationTypeDef, RelationsByAnchor, RelationsByPoint } from '@/api/types';
import { request } from './http';
import { isMockDataSource } from '@/dev/dataSource';
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination';
import type { PageResult } from '@/constants/pagination';
import {
  createKnowledgeRelationMock,
  deleteKnowledgeRelationMock,
  listKnowledgeRelationsByAnchorMock,
  listKnowledgeRelationsByPointMock,
  listKnowledgeRelationsMock,
  listRelationTypesMock,
} from '@/mock/knowledgeRelation';

export interface ListKnowledgeRelationsParams {
  locator?: string;
  pointId?: string;
  relationTypeKey?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export async function listRelationTypes(kbId: string): Promise<RelationTypeDef[]> {
  if (isMockDataSource()) return listRelationTypesMock(kbId);
  return request<RelationTypeDef[]>(`/api/kbs/${kbId}/relation-types`);
}

export async function listKnowledgeRelations(
  kbId: string,
  params: ListKnowledgeRelationsParams = {},
): Promise<PageResult<KnowledgeRelation>> {
  if (isMockDataSource()) {
    return listKnowledgeRelationsMock(kbId, params);
  }
  const query = new URLSearchParams();
  if (params.locator) query.set('locator', params.locator);
  if (params.pointId) query.set('pointId', params.pointId);
  if (params.relationTypeKey) query.set('relationTypeKey', params.relationTypeKey);
  if (params.q) query.set('q', params.q);
  query.set('page', String(params.page ?? 0));
  query.set('pageSize', String(params.pageSize ?? DEFAULT_PAGE_SIZE));
  return request<PageResult<KnowledgeRelation>>(`/api/kbs/${kbId}/relations?${query.toString()}`);
}

export async function listKnowledgeRelationsByAnchor(
  kbId: string,
  locator: string,
): Promise<RelationsByAnchor> {
  if (isMockDataSource()) {
    return listKnowledgeRelationsByAnchorMock(kbId, locator);
  }
  const query = new URLSearchParams({ locator });
  return request<RelationsByAnchor>(`/api/kbs/${kbId}/relations/by-anchor?${query.toString()}`);
}

export async function listKnowledgeRelationsByPoint(
  kbId: string,
  pointId: string,
): Promise<RelationsByPoint> {
  if (isMockDataSource()) {
    return listKnowledgeRelationsByPointMock(kbId, pointId);
  }
  const query = new URLSearchParams({ kbId });
  return request<RelationsByPoint>(`/api/knowledge-points/${pointId}/relations?${query.toString()}`);
}

export async function createKnowledgeRelation(
  kbId: string,
  payload: {
    relationTypeKey: string;
    fromPointId?: string;
    toPointId: string;
    from?: KnowledgeAnchor;
    to?: KnowledgeAnchor;
    note?: string;
  },
): Promise<KnowledgeRelation> {
  if (isMockDataSource()) {
    return createKnowledgeRelationMock(kbId, payload);
  }
  return request<KnowledgeRelation>(`/api/kbs/${kbId}/relations`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteKnowledgeRelation(id: string): Promise<void> {
  if (isMockDataSource()) {
    deleteKnowledgeRelationMock(id);
    return;
  }
  await request<void>(`/api/relations/${id}`, { method: 'DELETE' });
}
