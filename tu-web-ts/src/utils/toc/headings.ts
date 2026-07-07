import type { Block, HeadingSourceBinding } from '@/api/types'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export type TocSourceType = 'local' | 'ref-group' | 'ref-child' | 'ref-doc-block'

export interface FlatTocEntry {
  id: string
  blockId: string
  level: number
  text: string
  pos: number
  sortIndex: number
  sourceType: TocSourceType
  refId?: string
  targetText?: string
  sourceBinding?: HeadingSourceBinding
  contentTreeNodeId?: string
  previewText?: string
  estimatedHours?: number
  totalEstimatedHours?: number
}

export interface TocTreeItem {
  id: string
  blockId: string
  level: number
  text: string
  pos: number
  sourceType: TocSourceType
  refId?: string
  targetText?: string
  sourceBinding?: HeadingSourceBinding
  children?: TocTreeItem[]
}

export function clampHeadingLevel(level: number): number {
  return Math.min(6, Math.max(1, level))
}

/** Find the nearest preceding heading level in a ProseMirror document. */
export function findParentHeadingLevel(doc: ProseMirrorNode, pos: number): number {
  let nearestPos = -1
  let nearestLevel = 0
  doc.descendants((node, nodePos) => {
    if (node.type.name === 'heading' && nodePos < pos && nodePos > nearestPos) {
      nearestPos = nodePos
      nearestLevel = node.attrs?.level || 1
    }
    return true
  })
  return nearestLevel
}

/** Ref wrapper heading level (matches RefBlockView when tocSettings.hideTitle is false). */
export function computeRefWrapperLevel(
  refAttrs: Record<string, unknown>,
  doc: ProseMirrorNode,
  pos: number,
): number {
  const explicitLevel = Number(refAttrs.headingLevel || 0)
  if (explicitLevel > 0) return clampHeadingLevel(explicitLevel)
  return clampHeadingLevel(findParentHeadingLevel(doc, pos) + 1)
}

