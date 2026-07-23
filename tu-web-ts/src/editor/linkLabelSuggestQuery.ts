import type { ResourceItem } from '@/api/externalResource'

export type LinkSuggestKind =
  | 'page'
  | 'heading'
  | 'resourceItem'
  | 'resourceChapter'
  | 'resourceExcerpt'

export interface LinkSuggestItem {
  id: string
  kind: LinkSuggestKind
  /** Primary list text (node name; no confirmed ancestors). */
  label: string
  /**
   * Text written into `[]` on select. Defaults to `label`.
   * Resource/heading drills use full readable path for further `>` browse.
   */
  applyLabel?: string
  href: string
  description: string
}

export interface ParsedLinkLabelQuery {
  pageQuery: string
  /**
   * Completed path titles between `>` separators (resource chapter drill).
   * Example: `王道>第1章>1.1` → `['第1章']` with `childQuery='1.1'`.
   */
  pathSegments: string[]
  /**
   * Filter text at the current level (last segment; empty when the query ends with `>`).
   * Null when not drilled.
   */
  childQuery: string | null
  /**
   * Page heading search needle: non-empty path/child segments joined by space.
   * Empty string when drilled with no filter (e.g. `入门>`).
   */
  headingQuery: string | null
  drilled: boolean
}

export const HEADING_SEP = '>'

export function parseLinkLabelQuery(raw: string): ParsedLinkLabelQuery {
  const text = raw.replace(/^\uFEFF/, '')
  if (!text.includes(HEADING_SEP)) {
    return {
      pageQuery: text.trim(),
      pathSegments: [],
      childQuery: null,
      headingQuery: null,
      drilled: false,
    }
  }
  const parts = text.split(HEADING_SEP).map((part) => part.trim())
  const pageQuery = parts[0] || ''
  const pathSegments = parts.slice(1, -1)
  const childQuery = parts[parts.length - 1] ?? ''
  const headingQuery = [...pathSegments, childQuery].filter((part) => part.length > 0).join(' ')
  return {
    pageQuery,
    pathSegments,
    childQuery,
    headingQuery,
    drilled: true,
  }
}

export function isInternalLocatorHref(href: string): boolean {
  const base = href.trim().split('#')[0] || ''
  return base.startsWith('page:') || base.startsWith('resource:')
}

export function isHttpHref(value: string | null | undefined): boolean {
  if (!value) return false
  return /^https?:\/\//i.test(value.trim())
}

/** Strip `#…` fragment from a locator href. */
export function stripHrefFragment(href: string): string {
  const hash = href.indexOf('#')
  return hash < 0 ? href.trim() : href.slice(0, hash).trim()
}

/**
 * Visible `#page=N` / `#page=N-M` suffix for a resource href (collapsed link decoration).
 * Returns null when there is no valid page fragment.
 */
export function resourceHrefPageLimitText(href: string | null | undefined): string | null {
  const split = splitResourceHref(href)
  if (split?.pageStart == null || split.pageEnd == null) return null
  if (split.pageStart === split.pageEnd) return `#page=${split.pageStart}`
  return `#page=${split.pageStart}-${split.pageEnd}`
}

export interface ResourceHrefPageRange {
  /** Locator without `#page=` fragment. */
  base: string
  pageStart?: number
  pageEnd?: number
}

const PAGE_FRAGMENT_RE = /^page=(\d+)(?:-(\d+))?$/i

function normalizePageRange(start: number, end?: number): { pageStart: number; pageEnd: number } | null {
  if (!Number.isFinite(start) || start < 1) return null
  const pageStart = Math.floor(start)
  const pageEnd = end == null ? pageStart : Math.floor(end)
  if (!Number.isFinite(pageEnd) || pageEnd < pageStart) return null
  return { pageStart, pageEnd }
}

/**
 * Split `resource:…` / `resource:…#page=N` / `#page=N-M` into base locator + optional page range.
 * Invalid fragments are ignored (treated as no page).
 */
