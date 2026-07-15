const BOOK_RESOURCE_TYPE_CODE = 'book'
const WEB_LINK_RESOURCE_TYPE_CODE = 'web-link'
const DOCUMENT_RESOURCE_TYPE_CODE = 'document'
export type ResourcePositionKind = 'anchor' | 'page' | 'pageRange' | 'paragraph' | 'legacy'

export interface ResourcePositionLocator {
  kind: ResourcePositionKind
  anchor?: string
  page?: number
  endPage?: number
  paragraph?: number
  legacy?: string
}

const ANCHOR_PREFIX = 'anchor:'
const PAGE_PREFIX = 'page:'
const PARAGRAPH_PREFIX = 'paragraph:'

export function defaultPositionKindForResourceType(typeCode?: string | null): ResourcePositionKind {
  if (typeCode === WEB_LINK_RESOURCE_TYPE_CODE) return 'anchor'
  if (typeCode === BOOK_RESOURCE_TYPE_CODE || typeCode === DOCUMENT_RESOURCE_TYPE_CODE) return 'page'
  return 'page'
}

export function positionKindsForResourceType(typeCode?: string | null): ResourcePositionKind[] {
  if (typeCode === WEB_LINK_RESOURCE_TYPE_CODE) {
    return ['anchor', 'paragraph', 'page', 'pageRange']
  }
  return ['page', 'pageRange', 'paragraph', 'anchor']
}

export function positionKindLabel(kind: ResourcePositionKind): string {
  switch (kind) {
    case 'anchor': return '锚点'
    case 'page': return '页码'
    case 'pageRange': return '页码范围'
    case 'paragraph': return '段落'
    default: return '自定义'
  }
}

function parseLegacyPage(value: string): { page?: number; endPage?: number } | null {
  const range = value.match(/^p\.?\s*(\d+)\s*[–—-]\s*p?\.?\s*(\d+)$/i)
  if (range) {
    const start = Number(range[1])
    const end = Number(range[2])
    if (Number.isFinite(start) && Number.isFinite(end) && start > 0 && end >= start) {
      return { page: start, endPage: end }
    }
  }
  const single = value.match(/^p\.?\s*(\d+)$/i)
  if (single) {
    const page = Number(single[1])
    if (Number.isFinite(page) && page > 0) return { page }
  }
  return null
}

export function parseResourcePositionLocator(raw: string | null | undefined): ResourcePositionLocator | null {
  const value = raw?.trim()
  if (!value) return null

  if (value.startsWith(ANCHOR_PREFIX)) {
    const anchor = value.slice(ANCHOR_PREFIX.length).trim()
    return anchor ? { kind: 'anchor', anchor } : null
  }

  if (value.startsWith(PAGE_PREFIX)) {
    const body = value.slice(PAGE_PREFIX.length).trim()
    const range = body.match(/^(\d+)-(\d+)$/)
    if (range) {
      const page = Number(range[1])
      const endPage = Number(range[2])
      if (Number.isFinite(page) && Number.isFinite(endPage) && page > 0 && endPage >= page) {
        return { kind: 'pageRange', page, endPage }
      }
      return null
    }
    const page = Number(body)
    if (Number.isFinite(page) && page > 0) return { kind: 'page', page }
    return null
  }

  if (value.startsWith(PARAGRAPH_PREFIX)) {
    const paragraph = Number(value.slice(PARAGRAPH_PREFIX.length).trim())
    if (Number.isFinite(paragraph) && paragraph > 0) return { kind: 'paragraph', paragraph }
    return null
  }

  if (value.startsWith('#')) {
    const anchor = value.slice(1).trim()
    return anchor ? { kind: 'anchor', anchor } : null
  }

  const legacyPage = parseLegacyPage(value)
  if (legacyPage?.page != null) {
    if (legacyPage.endPage != null) {
      return { kind: 'pageRange', page: legacyPage.page, endPage: legacyPage.endPage }
    }
    return { kind: 'page', page: legacyPage.page }
  }

  return { kind: 'legacy', legacy: value }
}

export function formatResourcePositionLocator(locator: ResourcePositionLocator): string {
  switch (locator.kind) {
    case 'anchor': {
      const anchor = locator.anchor?.trim()
      return anchor ? `${ANCHOR_PREFIX}${anchor}` : ''
    }
    case 'page': {
      const page = locator.page
      return page != null && page > 0 ? `${PAGE_PREFIX}${page}` : ''
    }
    case 'pageRange': {
      const page = locator.page
      const endPage = locator.endPage
      if (page != null && endPage != null && page > 0 && endPage >= page) {
        return `${PAGE_PREFIX}${page}-${endPage}`
      }
      return ''
    }
    case 'paragraph': {
      const paragraph = locator.paragraph
      return paragraph != null && paragraph > 0 ? `${PARAGRAPH_PREFIX}${paragraph}` : ''
    }
    case 'legacy':
      return locator.legacy?.trim() || ''
    default:
      return ''
  }
}

