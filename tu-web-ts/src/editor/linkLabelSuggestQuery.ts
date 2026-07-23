import type { ResourceItem } from '@/api/externalResource'

export type LinkSuggestKind = 'page' | 'heading' | 'resourceItem'

export interface LinkSuggestItem {
  id: string
  kind: LinkSuggestKind
  label: string
  href: string
  description: string
}

export interface ParsedLinkLabelQuery {
  pageQuery: string
  headingQuery: string | null
  drilled: boolean
}

const HEADING_SEP = '>'

export function parseLinkLabelQuery(raw: string): ParsedLinkLabelQuery {
  const text = raw.replace(/^\uFEFF/, '')
  const sep = text.indexOf(HEADING_SEP)
  if (sep < 0) {
    return { pageQuery: text.trim(), headingQuery: null, drilled: false }
  }
  return {
    pageQuery: text.slice(0, sep).trim(),
    headingQuery: text.slice(sep + 1).trim(),
    drilled: true,
  }
}

export function isInternalLocatorHref(href: string): boolean {
  return href.startsWith('page:') || href.startsWith('resource:')
}

export function isHttpHref(value: string | null | undefined): boolean {
  if (!value) return false
  return /^https?:\/\//i.test(value.trim())
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

export function pageLocator(pageId: string): string {
  return `page:${pageId}`
}

export function headingLocator(pageId: string, sourceBlockId: string): string {
  return `page:${pageId}:heading:${sourceBlockId}`
}
