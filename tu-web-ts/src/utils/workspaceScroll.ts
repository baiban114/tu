/**
 * Persist / restore document scroll position for workspace browse (refresh resume).
 * Keyed by view id (pageId or resource-document tree id).
 */

const STORAGE_KEY = 'tu:workspace-scroll'

export interface WorkspaceScrollEntry {
  viewKey: string
  scrollTop: number
}

function readAll(): Record<string, number> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return {}
    const result: Record<string, number> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (!key.trim()) continue
      const n = typeof value === 'number' ? value : Number(value)
      if (Number.isFinite(n) && n >= 0) result[key.trim()] = Math.round(n)
    }
    return result
  } catch {
    return {}
  }
}

export function loadWorkspaceScrollTop(viewKey: string | null | undefined): number {
  if (!viewKey?.trim()) return 0
  return readAll()[viewKey.trim()] ?? 0
}

export function saveWorkspaceScrollTop(
  viewKey: string | null | undefined,
  scrollTop: number,
): void {
  if (typeof window === 'undefined' || !viewKey?.trim()) return
  try {
    const key = viewKey.trim()
    const all = readAll()
    const next = Math.max(0, Math.round(scrollTop))
    // Re-insert so this key becomes last (recent) in insertion order.
    delete all[key]
    if (next > 0) {
      all[key] = next
    }
    // Cap storage size: keep most recently written keys.
    const entries = Object.entries(all)
    if (entries.length > 80) {
      const trimmed = Object.fromEntries(entries.slice(entries.length - 80))
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
      return
    }
    if (Object.keys(all).length === 0) {
      window.localStorage.removeItem(STORAGE_KEY)
      return
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // ignore quota / private mode
  }
}

export function clearWorkspaceScrollTop(viewKey: string | null | undefined): void {
  saveWorkspaceScrollTop(viewKey, 0)
}
