import { isMockDataSource } from '@/dev/dataSource';
import { request } from './http';

export async function flushPageIndex(pageId: string): Promise<void> {
  if (isMockDataSource()) {
    return;
  }
  await request<void>(`/api/index/pages/${pageId}/flush`, {
    method: 'POST',
  });
}