export function splitResourceHref(href: string | null | undefined): ResourceHrefPageRange | null {
  if (!href) return null
  const trimmed = href.trim()
  if (!trimmed.startsWith('resource:')) return null

  const hashIdx = trimmed.indexOf('#')
  const base = hashIdx < 0 ? trimmed : trimmed.slice(0, hashIdx).trim()
  if (!base.startsWith('resource:') || !parseResourceLocator(base)) return null

  if (hashIdx < 0) return { base }

  const fragment = trimmed.slice(hashIdx + 1).trim()
  // Obsidian-style `#page=N` / `#page=N-M`; ignore other fragment keys for now.
  const match = fragment.match(PAGE_FRAGMENT_RE)
  if (!match) return { base }

  const start = Number(match[1])
  const end = match[2] != null ? Number(match[2]) : undefined
  const range = normalizePageRange(start, end)
  if (!range) return { base }
  return { base, pageStart: range.pageStart, pageEnd: range.pageEnd }
}

/**
 * Attach Obsidian-style `#page=` fragment to a resource locator base.
 * Same start/end → `#page=N`; range → `#page=N-M`.
 */
export function formatResourceHrefPage(
  base: string,
  startPage: number,
  endPage?: number,
): string {
  const cleanBase = stripHrefFragment(base)
  const range = normalizePageRange(startPage, endPage)
  if (!range) return cleanBase
  if (range.pageStart === range.pageEnd) {
    return `${cleanBase}#page=${range.pageStart}`
  }
  return `${cleanBase}#page=${range.pageStart}-${range.pageEnd}`
}

/**
 * Rebuild resource href for PDF↔link sync.
 * Full view drops `#page=`; excerpt writes `#page=` from start/end.
 */
export function syncResourceHrefWithPdfPages(
  sourceHref: string,
  viewMode: 'excerpt' | 'full',
  startPage: number,
  endPage: number,
): string {
  const split = splitResourceHref(sourceHref)
  const base = split?.base || stripHrefFragment(sourceHref)
  if (!base.startsWith('resource:')) return sourceHref.trim()
  if (viewMode === 'full') return base
  return formatResourceHrefPage(base, startPage, endPage)
}

export function parseResourceLocator(href: string | null | undefined): {
  itemId: string
  excerptId?: string
  chapterId?: string
} | null {
  if (!href) return null
  const trimmed = stripHrefFragment(href)
  if (!trimmed.startsWith('resource:')) return null
  const parts = trimmed.slice('resource:'.length).split(':')
  const itemId = parts[0]?.trim()
  if (!itemId) return null
  if (parts[1] === 'excerpt' && parts[2]) {
    return { itemId, excerptId: parts[2].split('#')[0] }
  }
  if (parts[1] === 'chapter' && parts[2]) {
    return { itemId, chapterId: parts[2].split('#')[0] }
  }
  return { itemId }
}

export function resolveResourceItemHref(item: Pick<ResourceItem, 'id' | 'sourceUrl' | 'identityValue'>): string {
  if (isHttpHref(item.sourceUrl)) return item.sourceUrl!.trim()
  if (isHttpHref(item.identityValue)) return item.identityValue!.trim()
  return `resource:${item.id}`
}

export function resourceItemSearchText(item: Pick<ResourceItem, 'title' | 'typeName' | 'workTitle' | 'identityValue' | 'sourceUrl'>): string {
  return [
    item.title,
    item.typeName,
    item.workTitle,
    item.identityValue,
    item.sourceUrl,
  ].filter(Boolean).join(' ')
}

export function formatHeadingSuggestLabel(pageTitle: string, headingText: string): string {
  return `${pageTitle} ${HEADING_SEP} ${headingText}`
}

export function formatResourceChildSuggestLabel(resourceTitle: string, ...pathTitles: string[]): string {
  return [resourceTitle, ...pathTitles.map((title) => title.trim()).filter(Boolean)]
    .join(` ${HEADING_SEP} `)
}

export function pageLocator(pageId: string): string {
  return `page:${pageId}`
}

export function headingLocator(pageId: string, sourceBlockId: string): string {
  return `page:${pageId}:heading:${sourceBlockId}`
}

export function resourceChapterLocator(itemId: string, chapterId: string): string {
  return `resource:${itemId}:chapter:${chapterId}`
}

export function resourceExcerptLocator(itemId: string, excerptId: string): string {
  return `resource:${itemId}:excerpt:${excerptId}`
}
