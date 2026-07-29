/** Reading-only knowledge-point preview state (not page content; local cache only). */

const STORAGE_PREFIX = 'tu:kp-reading-preview'
const DEV_LOCAL_USER_ID = 'dev-local-user'

export interface KnowledgePointReadingPreviewState {
  pointId: string
  displayTypeCode?: string
  updatedAt: number
}

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId.trim()}`
}

function getLocalStorage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null
  } catch {
    return null
  }
}

export function resolveKnowledgePointReadingUserId(userId?: string | null): string {
  const trimmed = typeof userId === 'string' ? userId.trim() : ''
  return trimmed || DEV_LOCAL_USER_ID
}

export function normalizeKnowledgePointReadingPreviewState(
  raw: unknown,
): KnowledgePointReadingPreviewState | null {
  if (!raw || typeof raw !== 'object') return null
  const entry = raw as Record<string, unknown>
  const pointId = typeof entry.pointId === 'string' ? entry.pointId.trim() : ''
  if (!pointId) return null
  const displayTypeCode = typeof entry.displayTypeCode === 'string' && entry.displayTypeCode.trim()
    ? entry.displayTypeCode.trim()
    : undefined
  const updatedAt = typeof entry.updatedAt === 'number' ? entry.updatedAt : Date.now()
  return { pointId, displayTypeCode, updatedAt }
}

export function loadKnowledgePointReadingPreview(
  userId: string | null | undefined,
  pageId: string,
): KnowledgePointReadingPreviewState | null {
  const storage = getLocalStorage()
  const pid = pageId.trim()
  if (!storage || !pid) return null
  try {
    const raw = storage.getItem(storageKey(resolveKnowledgePointReadingUserId(userId)))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return normalizeKnowledgePointReadingPreviewState(parsed[pid])
  } catch {
    return null
  }
}

export function saveKnowledgePointReadingPreview(
  userId: string | null | undefined,
  pageId: string,
  state: KnowledgePointReadingPreviewState | null,
): void {
  const storage = getLocalStorage()
  const pid = pageId.trim()
  if (!storage || !pid) return
  try {
    const key = storageKey(resolveKnowledgePointReadingUserId(userId))
    const raw = storage.getItem(key)
    const parsed = raw ? (JSON.parse(raw) as Record<string, KnowledgePointReadingPreviewState>) : {}
    if (!state) {
      delete parsed[pid]
    } else {
      const normalized = normalizeKnowledgePointReadingPreviewState(state)
      if (!normalized) {
        delete parsed[pid]
      } else {
        parsed[pid] = {
          ...normalized,
          updatedAt: Date.now(),
        }
      }
    }
    if (Object.keys(parsed).length === 0) {
      storage.removeItem(key)
      return
    }
    storage.setItem(key, JSON.stringify(parsed))
  } catch {
    // ignore quota / private mode
  }
}

export function clearKnowledgePointReadingPreview(
  userId: string | null | undefined,
  pageId: string,
): void {
  saveKnowledgePointReadingPreview(userId, pageId, null)
}