/** Coerce legacy / hash forms into canonical resource position locator strings. */
export function normalizeResourcePositionLocator(raw: string | null | undefined): string {
  const value = raw?.trim()
  if (!value) return ''
  const parsed = parseResourcePositionLocator(value)
  if (!parsed) return ''
  if (parsed.kind === 'legacy') return parsed.legacy || ''
  return formatResourcePositionLocator(parsed)
}

export function resourcePositionDisplay(raw: string | null | undefined): string {
  const value = raw?.trim()
  if (!value) return ''
  const parsed = parseResourcePositionLocator(value)
  if (!parsed) return value

  switch (parsed.kind) {
    case 'anchor':
      return parsed.anchor ? `#${parsed.anchor}` : ''
    case 'page':
      return parsed.page != null ? `第 ${parsed.page} 页` : ''
    case 'pageRange':
      return parsed.page != null && parsed.endPage != null
        ? `第 ${parsed.page}–${parsed.endPage} 页`
        : ''
    case 'paragraph':
      return parsed.paragraph != null ? `第 ${parsed.paragraph} 段` : ''
    case 'legacy':
      return parsed.legacy || value
    default:
      return value
  }
}

export function normalizeResourcePositionLocatorKey(raw: string | null | undefined): string {
  const canonical = normalizeResourcePositionLocator(raw)
  if (!canonical) return ''
  const parsed = parseResourcePositionLocator(canonical)
  if (!parsed || parsed.kind === 'legacy') return canonical.toLowerCase()
  return formatResourcePositionLocator(parsed).toLowerCase()
}

export function buildResourcePositionLocator(
  kind: ResourcePositionKind,
  value: string,
): string {
  const trimmed = value.trim()
  if (!trimmed) return ''

  switch (kind) {
    case 'anchor':
      return formatResourcePositionLocator({
        kind: 'anchor',
        anchor: trimmed.replace(/^#/, ''),
      })
    case 'page': {
      const page = Number(trimmed)
      return Number.isFinite(page) && page > 0
        ? formatResourcePositionLocator({ kind: 'page', page })
        : ''
    }
    case 'pageRange': {
      const range = trimmed.match(/^(\d+)\s*[–—-]\s*(\d+)$/)
      if (!range) return ''
      const page = Number(range[1])
      const endPage = Number(range[2])
      if (!Number.isFinite(page) || !Number.isFinite(endPage) || page <= 0 || endPage < page) return ''
      return formatResourcePositionLocator({ kind: 'pageRange', page, endPage })
    }
    case 'paragraph': {
      const paragraph = Number(trimmed)
      return Number.isFinite(paragraph) && paragraph > 0
        ? formatResourcePositionLocator({ kind: 'paragraph', paragraph })
        : ''
    }
    case 'legacy':
      return trimmed
    default:
      return ''
  }
}

export function resourcePositionValuePlaceholder(kind: ResourcePositionKind): string {
  switch (kind) {
    case 'anchor': return 'intro 或 #:~:text=…'
    case 'page': return '18'
    case 'pageRange': return '1-20'
    case 'paragraph': return '3'
    default: return '自定义定位'
  }
}

export function splitResourcePositionLocator(raw: string | null | undefined, typeCode?: string | null): {
  kind: ResourcePositionKind
  value: string
} {
  const parsed = parseResourcePositionLocator(raw)
  if (!parsed) {
    return { kind: defaultPositionKindForResourceType(typeCode), value: '' }
  }
  switch (parsed.kind) {
    case 'anchor':
      return { kind: 'anchor', value: parsed.anchor || '' }
    case 'page':
      return { kind: 'page', value: parsed.page != null ? String(parsed.page) : '' }
    case 'pageRange':
      return {
        kind: 'pageRange',
        value: parsed.page != null && parsed.endPage != null ? `${parsed.page}-${parsed.endPage}` : '',
      }
    case 'paragraph':
      return { kind: 'paragraph', value: parsed.paragraph != null ? String(parsed.paragraph) : '' }
    case 'legacy':
      return { kind: 'legacy', value: parsed.legacy || '' }
    default:
      return { kind: defaultPositionKindForResourceType(typeCode), value: '' }
  }
}
