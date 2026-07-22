import type { FlatTocEntry, TocTreeItem } from '@/utils/toc/headings'

/**
 * Nearest TOC entry at or before the cursor (flat list must be document order).
 */
export function findActiveFlatTocEntry(
  flat: FlatTocEntry[],
  cursorPos: number,
): FlatTocEntry | null {
  let best: FlatTocEntry | null = null
  for (const entry of flat) {
    if (entry.pos <= cursorPos) best = entry
    else break
  }
  return best
}

/**
 * Expand keys for ancestors of `activeItemId` so the active row is visible.
 * Returns null when the id is not in the tree.
 */
export function collectTocFocusExpandKeys(
  tree: TocTreeItem[],
  activeItemId: string,
  getExpandKey: (item: TocTreeItem) => string,
): string[] | null {
  const walk = (items: TocTreeItem[], ancestors: string[]): string[] | null => {
    for (const item of items) {
      if (item.id === activeItemId) return ancestors
      if (item.children?.length) {
        const found = walk(item.children, [...ancestors, getExpandKey(item)])
        if (found) return found
      }
    }
    return null
  }
  return walk(tree, [])
}
