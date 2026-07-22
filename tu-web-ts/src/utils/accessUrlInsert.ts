import { buildFileUrl } from '@/api/fileStorage'

export type AccessUrlInsertKind = 'pdf' | 'image' | 'externalResource'

const FILE_API_PATH_RE = /\/api\/files\/([^/?#]+)\/?$/i

/** Collect non-empty access URLs; first entry is the default for insert. */
export function listAccessUrls(urls: string[] | null | undefined): string[] {
  return (urls ?? []).map((item) => item.trim()).filter(Boolean)
}

export function defaultAccessUrl(urls: string[] | null | undefined): string {
  return listAccessUrls(urls)[0] || ''
}

/** Extract stored file id from `/api/files/{id}` (absolute or relative). */
export function extractStoredFileId(accessUrl: string): string | null {
  const value = accessUrl.trim()
  if (!value) return null
  try {
    const url = new URL(value, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    const match = url.pathname.match(FILE_API_PATH_RE)
    return match?.[1] ? decodeURIComponent(match[1]) : null
  } catch {
    const match = value.match(FILE_API_PATH_RE)
    return match?.[1] ? decodeURIComponent(match[1]) : null
  }
}

function pathWithoutQueryHash(raw: string): string {
  try {
    const url = new URL(raw, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    return url.pathname
  } catch {
    return raw.split(/[?#]/)[0] || raw
  }
}

/** Sync classification from path / extension (no network). */
export function classifyAccessUrlSync(accessUrl: string): AccessUrlInsertKind {
  const path = pathWithoutQueryHash(accessUrl).toLowerCase()
  if (path.endsWith('.pdf')) return 'pdf'
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(path)) return 'image'
  return 'externalResource'
}

export function guessAccessUrlFileName(accessUrl: string, fallbackTitle: string): string {
  const path = pathWithoutQueryHash(accessUrl)
  const last = path.split('/').filter(Boolean).pop() || ''
  if (last && last !== 'files' && !/^file-/i.test(last) && last.includes('.')) {
    try {
      return decodeURIComponent(last)
    } catch {
      return last
    }
  }
  const title = fallbackTitle.trim() || 'resource'
  const kind = classifyAccessUrlSync(accessUrl)
  if (kind === 'pdf') return title.toLowerCase().endsWith('.pdf') ? title : `${title}.pdf`
  if (kind === 'image') return title
  return title
}

async function peekStoredFileContentType(fileId: string): Promise<string | null> {
  const url = buildFileUrl(fileId)
  try {
    const head = await fetch(url, { method: 'HEAD' })
    if (head.ok) {
      const type = head.headers.get('content-type')
      if (type) return type
    }
  } catch {
    /* HEAD may be unavailable */
  }
  try {
    const ranged = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
    })
    return ranged.headers.get('content-type')
  } catch {
    return null
  }
}

function kindFromContentType(contentType: string | null | undefined): AccessUrlInsertKind | null {
  if (!contentType) return null
  const type = contentType.split(';', 1)[0]!.trim().toLowerCase()
  if (type === 'application/pdf') return 'pdf'
  if (type.startsWith('image/')) return 'image'
  return null
}

/**
 * Resolve insert nodeView kind for an access URL.
 * Uses extension first; for `/api/files/{id}` without extension, peeks Content-Type.
 */
export async function resolveAccessUrlInsertKind(accessUrl: string): Promise<AccessUrlInsertKind> {
  const trimmed = accessUrl.trim()
  if (!trimmed) return 'externalResource'

  const sync = classifyAccessUrlSync(trimmed)
  if (sync !== 'externalResource') return sync

  const fileId = extractStoredFileId(trimmed)
  if (!fileId) return 'externalResource'

  const contentType = await peekStoredFileContentType(fileId)
  return kindFromContentType(contentType) ?? 'externalResource'
}
