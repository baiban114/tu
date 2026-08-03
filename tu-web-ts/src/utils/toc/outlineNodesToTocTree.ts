import type { ContentTreeNode } from '@/api/outline'
import type { TocSourceType, TocTreeItem } from '@/utils/toc/headings'

/**
 * Convert page outline ContentTreeNode[] into a TocTreeItem tree for mindmap building.
 * Hierarchy follows outline `parentId` (not ATX level stack).
 */
export function outlineNodesToTocTree(pageId: string, nodes: ContentTreeNode[]): TocTreeItem[] {
  if (!nodes.length) return []

  const byId = new Map<string, TocTreeItem>()
  const order = [...nodes].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  for (const node of order) {
    const blockId = (node.sourceBlockId?.trim() || node.id).trim()
    const sourceType = (node.sourceType as TocSourceType | null | undefined) || 'local'
    byId.set(node.id, {
      id: `outline:${pageId}:${node.id}`,
      blockId,
      level: Math.min(6, Math.max(1, Number(node.level) || 1)),
      text: node.title?.trim() || '未命名',
      pos: node.sortOrder ?? 0,
      sourceType,
      children: [],
    })
  }

  const roots: TocTreeItem[] = []
  for (const node of order) {
    const item = byId.get(node.id)
    if (!item) continue
    const parentId = node.parentId?.trim()
    if (parentId && byId.has(parentId)) {
      const parent = byId.get(parentId)!
      if (!parent.children) parent.children = []
      parent.children.push(item)
    } else {
      roots.push(item)
    }
  }

  // Drop empty children arrays for cleaner fixtures / snapshots.
  const prune = (items: TocTreeItem[]) => {
    for (const item of items) {
      if (item.children?.length) prune(item.children)
      else delete item.children
    }
  }
  prune(roots)
  return roots
}
