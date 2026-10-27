import type { PdfDocumentProxy } from './pdfjsSetup'
import type { PdfExcerptViewMode } from './pdfExcerpt'
import type { TreeNode } from './tree'

export type PdfSidebarSource = 'outline' | 'pages' | 'none'

export interface PdfSidebarNode {
  id: string
  title: string
  /** 1-based page number from PDF destination; null if unresolved */
  pageNumber: number | null
  children: PdfSidebarNode[]
  /** Locally edited bookmark, stored on the PDF excerpt block rather than the PDF file. */
  custom?: boolean
}

export interface PdfSidebarTreeMeta {
  pageNumber: number | null
  custom: boolean
}

export interface BuildPdfSidebarOptions {
  viewMode?: PdfExcerptViewMode
  /** Skip flat page list when full document has more pages than this threshold */
  skipPageListOver?: number
  /** Bookmark definitions persisted on the document block. */
  customBookmarks?: PdfCustomBookmark[]
}

export interface PdfCustomBookmark {
  id: string
  title: string
  pageNumber: number
  parentId?: string | null
}

type RawOutlineItem = {
  title?: string
  dest?: string | unknown[] | null
  items?: RawOutlineItem[]
}

function buildPageList(startPage: number, endPage: number): PdfSidebarNode[] {
  const nodes: PdfSidebarNode[] = []
  for (let pageNumber = startPage; pageNumber <= endPage; pageNumber += 1) {
    nodes.push({
      id: `page-${pageNumber}`,
      title: `第 ${pageNumber} 页`,
      pageNumber,
      children: [],
    })
  }
  return nodes
}

export async function resolveDestPageNumber(
  doc: PdfDocumentProxy,
  dest: string | unknown[] | null | undefined,
): Promise<number | null> {
  if (dest == null) return null
  try {
    let resolved: unknown = dest
    if (typeof dest === 'string') {
      resolved = await doc.getDestination(dest)
    }
    if (!Array.isArray(resolved) || resolved.length === 0) return null
    const pageIndex = await doc.getPageIndex(resolved[0])
    if (!Number.isFinite(pageIndex) || pageIndex < 0) return null
    return pageIndex + 1
  } catch {
    return null
  }
}

function isPageInRange(pageNumber: number | null, startPage: number, endPage: number): boolean {
  return pageNumber != null && pageNumber >= startPage && pageNumber <= endPage
}

function nodeHasInRangeContent(node: PdfSidebarNode, startPage: number, endPage: number): boolean {
  if (isPageInRange(node.pageNumber, startPage, endPage)) return true
  return node.children.some((child) => nodeHasInRangeContent(child, startPage, endPage))
}

export function resolveSidebarNodePage(
  node: PdfSidebarNode,
  startPage: number,
  endPage: number,
): number | null {
  if (isPageInRange(node.pageNumber, startPage, endPage)) return node.pageNumber
  for (const child of node.children) {
    const page = resolveSidebarNodePage(child, startPage, endPage)
    if (page != null) return page
  }
  return null
}

/** Adapt PDF outline and local-bookmark nodes to the shared tree presentation model. */
export function pdfSidebarNodesToTreeNodes<TMeta extends PdfSidebarTreeMeta = PdfSidebarTreeMeta>(
  nodes: PdfSidebarNode[],
  resolveMeta: (node: PdfSidebarNode) => TMeta = (node) => ({
    pageNumber: node.pageNumber,
    custom: Boolean(node.custom),
  }) as TMeta,
): TreeNode<TMeta>[] {
  return nodes.map((node) => ({
    id: node.id,
    label: node.title,
    children: pdfSidebarNodesToTreeNodes(node.children, resolveMeta),
    meta: resolveMeta(node),
  }))
}

/** Node ids that have children and can be expanded/collapsed in the sidebar tree. */
export function collectExpandableNodeIds(nodes: PdfSidebarNode[]): string[] {
  const ids: string[] = []
  const walk = (list: PdfSidebarNode[]) => {
    for (const node of list) {
      if (node.children.length > 0) {
        ids.push(node.id)
        walk(node.children)
      }
    }
  }
  walk(nodes)
  return ids
}

