import type { BlockTag, PageContent } from '@/api/types'
import { normalizeBlockTags, normalizeTagLabel } from '@/utils/blockMetadata'

export function getPageTags(pc: PageContent | null | undefined): BlockTag[] {
  if (!pc?.metadata) return []
  const raw = pc.metadata.tags
  return normalizeBlockTags(Array.isArray(raw) ? raw as Array<Partial<BlockTag> | string> : [])
}

export function setPageTags(
  pc: PageContent,
  tags: Array<Partial<BlockTag> | string>,
): PageContent {
  const normalizedTags = normalizeBlockTags(tags)
  const metadata = { ...(pc.metadata ?? {}) }
  if (normalizedTags.length > 0) {
    metadata.tags = normalizedTags
  } else {
    delete metadata.tags
  }
  return {
    ...pc,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  }
}

export function mergeTagPools(...pools: Array<BlockTag[] | undefined | null>): BlockTag[] {
  const deduped = new Map<string, BlockTag>()
  for (const pool of pools) {
    if (!pool) continue
    for (const tag of pool) {
      const key = normalizeTagLabel(tag.label).toLowerCase()
      if (!deduped.has(key)) {
        deduped.set(key, tag)
      }
    }
  }
  return Array.from(deduped.values()).sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
}
