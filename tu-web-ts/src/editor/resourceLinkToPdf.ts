import { getResourceItem, listResourceChapters, type ResourceChapter } from '@/api/externalResource'
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
import { parseResourcePositionLocator } from '@/utils/resourcePositionLocator'

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

/** Sentinel end page for the last chapter (clamped to PDF total when the doc loads). */
export const OPEN_CHAPTER_END_PAGE = 999_999

export type ChapterPageRangeInput = Pick<ResourceChapter, 'id' | 'parentId' | 'locator' | 'sortOrder'>

function parseChapterLocatorPages(locator?: string | null): {
  startPage: number
  /** Present when locator is an explicit `page:N-M` range. */
  endPage?: number
} | null {
  const parsed = parseResourcePositionLocator(locator)
  if (!parsed || (parsed.kind !== 'page' && parsed.kind !== 'pageRange')) return null
  const startPage = parsed.page
  if (startPage == null || startPage < 1) return null
  if (parsed.kind === 'pageRange' && parsed.endPage != null && parsed.endPage >= startPage) {
    return { startPage, endPage: parsed.endPage }
  }
  return { startPage }
}

function sameParentId(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? null) === (b ?? null)
}

/**
 * Chapter PDF page span: locator start → explicit `page:N-M` end, else next sibling
 * (then uncle…) start − 1. Last chapter uses {@link OPEN_CHAPTER_END_PAGE}.
 */
export function resolveResourceChapterPageRange(
  chapters: ChapterPageRangeInput[],
  chapterId: string,
): { startPage: number; endPage: number } | null {
  const byId = new Map(chapters.map((c) => [c.id, c]))
  const current = byId.get(chapterId)
  if (!current) return null

  const parsed = parseChapterLocatorPages(current.locator)
  if (!parsed) return null

  if (parsed.endPage != null) {
    return { startPage: parsed.startPage, endPage: parsed.endPage }
  }

  const startPage = parsed.startPage
  let cursor: ChapterPageRangeInput | undefined = current

  while (cursor) {
    const parentKey = cursor.parentId ?? null
    const siblings = chapters
      .filter((c) => sameParentId(c.parentId, parentKey))
      .map((c) => ({
        chapter: c,
        start: parseChapterLocatorPages(c.locator)?.startPage ?? null,
      }))
      .sort((a, b) => {
        if (a.start != null && b.start != null && a.start !== b.start) return a.start - b.start
        if (a.start != null && b.start == null) return -1
        if (a.start == null && b.start != null) return 1
        return (a.chapter.sortOrder ?? 0) - (b.chapter.sortOrder ?? 0)
      })

    const idx = siblings.findIndex((s) => s.chapter.id === cursor!.id)
    if (idx >= 0) {
      for (let j = idx + 1; j < siblings.length; j++) {
        const nextStart = siblings[j]?.start
        if (nextStart == null) continue
        return { startPage, endPage: Math.max(startPage, nextStart - 1) }
      }
    }

    if (!cursor.parentId) break
    cursor = byId.get(cursor.parentId)
  }

  return { startPage, endPage: OPEN_CHAPTER_END_PAGE }
}

/**
 * Resolve a `resource:…` locator to pdfExcerptBlock attrs when the item has a
 * stored `/api/files/…` PDF access URL. Lookup only — never registers resources.
 * `#page=N` / `#page=N-M` → excerpt (wins over chapter inference);
 * `:chapter:` without fragment → chapter page span; otherwise full.
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
    if (hasPage) {
      return {
        fileId,
        fileName,
        viewMode: 'excerpt',
        startPage: split.pageStart!,
        endPage: split.pageEnd!,
        height: PDF_EXCERPT_DEFAULT_HEIGHT,
        clipTop: split?.clipTop ?? 0,
        clipBottom: split?.clipBottom ?? 1,
      }
    }

    if (loc.chapterId) {
      try {
        const chapters = await listResourceChapters(loc.itemId)
        const range = resolveResourceChapterPageRange(chapters, loc.chapterId)
        if (range) {
          return {
            fileId,
            fileName,
            viewMode: 'excerpt',
            startPage: range.startPage,
            endPage: range.endPage,
            height: PDF_EXCERPT_DEFAULT_HEIGHT,
            clipTop: 0,
            clipBottom: 1,
          }
        }
      } catch {
        // Fall through to full view when chapter list / locator is unavailable.
      }
    }

    return {
      fileId,
      fileName,
      viewMode: 'full',
      startPage: 1,
      endPage: 1,
      height: PDF_EXCERPT_DEFAULT_HEIGHT,
      clipTop: 0,
      clipBottom: 1,
    }
  }

  return null
}

/** True when hover toolbar should offer「PDF」instead of iframe for this href. */
export function isResourceLocatorHref(href: string | null | undefined): boolean {
  const base = String(href || '').trim().split('#')[0] || ''
  return base.startsWith('resource:')
}
