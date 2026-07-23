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

const LEARNING_API_BASE = '/api/learning'

const DEFAULT_USER_ID = 'local'

function userHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-User-Id': DEFAULT_USER_ID,
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
