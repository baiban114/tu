import type { PageItem } from '@/api/types'
import type { ResourceChapter, ResourceExcerpt, ResourceItem } from '@/api/externalResource'
import { searchHeadings, searchPages } from '@/api/search'
import type { ContentTreeNode } from '@/api/outline'
import { MAX_PAGE_SIZE } from '@/constants/pagination'
import {
  browseChildren,
  collectSubtreeIds,
  deepSearchInSubtree,
  indexNodesByParent,
  matchNodeAtLevel,
  resolveScopeParent,
  type ScopeTreeNode,
} from '@/editor/hierarchicalScopeSearch'
import {
  formatHeadingSuggestLabel,
  formatLinkLabelWithPageRange,
  formatResourceChildSuggestLabel,
  applyPageRangeToHref,
  headingLocator,
  isHttpHref,
  linkLabelPageRangeText,
  pageLocator,
  parseLinkLabelQuery,
  parseResourceLocator,
  resolveResourceItemHref,
  resourceChapterLocator,
  resourceExcerptLocator,
  resourceHrefPageLimitText,
  resourceItemSearchText,
  type LinkLabelPageRange,
  type LinkSuggestItem,
} from '@/editor/linkLabelSuggestQuery'

export type {
  LinkSuggestItem,
  LinkSuggestKind,
  ParsedLinkLabelQuery,
} from '@/editor/linkLabelSuggestQuery'

export {
  parseLinkLabelQuery,
  parseResourceLocator,
  splitResourceHref,
  formatResourceHrefPage,
  syncResourceHrefWithPdfPages,
  resourceHrefPageLimitText,
  stripHrefFragment,
  isInternalLocatorHref,
  isHttpHref,
  resolveResourceItemHref,
  resourceItemSearchText,
  resourceChapterLocator,
  resourceExcerptLocator,
  extractLinkLabelPageRange,
  formatLinkLabelWithPageRange,
  applyPageRangeToHref,
} from '@/editor/linkLabelSuggestQuery'

export { applyLinkSuggest } from '@/editor/linkLabelSuggestApply'
export type { LinkLabelEditContext } from '@/editor/linkLabelSuggestRanges'

export {
  browseChildren,
  deepSearchInSubtree,
  matchRank,
  resolveScopeParent,
} from '@/editor/hierarchicalScopeSearch'

type ChapterScopeNode = ResourceChapter & ScopeTreeNode

function toChapterScopeNodes(chapters: ResourceChapter[]): ChapterScopeNode[] {
  return chapters.map((chapter) => ({
    ...chapter,
    parentId: chapter.parentId ?? null,
  }))
}

/** Direct children grouped by parentId (null = root). */
export function indexChaptersByParent(chapters: ResourceChapter[]): Map<string | null, ResourceChapter[]> {
  return indexNodesByParent(toChapterScopeNodes(chapters))
}

export function matchChapterAtLevel(
  siblings: ResourceChapter[],
  segment: string,
): ResourceChapter | null {
  return matchNodeAtLevel(toChapterScopeNodes(siblings), segment)
}

export function resolveChapterDrillParent(
  chapters: ResourceChapter[],
  pathSegments: string[],
): { parentId: string | null; resolvedPath: string[] } | null {
  return resolveScopeParent(toChapterScopeNodes(chapters), pathSegments)
}

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
    label: headingText,
    applyLabel: formatHeadingSuggestLabel(pageTitle, headingText),
    href,
    description: pageTitle,
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

