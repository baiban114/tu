import type { GraphData } from '@/api/types'
import { MINDMAP_KIND } from '@/components/x6/blueprints'
import { createId, type CellData } from '@/components/x6/cellUtils'
import {
  createMindmapEdgeMetadata,
  createMindmapNode,
} from '@/components/x6/graphCells'
import { layoutMindmapGraphData } from '@/components/x6/mindmap'
import type { TocTreeItem } from '@/utils/toc/headings'
import { flattenTocTreeForMindmap } from '@/utils/toc/mindmapFromTocTree'

export type { MindmapTocLink } from '@/utils/toc/mindmapFromTocTree'
export { flattenTocTreeForMindmap } from '@/utils/toc/mindmapFromTocTree'

export interface BuildMindmapGraphFromTocOptions {
  rootTitle: string
  toc: TocTreeItem[]
  /** Stable ids for tests; defaults to `createId`. */
  createNodeId?: (prefix: string) => string
}

/**
 * Build a mindmap GraphData from the document TOC tree (page title as root).
 */
export function buildMindmapGraphFromToc(options: BuildMindmapGraphFromTocOptions): GraphData {
  const createNodeId = options.createNodeId ?? ((prefix: string) => createId(prefix))
  const links = flattenTocTreeForMindmap(options.rootTitle, options.toc, createNodeId)

  const nodes: CellData[] = []
  const edges: CellData[] = []
  const idSet = new Set(links.map((link) => link.id))

  for (const link of links) {
    const isRoot = link.parentId == null
    nodes.push(createMindmapNode({
      id: link.id,
      x: isRoot ? 200 : undefined,
      y: isRoot ? 220 : undefined,
      label: link.text,
      mindRole: isRoot ? 'root' : 'topic',
      data: isRoot
        ? undefined
        : {
            tocEntryId: link.tocEntryId,
            tocBlockId: link.blockId,
            tocSourceType: link.sourceType,
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
