export const PDF_EXCERPT_COMMENT_RE = /<!--tu:pdf-excerpt\s+([^>]+)-->/
export const PDF_EXCERPT_DEFAULT_HEIGHT = 480
export const PDF_EXCERPT_MIN_HEIGHT = 160
export const PDF_EXCERPT_MAX_HEIGHT = 2000
export const PDF_EXCERPT_LARGE_DOC_PAGES = 300
export const PDF_EXCERPT_ZOOM_MIN = 0.5
export const PDF_EXCERPT_ZOOM_MAX = 3
export const PDF_EXCERPT_ZOOM_STEP = 0.1
export const PDF_EXCERPT_SIDEBAR_DEFAULT_WIDTH = 200
export const PDF_EXCERPT_SIDEBAR_MIN_WIDTH = 160
export const PDF_EXCERPT_SIDEBAR_MAX_WIDTH = 480

export type PdfExcerptViewMode = 'excerpt' | 'full'

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;')
}

function parseAttrString(attrsStr: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([\w-]+)="([^"]*)"/g
  let match: RegExpExecArray | null
  while ((match = re.exec(attrsStr)) !== null) {
    attrs[match[1]] = match[2]
  }
  return attrs
}

export function createPdfExcerptBlockId(): string {
  return `pe-${crypto.randomUUID().replace(/-/g, '')}`
}

export function parsePdfExcerptViewMode(raw: string | undefined | null): PdfExcerptViewMode {
  return raw === 'full' ? 'full' : 'excerpt'
}

/**
 * Clamp vertical page clip ratios to 0–1.
 * Top/bottom are independent (multi-page: top on first page, bottom on last).
 * Near-full 0–1 collapses to exact defaults for cleaner persistence.
 */
export function normalizePdfClipRatio(
  clipTop: number,
  clipBottom: number,
): { clipTop: number; clipBottom: number } {
  const rawTop = Number(clipTop)
  const rawBottom = Number(clipBottom)
  const top = Number.isFinite(rawTop) ? Math.min(1, Math.max(0, rawTop)) : 0
  const bottom = Number.isFinite(rawBottom) ? Math.min(1, Math.max(0, rawBottom)) : 1
  if (top <= 0.001 && bottom >= 0.999) return { clipTop: 0, clipBottom: 1 }
  return {
    clipTop: Math.round(top * 1000) / 1000,
    clipBottom: Math.round(bottom * 1000) / 1000,
  }
}

export function isPdfClipActive(clipTop: number, clipBottom: number): boolean {
  const normalized = normalizePdfClipRatio(clipTop, clipBottom)
  return normalized.clipTop > 0.001 || normalized.clipBottom < 0.999
}

/**
 * Per-page vertical clip: first page uses clipTop, last page uses clipBottom,
 * middle pages stay full. Single-page excerpt applies both (requires top < bottom).
 */
export function resolvePdfPageVerticalClip(
  pageNumber: number,
  rangeStart: number,
  rangeEnd: number,
  clipTop: number,
  clipBottom: number,
): { clipTop: number; clipBottom: number } | null {
  if (pageNumber < rangeStart || pageNumber > rangeEnd) return null
  const normalized = normalizePdfClipRatio(clipTop, clipBottom)
  if (!isPdfClipActive(normalized.clipTop, normalized.clipBottom)) return null

  let top = 0
  let bottom = 1
  if (pageNumber === rangeStart) top = normalized.clipTop
  if (pageNumber === rangeEnd) bottom = normalized.clipBottom
  if (bottom - top < 0.01) return null
  if (top <= 0.001 && bottom >= 0.999) return null
  return { clipTop: top, clipBottom: bottom }
}

export interface PdfPageVerticalHit {
  pageNumber: number
  /** 0–1 within the page canvas host. */
  ratio: number
}

/**
 * Turn two vertical hits (drag start/end) into excerpt page range + clip ratios.
 * Hits are ordered top→bottom regardless of drag direction.
 * Same page: clipTop < clipBottom on that page.
 * Multi-page: clipTop is on the first page, clipBottom on the last (independent).
 */
