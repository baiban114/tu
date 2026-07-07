import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export const HEADING_FOLD_COMMENT_RE = /<!--tu:heading-fold\s+([^>]+)-->/
export const HEADING_ID_COMMENT_RE = /<!--tu:heading-id\s+([^>]+)-->/

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;')
}

function parseAttrString(attrsStr: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([\w-]+)="([^"]*)"/g
  let match: RegExpExecArray | null
  while ((match = re.exec(attrsStr)) !== null) {
    attrs[match[1]] = match[2]
  }
  return attrs
}

export function parseHeadingFoldComment(attrsStr: string): { blockId: string; sectionCollapsed: boolean } | null {
  const attrs = parseAttrString(attrsStr)
  const blockId = attrs.id
  if (!blockId) return null
  return {
    blockId,
    sectionCollapsed: attrs.collapsed === 'true',
  }
}

export function serializeHeadingFoldComment(blockId: string): string {
  return `<!--tu:heading-fold id="${escapeAttr(blockId)}" collapsed="true"-->`
}

export function parseHeadingIdComment(attrsStr: string): { blockId: string } | null {
  const attrs = parseAttrString(attrsStr)
  const blockId = attrs.id
  if (!blockId) return null
  return { blockId }
}

export function serializeHeadingIdComment(blockId: string): string {
  return `<!--tu:heading-id id="${escapeAttr(blockId)}"-->`
}

export interface HeadingSectionContentRange {
  from: number
  to: number
}

export function getHeadingSectionContentRange(
  doc: ProseMirrorNode,
  headingPos: number,
): HeadingSectionContentRange | null {
  const heading = doc.nodeAt(headingPos)
  if (!heading || heading.type.name !== 'heading') return null

  const level = Number(heading.attrs.level) || 1
  const from = headingPos + heading.nodeSize
  let to = doc.content.size

  doc.forEach((node, offset) => {
    if (offset < from) return
    if (node.type.name !== 'heading') return
    const hLevel = Number(node.attrs.level) || 1
    if (hLevel <= level && offset < to) {
      to = offset
    }
  })

  if (from >= to) return null
  return { from, to }
}

export interface HeadingSectionInfo {
  headingPos: number
  level: number
  contentRange: HeadingSectionContentRange
}

export function iterHeadingSections(doc: ProseMirrorNode): HeadingSectionInfo[] {
  const sections: HeadingSectionInfo[] = []
  doc.forEach((node, offset) => {
    if (node.type.name !== 'heading') return
    const contentRange = getHeadingSectionContentRange(doc, offset)
    if (!contentRange) return
    sections.push({
      headingPos: offset,
      level: Number(node.attrs.level) || 1,
      contentRange,
    })
  })
  return sections
}

export function getCollapsedHeadingSectionRanges(doc: ProseMirrorNode): HeadingSectionContentRange[] {
  const ranges: HeadingSectionContentRange[] = []
  doc.forEach((node, offset) => {
    if (node.type.name !== 'heading') return
    if (!node.attrs.sectionCollapsed) return
    const range = getHeadingSectionContentRange(doc, offset)
    if (range) ranges.push(range)
  })
  return ranges
}

export function isRangeOverlappingSection(
  pos: number,
  nodeSize: number,
  section: HeadingSectionContentRange,
): boolean {
  const end = pos + nodeSize
  return pos >= section.from && pos < section.to
}