function minHeadingLevelInContent(content: string): number {
  let min = Infinity
  for (const line of content.split('\n')) {
    const match = line.match(/^(#{1,6})\s+/)
    if (match) min = Math.min(min, match[1].length)
  }
  return min
}

/** Minimum ATX heading level (# count) in rich-text blocks (richtext + externalResource excerpt). */
function minHeadingLevelInBlocks(blocks: Block[]): number {
  let min = Infinity
  const walk = (list: Block[]) => {
    for (const block of list) {
      if (block.type === 'richtext' || block.type === 'richText') {
        if (block.content) min = Math.min(min, minHeadingLevelInContent(block.content))
      } else if (block.type === 'externalResource') {
        const excerptText = block.externalResource?.snapshot?.excerptText
        if (excerptText) min = Math.min(min, minHeadingLevelInContent(excerptText))
      }
      if (block.children) walk(block.children)
    }
  }
  walk(blocks)
  return min
}

/** Shift heading levels in markdown content by `offset` (positive = deeper). */
function shiftContentHeadings(content: string, offset: number): string {
  if (offset === 0) return content
  return content.replace(/^(#{1,6})(?=\s)/gm, (match) => {
    const newLevel = Math.min(6, match.length + offset)
    return '#'.repeat(newLevel)
  })
}

function shiftBlockHeadings(block: Block, offset: number): Block {
  if (offset === 0) return block
  if (block.type === 'container' && block.children) {
    return { ...block, children: shiftBlocksHeadings(block.children, offset) }
  }
  if (block.type === 'richtext' || block.type === 'richText') {
    if (!block.content) return block
    return { ...block, content: shiftContentHeadings(block.content, offset) }
  }
  if (block.type === 'externalResource') {
    const excerptText = block.externalResource?.snapshot?.excerptText
    if (!excerptText || !block.externalResource) return block
    return {
      ...block,
      externalResource: {
        ...block.externalResource,
        snapshot: {
          ...block.externalResource.snapshot,
          excerptText: shiftContentHeadings(excerptText, offset),
        },
      },
    }
  }
  return block
}

function shiftBlocksHeadings(blocks: Block[], offset: number): Block[] {
  if (offset === 0) return blocks
  return blocks.map((block) => shiftBlockHeadings(block, offset))
}

/**
 * Shift referenced richtext headings so rendered h-levels nest under the ref wrapper
 * (same logic as RefBlockView.withShiftedHeadings).
 */
export function applyRefContentHeadingShift(blocks: Block[], contentParentLevel: number): Block[] {
  if (contentParentLevel === 0) return blocks
  const minChild = minHeadingLevelInBlocks(blocks)
  if (!isFinite(minChild)) return blocks
  const offset = Math.max(0, contentParentLevel + 1 - minChild)
  if (offset === 0) return blocks
  return shiftBlocksHeadings(blocks, offset)
}

interface MarkdownHeading {
  text: string
  level: number
  blockId: string
}

function stripMarkdownHeadingText(raw: string): string {
  let text = raw.trim()
  text = text.replace(/\s*#+\s*$/, '').trim()
  text = text.replace(/\*\*(.+?)\*\*/g, '$1')
  text = text.replace(/\*(.+?)\*/g, '$1')
  text = text.replace(/`(.+?)`/g, '$1')
  text = text.replace(/\[(.+?)\]\(.+?\)/g, '$1')
  return text
}

function parseMarkdownHeadingLines(
  content: string,
  blockId: string,
  seen: Set<string>,
): MarkdownHeading[] {
  const result: MarkdownHeading[] = []
  const normalized = content.replace(/\r\n/g, '\n')
  for (const line of normalized.split('\n')) {
    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (!match) continue
    const level = match[1].length
    const text = stripMarkdownHeadingText(match[2])
    const key = `${blockId}:${text}`
    if (text && !seen.has(key)) {
      seen.add(key)
      result.push({ text, level, blockId })
    }
  }
  return result
}

/**
 * Extract ATX markdown headings from rich-text sources in blocks:
 * richtext, externalResource excerptText, and container children.
 */
export function extractRichTextHeadingsFromBlocks(blocks: Block[]): MarkdownHeading[] {
  const result: MarkdownHeading[] = []
  const seen = new Set<string>()

  const walk = (list: Block[]) => {
    for (const block of list) {
      if (block.type === 'richtext' || block.type === 'richText') {
        if (block.content) {
          result.push(...parseMarkdownHeadingLines(block.content, block.id, seen))
        }
      } else if (block.type === 'externalResource') {
        const excerptText = block.externalResource?.snapshot?.excerptText
        if (excerptText?.trim()) {
          result.push(...parseMarkdownHeadingLines(excerptText, block.id, seen))
        }
      }
      if (block.children) walk(block.children)
    }
  }

  walk(blocks)
  return result
}

/** Build a heading hierarchy tree from a flat, document-ordered list. */
export function buildHeadingTree(flat: FlatTocEntry[]): TocTreeItem[] {
  const sorted = [...flat].sort((a, b) => a.pos - b.pos || a.sortIndex - b.sortIndex)
  const root: TocTreeItem[] = []
  const stack: TocTreeItem[] = []

  for (const entry of sorted) {
    const node: TocTreeItem = {
      id: entry.id,
      blockId: entry.blockId,
      level: entry.level,
      text: entry.text,
      pos: entry.pos,
      sourceType: entry.sourceType,
      refId: entry.refId,
      targetText: entry.targetText,
      sourceBinding: entry.sourceBinding,
    }

    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop()
    }

    if (stack.length > 0) {
      const parent = stack[stack.length - 1]
      if (!parent.children) parent.children = []
      parent.children.push(node)
    } else {
      root.push(node)
    }

    stack.push(node)
  }

  return root
}