export function clipAttrsFromVerticalHits(
  a: PdfPageVerticalHit,
  b: PdfPageVerticalHit,
): { startPage: number; endPage: number; clipTop: number; clipBottom: number } {
  const aFirst = a.pageNumber < b.pageNumber
    || (a.pageNumber === b.pageNumber && a.ratio <= b.ratio)
  const top = aFirst ? a : b
  const bottom = aFirst ? b : a
  if (top.pageNumber === bottom.pageNumber) {
    const ordered = normalizePdfClipRatio(
      Math.min(top.ratio, bottom.ratio),
      Math.max(top.ratio, bottom.ratio),
    )
    // Same page still needs a usable band
    if (ordered.clipBottom - ordered.clipTop < 0.01) {
      return { startPage: top.pageNumber, endPage: bottom.pageNumber, clipTop: 0, clipBottom: 1 }
    }
    return {
      startPage: top.pageNumber,
      endPage: bottom.pageNumber,
      ...ordered,
    }
  }
  const clipTop = Math.min(1, Math.max(0, Math.round(top.ratio * 1000) / 1000))
  const clipBottom = Math.min(1, Math.max(0, Math.round(bottom.ratio * 1000) / 1000))
  return {
    startPage: top.pageNumber,
    endPage: bottom.pageNumber,
    clipTop,
    clipBottom,
  }
}

/** Custom event on PDF block root: enter vertical clip marquee mode. */
export const PDF_EXCERPT_CLIP_SELECT_EVENT = 'tu:pdf-excerpt-clip-select'

export interface PdfExcerptAttrs {
  blockId: string
  fileId: string
  fileName: string
  viewMode: PdfExcerptViewMode
  startPage: number
  endPage: number
  height: number
  /** Vertical start ratio on the first page (0–1). Default 0. */
  clipTop: number
  /** Vertical end ratio on the last page (0–1). Default 1. */
  clipBottom: number
  /** Original link href (`resource:…` / http) for presentation round-trip. */
  sourceHref?: string
  /** Original link label for restoring inline link text. */
  sourceLabel?: string
}

export function parsePdfExcerptComment(attrsStr: string): PdfExcerptAttrs | null {
  const attrs = parseAttrString(attrsStr)
  const blockId = attrs.id
  const fileId = attrs.fileId
  if (!blockId || !fileId) return null
  const startPage = Math.max(1, Number(attrs.start) || 1)
  const endPage = Math.max(startPage, Number(attrs.end) || startPage)
  const height = Number(attrs.height) || PDF_EXCERPT_DEFAULT_HEIGHT
  const clip = normalizePdfClipRatio(
    attrs.clipTop != null ? Number(attrs.clipTop) : 0,
    attrs.clipBottom != null ? Number(attrs.clipBottom) : 1,
  )
  return {
    blockId,
    fileId,
    fileName: attrs.fileName || '',
    viewMode: parsePdfExcerptViewMode(attrs.mode),
    startPage,
    endPage,
    height: Number.isFinite(height) && height > 0 ? height : PDF_EXCERPT_DEFAULT_HEIGHT,
    clipTop: clip.clipTop,
    clipBottom: clip.clipBottom,
    sourceHref: attrs.sourceHref || undefined,
    sourceLabel: attrs.sourceLabel || undefined,
  }
}

export function serializePdfExcerptComment(attrs: PdfExcerptAttrs): string {
  const modeAttr = attrs.viewMode === 'full' ? ` mode="full"` : ''
  const clip = normalizePdfClipRatio(attrs.clipTop ?? 0, attrs.clipBottom ?? 1)
  const clipAttr = isPdfClipActive(clip.clipTop, clip.clipBottom)
    ? ` clipTop="${clip.clipTop}" clipBottom="${clip.clipBottom}"`
    : ''
  const sourceHrefAttr = attrs.sourceHref
    ? ` sourceHref="${escapeAttr(attrs.sourceHref)}"`
    : ''
  const sourceLabelAttr = attrs.sourceLabel
    ? ` sourceLabel="${escapeAttr(attrs.sourceLabel)}"`
    : ''
  return `<!--tu:pdf-excerpt id="${escapeAttr(attrs.blockId)}" fileId="${escapeAttr(attrs.fileId)}" fileName="${escapeAttr(attrs.fileName)}" start="${attrs.startPage}" end="${attrs.endPage}" height="${attrs.height}"${modeAttr}${clipAttr}${sourceHrefAttr}${sourceLabelAttr}-->`
}

