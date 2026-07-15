import type { Block } from '@/api/types'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/vue-3'
import {
  collectBasisBlockIds,
  excerptTitleFromText,
  getBlockExcerptContent,
  type BlockExcerptContent,
} from '@/utils/blockExcerptContent'
import type { RefGutterHostContext } from '@/editor/refGutterBridge'
import {
  applyRefContentHeadingShift,
  extractRichTextHeadingsFromBlocks,
  type FlatTocEntry,
} from '@/utils/toc/headings'
import type { TocCollectContext } from '@/utils/toc/collectFlatTocEntries'

function blockToPlainText(block: Block): string {
  if (block.type === 'richtext' && block.content?.trim()) {
    return block.content.trim()
  }
  if (block.type === 'externalResource') {
    const excerpt = block.externalResource?.snapshot?.excerptText?.trim()
    if (excerpt) return excerpt
  }
  if (block.title?.trim()) return block.title.trim()
  if (block.children?.length) {
    return block.children.map(blockToPlainText).filter(Boolean).join('\n\n')
  }
  return ''
}

export function resolveRefContentBlocks(
  host: RefGutterHostContext,
  ctx: TocCollectContext,
): Block[] {
  if (host.refType === 'page') {
    return ctx.getPageBlocks(host.refId) ?? []
  }
  const block = ctx.getBlock(host.refId)
  if (!block) return []
  if (block.type === 'container' && block.children?.length) {
    return block.children
  }
  return [block]
}

function getShiftedRefContentBlocks(host: RefGutterHostContext, ctx: TocCollectContext): Block[] {
  const blocks = resolveRefContentBlocks(host, ctx)
  return applyRefContentHeadingShift(blocks, host.contentParentLevel)
}

export function getRefChildSectionExcerpt(
  host: RefGutterHostContext,
  entry: FlatTocEntry,
  ctx: TocCollectContext,
): BlockExcerptContent | null {
  const match = /^ref-child-(.+)-(\d+)$/.exec(entry.id)
  if (!match) return null

  const headingIndex = Number.parseInt(match[2], 10)
  if (!Number.isFinite(headingIndex) || headingIndex < 0) return null

  const shiftedBlocks = getShiftedRefContentBlocks(host, ctx)
  const headings = extractRichTextHeadingsFromBlocks(shiftedBlocks)
  const heading = headings[headingIndex]
  if (!heading) return null

  const headingText = heading.text.trim() || entry.text.trim()
  if (!headingText) return null

  const bodyParts: string[] = []
  for (const block of shiftedBlocks) {
    if (block.type !== 'richtext' || !block.content?.trim()) continue
    const lines = block.content.split(/\r?\n/)
    let inSection = false
    let currentLevel = 0
    const collected: string[] = []

    for (const line of lines) {
      const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line)
      if (headingMatch) {
        const level = headingMatch[1].length
        const text = headingMatch[2].trim()
        if (text === headingText && level === heading.level) {
          inSection = true
          currentLevel = level
          continue
        }
        if (inSection && level <= currentLevel) break
      }
      if (inSection) collected.push(line)
    }

    const body = collected.join('\n').trim()
    if (body) bodyParts.push(body)
  }

  const text = bodyParts.length > 0
    ? `${headingText}\n\n${bodyParts.join('\n\n')}`
    : headingText
  return { text, title: excerptTitleFromText(text) }
}

export function getRefInnerBlockExcerptContent(
  host: RefGutterHostContext,
  innerBlockId: string,
  innerEditor: Editor,
  ctx: TocCollectContext,
): BlockExcerptContent | null {
  const doc = innerEditor.state.doc as ProseMirrorNode
  return getBlockExcerptContent(doc, innerBlockId, ctx)
}

export function collectRefInnerBasisBlockIds(
  host: RefGutterHostContext,
  innerBlockId: string,
  innerEditor: Editor,
  ctx: TocCollectContext,
): string[] {
  const doc = innerEditor.state.doc as ProseMirrorNode
  const innerIds = collectBasisBlockIds(doc, innerBlockId, ctx)
  return innerIds.length > 0 ? [host.hostBlockId] : [host.hostBlockId]
}

export function getRefGroupExcerptFromBlocks(
  host: RefGutterHostContext,
  ctx: TocCollectContext,
  groupTitle: string,
): BlockExcerptContent | null {
  const blocks = getShiftedRefContentBlocks(host, ctx)
  const body = blocks.map(blockToPlainText).filter(Boolean).join('\n\n').trim()
  const parts = [groupTitle.trim(), body].filter(Boolean)
  const text = parts.join('\n\n').trim()
  if (!text) return null
  return { text, title: excerptTitleFromText(text) }
}
