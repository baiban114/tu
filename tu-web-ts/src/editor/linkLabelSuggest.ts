import type { PageItem } from '@/api/types'
import type { ResourceItem } from '@/api/externalResource'
import { searchHeadings, searchPages } from '@/api/search'
import type { ContentTreeNode } from '@/api/outline'
import { MAX_PAGE_SIZE } from '@/constants/pagination'
import {
  formatHeadingSuggestLabel,
  headingLocator,
  pageLocator,
  parseLinkLabelQuery,
  resolveResourceItemHref,
  resourceItemSearchText,
  type LinkSuggestItem,
} from '@/editor/linkLabelSuggestQuery'

export type {
  LinkSuggestItem,
  LinkSuggestKind,
  ParsedLinkLabelQuery,
} from '@/editor/linkLabelSuggestQuery'

export {
  parseLinkLabelQuery,
  isInternalLocatorHref,
  isHttpHref,
  resolveResourceItemHref,
  resourceItemSearchText,
} from '@/editor/linkLabelSuggestQuery'

export { applyLinkSuggest } from '@/editor/linkLabelSuggestApply'
export type { LinkLabelEditContext } from '@/editor/linkLabelSuggestRanges'

function flattenPages(nodes: PageItem[]): PageItem[] {
  const out: PageItem[] = []
  const walk = (list: PageItem[]) => {
    for (const node of list) {
      out.push(node)
      if (node.children?.length) walk(node.children)
    }
  }
  walk(nodes)
  return out
}

function filterPagesByTitle(pages: PageItem[], query: string, limit: number): PageItem[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  return pages
    .filter((page) => page.title.toLowerCase().includes(needle))
    .slice(0, limit)
}

function toPageSuggest(page: PageItem): LinkSuggestItem {
  return {
    id: `page:${page.id}`,
    kind: 'page',
    label: page.title,
    href: pageLocator(page.id),
    description: pageLocator(page.id),
  }
}

function toHeadingSuggest(
  pageId: string,
  pageTitle: string,
  headingText: string,
  sourceBlockId: string,
): LinkSuggestItem {
  const href = headingLocator(pageId, sourceBlockId)
  return {
    id: href,
    kind: 'heading',
    label: formatHeadingSuggestLabel(pageTitle, headingText),
    href,
    description: href,
  }
}

function toResourceSuggest(item: ResourceItem): LinkSuggestItem {
  const href = resolveResourceItemHref(item)
  return {
    id: `resource:${item.id}`,
    kind: 'resourceItem',
    label: item.title,
    href,
    description: href,
  }
}

function flattenOutlineHeadings(nodes: ContentTreeNode[]): ContentTreeNode[] {
  const out: ContentTreeNode[] = []
  const walk = (list: ContentTreeNode[]) => {
    for (const node of list) {
      out.push(node)
      const children = (node as ContentTreeNode & { children?: ContentTreeNode[] }).children
      if (children?.length) walk(children)
    }
  }
  walk(nodes)
  return out
}

export interface FetchLinkSuggestOptions {
  kbId: string | null
  pageTree: PageItem[]
  ensurePageOutline: (pageId: string) => Promise<ContentTreeNode[]>
  limit?: number
}

export async function fetchLinkSuggestItems(
  rawQuery: string,
  options: FetchLinkSuggestOptions,
): Promise<LinkSuggestItem[]> {
  const { listResourceItems } = await import('@/api/externalResource')
  const parsed = parseLinkLabelQuery(rawQuery)
  if (!parsed.pageQuery && !parsed.drilled) return []
  if (parsed.drilled && !parsed.pageQuery) return []

  const limit = options.limit ?? 20
  const pages = flattenPages(options.pageTree)
  const matchedPages = filterPagesByTitle(pages, parsed.pageQuery, limit)

  if (parsed.drilled) {
    const pageHits = matchedPages.length > 0
      ? matchedPages
      : filterPagesByTitle(pages, parsed.pageQuery, limit)
    if (pageHits.length === 0) return []

    const pageIds = new Set(pageHits.map((page) => page.id))
    const pageTitleById = new Map(pageHits.map((page) => [page.id, page.title]))
    const headingQuery = parsed.headingQuery ?? ''

    if (headingQuery) {
      try {
        const response = await searchHeadings(headingQuery, {
          kbId: options.kbId ?? undefined,
          limit: Math.max(limit, 40),
        })
        const items = response.items
          .filter((hit) => pageIds.has(hit.pageId) && hit.sourceBlockId && hit.text)
          .slice(0, limit)
          .map((hit) => toHeadingSuggest(
            hit.pageId,
            hit.pageTitle || pageTitleById.get(hit.pageId) || hit.pageId,
            hit.text,
            hit.sourceBlockId!,
          ))
        if (items.length > 0) return items
      } catch {
        // fall through to outline filter
      }
    }

    const outlineItems: LinkSuggestItem[] = []
    for (const page of pageHits.slice(0, 5)) {
      const nodes = await options.ensurePageOutline(page.id)
      const headings = flattenOutlineHeadings(nodes)
      for (const node of headings) {
        const text = (node.title || '').trim()
        const blockId = node.sourceBlockId
        if (!text || !blockId) continue
        if (headingQuery && !text.toLowerCase().includes(headingQuery.toLowerCase())) continue
        outlineItems.push(toHeadingSuggest(page.id, page.title, text, blockId))
        if (outlineItems.length >= limit) return outlineItems
      }
    }
    return outlineItems
  }

  const pageItems = matchedPages.map(toPageSuggest)

  if (parsed.pageQuery.length >= 2) {
    try {
      const searched = await searchPages(parsed.pageQuery, limit)
      const seen = new Set(pageItems.map((item) => item.id))
      for (const hit of searched.hits) {
        if (options.kbId && hit.kbId && hit.kbId !== options.kbId) continue
        const id = `page:${hit.pageId}`
        if (seen.has(id)) continue
        pageItems.push({
          id,
          kind: 'page',
          label: hit.pageTitle || hit.title,
          href: pageLocator(hit.pageId),
          description: pageLocator(hit.pageId),
        })
        seen.add(id)
        if (pageItems.length >= limit) break
      }
    } catch {
      // keep local page hits
    }
  }

  let resourceItems: LinkSuggestItem[] = []
  try {
    const result = await listResourceItems({ page: 0, pageSize: MAX_PAGE_SIZE })
    const needle = parsed.pageQuery.toLowerCase()
    resourceItems = result.items
      .filter((item) => resourceItemSearchText(item).toLowerCase().includes(needle))
      .slice(0, limit)
      .map(toResourceSuggest)
  } catch {
    resourceItems = []
  }

  return [...pageItems, ...resourceItems].slice(0, limit)
}
