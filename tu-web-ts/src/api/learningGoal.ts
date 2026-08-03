import type { PageResult } from '@/constants/pagination'
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination'
import { request } from './http'
import { isMockDataSource } from '@/dev/dataSource'
import {
  clearCurrentLearningGoalMock,
  createLearningGoalMock,
  deleteLearningGoalMock,
  getCurrentLearningGoalMock,
  listLearningGoalsMock,
  setCurrentLearningGoalMock,
  updateLearningGoalMock,
} from '@/mock/learningGoal'

export type LearningGoalSourceKind =
  | 'free_text'
  | 'knowledge_point'
  | 'resource_item'
  | 'resource_excerpt'

export interface LearningGoal {
  id: string
  userId: string
  title: string
  kbId?: string | null
  sourceKind: LearningGoalSourceKind | string
  knowledgePointId?: string | null
  resourceItemId?: string | null
  resourceExcerptId?: string | null
  snapshotJson?: string | null
  currentFlag?: boolean | null
  createdAt: string
  updatedAt: string
}

export interface LearningGoalUpsertPayload {
  title: string
  kbId?: string | null
  sourceKind?: LearningGoalSourceKind | string
  knowledgePointId?: string | null
  resourceItemId?: string | null
  resourceExcerptId?: string | null
  snapshotJson?: string | null
  setCurrent?: boolean
}

function userHeaders(userId?: string | null): HeadersInit {
  const uid = typeof userId === 'string' && userId.trim() ? userId.trim() : 'local'
  return { 'X-User-Id': uid }
}

export async function listLearningGoals(
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE,
  userId?: string | null,
): Promise<PageResult<LearningGoal>> {
  if (isMockDataSource()) return listLearningGoalsMock(page, pageSize, userId)
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })
  return request<PageResult<LearningGoal>>(`/api/learning/goals?${query}`, {
    headers: userHeaders(userId),
  })
}

export async function getCurrentLearningGoal(userId?: string | null): Promise<LearningGoal | null> {
  if (isMockDataSource()) return getCurrentLearningGoalMock(userId)
  return request<LearningGoal | null>('/api/learning/goals/current', {
    headers: userHeaders(userId),
  })
}

export async function createLearningGoal(
  payload: LearningGoalUpsertPayload,
  userId?: string | null,
): Promise<LearningGoal> {
  if (isMockDataSource()) return createLearningGoalMock(payload, userId)
  return request<LearningGoal>('/api/learning/goals', {
    method: 'POST',
    headers: userHeaders(userId),
    body: JSON.stringify(payload),
  })
}

export async function updateLearningGoal(
  id: string,
  payload: LearningGoalUpsertPayload,
  userId?: string | null,
): Promise<LearningGoal> {
  if (isMockDataSource()) return updateLearningGoalMock(id, payload, userId)
  return request<LearningGoal>(`/api/learning/goals/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: userHeaders(userId),
    body: JSON.stringify(payload),
  })
}

export async function setCurrentLearningGoal(
  id: string,
  userId?: string | null,
): Promise<LearningGoal> {
  if (isMockDataSource()) return setCurrentLearningGoalMock(id, userId)
  return request<LearningGoal>(`/api/learning/goals/${encodeURIComponent(id)}/current`, {
    method: 'PUT',
    headers: userHeaders(userId),
  })
}

export async function clearCurrentLearningGoal(userId?: string | null): Promise<void> {
  if (isMockDataSource()) {
    clearCurrentLearningGoalMock(userId)
    return
  }
  await request<void>('/api/learning/goals/current', {
    method: 'DELETE',
    headers: userHeaders(userId),
  })
}

export async function deleteLearningGoal(id: string, userId?: string | null): Promise<void> {
  if (isMockDataSource()) {
    deleteLearningGoalMock(id, userId)
    return
  }
  await request<void>(`/api/learning/goals/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: userHeaders(userId),
  })
}
