import { request } from './http';
import { isMockDataSource } from '@/dev/dataSource';
import {
  createKbResourceLinkMock,
  deleteKbResourceLinkMock,
  listKbResourceLinksMock,
} from '@/mock/store';

export interface KbResourceLink {
  id: string;
  kbId: string;
  resourceItemId: string;
  /** When set, shown under this page in the page tree; null/omit = KB root. */
  parentPageId?: string | null;
  sortOrder: number;
  title: string;
  typeId: string;
  typeCode?: string | null;
  typeName?: string | null;
  sourceUrl?: string | null;
  note?: string | null;
}

export interface CreateKbResourceLinkPayload {
  resourceItemId: string;
  parentPageId?: string | null;
}

export function listKbResourceLinks(kbId: string): Promise<KbResourceLink[]> {
  if (isMockDataSource()) return Promise.resolve(listKbResourceLinksMock(kbId));
  return request<KbResourceLink[]>(`/api/kbs/${encodeURIComponent(kbId)}/resource-links`);
}

export function createKbResourceLink(
  kbId: string,
  payload: CreateKbResourceLinkPayload,
): Promise<KbResourceLink> {
  if (isMockDataSource()) return Promise.resolve(createKbResourceLinkMock(kbId, payload));
  return request<KbResourceLink>(`/api/kbs/${encodeURIComponent(kbId)}/resource-links`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteKbResourceLink(kbId: string, resourceItemId: string): Promise<void> {
  if (isMockDataSource()) {
    deleteKbResourceLinkMock(kbId, resourceItemId);
    return Promise.resolve();
  }
  return request<void>(
    `/api/kbs/${encodeURIComponent(kbId)}/resource-links/${encodeURIComponent(resourceItemId)}`,
    { method: 'DELETE' },
  );
}
