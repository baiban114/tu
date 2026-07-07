import { isMockDataSource } from '@/dev/dataSource';
import {
  createPageMock,
  deletePageMock,
  getPageContentMock,
  getPageTreeMock,
  listAllBlocksMock,
  movePageMock,
  renamePageMock,
  savePageContentMock,
  updateBlockMock,
  updateBlockContentMock,
  updateBlockGraphDataMock,
} from '@/mock/store';
import { request } from './http';
import type { Block, BlockWithMeta, PageBlocks, PageContent, PageItem, PageType } from './types';
import { normalizePageContentFromApi } from '@/utils/boardPageContent';

export type { Block, BlockWithMeta, PageBlocks, PageContent, PageItem } from './types';

export async function getPageTree(kbId: string): Promise<PageItem[]> {
  if (isMockDataSource()) {
    return getPageTreeMock(kbId);
  }
  return request<PageItem[]>(`/api/kbs/${kbId}/pages/tree`);
}

/**
 * Fetch page content directly in the new PageContent format.
 * The Go backend now stores and returns PageContent natively (no block conversion needed).
 */
export async function getPageContent(pageId: string): Promise<PageContent> {
  if (isMockDataSource()) {
    return getPageContentMock(pageId);
  }
  const data = await request<PageContent>(`/api/pages/${pageId}/content`);
  // Ensure arrays are initialized
  return normalizePageContentFromApi({
    content: data.content || '',
    embeds: data.embeds || [],
    annotations: data.annotations || [],
    metadata: data.metadata,
    document: data.document,
    schemaVersion: data.schemaVersion,
  });
}

/**
 * Save page content directly in the new PageContent format.
 * The Go backend now accepts PageContent natively (no block conversion needed).
 */
export async function savePageContent(pageId: string, content: PageContent): Promise<void> {
  if (isMockDataSource()) {
    return savePageContentMock(pageId, content);
  }
  await request(`/api/pages/${pageId}/content`, {
    method: 'PUT',
    body: JSON.stringify(content),
  });
}

export async function createPage(
  kbId: string,
  parentId: string | null,
  title = '新页面',
  pageType?: PageType,
): Promise<PageItem> {
  if (isMockDataSource()) {
    return createPageMock(kbId, parentId, title, pageType);
  }
  return request<PageItem>('/api/pages', {
    method: 'POST',
    body: JSON.stringify({ kbId, parentId, title, pageType }),
  });
}

export async function deletePage(id: string): Promise<void> {
  if (isMockDataSource()) {
    return deletePageMock(id);
  }
  await request<void>(`/api/pages/${id}`, {
    method: 'DELETE',
  });
}

export async function movePage(
  id: string,
  newParentId: string | null,
  newOrder: number,
): Promise<void> {
  if (isMockDataSource()) {
    return movePageMock(id, newParentId, newOrder);
  }
  await request<PageItem>(`/api/pages/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ parentId: newParentId, order: newOrder }),
  });
}

export async function renamePage(id: string, title: string): Promise<void> {
  if (isMockDataSource()) {
    return renamePageMock(id, title);
  }
  await request<PageItem>(`/api/pages/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
}

/** @deprecated Block concept removed - kept for backward compatibility with mock */
export async function listAllBlocks(): Promise<BlockWithMeta[]> {
  if (isMockDataSource()) {
    return listAllBlocksMock();
  }
  // Block API removed from Go backend; return empty array
  return [];
}

/** @deprecated Block concept removed - kept for backward compatibility with mock */
export async function updateBlockContent(
  pageId: string,
  blockId: string,
  content: string,
): Promise<void> {
  if (isMockDataSource()) {
    return updateBlockContentMock(pageId, blockId, content);
  }
  // Block API removed from Go backend - no-op
}

/** @deprecated Block concept removed - kept for backward compatibility with mock */
export async function updateBlockGraphData(
  pageId: string,
  blockId: string,
  graphData: Block['graphData'],
): Promise<void> {
  if (isMockDataSource()) {
    return updateBlockGraphDataMock(pageId, blockId, graphData);
  }
  // Block API removed from Go backend - no-op
}

/** @deprecated Block concept removed - kept for backward compatibility with mock */
export async function updateBlock(
  pageId: string,
  blockId: string,
  block: Block,
): Promise<void> {
  if (isMockDataSource()) {
    return updateBlockMock(pageId, blockId, block);
  }
  // Block API removed from Go backend - no-op
}
