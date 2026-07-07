import { request } from './http';
import { isMockDataSource } from '@/dev/dataSource';

export interface OrphanedAnnotation {
  id: string;
  pageId: string;
  blockId: string;
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  note: string;
  color: string;
  scope: string;
  from?: number;
  to?: number;
  pageTitle: string;
  blockType: string;
  orphanedAt: string;
  createdAt: string;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function listOrphanedAnnotations(page = 0, pageSize = 10): Promise<PageResult<OrphanedAnnotation>> {
  if (isMockDataSource()) {
    return Promise.resolve(mockListOrphaned(page, pageSize));
  }
  return request<PageResult<OrphanedAnnotation>>(`/api/orphaned-annotations?page=${page}&pageSize=${pageSize}`);
}

export function countOrphanedAnnotations(): Promise<number> {
  if (isMockDataSource()) {
    return Promise.resolve(mockData.length);
  }
  return request<number>('/api/orphaned-annotations/count');
}

export function deleteOrphanedAnnotation(id: string): Promise<void> {
  if (isMockDataSource()) {
    const idx = mockData.findIndex((a) => a.id === id);
    if (idx >= 0) mockData.splice(idx, 1);
    return Promise.resolve();
  }
  return request<void>(`/api/orphaned-annotations/${id}`, { method: 'DELETE' });
}

export function clearAllOrphanedAnnotations(): Promise<number> {
  if (isMockDataSource()) {
    const count = mockData.length;
    mockData.length = 0;
    return Promise.resolve(count);
  }
  return request<number>('/api/orphaned-annotations/clear', { method: 'POST' });
}

interface MockAnnotation {
  id: string;
  pageId: string;
  blockId: string;
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  note: string;
  color: string;
  scope: string;
  from?: number;
  to?: number;
  pageTitle: string;
  blockType: string;
  orphanedAt: string;
  createdAt: string;
}

const mockData: MockAnnotation[] = [];

export function addMockOrphanedAnnotation(data: {
  pageId: string;
  pageTitle: string;
  selectedText: string;
  note: string;
}) {
  mockData.push({
    id: `mock-ann-${mockData.length + 1}`,
    pageId: data.pageId,
    blockId: '',
    selectedText: data.selectedText,
    contextBefore: '',
    contextAfter: '',
    note: data.note,
    color: '#fef08a',
    scope: 'text',
    pageTitle: data.pageTitle,
    blockType: 'richtext',
    orphanedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });
}

function mockListOrphaned(page: number, pageSize: number): PageResult<OrphanedAnnotation> {
  const start = page * pageSize;
  const items = mockData.slice(start, start + pageSize);
  return { items, total: mockData.length, page, pageSize };
}