/** Normalize persisted/custom bookmark input without trusting page or title data. */
export function normalizePdfCustomBookmarks(
  value: unknown,
  startPage = 1,
  endPage = Number.MAX_SAFE_INTEGER,
): PdfCustomBookmark[] {
  const safeStart = Math.max(1, Math.floor(startPage) || 1)
  const safeEnd = Math.max(safeStart, Math.floor(endPage) || safeStart)
  const seen = new Set<string>()
  const result: PdfCustomBookmark[] = []
  if (!Array.isArray(value)) return result

  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const raw = item as Record<string, unknown>
    const id = String(raw.id || '').trim()
    const title = String(raw.title || '').trim()
    const page = Math.floor(Number(raw.pageNumber))
    const parentId = String(raw.parentId || '').trim() || null
    if (!id || !title || !Number.isFinite(page) || seen.has(id)) continue
    seen.add(id)
    result.push({
      id,
      title: title.slice(0, 120),
      pageNumber: Math.min(safeEnd, Math.max(safeStart, page)),
      ...(parentId ? { parentId } : {}),
    })
  }
  const byId = new Map(result.map((bookmark) => [bookmark.id, bookmark]))
  return result.map((bookmark) => {
    const parentId = bookmark.parentId
    if (!parentId || !byId.has(parentId) || parentId === bookmark.id) {
      const { parentId: _parentId, ...root } = bookmark
      return root
    }
    const visited = new Set([bookmark.id])
    let cursor: string | undefined = parentId
    while (cursor && byId.has(cursor)) {
      if (visited.has(cursor)) {
        const { parentId: _parentId, ...root } = bookmark
        return root
      }
      visited.add(cursor)
      cursor = byId.get(cursor)?.parentId ?? undefined
    }
    return bookmark
  })
}

/** Merge document bookmarks into the PDF outline. Custom nodes stay visually distinct. */
export function mergePdfSidebarBookmarks(
  nodes: PdfSidebarNode[],
  bookmarks: unknown,
  startPage: number,
  endPage: number,
): PdfSidebarNode[] {
  const customBookmarks = normalizePdfCustomBookmarks(bookmarks, startPage, endPage)
  const customIds = new Set(customBookmarks.map((bookmark) => bookmark.id))
  const customNodes = new Map(customBookmarks.map((bookmark) => [bookmark.id, {
    id: bookmark.id,
    title: bookmark.title,
    pageNumber: bookmark.pageNumber,
    children: [] as PdfSidebarNode[],
    custom: true,
  }]))
  const roots: PdfSidebarNode[] = []
  for (const bookmark of customBookmarks) {
    const node = customNodes.get(bookmark.id)!
    const parent = bookmark.parentId && customIds.has(bookmark.parentId)
      ? customNodes.get(bookmark.parentId)
      : null
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return [...nodes, ...roots]
}

async function mapOutlineItems(
  doc: PdfDocumentProxy,
  items: RawOutlineItem[],
  startPage: number,
  endPage: number,
  idPrefix: string,
  clipToRange: boolean,
): Promise<PdfSidebarNode[]> {
  const result: PdfSidebarNode[] = []
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    const title = String(item.title || '').trim() || '未命名'
    const pageNumber = await resolveDestPageNumber(doc, item.dest ?? null)
    const childItems = Array.isArray(item.items) ? item.items : []
    const children = childItems.length > 0
      ? await mapOutlineItems(doc, childItems, startPage, endPage, `${idPrefix}-${index}`, clipToRange)
      : []
    const node: PdfSidebarNode = {
      id: `${idPrefix}-${index}`,
      title,
      pageNumber,
      children,
    }
    if (!clipToRange || nodeHasInRangeContent(node, startPage, endPage)) {
      result.push(node)
    }
  }
  return result
}

export async function buildPdfSidebarTree(
  doc: PdfDocumentProxy,
  startPage: number,
  endPage: number,
  options: BuildPdfSidebarOptions = {},
): Promise<{ nodes: PdfSidebarNode[]; source: PdfSidebarSource }> {
  const viewMode = options.viewMode ?? 'excerpt'
  const clipToRange = viewMode !== 'full'
  const skipPageListOver = options.skipPageListOver ?? 50
  const pageCount = endPage - startPage + 1

  let outlineNodes: PdfSidebarNode[] = []
  let outlineSource: PdfSidebarSource = 'none'
  try {
    const rawOutline = await doc.getOutline()
    if (Array.isArray(rawOutline) && rawOutline.length > 0) {
      const nodes = await mapOutlineItems(
        doc,
        rawOutline as RawOutlineItem[],
        startPage,
        endPage,
        'outline',
        clipToRange,
      )
      if (nodes.length > 0) {
        outlineNodes = nodes
        outlineSource = 'outline'
      }
    }
  } catch {
    // fall through to page list
  }

  const customBookmarks = normalizePdfCustomBookmarks(
    options.customBookmarks,
    startPage,
    endPage,
  )
  if (outlineNodes.length > 0) {
    return {
      nodes: mergePdfSidebarBookmarks(outlineNodes, customBookmarks, startPage, endPage),
      source: outlineSource,
    }
  }

  // A purely local bookmark list is more useful than a page list replacement.
  if (customBookmarks.length > 0) {
    return {
      nodes: mergePdfSidebarBookmarks([], customBookmarks, startPage, endPage),
      source: 'outline',
    }
  }

  if (viewMode === 'full' && pageCount > skipPageListOver) {
    return { nodes: [], source: 'none' }
  }

  return { nodes: buildPageList(startPage, endPage), source: 'pages' }
}
