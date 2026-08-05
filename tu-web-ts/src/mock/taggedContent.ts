import type { Block, BlockTag, PageContent } from '@/api/types'
import type { JSONContent } from '@tiptap/core'
import type { TaggedContentItem } from '@/api/taggedContent'
import { getBlockTags, normalizeTagLabel } from '@/utils/blockMetadata'
import { sectionTagsMapFromMetadata } from '@/utils/sectionMetadata'
import { tipTapToBlocks } from '@/editor/converters'
import { resolvePageDocument } from '@/editor/pageDocument'
import { DEFAULT_PAGE_SIZE, type PageResult } from '@/constants/pagination'
import { getMockState } from './store'

function matchTags(tags: BlockTag[], normalizedLabel: string): BlockTag[] {
  return tags.filter((tag) => normalizeTagLabel(tag.label) === normalizedLabel)
}

function firstContentLine(content: string): string {
  const line = content
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item && !item.startsWith('<!--tu:'))
  return line ? line.replace(/^#{1,6}\s+/, '').trim() : ''
}

function blocksFromContent(pc: PageContent): Block[] {
  return tipTapToBlocks(resolvePageDocument(pc), [])
}

function headingTextFromDocument(doc: JSONContent, blockId: string): string {
  if (doc.type === 'heading' && doc.attrs?.blockId === blockId) {
    return (doc.content ?? [])
      .map((n) => n.text ?? '')
      .join('')
      .trim()
  }
  for (const child of doc.content ?? []) {
    const text = headingTextFromDocument(child, blockId)
    if (text) return text
  }
  return ''
}

function collectBlockHits(
  blocks: Block[],
  normalizedLabel: string,
  pageId: string,
  pageTitle: string,
  updatedAt: string,
  out: TaggedContentItem[],
): void {
  for (const block of blocks) {
    const matched = matchTags(getBlockTags(block), normalizedLabel)
    if (matched.length > 0) {
      const contentLine = firstContentLine(block.content ?? '')
      out.push({
        id: `block:${pageId}:${block.id}`,
        scope: 'block',
        pageId,
        pageTitle,
        blockId: block.id,
        sectionKey: null,
        title: contentLine || block.title || matched[0].label,
        snippet: contentLine,
        matchedTags: matched,
        updatedAt,
      })
    }
    if (block.children?.length) {
      collectBlockHits(block.children, normalizedLabel, pageId, pageTitle, updatedAt, out)
    }
  }
}

function resolveSectionBlockId(sectionKey: string): string {
  if (sectionKey.startsWith('local:')) return sectionKey.slice('local:'.length)
  if (sectionKey.startsWith('ref-group:')) return sectionKey.slice('ref-group:'.length)
  if (sectionKey.startsWith('ref-child:')) {
    const rest = sectionKey.slice('ref-child:'.length)
    const colon = rest.indexOf(':')
    return colon > 0 ? rest.slice(0, colon) : rest
  }
  if (sectionKey.startsWith('heading-')) return sectionKey
  return sectionKey
}

function headingTextFromBlocks(blocks: Block[], blockId: string): string {
  for (const block of blocks) {
    if (block.id === blockId) {
      return firstContentLine(block.content ?? '')
    }
    if (block.children?.length) {
      const nested = headingTextFromBlocks(block.children, blockId)
      if (nested) return nested
    }
  }
  return ''
}

export function searchTaggedContentMock(
  kbId: string,
  tagLabel: string,
  page: number,
  pageSize: number,
): PageResult<TaggedContentItem> {
  const normalizedLabel = normalizeTagLabel(tagLabel)
  const safePage = Math.max(0, page)
  const safePageSize = Math.min(200, Math.max(1, pageSize || DEFAULT_PAGE_SIZE))
  if (!normalizedLabel) {
    return { items: [], total: 0, page: safePage, pageSize: safePageSize }
  }

  const state = getMockState()
  const all: TaggedContentItem[] = []

  for (const pageMeta of state.pages) {
    if (pageMeta.kbId !== kbId) continue
    const pc = state.contents[pageMeta.id]
    if (!pc) continue
    const updatedAt = state.pageUpdatedAt[pageMeta.id] ?? ''

    const blocks = blocksFromContent(pc)
    const doc = resolvePageDocument(pc)

    const sectionTagsMap = sectionTagsMapFromMetadata(pc.metadata)
    for (const [sectionKey, tags] of Object.entries(sectionTagsMap)) {
      const matched = matchTags(tags, normalizedLabel)
      if (matched.length === 0) continue
      const blockId = resolveSectionBlockId(sectionKey)
      const heading = headingTextFromDocument(doc, blockId)
        || headingTextFromBlocks(blocks, blockId)
      all.push({
        id: `section:${pageMeta.id}:${sectionKey}`,
        scope: 'section',
        pageId: pageMeta.id,
        pageTitle: pageMeta.title,
        blockId,
        sectionKey,
        title: heading || matched[0].label,
        snippet: heading,
        matchedTags: matched,
        updatedAt,
      })
    }

    collectBlockHits(blocks, normalizedLabel, pageMeta.id, pageMeta.title, updatedAt, all)
  }

  all.sort(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt)
      || a.pageId.localeCompare(b.pageId)
      || a.id.localeCompare(b.id),
  )

  const total = all.length
  const from = safePage * safePageSize
  return {
    items: from >= total ? [] : all.slice(from, from + safePageSize),
    total,
    page: safePage,
    pageSize: safePageSize,
  }
}
