import type { PageResult } from '@/constants/pagination'
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination'
import type { LearningGoal, LearningGoalUpsertPayload } from '@/api/learningGoal'

const STORAGE_KEY = 'tu:mock:learning-goals'

function uid(userId?: string | null): string {
  return (userId && userId.trim()) || 'local'
}

function loadAll(): LearningGoal[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as LearningGoal[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveAll(items: LearningGoal[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

function nowIso(): string {
  return new Date().toISOString()
}

export function listLearningGoalsMock(
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE,
  userId?: string | null,
): PageResult<LearningGoal> {
  const user = uid(userId)
  const items = loadAll()
    .filter((item) => item.userId === user)
    .sort((a, b) => {
      const ac = a.currentFlag ? 1 : 0
      const bc = b.currentFlag ? 1 : 0
      if (ac !== bc) return bc - ac
      return (b.updatedAt || '').localeCompare(a.updatedAt || '')
    })
  const safeSize = Math.max(1, pageSize)
  const safePage = Math.max(0, page)
  const start = safePage * safeSize
  return {
    items: items.slice(start, start + safeSize),
    total: items.length,
    page: safePage,
    pageSize: safeSize,
  }
}

export function getCurrentLearningGoalMock(userId?: string | null): LearningGoal | null {
  return loadAll().find((item) => item.userId === uid(userId) && item.currentFlag) ?? null
}

export function createLearningGoalMock(
  payload: LearningGoalUpsertPayload,
  userId?: string | null,
): LearningGoal {
  const user = uid(userId)
  const all = loadAll()
  const stamp = nowIso()
  if (payload.setCurrent) {
    for (const item of all) {
      if (item.userId === user) item.currentFlag = false
    }
  }
  const goal: LearningGoal = {
    id: `lg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    userId: user,
    title: payload.title.trim(),
    kbId: payload.kbId ?? null,
    sourceKind: payload.sourceKind || 'free_text',
    knowledgePointId: payload.knowledgePointId ?? null,
    resourceItemId: payload.resourceItemId ?? null,
    resourceExcerptId: payload.resourceExcerptId ?? null,
    snapshotJson: payload.snapshotJson ?? null,
    currentFlag: Boolean(payload.setCurrent),
    createdAt: stamp,
    updatedAt: stamp,
  }
  all.unshift(goal)
  saveAll(all)
  return goal
}

export function updateLearningGoalMock(
  id: string,
  payload: LearningGoalUpsertPayload,
  userId?: string | null,
): LearningGoal {
  const user = uid(userId)
  const all = loadAll()
  const idx = all.findIndex((item) => item.id === id && item.userId === user)
  if (idx < 0) throw new Error('goal not found')
  if (payload.setCurrent) {
    for (const item of all) {
      if (item.userId === user) item.currentFlag = false
    }
  }
  const prev = all[idx]
  const next: LearningGoal = {
    ...prev,
    title: payload.title.trim(),
    kbId: payload.kbId ?? null,
    sourceKind: payload.sourceKind || prev.sourceKind,
    knowledgePointId: payload.knowledgePointId ?? null,
    resourceItemId: payload.resourceItemId ?? null,
    resourceExcerptId: payload.resourceExcerptId ?? null,
    snapshotJson: payload.snapshotJson ?? null,
    currentFlag: payload.setCurrent ? true : prev.currentFlag,
    updatedAt: nowIso(),
  }
  all[idx] = next
  saveAll(all)
  return next
}

export function setCurrentLearningGoalMock(id: string, userId?: string | null): LearningGoal {
  const user = uid(userId)
  const all = loadAll()
  const idx = all.findIndex((item) => item.id === id && item.userId === user)
  if (idx < 0) throw new Error('goal not found')
  for (const item of all) {
    if (item.userId === user) item.currentFlag = false
  }
  all[idx] = { ...all[idx], currentFlag: true, updatedAt: nowIso() }
  saveAll(all)
  return all[idx]
}

export function clearCurrentLearningGoalMock(userId?: string | null): void {
  const user = uid(userId)
  const all = loadAll()
  for (const item of all) {
    if (item.userId === user) item.currentFlag = false
  }
  saveAll(all)
}

export function deleteLearningGoalMock(id: string, userId?: string | null): void {
  const user = uid(userId)
  saveAll(loadAll().filter((item) => !(item.id === id && item.userId === user)))
}
