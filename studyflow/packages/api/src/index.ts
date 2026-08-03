export interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
}

export interface LearningHealthDto {
  status: string
  service: string
}

export interface PersonalNoteDto {
  id: string
  userId: string
  body: string
  createdAt: string
  updatedAt: string
}

export interface PersonalNotePageDto {
  items: PersonalNoteDto[]
  total: number
  page: number
  pageSize: number
}

export type LearningGoalSourceKindDto =
  | 'free_text'
  | 'knowledge_point'
  | 'resource_item'
  | 'resource_excerpt'

export interface LearningGoalDto {
  id: string
  userId: string
  title: string
  kbId?: string | null
  sourceKind: LearningGoalSourceKindDto | string
  knowledgePointId?: string | null
  resourceItemId?: string | null
  resourceExcerptId?: string | null
  snapshotJson?: string | null
  currentFlag?: boolean | null
  createdAt: string
  updatedAt: string
}

export interface LearningGoalPageDto {
  items: LearningGoalDto[]
  total: number
  page: number
  pageSize: number
}

export interface LearningGoalUpsertPayload {
  title: string
  kbId?: string | null
  sourceKind?: LearningGoalSourceKindDto | string
  knowledgePointId?: string | null
  resourceItemId?: string | null
  resourceExcerptId?: string | null
  snapshotJson?: string | null
  setCurrent?: boolean
}

export type MasteryStatusDto = 'unknown' | 'learning' | 'mastered'

export interface KnowledgePointMasteryDto {
  id: string | null
  userId: string
  kbId?: string | null
  knowledgePointId: string
  status: MasteryStatusDto | string
  score?: number | null
  note?: string | null
  createdAt: string
  updatedAt: string
}

export interface KnowledgePointMasteryPageDto {
  items: KnowledgePointMasteryDto[]
  total: number
  page: number
  pageSize: number
}

export interface MasteryUpsertPayload {
  kbId?: string | null
  knowledgePointId: string
  status: MasteryStatusDto | string
  score?: number | null
  note?: string | null
}

export interface MasteryProjectionDto {
  items: KnowledgePointMasteryDto[]
  suggestedNextPointId?: string | null
}


const LEARNING_API_BASE = '/api/learning'

const DEFAULT_USER_ID = 'local'

function userHeaders(userId?: string | null): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-User-Id': (userId && userId.trim()) || DEFAULT_USER_ID,
  }
}

async function parseEnvelope<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `request failed: ${response.status}`
    try {
      const body = await response.json() as ApiEnvelope<unknown>
      if (body?.message) message = body.message
    } catch {
      // ignore non-JSON error bodies
    }
    throw new Error(message)
  }
  const body = await response.json() as ApiEnvelope<T>
  if (body.code !== 0) {
    throw new Error(body.message || 'request failed')
  }
  return body.data
}

export async function fetchLearningHealth(): Promise<LearningHealthDto> {
  const response = await fetch(`${LEARNING_API_BASE}/health`)
  return parseEnvelope(response)
}

export async function listPersonalNotes(page = 0, pageSize = 10): Promise<PersonalNotePageDto> {
  const qs = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })
  const response = await fetch(`${LEARNING_API_BASE}/notes?${qs}`, {
    headers: userHeaders(),
  })
  return parseEnvelope(response)
}

export async function createPersonalNote(body: string): Promise<PersonalNoteDto> {
  const response = await fetch(`${LEARNING_API_BASE}/notes`, {
    method: 'POST',
    headers: userHeaders(),
    body: JSON.stringify({ body }),
  })
  return parseEnvelope(response)
}

export async function updatePersonalNote(id: string, body: string): Promise<PersonalNoteDto> {
  const response = await fetch(`${LEARNING_API_BASE}/notes/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: userHeaders(),
    body: JSON.stringify({ body }),
  })
  return parseEnvelope(response)
}

export async function deletePersonalNote(id: string): Promise<void> {
  const response = await fetch(`${LEARNING_API_BASE}/notes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: userHeaders(),
  })
  await parseEnvelope(response)
}