function withPageRange(
  item: LinkSuggestItem,
  pageRange: LinkLabelPageRange | null | undefined,
): LinkSuggestItem {
  if (!pageRange) return item
  const href = applyPageRangeToHref(item.href, pageRange)
  if (href === item.href) return item
  const pageText = linkLabelPageRangeText(pageRange)
  return {
    ...item,
    id: `${item.id}#page=${pageText}`,
    href,
    applyLabel: formatLinkLabelWithPageRange(item.applyLabel ?? item.label, pageRange),
    description: resourceHrefPageLimitText(href) || item.description,
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

function relativeBreadcrumb(pathFromScope: string[]): string {
  return pathFromScope.join(' > ')
}

function toResourceChapterHitSuggest(
  item: ResourceItem,
  hit: { node: ChapterScopeNode; pathFromRoot: string[]; pathFromScope: string[] },
): LinkSuggestItem {
  const href = resourceChapterLocator(item.id, hit.node.id)
  return {
    id: href,
    kind: 'resourceChapter',
    label: hit.node.title,
    applyLabel: formatResourceChildSuggestLabel(item.title, ...hit.pathFromRoot),
    href,
    description: relativeBreadcrumb(hit.pathFromScope),
  }
}

function toResourceExcerptHitSuggest(
  item: ResourceItem,
  excerpt: ResourceExcerpt,
  pathFromRoot: string[],
  pathFromScope: string[],
): LinkSuggestItem {
  const href = resourceExcerptLocator(item.id, excerpt.id)
  const title = (excerpt.title || '').trim()
  return {
    id: href,
    kind: 'resourceExcerpt',
    label: title,
    applyLabel: formatResourceChildSuggestLabel(item.title, ...pathFromRoot),
    href,
    description: relativeBreadcrumb(pathFromScope),
  }
}

function matchesExcerptQuery(excerpt: ResourceExcerpt, query: string): boolean {
  const title = (excerpt.title || '').trim()
  if (!title) return false
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const haystack = [excerpt.chapterTitle, title].filter(Boolean).join(' ').toLowerCase()
  return title.toLowerCase().includes(needle) || haystack.includes(needle)
}

export interface FetchLinkSuggestOptions {
  kbId: string | null
  pageTree: PageItem[]
  ensurePageOutline: (pageId: string) => Promise<ContentTreeNode[]>
  /** Current markdown link href when editing a complete `[label](href)`. */
  currentHref?: string | null
  limit?: number
}

async function resolveResourcesForDrill(
  pageQuery: string,
  currentHref: string | null | undefined,
  limit: number,
): Promise<ResourceItem[]> {
  const { getResourceItem, listResourceItems } = await import('@/api/externalResource')
  const pinned = parseResourceLocator(currentHref)
  if (pinned?.itemId) {
    try {
      return [await getResourceItem(pinned.itemId)]
    } catch {
      // fall through to title / url search
    }
  }

  try {
    const result = await listResourceItems({ page: 0, pageSize: MAX_PAGE_SIZE })
    if (isHttpHref(currentHref)) {
      const href = currentHref!.trim()
      const byUrl = result.items.filter((item) => (
        item.sourceUrl?.trim() === href || item.identityValue?.trim() === href
      ))
      if (byUrl.length > 0) return byUrl.slice(0, limit)
    }

    const needle = pageQuery.trim().toLowerCase()
    if (!needle) return []
    return result.items
      .filter((item) => resourceItemSearchText(item).toLowerCase().includes(needle))
      .slice(0, limit)
  } catch {
    return []
  }
}

/**
 * Collect resource chapter/excerpt suggests under a drill scope.
 * Empty childQuery → Browse (direct children); non-empty → DeepSearch in subtree.
 * Optional pageRange attaches `#page=` (PDF-style start–end) to resource locators.
 */
export function collectResourceScopeSuggests(
  item: ResourceItem,
  chapters: ResourceChapter[],
  excerpts: ResourceExcerpt[],
  pathSegments: string[],
  childQuery: string,
  limit: number,
  pageRange: LinkLabelPageRange | null = null,
): LinkSuggestItem[] {
  const scopeNodes = toChapterScopeNodes(chapters)
  const resolved = resolveScopeParent(scopeNodes, pathSegments)
  if (!resolved) return []

  const { parentId, resolvedPath } = resolved
  const browsing = !childQuery.trim()
  const items: LinkSuggestItem[] = []

  // With an explicit page range and empty filter, prefer the current scope target itself.
  if (pageRange && browsing) {
    if (parentId) {
      const chapter = scopeNodes.find((node) => node.id === parentId)
      if (chapter) {
        items.push(withPageRange(toResourceChapterHitSuggest(item, {
          node: chapter,
          pathFromRoot: resolvedPath,
          pathFromScope: resolvedPath.slice(-1),
        }), pageRange))
      }
    } else {
      items.push(withPageRange(toResourceSuggest(item), pageRange))
    }
    if (items.length >= limit) return items
  }

  const chapterHits = browsing
    ? browseChildren(scopeNodes, parentId, resolvedPath)
    : deepSearchInSubtree(scopeNodes, parentId, childQuery, resolvedPath)

  for (const hit of chapterHits) {
    items.push(withPageRange(toResourceChapterHitSuggest(item, hit), pageRange))
    if (items.length >= limit) return items
  }

  const subtreeChapterIds = browsing
    ? new Set<string | null>([parentId])
    : collectSubtreeIds(scopeNodes, parentId)

  for (const excerpt of excerpts) {
    const title = (excerpt.title || '').trim()
    if (!title) continue
    const excerptChapterId = excerpt.chapterId ?? null
    if (!subtreeChapterIds.has(excerptChapterId)) continue
    if (browsing && excerpt.parentId) continue
    if (!matchesExcerptQuery(excerpt, browsing ? '' : childQuery)) continue

    const pathFromRoot = [...resolvedPath, title]
    const pathFromScope = [title]
    items.push(withPageRange(
      toResourceExcerptHitSuggest(item, excerpt, pathFromRoot, pathFromScope),
      pageRange,
    ))
    if (items.length >= limit) return items
  }

  return items
}

async function collectResourceChildSuggests(
  item: ResourceItem,
  pathSegments: string[],
  childQuery: string,
  limit: number,
  pageRange: LinkLabelPageRange | null = null,
): Promise<LinkSuggestItem[]> {
  const { listResourceChapters, listResourceExcerpts } = await import('@/api/externalResource')
  let chapters: ResourceChapter[] = []
  try {
    chapters = await listResourceChapters(item.id)
  } catch {
    if (pathSegments.length > 0) return []
  }

  let excerpts: ResourceExcerpt[] = []
  try {
    const page = await listResourceExcerpts(item.id, { page: 0, pageSize: MAX_PAGE_SIZE })
    excerpts = page.items
  } catch {
    // ignore excerpt load failures
  }

  const items = collectResourceScopeSuggests(
    item,
    chapters,
    excerpts,
    pathSegments,
    childQuery,
    limit,
    pageRange,
  )
  if (items.length > 0) return items
  // No chapters/excerpts (or empty browse): still allow resource + page range.
  if (pageRange && pathSegments.length === 0 && !childQuery.trim()) {
    return [withPageRange(toResourceSuggest(item), pageRange)].slice(0, limit)
  }
  return items
}

async function collectPageHeadingSuggests(
  matchedPages: PageItem[],
  headingQuery: string,
  options: FetchLinkSuggestOptions,
  limit: number,
): Promise<LinkSuggestItem[]> {
  if (matchedPages.length === 0) return []

  const pageIds = new Set(matchedPages.map((page) => page.id))
  const pageTitleById = new Map(matchedPages.map((page) => [page.id, page.title]))

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
  for (const page of matchedPages.slice(0, 5)) {
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

export async function fetchLinkSuggestItems(
  rawQuery: string,
  options: FetchLinkSuggestOptions,
): Promise<LinkSuggestItem[]> {
  const { listResourceItems } = await import('@/api/externalResource')
  const parsed = parseLinkLabelQuery(rawQuery)
  if (!parsed.pageQuery && !parsed.drilled) return []
  // Allow `>` drill when current href already pins a resource, even if label before `>` is empty.
  if (parsed.drilled && !parsed.pageQuery && !parseResourceLocator(options.currentHref)) return []

  const limit = options.limit ?? 20
  const pages = flattenPages(options.pageTree)
  const matchedPages = parsed.pageQuery
    ? filterPagesByTitle(pages, parsed.pageQuery, limit)
    : []

  if (parsed.drilled) {
    const headingQuery = parsed.headingQuery ?? ''
    const childQuery = parsed.childQuery ?? ''
    // Page ranges target resource/PDF locators; skip document heading suggests.
    const pageItems = parsed.pageRange
      ? []
      : await collectPageHeadingSuggests(matchedPages, headingQuery, options, limit)
    const remaining = Math.max(0, limit - pageItems.length)
    if (remaining === 0) return pageItems

    const resources = await resolveResourcesForDrill(parsed.pageQuery, options.currentHref, 5)
    const resourceItems: LinkSuggestItem[] = []
    for (const item of resources) {
      const children = await collectResourceChildSuggests(
        item,
        parsed.pathSegments,
        childQuery,
        remaining - resourceItems.length,
        parsed.pageRange,
      )
      resourceItems.push(...children)
      if (resourceItems.length >= remaining) break
    }
    return [...pageItems, ...resourceItems].slice(0, limit)
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
      .map((item) => withPageRange(toResourceSuggest(item), parsed.pageRange))
  } catch {
    resourceItems = []
  }

  return [...pageItems, ...resourceItems].slice(0, limit)
}
