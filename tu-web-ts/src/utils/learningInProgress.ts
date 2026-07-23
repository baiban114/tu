import type { HeadingSourceBinding } from '@/api/types'

const STORAGE_PREFIX = 'tu:learning-in-progress'
const LEGACY_SESSION_KEY = 'tu:last-mark-excerpt'
const DEV_LOCAL_USER_ID = 'dev-local-user'

export interface LearningInProgress {
  resourceItemId: string
  /** Present when the learning target is a specific excerpt; otherwise item-level. */
  resourceExcerptId?: string | null
  snapshot: HeadingSourceBinding['snapshot']
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

function getSessionStorage(): Storage | null {
  try {
    return (globalThis as { sessionStorage?: Storage }).sessionStorage ?? null
  } catch {
    return null
  }
}

function isSnapshot(value: unknown): value is HeadingSourceBinding['snapshot'] {
  return value != null && typeof value === 'object'
}

export function normalizeLearningInProgress(raw: unknown): LearningInProgress | null {
  if (!raw || typeof raw !== 'object') return null
  const entry = raw as Record<string, unknown>
  const resourceItemId = typeof entry.resourceItemId === 'string' ? entry.resourceItemId.trim() : ''
  if (!resourceItemId || !isSnapshot(entry.snapshot)) return null
  const resourceExcerptId = typeof entry.resourceExcerptId === 'string' && entry.resourceExcerptId.trim()
    ? entry.resourceExcerptId.trim()
    : (entry.resourceExcerptId === null ? null : undefined)
  const updatedAt = typeof entry.updatedAt === 'number' ? entry.updatedAt : Date.now()
  return {
    resourceItemId,
    resourceExcerptId: resourceExcerptId ?? null,
    snapshot: { ...(entry.snapshot as HeadingSourceBinding['snapshot']) },
    updatedAt,
  }
}

export function resolveLearningInProgressUserId(userId?: string | null): string {
  const trimmed = typeof userId === 'string' ? userId.trim() : ''
  return trimmed || DEV_LOCAL_USER_ID
}

export function learningInProgressFromBinding(binding: HeadingSourceBinding): LearningInProgress | null {
  const resourceItemId = typeof binding.resourceItemId === 'string' ? binding.resourceItemId.trim() : ''
  if (!resourceItemId || !binding.snapshot) return null
  const excerptId = typeof binding.resourceExcerptId === 'string' && binding.resourceExcerptId.trim()
    ? binding.resourceExcerptId.trim()
    : null
  return {
    resourceItemId,
    resourceExcerptId: excerptId,
    snapshot: { ...binding.snapshot },
    updatedAt: Date.now(),
  }
}

export function learningInProgressToBinding(target: LearningInProgress): HeadingSourceBinding {
  return {
    resourceItemId: target.resourceItemId,
    resourceExcerptId: target.resourceExcerptId ?? null,
    snapshot: { ...target.snapshot },
    markerSource: 'user',
  }
}

/** True when the in-progress target can be reused for mark-excerpt (needs an excerpt id). */
export function canAutoMarkFromInProgress(target: LearningInProgress | null | undefined): boolean {
  return Boolean(target?.resourceItemId && target.resourceExcerptId)
}

/** Chip / entity-level display: ResourceItem title. */
export function formatLearningInProgressLabel(target: LearningInProgress): string {
  return target.snapshot.resourceTitle
    || target.snapshot.workTitle
    || '进行中资源'
}

/**
 * Fallback label from a stored binding snapshot (not current caret position).
 * Prefer {@link resolveExcerptDefaultTitle} at the mark position when a doc is available.
 */
export function formatLearningInProgressMarkAsLabel(target: LearningInProgress | HeadingSourceBinding): string {
  const snapshot = 'snapshot' in target ? target.snapshot : null
  if (!snapshot) return '外部资源'
  return snapshot.excerptTitle
    || snapshot.resourceTitle
    || '外部资源'
}

/**
 * Toolbar countdown label: `资源实体名>文档层级` (hierarchy from nearest heading / selection).
 */
export function formatReuseMarkOfferLabel(
  binding: HeadingSourceBinding | LearningInProgress,
  hierarchyLabel: string,
): string {
  const snapshot = 'snapshot' in binding ? binding.snapshot : null
  const resourceName = (
    snapshot?.resourceTitle?.trim()
    || snapshot?.workTitle?.trim()
    || ''
  )
  const hierarchy = hierarchyLabel.trim()
  if (resourceName && hierarchy) {
    if (hierarchy === resourceName || hierarchy.startsWith(`${resourceName}>`)) {
      return hierarchy.slice(0, 120)
    }
    return `${resourceName}>${hierarchy}`.slice(0, 120)
  }
  return (hierarchy || resourceName || '外部资源').slice(0, 120)
}

export function buildLearningInProgressResourceLink(target: LearningInProgress): {
  path: string
  query: Record<string, string>
} {
  const query: Record<string, string> = {
    tab: 'items',
    itemId: target.resourceItemId,
  }
  if (target.resourceExcerptId) {
    query.excerptId = target.resourceExcerptId
  }
  return { path: '/resources', query }
}

function migrateLegacySessionCache(userId: string): LearningInProgress | null {
  const session = getSessionStorage()
  if (!session) return null
  try {
    const raw = session.getItem(LEGACY_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { binding?: HeadingSourceBinding; cachedAt?: number }
    const fromBinding = parsed.binding ? learningInProgressFromBinding(parsed.binding) : null
    if (!fromBinding) {
      session.removeItem(LEGACY_SESSION_KEY)
      return null
    }
    if (typeof parsed.cachedAt === 'number') {
      fromBinding.updatedAt = parsed.cachedAt
    }
    saveLearningInProgress(userId, fromBinding)
    session.removeItem(LEGACY_SESSION_KEY)
    return fromBinding
  } catch {
    return null
  }
}

export function loadLearningInProgress(userId?: string | null): LearningInProgress | null {
  const uid = resolveLearningInProgressUserId(userId)
  const storage = getLocalStorage()
  if (!storage) return migrateLegacySessionCache(uid)
  try {
    const raw = storage.getItem(storageKey(uid))
    if (raw) {
      return normalizeLearningInProgress(JSON.parse(raw))
    }
  } catch {
    // fall through to legacy
  }
  return migrateLegacySessionCache(uid)
}

export function saveLearningInProgress(
  userId: string | null | undefined,
  target: LearningInProgress | HeadingSourceBinding,
): LearningInProgress | null {
  const normalized = 'resourceItemId' in target && 'updatedAt' in target
    ? normalizeLearningInProgress(target)
    : learningInProgressFromBinding(target as HeadingSourceBinding)
  if (!normalized) return null
  const entry: LearningInProgress = {
    ...normalized,
    updatedAt: Date.now(),
  }
  const storage = getLocalStorage()
  const uid = resolveLearningInProgressUserId(userId)
  if (storage) {
    try {
      storage.setItem(storageKey(uid), JSON.stringify(entry))
    } catch {
      // ignore quota / private mode
    }
  }
  return entry
}

export function clearLearningInProgress(userId?: string | null): void {
  const storage = getLocalStorage()
  if (!storage) return
  try {
    storage.removeItem(storageKey(resolveLearningInProgressUserId(userId)))
  } catch {
    // ignore
  }
}
