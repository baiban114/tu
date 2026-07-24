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

/** PDF-style page start/end attached via `-N` / `-N-M` in link label search. */
export interface LinkLabelPageRange {
  pageStart: number
  pageEnd: number
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
  /**
   * Optional PDF-style page range from `-12` / `-12-20`, or a final `>` segment that is only digits.
   * Written onto resource locators as `#page=…` when selecting a suggest.
   */
  pageRange: LinkLabelPageRange | null
}

export const HEADING_SEP = '>'

/** Trailing `-12` or `-12-20` (same start–end meaning as PDF `#page=`). */
const PAGE_RANGE_SUFFIX_RE = /-(\d+)(?:-(\d+))?$/
/** Entire segment is a page or page range (e.g. last part of `王道>12-20`). */
const PAGE_RANGE_SEGMENT_RE = /^(\d+)(?:-(\d+))?$/

function normalizeLinkLabelPageRange(
  startRaw: string,
  endRaw?: string,
): LinkLabelPageRange | null {
  const pageStart = Math.floor(Number(startRaw))
  const pageEnd = endRaw == null ? pageStart : Math.floor(Number(endRaw))
  if (!Number.isFinite(pageStart) || pageStart < 1) return null
  if (!Number.isFinite(pageEnd) || pageEnd < pageStart) return null
  return { pageStart, pageEnd }
}

function formatLinkLabelPageRangeText(range: LinkLabelPageRange): string {
  return range.pageStart === range.pageEnd
    ? String(range.pageStart)
    : `${range.pageStart}-${range.pageEnd}`
}

/**
 * Strip PDF-style page start/end from a link-label query.
 * - `王道>12-20` / `王道>第1章>12` → last `>` segment is only digits → range; remaining path browses that scope
 * - `王道-12` / `王道>第1章-3-5` → trailing `-N` / `-N-M` suffix
 */
export function extractLinkLabelPageRange(raw: string): {
  text: string
  pageRange: LinkLabelPageRange | null
  /** True when the page came from a dedicated final `>` segment (force browse at remaining path). */
  pageSegmentDrilled: boolean
} {
  const text = raw.replace(/^\uFEFF/, '')
  if (!text) return { text: '', pageRange: null, pageSegmentDrilled: false }

  if (text.includes(HEADING_SEP)) {
    const parts = text.split(HEADING_SEP)
    const lastIdx = parts.length - 1
    const last = (parts[lastIdx] ?? '').trim()
    const segmentMatch = last.match(PAGE_RANGE_SEGMENT_RE)
    if (segmentMatch) {
      const pageRange = normalizeLinkLabelPageRange(segmentMatch[1]!, segmentMatch[2])
      if (pageRange) {
        const rest = parts.slice(0, lastIdx).join(HEADING_SEP)
        return { text: rest, pageRange, pageSegmentDrilled: true }
      }
    }
  }

  const suffixMatch = text.match(PAGE_RANGE_SUFFIX_RE)
  if (!suffixMatch || suffixMatch.index == null) {
    return { text, pageRange: null, pageSegmentDrilled: false }
  }
  const pageRange = normalizeLinkLabelPageRange(suffixMatch[1]!, suffixMatch[2])
  if (!pageRange) return { text, pageRange: null, pageSegmentDrilled: false }
  // Require some non-empty label before the page suffix (bare `-12` is not a search query).
  const before = text.slice(0, suffixMatch.index).trimEnd()
  if (!before) return { text, pageRange: null, pageSegmentDrilled: false }
  return { text: before, pageRange, pageSegmentDrilled: false }
}

export function parseLinkLabelQuery(raw: string): ParsedLinkLabelQuery {
  const extracted = extractLinkLabelPageRange(raw)
  let text = extracted.text
  // `王道>第1章>12` → remaining `王道>第1章` should browse under 第1章 (as if ended with `>`).
  if (extracted.pageSegmentDrilled && text.includes(HEADING_SEP) && !text.trimEnd().endsWith(HEADING_SEP)) {
    text = `${text.trimEnd()}${HEADING_SEP}`
  }

  if (!text.includes(HEADING_SEP)) {
    return {
      pageQuery: text.trim(),
      pathSegments: [],
      childQuery: extracted.pageSegmentDrilled ? '' : null,
      headingQuery: extracted.pageSegmentDrilled ? '' : null,
      drilled: extracted.pageSegmentDrilled,
      pageRange: extracted.pageRange,
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
    pageRange: extracted.pageRange,
  }
}

/** Append `-N` / `-N-M` to a readable applyLabel (mirrors search grammar). */
export function formatLinkLabelWithPageRange(
  label: string,
  pageRange: LinkLabelPageRange | null | undefined,
): string {
  if (!pageRange) return label
  return `${label}-${formatLinkLabelPageRangeText(pageRange)}`
}

export function linkLabelPageRangeText(pageRange: LinkLabelPageRange): string {
  return formatLinkLabelPageRangeText(pageRange)
}

/** Attach `#page=` (and optional clip-less range) to a suggest href when pageRange is set. */
export function applyPageRangeToHref(
  href: string,
  pageRange: LinkLabelPageRange | null | undefined,
): string {
  if (!pageRange) return href
  const trimmed = href.trim()
  if (!trimmed) return href
  return formatResourceHrefPage(trimmed, pageRange.pageStart, pageRange.pageEnd)
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
