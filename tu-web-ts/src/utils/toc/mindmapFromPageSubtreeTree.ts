import type { PageItem } from '@/api/types'
import type { TocTreeItem } from '@/utils/toc/headings'
import {
  buildTocEntrySourceLocator,
  buildTocRootSourceLocator,
} from '@/utils/toc/tocMindmapLocator'

export type MindmapOutlineNodeKind = 'page' | 'heading'

export type MindmapCollapseMode = 'all' | 'toc-only'

export interface MindmapOutlineLink {
  id: string
  parentId: string | null
  text: string
  nodeKind: MindmapOutlineNodeKind
  sourceLocator: string
  /** Heading fields */
  tocEntryId?: string
  blockId?: string
  sourceType?: TocTreeItem['sourceType']
  /** Owning page id for heading / page node */
  pageId?: string
  childrenCollapsed?: boolean
  collapseMode?: MindmapCollapseMode
}

export interface FlattenPageSubtreeForMindmapOptions {
  rootPageId: string
  rootTitle: string
  /** Live TOC of the current (root) page. */
  rootToc: TocTreeItem[]
  /** Direct child pages of the root (nested via `.children`). */
  childPages: PageItem[]
  /** Outline TOC for a descendant page (usually from outline API). */
  getPageOutlineToc: (pageId: string) => TocTreeItem[]
  createNodeId: (prefix: string) => string
}

/**
 * Flatten current-page TOC + descendant page tree into mindmap links.
 * Child page nodes default to toc-only collapse (hide headings, keep nested pages).
 */
export function flattenPageSubtreeForMindmap(
  options: FlattenPageSubtreeForMindmapOptions,
): MindmapOutlineLink[] {
  const rootPageId = options.rootPageId.trim()
  const rootTitle = options.rootTitle.trim() || '文档'
  const createNodeId = options.createNodeId
  const rootId = createNodeId('mindmap-root')

  const rows: MindmapOutlineLink[] = [{
    id: rootId,
    parentId: null,
    text: rootTitle,
    nodeKind: 'page',
    pageId: rootPageId || undefined,
    sourceLocator: buildTocRootSourceLocator(rootPageId, rootTitle),
    childrenCollapsed: false,
    collapseMode: 'all',
  }]

  const pushHeadingTree = (
    entries: TocTreeItem[],
    parentId: string,
    pageId: string,
  ) => {
    for (const entry of entries) {
      const id = createNodeId('mindmap-topic')
      rows.push({
        id,
        parentId,
        text: entry.text.trim() || '未命名',
        nodeKind: 'heading',
        pageId: pageId || undefined,
        tocEntryId: entry.id,
        blockId: entry.blockId,
        sourceType: entry.sourceType,
        sourceLocator: buildTocEntrySourceLocator(pageId, entry),
      })
      if (entry.children?.length) {
        pushHeadingTree(entry.children, id, pageId)
      }
    }
  }

  const pushPageSubtree = (page: PageItem, parentId: string) => {
    const pageId = page.id.trim()
    if (!pageId) return
    const title = page.title?.trim() || '未命名页面'
    const nodeId = createNodeId('mindmap-page')
    const outlineToc = options.getPageOutlineToc(pageId)
    const hasOutline = outlineToc.length > 0
    rows.push({
      id: nodeId,
      parentId,
      text: title,
      nodeKind: 'page',
      pageId,
      sourceLocator: buildTocRootSourceLocator(pageId, title),
      // Hide this page's TOC by default; nested child pages stay visible.
      childrenCollapsed: hasOutline,
      collapseMode: 'toc-only',
    })

    const nested = page.children ?? []
    for (const child of nested) {
      pushPageSubtree(child, nodeId)
    }

    if (hasOutline) {
      pushHeadingTree(outlineToc, nodeId, pageId)
    }
  }

  if (rootPageId) {
    pushHeadingTree(options.rootToc, rootId, rootPageId)
  } else {
    pushHeadingTree(options.rootToc, rootId, '')
  }

  for (const child of options.childPages) {
    pushPageSubtree(child, rootId)
  }

  return rows
}
