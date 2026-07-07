import { request } from './http';
import { isMockDataSource } from '@/dev/dataSource';
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination';
import {
  listReferencesMock,
  deleteAnnotationReferenceMock,
} from '@/mock/store';

export interface ReferenceCitation {
  displayText?: string | null;
  locator?: string | null;
  note?: string | null;
}

export interface ReferenceSource {
  pageId: string;
  pageTitle: string;
  blockId: string;
  blockType: string;
  sourceKind: string;
  sourceLocator: string;
}

export interface ReferenceTarget {
  kind: string;
  pageId?: string | null;
  pageTitle?: string | null;
  blockId?: string | null;
  blockPreview?: string | null;
  resourceItemId?: string | null;
  resourceItemTitle?: string | null;
  resourceTypeName?: string | null;
  resourceExcerptId?: string | null;
  resourceExcerptTitle?: string | null;
  resourceExcerptLocator?: string | null;
  url?: string | null;
}

export interface ReferenceItem {
  id: string;
  category: 'internal' | 'external' | string;
  editable: boolean;
  source: ReferenceSource;
  target: ReferenceTarget;
  status: 'ok' | 'broken' | 'bound' | 'unbound' | string;
  citation: ReferenceCitation;
}

export interface ListReferencesParams {
  category?: string;
  pageId?: string;
  resourceItemId?: string;
  status?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface ListReferencesResult {
  items: ReferenceItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UpdateExternalReferencePayload {
  resourceItemId: string | null;
  bindingMode: 'auto' | 'manual_bound' | 'manual_unbound';
  displayText?: string;
  citationLocator?: string;
  citationNote?: string;
}

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const serialized = search.toString();
  return serialized ? `?${serialized}` : '';
}

export function listReferences(params: ListReferencesParams = {}): Promise<ListReferencesResult> {
  const page = params.page ?? 0;
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  const requestParams = {
    category: params.category,
    pageId: params.pageId,
    resourceItemId: params.resourceItemId,
    status: params.status,
    q: params.q,
    page: String(page),
    pageSize: String(pageSize),
  };
  if (isMockDataSource()) {
    return Promise.resolve(listReferencesMock({ ...params, page, pageSize }));
  }
  return request<ListReferencesResult>(`/api/references${query(requestParams)}`);
}

export function updateExternalReference(id: string, payload: UpdateExternalReferencePayload): Promise<ReferenceItem> {
  return request<ReferenceItem>(`/api/external-references/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function rebuildReferences(): Promise<void> {
  return request<void>('/api/references/rebuild', { method: 'POST' });
}

export function deleteAnnotationReference(pageId: string, blockId: string, annotationId: string): Promise<void> {
  if (isMockDataSource()) {
    return Promise.resolve(deleteAnnotationReferenceMock(pageId, blockId, annotationId));
  }
  return request<void>(`/api/pages/${pageId}/blocks/${blockId}/annotations/${annotationId}`, { method: 'DELETE' });
}
