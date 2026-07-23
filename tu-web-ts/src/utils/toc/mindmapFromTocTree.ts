import type { TocTreeItem } from '@/utils/toc/headings'

export interface MindmapTocLink {
  id: string
  parentId: string | null
  text: string
  /** Original TOC entry id when not the synthetic root. */
  tocEntryId: string
  blockId: string
  sourceType: TocTreeItem['sourceType']
}

/**
 * Flatten TOC tree into parent-linked rows (root first). Pure — safe for unit tests.
 */
export function flattenTocTreeForMindmap(
  rootTitle: string,
  toc: TocTreeItem[],
  createNodeId: (prefix: string) => string,
): MindmapTocLink[] {
  const rootId = createNodeId('mindmap-root')
  const rows: MindmapTocLink[] = [{
    id: rootId,
    parentId: null,
    text: rootTitle.trim() || '文档',
    tocEntryId: '',
    blockId: '',
    sourceType: 'local',
  }]

  const walk = (entries: TocTreeItem[], parentId: string) => {
    for (const entry of entries) {
      const id = createNodeId('mindmap-topic')
      rows.push({
        id,
        parentId,
        text: entry.text.trim() || '未命名',
        tocEntryId: entry.id,
        blockId: entry.blockId,
        sourceType: entry.sourceType,
      })
      if (entry.children?.length) {
        walk(entry.children, id)
      }
    }
  }

  walk(toc, rootId)
  return rows
}
