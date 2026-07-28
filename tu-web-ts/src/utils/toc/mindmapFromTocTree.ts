import type { TocTreeItem } from '@/utils/toc/headings'
import {
  buildTocEntrySourceLocator,
  buildTocRootSourceLocator,
} from '@/utils/toc/tocMindmapLocator'

export interface MindmapTocLink {
  id: string
  parentId: string | null
  text: string
  /** Original TOC entry id when not the synthetic root. */
  tocEntryId: string
  blockId: string
  sourceType: TocTreeItem['sourceType']
  /** Locator for 定位系统 (page / heading / block / resource). */
  sourceLocator: string
}

export interface FlattenTocTreeForMindmapOptions {
  pageId?: string
}

/**
 * Flatten TOC tree into parent-linked rows (root first). Pure — safe for unit tests.
 */
export function flattenTocTreeForMindmap(
  rootTitle: string,
  toc: TocTreeItem[],
  createNodeId: (prefix: string) => string,
  options: FlattenTocTreeForMindmapOptions = {},
): MindmapTocLink[] {
  const pageId = options.pageId?.trim() ?? ''
  const rootTitleText = rootTitle.trim() || '文档'
  const rootId = createNodeId('mindmap-root')
  const rows: MindmapTocLink[] = [{
    id: rootId,
    parentId: null,
    text: rootTitleText,
    tocEntryId: '',
    blockId: '',
    sourceType: 'local',
    sourceLocator: buildTocRootSourceLocator(pageId, rootTitleText),
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
        sourceLocator: buildTocEntrySourceLocator(pageId, entry),
      })
      if (entry.children?.length) {
        walk(entry.children, id)
      }
    }
  }

  walk(toc, rootId)
  return rows
}
