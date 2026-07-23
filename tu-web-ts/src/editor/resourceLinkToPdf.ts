import { getResourceItem } from '@/api/externalResource'
import {
  parseResourceLocator,
  splitResourceHref,
} from '@/editor/linkLabelSuggestQuery'
import {
  defaultAccessUrl,
  extractStoredFileId,
  guessAccessUrlFileName,
  listAccessUrls,
  resolveAccessUrlInsertKind,
} from '@/utils/accessUrlInsert'
import { PDF_EXCERPT_DEFAULT_HEIGHT } from '@/utils/pdfExcerpt'

export interface PdfExcerptInsertInput {
  fileId: string
  fileName: string
  viewMode: 'excerpt' | 'full'
  startPage: number
  endPage: number
  height: number
  clipTop: number
  clipBottom: number
}

/**
 * Resolve a `resource:…` locator to pdfExcerptBlock attrs when the item has a
 * stored `/api/files/…` PDF access URL. Lookup only — never registers resources.
 * `#page=N` / `#page=N-M` → excerpt; optional `&clip=T-B` → vertical ratios; no fragment → full.
 */
export async function resolvePdfExcerptFromResourceHref(
  href: string,
): Promise<PdfExcerptInsertInput | null> {
  const split = splitResourceHref(href)
  const loc = parseResourceLocator(split?.base ?? href)
  if (!loc?.itemId) return null

  let item
  try {
    item = await getResourceItem(loc.itemId)
  } catch {
    return null
  }

  const urls = listAccessUrls(item.accessUrls)
  const candidates = urls.length > 0
    ? urls
    : [defaultAccessUrl([item.sourceUrl || ''])].filter(Boolean)

  for (const accessUrl of candidates) {
    const kind = await resolveAccessUrlInsertKind(accessUrl)
    if (kind !== 'pdf') continue
    const fileId = extractStoredFileId(accessUrl)
    if (!fileId) continue
    const guessed = guessAccessUrlFileName(accessUrl, item.title)
    const fileName = guessed.toLowerCase().endsWith('.pdf')
      ? guessed
      : `${item.title || 'resource'}.pdf`

    const hasPage = split?.pageStart != null && split.pageEnd != null
    return {
      fileId,
      fileName,
      viewMode: hasPage ? 'excerpt' : 'full',
      startPage: hasPage ? split.pageStart! : 1,
      endPage: hasPage ? split.pageEnd! : 1,
      height: PDF_EXCERPT_DEFAULT_HEIGHT,
      clipTop: hasPage ? (split?.clipTop ?? 0) : 0,
      clipBottom: hasPage ? (split?.clipBottom ?? 1) : 1,
    }
  }

  return null
}

/** True when hover toolbar should offer「PDF」instead of iframe for this href. */
export function isResourceLocatorHref(href: string | null | undefined): boolean {
  const base = String(href || '').trim().split('#')[0] || ''
  return base.startsWith('resource:')
}