export async function listLearningGoals(
  page = 0,
  pageSize = 10,
  userId?: string | null,
): Promise<LearningGoalPageDto> {
  const qs = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })
  const response = await fetch(`${LEARNING_API_BASE}/goals?${qs}`, {
    headers: userHeaders(userId),
  })
  return parseEnvelope(response)
}

export async function getCurrentLearningGoal(userId?: string | null): Promise<LearningGoalDto | null> {
  const response = await fetch(`${LEARNING_API_BASE}/goals/current`, {
    headers: userHeaders(userId),
  })
  return parseEnvelope(response)
}

export async function createLearningGoal(
  payload: LearningGoalUpsertPayload,
  userId?: string | null,
): Promise<LearningGoalDto> {
  const response = await fetch(`${LEARNING_API_BASE}/goals`, {
    method: 'POST',
    headers: userHeaders(userId),
    body: JSON.stringify(payload),
  })
  return parseEnvelope(response)
}

export async function updateLearningGoal(
  id: string,
  payload: LearningGoalUpsertPayload,
  userId?: string | null,
): Promise<LearningGoalDto> {
  const response = await fetch(`${LEARNING_API_BASE}/goals/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: userHeaders(userId),
    body: JSON.stringify(payload),
  })
  return parseEnvelope(response)
}

export async function setCurrentLearningGoal(
  id: string,
  userId?: string | null,
): Promise<LearningGoalDto> {
  const response = await fetch(`${LEARNING_API_BASE}/goals/${encodeURIComponent(id)}/current`, {
    method: 'PUT',
    headers: userHeaders(userId),
  })
  return parseEnvelope(response)
}

export async function clearCurrentLearningGoal(userId?: string | null): Promise<void> {
  const response = await fetch(`${LEARNING_API_BASE}/goals/current`, {
    method: 'DELETE',
    headers: userHeaders(userId),
  })
  await parseEnvelope(response)
}

export async function deleteLearningGoal(id: string, userId?: string | null): Promise<void> {
  const response = await fetch(`${LEARNING_API_BASE}/goals/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: userHeaders(userId),
  })
  await parseEnvelope(response)
}

export async function listKnowledgePointMastery(
  page = 0,
  pageSize = 10,
  kbId?: string | null,
  userId?: string | null,
): Promise<KnowledgePointMasteryPageDto> {
  const qs = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })
  if (kbId?.trim()) qs.set('kbId', kbId.trim())
  const response = await fetch(`${LEARNING_API_BASE}/mastery?${qs}`, {
    headers: userHeaders(userId),
  })
  return parseEnvelope(response)
}

export async function upsertKnowledgePointMastery(
  payload: MasteryUpsertPayload,
  userId?: string | null,
): Promise<KnowledgePointMasteryDto> {
  const response = await fetch(`${LEARNING_API_BASE}/mastery`, {
    method: 'PUT',
    headers: userHeaders(userId),
    body: JSON.stringify(payload),
  })
  return parseEnvelope(response)
}

export async function projectKnowledgePointMastery(
  orderedPointIds: string[],
  kbId?: string | null,
  userId?: string | null,
): Promise<MasteryProjectionDto> {
  const response = await fetch(`${LEARNING_API_BASE}/mastery/projection`, {
    method: 'POST',
    headers: userHeaders(userId),
    body: JSON.stringify({
      orderedPointIds,
      kbId: kbId ?? null,
    }),
  })
  return parseEnvelope(response)
}

export async function deleteKnowledgePointMastery(
  knowledgePointId: string,
  userId?: string | null,
): Promise<void> {
  const response = await fetch(
    `${LEARNING_API_BASE}/mastery/${encodeURIComponent(knowledgePointId)}`,
    {
      method: 'DELETE',
      headers: userHeaders(userId),
    },
  )
  await parseEnvelope(response)
}
