import type { GraphData, PageItem } from '@/api/types'
import { MINDMAP_KIND } from '@/components/x6/blueprints'
import { createId, type CellData } from '@/components/x6/cellUtils'
import {
  createMindmapEdgeMetadata,
  createMindmapNode,
} from '@/components/x6/graphCells'
import { layoutMindmapGraphData } from '@/components/x6/mindmap'
import type { TocTreeItem } from '@/utils/toc/headings'
import { flattenPageSubtreeForMindmap } from '@/utils/toc/mindmapFromPageSubtreeTree'

export type {
  MindmapCollapseMode,
  MindmapOutlineLink,
  MindmapOutlineNodeKind,
} from '@/utils/toc/mindmapFromPageSubtreeTree'
export { flattenPageSubtreeForMindmap } from '@/utils/toc/mindmapFromPageSubtreeTree'

export interface BuildMindmapGraphFromPageSubtreeOptions {
  rootPageId: string
  rootTitle: string
  rootToc: TocTreeItem[]
  childPages: PageItem[]
  getPageOutlineToc: (pageId: string) => TocTreeItem[]
  createNodeId?: (prefix: string) => string
}

/**
 * Build a mindmap GraphData from current-page TOC + descendant pages.
 */
export function buildMindmapGraphFromPageSubtree(
  options: BuildMindmapGraphFromPageSubtreeOptions,
): GraphData {
  const createNodeId = options.createNodeId ?? ((prefix: string) => createId(prefix))
  const links = flattenPageSubtreeForMindmap({
    ...options,
    createNodeId,
  })

  const nodes: CellData[] = []
  const edges: CellData[] = []
  const idSet = new Set(links.map((link) => link.id))

  for (const link of links) {
    const isRoot = link.parentId == null
    const isPage = link.nodeKind === 'page'
    nodes.push(createMindmapNode({
      id: link.id,
      x: isRoot ? 200 : undefined,
      y: isRoot ? 220 : undefined,
      label: link.text,
      mindRole: isRoot ? 'root' : 'topic',
      data: {
        mindRole: isRoot ? 'root' : 'topic',
        nodeKind: link.nodeKind,
        ...(link.sourceLocator ? { sourceLocator: link.sourceLocator } : {}),
        ...(link.pageId ? { pageId: link.pageId } : {}),
        ...(isPage && link.childrenCollapsed != null
          ? { childrenCollapsed: link.childrenCollapsed }
          : {}),
        ...(isPage && link.collapseMode ? { collapseMode: link.collapseMode } : {}),
        ...(!isPage
          ? {
              tocEntryId: link.tocEntryId,
              tocBlockId: link.blockId,
              tocSourceType: link.sourceType,
            }
          : {}),
      },
    }))
    if (link.parentId && idSet.has(link.parentId)) {
      edges.push(createMindmapEdgeMetadata(link.parentId, link.id))
    }
  }

  return layoutMindmapGraphData({
    cells: [...nodes, ...edges],
    nodes,
    edges,
    blueprintMeta: {
      kind: MINDMAP_KIND,
      direction: 'LR',
      anchor: { x: 200, y: 220 },
    },
  } as GraphData)
}
