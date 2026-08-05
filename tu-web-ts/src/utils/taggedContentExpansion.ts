import type { JSONContent } from '@tiptap/core'
import type { Block, PageContent } from '@/api/types'
import { tipTapToBlocks } from '@/editor/converters'
import { resolvePageDocument } from '@/editor/pageDocument'

export interface BlockIdLocation {
  parent: JSONContent
  index: number
}

/** Locate a node by `attrs.blockId` inside a Tiptap document tree. */
export function findNodeByBlockId(node: JSONContent, blockId: string): BlockIdLocation | null {
  if (!node.content) return null
  for (let i = 0; i < node.content.length; i += 1) {
    const child = node.content[i]!
    if (child.attrs?.blockId === blockId) return { parent: node, index: i }
    const nested = findNodeByBlockId(child, blockId)
    if (nested) return nested
  }
  return null
}

/**
 * Extract the heading node (by blockId) plus its following siblings until the
 * next heading at the same or higher level — i.e. a document section (单元).
 */
export function extractSectionDocument(content: PageContent, headingBlockId: string): JSONContent | null {
  const doc = resolvePageDocument(content)
  const found = findNodeByBlockId(doc, headingBlockId)
  if (!found) return null
  const siblings = found.parent.content!
  const headingNode = siblings[found.index]!
  if (headingNode.type !== 'heading') return null
  const level = Number(headingNode.attrs?.level ?? 0)
  if (level <= 0) return null

  const collected: JSONContent[] = [headingNode]
  for (let i = found.index + 1; i < siblings.length; i += 1) {
    const node = siblings[i]!
    if (node.type === 'heading' && Number(node.attrs?.level ?? 0) <= level) break
    collected.push(node)
  }
  return { type: 'doc', content: collected }
}

/** Extract a single node (by blockId) as a standalone document. */
export function extractBlockDocument(content: PageContent, blockId: string): JSONContent | null {
  const doc = resolvePageDocument(content)
  const found = findNodeByBlockId(doc, blockId)
  if (!found) return null
  return { type: 'doc', content: [found.parent.content![found.index]!] }
}

/** Convert a Tiptap document slice to renderable blocks (richtext + embeds). */
export function documentToBlocks(doc: JSONContent): Block[] {
  return tipTapToBlocks(doc)
}
