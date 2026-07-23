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
 * Visible `#page=…` / `#page=…&clip=…` suffix for a resource href (collapsed link decoration).
 * Returns null when there is no valid page fragment.
 */
export function resourceHrefPageLimitText(href: string | null | undefined): string | null {
  const split = splitResourceHref(href)
  if (split?.pageStart == null || split.pageEnd == null) return null
  const pagePart = split.pageStart === split.pageEnd
    ? `#page=${split.pageStart}`
    : `#page=${split.pageStart}-${split.pageEnd}`
  if (split.clipTop == null || split.clipBottom == null) return pagePart
  if (!isClipFragmentActive(split.clipTop, split.clipBottom)) return pagePart
  return `${pagePart}&clip=${formatClipFragmentValue(split.clipTop, split.clipBottom)}`
}

export interface ResourceHrefPageRange {
  /** Locator without `#…` fragment. */
  base: string
  pageStart?: number
  pageEnd?: number
  /** Vertical start ratio on first page (0–1). */
  clipTop?: number
  /** Vertical end ratio on last page (0–1). */
  clipBottom?: number
}

const PAGE_PARAM_RE = /^page=(\d+)(?:-(\d+))?$/i
const CLIP_PARAM_RE = /^clip=(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/i

function normalizePageRange(start: number, end?: number): { pageStart: number; pageEnd: number } | null {
  if (!Number.isFinite(start) || start < 1) return null
  const pageStart = Math.floor(start)
  const pageEnd = end == null ? pageStart : Math.floor(end)
  if (!Number.isFinite(pageEnd) || pageEnd < pageStart) return null
  return { pageStart, pageEnd }
}

function clampClipRatio(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, Math.round(value * 1000) / 1000))
}

function isClipFragmentActive(clipTop: number, clipBottom: number): boolean {
  return clipTop > 0.001 || clipBottom < 0.999
}

function formatClipFragmentValue(clipTop: number, clipBottom: number): string {
  const top = clampClipRatio(clipTop)
  const bottom = clampClipRatio(clipBottom)
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(n))
  return `${fmt(top)}-${fmt(bottom)}`
}

function parseClipParam(raw: string): { clipTop: number; clipBottom: number } | null {
  const match = raw.match(CLIP_PARAM_RE)
  if (!match) return null
  const clipTop = clampClipRatio(Number(match[1]))
  const clipBottom = clampClipRatio(Number(match[2]))
  if (!isClipFragmentActive(clipTop, clipBottom) && clipTop === 0 && clipBottom === 1) {
    return { clipTop: 0, clipBottom: 1 }
  }
  // Single-page invalid band (top >= bottom) is still allowed for multi-page independent ends;
  // only reject NaN already handled by clamp.
  return { clipTop, clipBottom }
}

/**
 * Split `resource:…` / `#page=N` / `#page=N-M&clip=T-B` into base + optional page/clip.
 * Invalid page fragments are ignored; unknown keys are ignored.
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
  if (!fragment) return { base }

  // Support both `#page=12` and `#page=12&clip=0.2-0.8` (also legacy bare `#page=…` only).
  const parts = fragment.split('&').map((part) => part.trim()).filter(Boolean)
  let pageStart: number | undefined
  let pageEnd: number | undefined
  let clipTop: number | undefined
  let clipBottom: number | undefined

  for (const part of parts) {
    const pageMatch = part.match(PAGE_PARAM_RE)
    if (pageMatch) {
      const range = normalizePageRange(
        Number(pageMatch[1]),
        pageMatch[2] != null ? Number(pageMatch[2]) : undefined,
      )
      if (range) {
        pageStart = range.pageStart
        pageEnd = range.pageEnd
      }
      continue
    }
    const clip = parseClipParam(part)
    if (clip) {
      clipTop = clip.clipTop
      clipBottom = clip.clipBottom
    }
  }

  const result: ResourceHrefPageRange = { base }
  if (pageStart != null && pageEnd != null) {
    result.pageStart = pageStart
    result.pageEnd = pageEnd
  }
  if (clipTop != null && clipBottom != null && isClipFragmentActive(clipTop, clipBottom)) {
    result.clipTop = clipTop
    result.clipBottom = clipBottom
  }
  return result
}

/**
 * Attach Obsidian-style `#page=` (+ optional `&clip=T-B`) to a resource locator base.
 */
export function formatResourceHrefPage(
  base: string,
  startPage: number,
  endPage?: number,
  clipTop = 0,
  clipBottom = 1,
): string {
  const cleanBase = stripHrefFragment(base)
  const range = normalizePageRange(startPage, endPage)
  if (!range) return cleanBase
  const pagePart = range.pageStart === range.pageEnd
    ? `page=${range.pageStart}`
    : `page=${range.pageStart}-${range.pageEnd}`
  const top = clampClipRatio(clipTop)
  const bottom = clampClipRatio(clipBottom)
  if (isClipFragmentActive(top, bottom)) {
    return `${cleanBase}#${pagePart}&clip=${formatClipFragmentValue(top, bottom)}`
  }
  return `${cleanBase}#${pagePart}`
}

/**
 * Rebuild resource href for PDF↔link sync.
 * Full view drops fragment; excerpt writes `#page=` and optional `&clip=`.
 */
export function syncResourceHrefWithPdfPages(
  sourceHref: string,
  viewMode: 'excerpt' | 'full',
  startPage: number,
  endPage: number,
  clipTop = 0,
  clipBottom = 1,
): string {
  const split = splitResourceHref(sourceHref)
  const base = split?.base || stripHrefFragment(sourceHref)
  if (!base.startsWith('resource:')) return sourceHref.trim()
  if (viewMode === 'full') return base
  return formatResourceHrefPage(base, startPage, endPage, clipTop, clipBottom)
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
