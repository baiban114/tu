const STORAGE_KEY = 'tu:pdf-reading-positions'
const MAX_ENTRIES = 120

/** Reading positions expire so stale blocks and replaced PDFs do not restore. */
export const PDF_READING_POSITION_TTL_MS = 30 * 24 * 60 * 60 * 1_000

export interface PdfReadingPosition {
  blockId: string
  fileId: string
  /** One-based PDF page number. */
  pageNumber: number
  /** Ratio of the viewport center inside the page (0–1). */
  pageOffset: number
  /** Millisecond timestamp of the last user reading position. */
  updatedAt: number
}

type StoredPosition = Omit<PdfReadingPosition, 'blockId'>

function storage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null
  } catch {
    return null
  }
}

function readAll(now = Date.now()): Record<string, StoredPosition> {
  const store = storage()
  if (!store) return {}
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return {}
    const result: Record<string, StoredPosition> = {}
    for (const [blockId, value] of Object.entries(parsed)) {
      if (!blockId.trim() || !value || typeof value !== 'object') continue
      const rawEntry = value as Record<string, unknown>
      const fileId = String(rawEntry.fileId || '').trim()
      const pageNumber = Math.floor(Number(rawEntry.pageNumber))
      const pageOffset = Number(rawEntry.pageOffset)
      const updatedAt = Number(rawEntry.updatedAt)
      if (
        !fileId
        || !Number.isFinite(pageNumber)
        || pageNumber < 1
        || !Number.isFinite(pageOffset)
        || pageOffset < 0
        || pageOffset > 1
        || !Number.isFinite(updatedAt)
        || updatedAt <= 0
        || now - updatedAt > PDF_READING_POSITION_TTL_MS
      ) continue
      result[blockId] = { fileId, pageNumber, pageOffset, updatedAt }
    }
    return result
  } catch {
    return {}
  }
}

function writeAll(value: Record<string, StoredPosition>): void {
  const store = storage()
  if (!store) return
  try {
    const entries = Object.entries(value)
      .sort(([, a], [, b]) => a.updatedAt - b.updatedAt)
      .slice(-MAX_ENTRIES)
    if (entries.length === 0) {
      store.removeItem(STORAGE_KEY)
      return
    }
    store.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // Ignore unavailable or full storage; reading position is advisory state.
  }
}

export function loadPdfReadingPosition(
  blockId: string | null | undefined,
  fileId: string | null | undefined,
  now = Date.now(),
): PdfReadingPosition | null {
  const key = blockId?.trim()
  const expectedFileId = fileId?.trim()
  if (!key || !expectedFileId) return null
  const entry = readAll(now)[key]
  if (!entry || entry.fileId !== expectedFileId) return null
  return { blockId: key, ...entry }
}

export function savePdfReadingPosition(
  value: PdfReadingPosition,
  now = Date.now(),
): void {
  const blockId = value.blockId.trim()
  const fileId = value.fileId.trim()
  const pageNumber = Math.floor(value.pageNumber)
  const pageOffset = Math.min(1, Math.max(0, Math.round(value.pageOffset * 1_000) / 1_000))
  if (!blockId || !fileId || !Number.isFinite(pageNumber) || pageNumber < 1) return
  const all = readAll(now)
  all[blockId] = {
    fileId,
    pageNumber,
    pageOffset,
    updatedAt: Number.isFinite(now) && now > 0 ? now : Date.now(),
  }
  writeAll(all)
}

export function clearPdfReadingPosition(blockId: string | null | undefined): void {
  const key = blockId?.trim()
  if (!key) return
  const all = readAll()
  if (!(key in all)) return
  delete all[key]
  writeAll(all)
}
