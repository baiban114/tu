import type { ContentTreeNode } from '@/api/outline'
import type { FlatTocEntry, TocSourceType } from '@/utils/toc/headings'

export function buildEmbedRefChildEntryId(embedBlockId: string, node: ContentTreeNode): string {
  if (node.sourceBlockId) {
    return `ref-child-${embedBlockId}-${node.sourceBlockId}-${node.title}`
  }
  return `ref-child-${embedBlockId}-${node.id}`
}

export function mapOutlineNodesToEmbedFlatToc(
  embedBlockId: string,
  refBlockId: string,
  nodes: ContentTreeNode[],
): FlatTocEntry[] {
  return nodes.map((node, index) => ({
    id: buildEmbedRefChildEntryId(embedBlockId, node),
    blockId: embedBlockId,
    level: node.level ?? 2,
    text: node.title,
    pos: 0,
    sortIndex: (node.sortOrder ?? index) + 1,
    sourceType: (node.sourceType ?? 'ref-child') as TocSourceType,
    refId: refBlockId,
    targetText: node.title,
    contentTreeNodeId: node.id,
    previewText: node.previewText ?? undefined,
    estimatedHours: node.estimatedHours ?? undefined,
    totalEstimatedHours: node.totalEstimatedHours ?? undefined,
  }))
}
