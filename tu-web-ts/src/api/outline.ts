import { isMockDataSource } from '@/dev/dataSource';
import {
  batchOutlinesMock,
  getBlockOutlineMock,
  getPageOutlineMock,
  patchContentTreeNodeHoursMock,
} from '@/mock/store';
import { request } from './http';

export interface ContentTreeNode {
  id: string;
  scopeType: 'page' | 'resource_item';
  scopeId: string;
  parentId: string | null;
  title: string;
  sortOrder: number;
  estimatedHours: number | null;
  totalEstimatedHours: number | null;
  locator?: string | null;
  note?: string | null;
  sourceBlockId?: string | null;
  level?: number | null;
  sourceType?: string | null;
  previewText?: string | null;
  blockType?: string | null;
}

export interface PageOutlineResponse {
  pageId: string;
  kbId: string;
  pageTitle: string;
  nodes: ContentTreeNode[];
}

export interface BlockOutlineResponse {
  blockId: string;
  pageId: string;
  nodes: ContentTreeNode[];
}

export interface OutlineBatchRequest {
  pageIds?: string[];
  blockIds?: string[];
}

export interface OutlineBatchResponse {
  pages: PageOutlineResponse[];
  blocks: BlockOutlineResponse[];
}

export async function getPageOutline(pageId: string): Promise<PageOutlineResponse> {
  if (isMockDataSource()) {
    return getPageOutlineMock(pageId);
  }
  return request<PageOutlineResponse>(`/api/pages/${pageId}/outline`);
}

export async function getBlockOutline(blockId: string): Promise<BlockOutlineResponse> {
  if (isMockDataSource()) {
    return getBlockOutlineMock(blockId);
  }
  return request<BlockOutlineResponse>(`/api/blocks/${blockId}/outline`);
}

export async function batchOutlines(payload: OutlineBatchRequest): Promise<OutlineBatchResponse> {
  if (isMockDataSource()) {
    return batchOutlinesMock(payload);
  }
  return request<OutlineBatchResponse>('/api/outlines/batch', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function patchContentTreeNodeHours(
  nodeId: string,
  estimatedHours: number | null,
): Promise<ContentTreeNode> {
  if (isMockDataSource()) {
    return patchContentTreeNodeHoursMock(nodeId, estimatedHours);
  }
  return request<ContentTreeNode>(`/api/content-tree-nodes/${nodeId}`, {
    method: 'PATCH',
    body: JSON.stringify({ estimatedHours }),
  });
}
