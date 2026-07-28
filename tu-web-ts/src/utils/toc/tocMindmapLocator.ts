import type { HeadingSourceBinding } from '@/api/types'
import type { TocTreeItem } from '@/utils/toc/headings'

/** Build a locator for a heading-source / basis resource binding. */
export function locatorFromHeadingSourceBinding(binding: HeadingSourceBinding): string {
  const itemId = binding.resourceItemId?.trim()
  if (!itemId) return ''
  const excerptId = binding.resourceExcerptId?.trim()
  if (excerptId) return `resource:${itemId}:excerpt:${excerptId}`
  const chapterId = binding.resourceChapterId?.trim()
  if (chapterId) return `resource:${itemId}:chapter:${chapterId}`
  return `resource:${itemId}`
}

/**
 * Locator for a TOC entry on a page (auto-generated outline mindmap).
 * Prefers external resource binding when present; otherwise page heading / block.
 */
export function buildTocEntrySourceLocator(pageId: string, entry: TocTreeItem): string {
  const trimmedPageId = pageId.trim()
  if (!trimmedPageId) return ''

  if (entry.sourceBinding) {
    const fromBinding = locatorFromHeadingSourceBinding(entry.sourceBinding)
    if (fromBinding) return fromBinding
  }

  const blockId = entry.blockId?.trim()
  if (!blockId) return `page:${trimmedPageId}`

  if (entry.sourceType === 'ref-group' || entry.sourceType === 'ref-doc-block') {
    return `page:${trimmedPageId}:block:${blockId}`
  }

  return `page:${trimmedPageId}:heading:${blockId}`
}

export function buildTocRootSourceLocator(pageId: string, _title?: string): string {
  const trimmedPageId = pageId.trim()
  if (!trimmedPageId) return ''
  return `page:${trimmedPageId}`
}
