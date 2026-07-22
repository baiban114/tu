import type { Block, ExternalResourceEmbedData } from '@/api/types'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { collectFlatTocEntries, type TocCollectContext } from '@/utils/toc/collectFlatTocEntries'
import { findNearestPrecedingHeadingText, type FlatTocEntry } from '@/utils/toc/headings'
import { getTocEntrySectionContentRange, getTocSectionBoundaryPos } from '@/utils/toc/tocSections'
import type { RefGutterHostContext } from '@/editor/refGutterBridge'
import {
  getRefChildSectionExcerpt,
  getRefGroupExcerptFromBlocks,
} from '@/utils/refInnerGutter'

export interface BlockExcerptContent {
  text: string
  title: string
}

const EMBED_NODE_TYPES = new Set([
  'refBlock',
  'externalResourceBlock',
  'x6Block',
  'tableBlock',
  'multiTableBlock',
  'timelineBlock',
])

export function excerptTitleFromText(text: string): string {
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || '来自文档的节选'
  return firstLine
    .replace(/^#+\s+/, '')
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .slice(0, 80)
}

/** Prefer nearest preceding heading as excerpt title; fall back to first line of text. */
export function resolveExcerptDefaultTitle(
  doc: ProseMirrorNode,
  pos: number,
  text: string,
): string {
  const heading = findNearestPrecedingHeadingText(doc, pos)
  if (heading) return heading.slice(0, 80)
  return excerptTitleFromText(text)
}

function findTopLevelBlock(doc: ProseMirrorNode, blockId: string): { pos: number; node: ProseMirrorNode } | null {
  let pos = 0
  for (let i = 0; i < doc.childCount; i += 1) {
    const node = doc.child(i)
    if (node.attrs?.blockId === blockId) {
      return { pos, node }
    }
    pos += node.nodeSize
  }
  return null
}

function blockToPlainText(block: Block): string {
  if (block.type === 'richtext' && block.content?.trim()) {
    return block.content.trim()
  }
  if (block.type === 'externalResource') {
    const excerpt = block.externalResource?.snapshot?.excerptText?.trim()
    if (excerpt) return excerpt
    if (block.title?.trim()) return block.title.trim()
    const resourceTitle = block.externalResource?.snapshot?.resourceTitle?.trim()
    if (resourceTitle) return resourceTitle
  }
  if (block.title?.trim()) return block.title.trim()
  if (block.children?.length) {
    return block.children.map(blockToPlainText).filter(Boolean).join('\n\n')
  }
  return ''
}

function resolveRefBlocks(refId: string, refType: string, ctx: TocCollectContext): Block[] {
  if (refType === 'page') return ctx.getPageBlocks(refId) ?? []
  const block = ctx.getBlock(refId)
  return block ? [block] : []
}

function excerptFromEmbedNode(node: ProseMirrorNode, ctx: TocCollectContext): string {
  const title = String(node.attrs?.title ?? '').trim()
  switch (node.type.name) {
    case 'refBlock': {
      const refId = String(node.attrs?.refId ?? '')
      const refType = String(node.attrs?.refType ?? 'page')
      const blocks = refId ? resolveRefBlocks(refId, refType, ctx) : []
      const body = blocks.map(blockToPlainText).filter(Boolean).join('\n\n').trim()
      if (body) return title ? `${title}\n\n${body}` : body
      const pageTitle = refType === 'page'
        ? ctx.getPageTitle(refId)
        : ctx.getBlockMeta(refId)?.pageTitle
      return [title, pageTitle].filter(Boolean).join('\n\n').trim()
    }
    case 'externalResourceBlock': {
      const er = node.attrs?.externalResource as ExternalResourceEmbedData | undefined
      const excerpt = er?.snapshot?.excerptText?.trim()
      if (excerpt) return excerpt
      return title || er?.snapshot?.resourceTitle?.trim() || '外部资源'
    }
    case 'x6Block':
      return title || '画板'
    case 'tableBlock':
    case 'multiTableBlock':
      return title || '表格'
    case 'timelineBlock':
      return title || '时间轴'
    default:
      return title
  }
}

function excerptFromHeadingSection(
  doc: ProseMirrorNode,
  pos: number,
  node: ProseMirrorNode,
  blockId: string,
  ctx: TocCollectContext,
): BlockExcerptContent {
  const headingText = node.textContent.trim()
  const flat = collectFlatTocEntries(doc, ctx)
  const entryIndex = flat.findIndex((entry) => (
    entry.blockId === blockId && entry.pos === pos && entry.sourceType === 'local'
  ))
  const title = headingText.slice(0, 80) || excerptTitleFromText(headingText)
  if (entryIndex < 0) {
    return { text: headingText, title }
  }
  const { contentRange } = getTocEntrySectionContentRange(flat, entryIndex, doc)
  const body = contentRange
    ? doc.textBetween(contentRange.from, contentRange.to, '\n\n').trim()
    : ''
  const text = body ? `${headingText}\n\n${body}` : headingText
  return { text, title }
}

export function getBlockExcerptContent(
  doc: ProseMirrorNode,
  blockId: string,
  ctx?: TocCollectContext,
): BlockExcerptContent | null {
  const found = findTopLevelBlock(doc, blockId)
  if (!found) return null
  const { pos, node } = found
  const from = pos
  const to = pos + node.nodeSize

  if (node.type.name === 'heading' && ctx) {
    const result = excerptFromHeadingSection(doc, pos, node, blockId, ctx)
    return result.text.trim() ? result : null
  }

  if (EMBED_NODE_TYPES.has(node.type.name)) {
    if (!ctx) return null
    const text = excerptFromEmbedNode(node, ctx).trim()
    if (!text) return null
    return { text, title: resolveExcerptDefaultTitle(doc, pos, text) }
  }

  const text = doc.textBetween(from, to, '\n\n').trim()
  if (!text) return null
  return { text, title: resolveExcerptDefaultTitle(doc, pos, text) }
}

export function getTocEntryExcerptContent(
  doc: ProseMirrorNode,
  flat: FlatTocEntry[],
  entryId: string,
  ctx: TocCollectContext,
): BlockExcerptContent | null {
  const entryIndex = flat.findIndex((entry) => entry.id === entryId)
  if (entryIndex < 0) return null
  const entry = flat[entryIndex]

  if (entry.sourceType === 'local') {
    return getBlockExcerptContent(doc, entry.blockId, ctx)
  }

  if (entry.sourceType === 'ref-group') {
    const title = entry.text.trim()
    const host = resolveRefHostFromEntry(entry, flat, entryIndex, ctx)
    if (host) {
      const fromBlocks = getRefGroupExcerptFromBlocks(host, ctx, title)
      if (fromBlocks) return fromBlocks
    }

    const parts: string[] = []
    if (title) parts.push(title)

    const { contentRange } = getTocEntrySectionContentRange(flat, entryIndex, doc)
    if (contentRange) {
      const body = doc.textBetween(contentRange.from, contentRange.to, '\n\n').trim()
      if (body) parts.push(body)
    }

    for (let j = entryIndex + 1; j < flat.length; j += 1) {
      if (flat[j].level <= entry.level) break
      if (flat[j].sourceType === 'ref-child' && flat[j].text.trim()) {
        parts.push(flat[j].text.trim())
      }
    }

    const text = parts.join('\n\n').trim()
    if (!text) return null
    return { text, title: excerptTitleFromText(text) }
  }

  if (entry.sourceType === 'ref-child') {
    const host = resolveRefHostFromEntry(entry, flat, entryIndex, ctx)
    if (host) {
      const fromBlocks = getRefChildSectionExcerpt(host, entry, ctx)
      if (fromBlocks) return fromBlocks
    }
    const text = entry.text.trim() || entry.targetText?.trim() || ''
    if (!text) return null
    return { text, title: excerptTitleFromText(text) }
  }

  return null
}

function resolveRefHostFromEntry(
  entry: FlatTocEntry,
  flat: FlatTocEntry[],
  entryIndex: number,
  ctx: TocCollectContext,
): RefGutterHostContext | null {
  if (!entry.blockId || !entry.refId) return null

  const hostBlock = ctx.blocks.find((block) => block.id === entry.blockId)
  const refType: 'block' | 'page' = hostBlock?.refType === 'page' ? 'page' : 'block'

  let contentParentLevel = entry.level > 0 ? entry.level : 0
  if (entry.sourceType === 'ref-child') {
    for (let j = entryIndex - 1; j >= 0; j -= 1) {
      if (flat[j].pos !== entry.pos) continue
      if (flat[j].sourceType === 'ref-group') {
        contentParentLevel = flat[j].level > 0 ? flat[j].level : contentParentLevel
        break
      }
    }
  }

  return {
    hostBlockId: entry.blockId,
    refId: entry.refId,
    refType,
    contentParentLevel,
  }
}

function collectTopLevelBlockIdsBetween(doc: ProseMirrorNode, fromPos: number, toPos: number): string[] {
  const ids: string[] = []
  let childPos = 0
  for (let i = 0; i < doc.childCount; i += 1) {
    const child = doc.child(i)
    if (childPos >= fromPos && childPos < toPos) {
      const childBlockId = child.attrs?.blockId
      if (childBlockId) ids.push(childBlockId)
    }
    childPos += child.nodeSize
  }
  return ids
}

/** 标题 section 或单块：用于依据标注的 spannedBlockIds */
export function collectBasisBlockIds(
  doc: ProseMirrorNode,
  blockId: string,
  ctx: TocCollectContext,
): string[] {
  const found = findTopLevelBlock(doc, blockId)
  if (!found) return [blockId]
  const { pos, node } = found

  if (node.type.name !== 'heading') {
    return [blockId]
  }

  const flat = collectFlatTocEntries(doc, ctx)
  const entryIndex = flat.findIndex((entry) => (
    entry.blockId === blockId && entry.pos === pos && entry.sourceType === 'local'
  ))
  if (entryIndex < 0) return [blockId]

  const boundaryPos = getTocSectionBoundaryPos(flat, entryIndex, doc)
  const ids = collectTopLevelBlockIdsBetween(doc, pos, boundaryPos)
  return ids.length > 0 ? ids : [blockId]
}

export function collectTocEntryBasisBlockIds(
  doc: ProseMirrorNode,
  flat: FlatTocEntry[],
  entryId: string,
  ctx: TocCollectContext,
): string[] {
  const entryIndex = flat.findIndex((entry) => entry.id === entryId)
  if (entryIndex < 0) return []
  const entry = flat[entryIndex]
  const boundaryPos = getTocSectionBoundaryPos(flat, entryIndex, doc)

  if (entry.sourceType === 'local') {
    return collectBasisBlockIds(doc, entry.blockId, ctx)
  }

  if (entry.sourceType === 'ref-group') {
    const ids = collectTopLevelBlockIdsBetween(doc, entry.pos, boundaryPos)
    return ids.length > 0 ? ids : (entry.blockId ? [entry.blockId] : [])
  }

  return entry.blockId ? [entry.blockId] : []
}
