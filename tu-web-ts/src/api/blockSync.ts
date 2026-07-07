import { isMockDataSource } from '@/dev/dataSource';
import { syncBlocksMock } from '@/mock/store';
import { request } from './http';
import type { Block } from './types';

export interface BlockSyncPayload {
  id: string;
  type: string;
  title?: string;
  content?: string;
  graphData?: unknown;
  timelineData?: unknown;
  [key: string]: unknown;
}

/**
 * @deprecated Block sync API removed from Go backend.
 * Content is now saved via savePageContent with the PageContent model.
 * This function is kept for backward compatibility with mock data source.
 */
export async function syncBlocks(
  pageId: string,
  blocks: BlockSyncPayload[],
): Promise<void> {
  if (isMockDataSource()) {
    return syncBlocksMock(pageId, blocks as Block[]);
  }
  // Block sync API removed from Go backend - no-op
  // Use savePageContent instead
}

/**
 * @deprecated Block sync API removed from Go backend.
 * Content is now saved via savePageContent with the PageContent model.
 */
export async function syncBlock(
  pageId: string,
  block: BlockSyncPayload,
): Promise<void> {
  return syncBlocks(pageId, [block]);
}
