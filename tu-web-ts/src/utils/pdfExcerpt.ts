export const PDF_EXCERPT_COMMENT_RE = /<!--tu:pdf-excerpt\s+([^>]+)-->/
export const PDF_EXCERPT_DEFAULT_HEIGHT = 480
export const PDF_EXCERPT_MIN_HEIGHT = 160
export const PDF_EXCERPT_MAX_HEIGHT = 2000
export const PDF_EXCERPT_LARGE_DOC_PAGES = 300
export const PDF_EXCERPT_ZOOM_MIN = 0.5
export const PDF_EXCERPT_ZOOM_MAX = 3
export const PDF_EXCERPT_ZOOM_STEP = 0.1

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

export interface PdfExcerptAttrs {
  blockId: string
  fileId: string
  fileName: string
  viewMode: PdfExcerptViewMode
  startPage: number
  endPage: number
  height: number
}

export function parsePdfExcerptComment(attrsStr: string): PdfExcerptAttrs | null {
  const attrs = parseAttrString(attrsStr)
  const blockId = attrs.id
  const fileId = attrs.fileId
  if (!blockId || !fileId) return null
  const startPage = Math.max(1, Number(attrs.start) || 1)
  const endPage = Math.max(startPage, Number(attrs.end) || startPage)
  const height = Number(attrs.height) || PDF_EXCERPT_DEFAULT_HEIGHT
  return {
    blockId,
    fileId,
    fileName: attrs.fileName || '',
    viewMode: parsePdfExcerptViewMode(attrs.mode),
    startPage,
    endPage,
    height: Number.isFinite(height) && height > 0 ? height : PDF_EXCERPT_DEFAULT_HEIGHT,
  }
}

export function serializePdfExcerptComment(attrs: PdfExcerptAttrs): string {
  const modeAttr = attrs.viewMode === 'full' ? ` mode="full"` : ''
  return `<!--tu:pdf-excerpt id="${escapeAttr(attrs.blockId)}" fileId="${escapeAttr(attrs.fileId)}" fileName="${escapeAttr(attrs.fileName)}" start="${attrs.startPage}" end="${attrs.endPage}" height="${attrs.height}"${modeAttr}-->`
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

export function formatPdfExcerptMetaLabel(
  fileName: string,
  viewMode: PdfExcerptViewMode,
  startPage: number,
  endPage: number,
): string {
  const name = fileName || 'PDF'
  if (viewMode === 'full') {
    return `${name} · 全文`
  }
  if (startPage === endPage) {
    return `${name} · 第 ${startPage} 页`
  }
  return `${name} · 第 ${startPage}–${endPage} 页`
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
