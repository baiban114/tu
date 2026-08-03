import type { PageResult } from '@/constants/pagination'
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination'
import { request } from './http'
import { isMockDataSource } from '@/dev/dataSource'
import {
  deleteKnowledgePointMasteryMock,
  listKnowledgePointMasteryMock,
  projectKnowledgePointMasteryMock,
  upsertKnowledgePointMasteryMock,
} from '@/mock/learningMastery'

export type MasteryStatus = 'unknown' | 'learning' | 'mastered'

export interface KnowledgePointMastery {
  id: string | null
  userId: string
  kbId?: string | null
  knowledgePointId: string
  status: MasteryStatus | string
  score?: number | null
  note?: string | null
  createdAt: string
  updatedAt: string
}

export interface MasteryUpsertPayload {
  kbId?: string | null
  knowledgePointId: string
  status: MasteryStatus | string
  score?: number | null
  note?: string | null
}

export interface MasteryProjection {
  items: KnowledgePointMastery[]
  suggestedNextPointId?: string | null
}

function userHeaders(userId?: string | null): HeadersInit {
  const uid = typeof userId === 'string' && userId.trim() ? userId.trim() : 'local'
  return { 'X-User-Id': uid }
}

export async function listKnowledgePointMastery(
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE,
  kbId?: string | null,
  userId?: string | null,
): Promise<PageResult<KnowledgePointMastery>> {
  if (isMockDataSource()) return listKnowledgePointMasteryMock(page, pageSize, kbId, userId)
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })
  if (kbId?.trim()) query.set('kbId', kbId.trim())
  return request<PageResult<KnowledgePointMastery>>(`/api/learning/mastery?${query}`, {
    headers: userHeaders(userId),
  })
}

export async function upsertKnowledgePointMastery(
  payload: MasteryUpsertPayload,
  userId?: string | null,
): Promise<KnowledgePointMastery> {
  if (isMockDataSource()) return upsertKnowledgePointMasteryMock(payload, userId)
  return request<KnowledgePointMastery>('/api/learning/mastery', {
    method: 'PUT',
    headers: userHeaders(userId),
    body: JSON.stringify(payload),
  })
}

export async function projectKnowledgePointMastery(
  orderedPointIds: string[],
  kbId?: string | null,
  userId?: string | null,
): Promise<MasteryProjection> {
  if (isMockDataSource()) {
    return projectKnowledgePointMasteryMock(orderedPointIds, kbId, userId)
  }
  return request<MasteryProjection>('/api/learning/mastery/projection', {
    method: 'POST',
    headers: userHeaders(userId),
    body: JSON.stringify({ orderedPointIds, kbId: kbId ?? null }),
  })
}

export async function deleteKnowledgePointMastery(
  knowledgePointId: string,
  userId?: string | null,
): Promise<void> {
  if (isMockDataSource()) {
    deleteKnowledgePointMasteryMock(knowledgePointId, userId)
    return
  }
  await request<void>(`/api/learning/mastery/${encodeURIComponent(knowledgePointId)}`, {
    method: 'DELETE',
    headers: userHeaders(userId),
  })
}

export function masteryStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'mastered':
      return '已掌握'
    case 'learning':
      return '学习中'
    default:
      return '未学'
  }
}

export function nextMasteryStatus(status: string | null | undefined): MasteryStatus {
  if (status === 'unknown' || !status) return 'learning'
  if (status === 'learning') return 'mastered'
  return 'unknown'
}
