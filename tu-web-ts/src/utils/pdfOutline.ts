import type { PdfDocumentProxy } from './pdfjsSetup'
import type { PdfExcerptViewMode } from './pdfExcerpt'

export type PdfSidebarSource = 'outline' | 'pages' | 'none'

export interface PdfSidebarNode {
  id: string
  title: string
  /** 1-based page number from PDF destination; null if unresolved */
  pageNumber: number | null
  children: PdfSidebarNode[]
}

export interface BuildPdfSidebarOptions {
  viewMode?: PdfExcerptViewMode
  /** Skip flat page list when full document has more pages than this threshold */
  skipPageListOver?: number
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
        return { nodes, source: 'outline' }
      }
    }
  } catch {
    // fall through to page list
  }

  if (viewMode === 'full' && pageCount > skipPageListOver) {
    return { nodes: [], source: 'none' }
  }

  return { nodes: buildPageList(startPage, endPage), source: 'pages' }
}
