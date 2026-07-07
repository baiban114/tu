import { isMockDataSource } from '@/dev/dataSource';
import { searchPagesMock } from '@/mock/store';
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

export async function searchPages(q: string, limit = 20): Promise<SearchResponse> {
  if (isMockDataSource()) {
    return searchPagesMock(q, limit);
  }
  return request<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}&limit=${limit}`);
}
