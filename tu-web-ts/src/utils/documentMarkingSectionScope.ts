import type { FlatTocEntry } from '@/utils/toc/headings'

export interface DocumentMarkingSectionScope {
  sectionHeadingBlockId?: string
  sectionEmbedBlockId?: string
  sectionTitle: string
}

export function buildDocumentMarkingSectionScope(entry: FlatTocEntry): DocumentMarkingSectionScope {
  const title = entry.text?.trim() || entry.targetText?.trim() || '本节'
  if (entry.sourceType === 'local') {
    return {
      sectionHeadingBlockId: entry.blockId,
      sectionTitle: title,
    }
  }
  if (entry.sourceType === 'ref-group' || entry.sourceType === 'ref-child') {
    return {
      sectionEmbedBlockId: entry.blockId,
      sectionTitle: title,
    }
  }
  return { sectionTitle: title }
}