export function normalizePdfPageRange(
  startPage: number,
  endPage: number,
  totalPages: number,
): { startPage: number; endPage: number } {
  const safeTotal = Math.max(1, totalPages)
  const start = Math.min(Math.max(1, Math.floor(startPage)), safeTotal)
  const end = Math.min(Math.max(start, Math.floor(endPage)), safeTotal)
  return { startPage: start, endPage: end }
}

export function resolvePageRange(
  viewMode: PdfExcerptViewMode,
  startPage: number,
  endPage: number,
  totalPages: number,
): { startPage: number; endPage: number } {
  if (viewMode === 'full') {
    const safeTotal = Math.max(1, totalPages)
    return { startPage: 1, endPage: safeTotal }
  }
  return normalizePdfPageRange(startPage, endPage, totalPages)
}

export function formatPdfExcerptRangeLabel(
  startPage: number,
  endPage: number,
  clipTop = 0,
  clipBottom = 1,
): string {
  const start = Math.max(1, Math.floor(startPage) || 1)
  const end = Math.max(start, Math.floor(endPage) || start)
  const clip = normalizePdfClipRatio(clipTop, clipBottom)
  const topPct = Math.round(clip.clipTop * 100)
  const bottomPct = Math.round(clip.clipBottom * 100)
  const clipped = isPdfClipActive(clip.clipTop, clip.clipBottom)

  if (start === end) {
    if (!clipped) return `第 ${start} 页`
    return `第 ${start} 页 ${topPct}%–${bottomPct}%`
  }
  if (!clipped) return `第 ${start}–${end} 页`
  // Cross-page: clipTop on first page, clipBottom on last page
  return `第 ${start} 页 ${topPct}% → 第 ${end} 页 ${bottomPct}%`
}

export function formatPdfExcerptMetaLabel(
  fileName: string,
  viewMode: PdfExcerptViewMode,
  startPage: number,
  endPage: number,
  clipTop = 0,
  clipBottom = 1,
): string {
  const name = fileName || 'PDF'
  if (viewMode === 'full') {
    return `${name} · 全文`
  }
  return `${name} · ${formatPdfExcerptRangeLabel(startPage, endPage, clipTop, clipBottom)}`
}

/** Custom event: scroll PDF excerpt block to a page (detail: { pageNumber: number }). */
export const PDF_EXCERPT_SCROLL_EVENT = 'tu:pdf-excerpt-scroll'

export function formatBlockLocator(pageId: string, blockId: string): string {
  return `page:${pageId}:block:${blockId}`
}

export function formatPdfExcerptLocator(
  pageId: string,
  blockId: string,
  pdfPage?: number,
): string {
  const base = formatBlockLocator(pageId, blockId)
  if (pdfPage != null && Number.isFinite(pdfPage) && pdfPage > 0) {
    return `${base}:pdfPage:${Math.floor(pdfPage)}`
  }
  return base
}

export function parsePdfExcerptLocator(locator: string): {
  pageId: string
  blockId: string
  pdfPage?: number
} | null {
  if (!locator.startsWith('page:')) return null
  const parts = locator.slice(5).split(':')
  if (parts.length < 3 || parts[1] !== 'block') return null
  const pageId = parts[0]
  const blockId = parts[2]
  if (!pageId || !blockId) return null
  let pdfPage: number | undefined
  if (parts[3] === 'pdfPage' && parts[4]) {
    const parsed = Number(parts[4])
    if (Number.isFinite(parsed) && parsed > 0) pdfPage = parsed
  }
  return { pageId, blockId, pdfPage }
}
