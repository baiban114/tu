import type { PageResult } from '@/constants/pagination'
import { DEFAULT_PAGE_SIZE } from '@/constants/pagination'
import type {
  KnowledgePointMastery,
  MasteryProjection,
  MasteryUpsertPayload,
} from '@/api/learningMastery'

const STORAGE_KEY = 'tu:mock:learning-mastery'

function uid(userId?: string | null): string {
  return (userId && userId.trim()) || 'local'
}

function loadAll(): KnowledgePointMastery[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as KnowledgePointMastery[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveAll(items: KnowledgePointMastery[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

function nowIso(): string {
  return new Date().toISOString()
}

export function listKnowledgePointMasteryMock(
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE,
  kbId?: string | null,
  userId?: string | null,
): PageResult<KnowledgePointMastery> {
  const user = uid(userId)
  let items = loadAll().filter((item) => item.userId === user)
  if (kbId?.trim()) {
    const kb = kbId.trim()
    items = items.filter((item) => item.kbId === kb)
  }
  items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const total = items.length
  const start = Math.max(0, page) * pageSize
  return {
    items: items.slice(start, start + pageSize),
    total,
    page: Math.max(0, page),
    pageSize,
  }
}

export function upsertKnowledgePointMasteryMock(
  payload: MasteryUpsertPayload,
  userId?: string | null,
): KnowledgePointMastery {
  const user = uid(userId)
  const all = loadAll()
  const pointId = payload.knowledgePointId.trim()
  const idx = all.findIndex((item) => item.userId === user && item.knowledgePointId === pointId)
  const now = nowIso()
  if (idx >= 0) {
    const next: KnowledgePointMastery = {
      ...all[idx],
      kbId: payload.kbId ?? all[idx].kbId,
      status: payload.status,
      score: payload.score ?? null,
      note: payload.note ?? null,
      updatedAt: now,
    }
    all[idx] = next
    saveAll(all)
    return next
  }
  const created: KnowledgePointMastery = {
    id: `mm-${Date.now()}`,
    userId: user,
    kbId: payload.kbId ?? null,
    knowledgePointId: pointId,
    status: payload.status,
    score: payload.score ?? null,
    note: payload.note ?? null,
    createdAt: now,
    updatedAt: now,
  }
  all.push(created)
  saveAll(all)
  return created
}

export function projectKnowledgePointMasteryMock(
  orderedPointIds: string[],
  kbId?: string | null,
  userId?: string | null,
): MasteryProjection {
  const user = uid(userId)
  const byPoint = new Map(
    loadAll()
      .filter((item) => item.userId === user)
      .map((item) => [item.knowledgePointId, item]),
  )
  const now = nowIso()
  const items: KnowledgePointMastery[] = []
  let suggestedNextPointId: string | null = null
  for (const pointId of orderedPointIds) {
    const id = pointId.trim()
    if (!id) continue
    const existing = byPoint.get(id)
    const row: KnowledgePointMastery = existing ?? {
      id: null,
      userId: user,
      kbId: kbId ?? null,
      knowledgePointId: id,
      status: 'unknown',
      score: null,
      note: null,
      createdAt: now,
      updatedAt: now,
    }
    items.push(row)
    if (!suggestedNextPointId && row.status !== 'mastered') {
      suggestedNextPointId = id
    }
  }
  return { items, suggestedNextPointId }
}

export function deleteKnowledgePointMasteryMock(
  knowledgePointId: string,
  userId?: string | null,
): void {
  const user = uid(userId)
  const next = loadAll().filter(
    (item) => !(item.userId === user && item.knowledgePointId === knowledgePointId),
  )
  saveAll(next)
}
