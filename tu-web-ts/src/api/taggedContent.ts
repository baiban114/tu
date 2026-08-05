import { request } from './http';
import { isMockDataSource } from '@/dev/dataSource';
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination';
import { collectKbTagsMock } from '@/mock/store';
import { searchTaggedContentMock } from '@/mock/taggedContent';
import type { BlockTag } from './types';
import type { PageResult } from '@/constants/pagination';

/** A tagged content item scope: block/nodeView vs heading section (unit). */
export type TaggedContentScope = 'block' | 'section';

export interface TaggedContentItem {
  id: string;
  scope: TaggedContentScope;
  pageId: string;
  pageTitle: string;
  blockId?: string | null;
  sectionKey?: string | null;
  title: string;
  snippet: string;
  matchedTags: BlockTag[];
  updatedAt: string;
}

export interface SearchTaggedContentParams {
  tagLabel: string;
  page?: number;
  pageSize?: number;
}

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const serialized = search.toString();
  return serialized ? `?${serialized}` : '';
}

/** Aggregated tag pool for a knowledge base (page + section + block scopes). */
export async function fetchKbTags(kbId: string): Promise<BlockTag[]> {
  if (isMockDataSource()) {
    return collectKbTagsMock(kbId);
  }
  return request<BlockTag[]>(`/api/kbs/${encodeURIComponent(kbId)}/tags`);
}

/** Search a KB's tagged content (block + section), paginated, time-desc. */
export function searchTaggedContent(
  kbId: string,
  params: SearchTaggedContentParams,
): Promise<PageResult<TaggedContentItem>> {
  const page = params.page ?? 0;
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  const queryString = query({
    tagLabel: params.tagLabel,
    page: String(page),
    pageSize: String(pageSize),
  });
  if (isMockDataSource()) {
    return Promise.resolve(searchTaggedContentMock(kbId, params.tagLabel, page, pageSize));
  }
  return request<PageResult<TaggedContentItem>>(
    `/api/kbs/${encodeURIComponent(kbId)}/tagged-content${queryString}`,
  );
}