import { isMockDataSource } from '@/dev/dataSource';
import { request } from './http';

export interface SearchHit {
  kbId: string;
  kbName: string;
  pageId: string;
  pageTitle: string;
  blockId?: string;
  blockType?: string;
  title: string;
  snippet: string;
}

export interface SearchResponse {
  hits: SearchHit[];
  enabled: boolean;
  message: string | null;
}

export interface HeadingSearchHit {
  nodeId: string;
  pageId: string;
  pageTitle: string;
  kbId: string;
  sourceBlockId: string | null;
  level: number | null;
  text: string;
  highlight: string | null;
  previewText: string | null;
  estimatedHours: number | null;
  totalEstimatedHours: number | null;
}

export interface HeadingSearchResponse {
  items: HeadingSearchHit[];
}

export async function searchPages(q: string, limit = 20): Promise<SearchResponse> {
  if (isMockDataSource()) {
    const { searchPagesMock } = await import('@/mock/store');
    return searchPagesMock(q, limit);
  }
  return request<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}&limit=${limit}`);
}

export async function searchHeadings(
  q: string,
  options: { kbId?: string; limit?: number } = {},
): Promise<HeadingSearchResponse> {
  const limit = options.limit ?? 20;
  if (isMockDataSource()) {
    const { searchHeadingsMock } = await import('@/mock/store');
    return searchHeadingsMock(q, options.kbId, limit);
  }
  const params = new URLSearchParams({
    q,
    limit: String(limit),
  });
  if (options.kbId) params.set('kbId', options.kbId);
  return request<HeadingSearchResponse>(`/api/search/headings?${params.toString()}`);
}
