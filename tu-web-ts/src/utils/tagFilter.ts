import type { BlockTag, TextTagSpan } from '@/api/types'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { normalizeBlockTags, normalizeTagLabel } from '@/utils/blockMetadata'
import { mergeTagPools } from '@/utils/pageMetadata'
import type { TocCollectContext } from '@/utils/toc/collectFlatTocEntries'
import type { FlatTocEntry } from '@/utils/toc/headings'
import {
  getLocalSectionTagLookupKeys,
  getSectionTagKey,
  resolveEntrySectionTags,
  sectionTagsMapFromMetadata,
  type SectionTagAnchor,
  type SectionTagsMap,
} from '@/utils/sectionMetadata'
import { getTocSectionBoundaryPos } from '@/utils/toc/tocSections'
import {
  collectTextTagSpanTags,
  resolveTextTagSpanRanges,
  type ResolvedTextTagSpanRange,
} from '@/utils/textTagSpanMetadata'

const EMBED_BLOCK_TYPES = new Set([
  'x6Block',
  'tableBlock',
  'multiTableBlock',
  'timelineBlock',
  'spacerBlock',
  'refBlock',
  'externalResourceBlock',
  'urlEmbedBlock',
  'pdfExcerptBlock',
])

export interface TagFilterHiddenRange {
  from: number
  to: number
}

export interface TagFilterDecorationSpec {
  from: number
  to: number
  type: 'node' | 'inline'
}

const TEXT_CONTAINER_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'listItem',
  'taskItem',
])

/** Leaf blocks that map to a single markdown visual unit (may sit inside listItem/blockquote). */
const MARKDOWN_LEAF_BLOCK_TYPES = new Set(['paragraph', 'codeBlock', 'image'])

const LIST_ITEM_NODE_TYPES = new Set(['listItem', 'taskItem'])
const LIST_ROOT_NODE_TYPES = new Set(['bulletList', 'orderedList', 'taskList'])
const BLOCK_CONTAINER_NODE_TYPES = new Set([...LIST_ROOT_NODE_TYPES, 'blockquote'])

export function isEmbedBlockType(typeName: string): boolean {
  return EMBED_BLOCK_TYPES.has(typeName)
}

export function tagMatchesFilter(active: BlockTag, tags: BlockTag[]): boolean {
  if (tags.length === 0) return false
  const activeLabel = normalizeTagLabel(active.label).toLowerCase()
  return tags.some((tag) => (
    tag.id === active.id
    || normalizeTagLabel(tag.label).toLowerCase() === activeLabel
  ))
}

function getEntrySectionTags(
  entry: FlatTocEntry,
  sectionTagsMap: SectionTagsMap,
  doc?: ProseMirrorNode,
  sectionTagAnchors?: Record<string, SectionTagAnchor>,
): BlockTag[] {
  if (entry.sourceType === 'local' && doc) {
    return resolveEntrySectionTags(entry, sectionTagsMap, doc, sectionTagAnchors)
  }
  return sectionTagsMap[getSectionTagKey(entry)] ?? []
}

function enrichSectionTagsMapWithAnchors(
  flat: FlatTocEntry[],
  doc: ProseMirrorNode,
  sectionTagsMap: SectionTagsMap,
  sectionTagAnchors?: Record<string, SectionTagAnchor>,
): SectionTagsMap {
  const enriched: SectionTagsMap = { ...sectionTagsMap }
  for (const entry of flat) {
    if (entry.sourceType !== 'local') continue
    const tags = resolveEntrySectionTags(entry, sectionTagsMap, doc, sectionTagAnchors)
    if (!tags.length) continue
    for (const key of getLocalSectionTagLookupKeys(entry, doc)) {
      enriched[key] = tags
    }
  }
  return enriched
}

function isEntryTagsVisible(
  entry: FlatTocEntry,
  sectionTagsMap: SectionTagsMap,
  activeTag: BlockTag,
  doc?: ProseMirrorNode,
): boolean {
  const tags = getEntrySectionTags(entry, sectionTagsMap, doc, undefined)
  if (tags.length === 0) return false
  return tagMatchesFilter(activeTag, tags)
}

export function isTocEntryVisible(
  entry: FlatTocEntry,
  flat: FlatTocEntry[],
  sectionTagsMap: SectionTagsMap,
  activeTag: BlockTag | null,
  doc?: ProseMirrorNode,
): boolean {
  if (!activeTag) return true

  if (entry.sourceType === 'ref-group') {
    if (isEntryTagsVisible(entry, sectionTagsMap, activeTag, doc)) return true
    return flat.some((item) => (
      item.sourceType === 'ref-child'
      && item.blockId === entry.blockId
      && item.pos === entry.pos
      && isEntryTagsVisible(item, sectionTagsMap, activeTag, doc)
    ))
  }

  return isEntryTagsVisible(entry, sectionTagsMap, activeTag, doc)
}

/** Local heading sections containing pos, innermost (deepest level) first. */
function getEnclosingLocalSections(
  flat: FlatTocEntry[],
  pos: number,
  doc: ProseMirrorNode,
): FlatTocEntry[] {
  const enclosing: FlatTocEntry[] = []
  for (let index = 0; index < flat.length; index += 1) {
    const entry = flat[index]
    if (entry.sourceType !== 'local') continue
    const heading = doc.nodeAt(entry.pos)
    if (!heading || heading.type.name !== 'heading') continue
    const boundary = getTocSectionBoundaryPos(flat, index, doc)
    if (pos >= entry.pos && pos < boundary) {
      enclosing.push(entry)
    }
  }
  return enclosing.sort((a, b) => b.level - a.level)
}

/**
 * Section-tag visibility at a document position.
 * Walk innermost → outer local sections; the first section with explicit section
 * tags decides match. Untagged inner sections inherit from the next outer tagged
 * ancestor. Child blocks/text with their own tags are handled separately in
 * isNodeVisible / isEmbedNodeVisible / isTextContainerNodeVisible.
 */
function isPosVisibleBySectionTags(
  pos: number,
  flat: FlatTocEntry[],
  doc: ProseMirrorNode,
  sectionTagsMap: SectionTagsMap,
  activeTag: BlockTag,
  sectionTagAnchors?: Record<string, SectionTagAnchor>,
): boolean {
  for (const entry of getEnclosingLocalSections(flat, pos, doc)) {
    const tags = getEntrySectionTags(entry, sectionTagsMap, doc, sectionTagAnchors)
    if (tags.length > 0) {
      return tagMatchesFilter(activeTag, tags)
    }
  }

  for (let index = 0; index < flat.length; index += 1) {
    const entry = flat[index]
    if (entry.sourceType === 'ref-group' && isTocEntryVisible(entry, flat, sectionTagsMap, activeTag, doc)) {
      const boundary = getTocSectionBoundaryPos(flat, index, doc)
      if (pos >= entry.pos && pos < boundary) return true
    }
  }

  return false
}

export function isEmbedNodeVisible(
  pos: number,
  node: ProseMirrorNode,
  doc: ProseMirrorNode,
  flat: FlatTocEntry[],
  sectionTagsMap: SectionTagsMap,
  activeTag: BlockTag | null,
  sectionTagAnchors?: Record<string, SectionTagAnchor>,
): boolean {
  if (!activeTag) return true

  const blockTags = normalizeBlockTags(
    (node.attrs?.metadata as { tags?: BlockTag[] } | undefined)?.tags,
  )
  if (blockTags.length > 0) {
    return tagMatchesFilter(activeTag, blockTags)
  }

  if (node.type.name === 'refBlock' || node.type.name === 'externalResourceBlock') {
    const blockId = String(node.attrs?.blockId || '')
    const refGroup = flat.find((entry) => (
      entry.sourceType === 'ref-group'
      && entry.pos === pos
      && entry.blockId === blockId
    ))
    if (refGroup && isTocEntryVisible(refGroup, flat, sectionTagsMap, activeTag, doc)) {
      return true
    }
    return flat.some((entry) => (
      entry.sourceType === 'ref-child'
      && entry.pos === pos
      && entry.blockId === blockId
      && isEntryTagsVisible(entry, sectionTagsMap, activeTag, doc)
    ))
  }

  return isPosVisibleBySectionTags(pos, flat, doc, sectionTagsMap, activeTag, sectionTagAnchors)
}

function getNodeInlineContentRange(pos: number, node: ProseMirrorNode): { from: number; to: number } | null {
  if (!TEXT_CONTAINER_TYPES.has(node.type.name) || node.nodeSize <= 2) return null
  return { from: pos + 1, to: pos + node.nodeSize - 1 }
}

function spansOverlappingRange(
  ranges: ResolvedTextTagSpanRange[],
  from: number,
  to: number,
): ResolvedTextTagSpanRange[] {
  return ranges.filter((range) => range.from < to && from < range.to)
}

function addHiddenGap(
  hidden: TagFilterDecorationSpec[],
  from: number,
  to: number,
  type: TagFilterDecorationSpec['type'],
) {
  if (to <= from) return
  hidden.push({ from, to, type })
}

function buildInlineHidesForTaggedBlock(
  contentFrom: number,
  contentTo: number,
  overlapping: ResolvedTextTagSpanRange[],
  activeTag: BlockTag,
): TagFilterDecorationSpec[] {
  const matching = overlapping.filter((range) => tagMatchesFilter(activeTag, range.tags))
  if (matching.length === 0) {
    return [{ from: contentFrom, to: contentTo, type: 'inline' }]
  }

  const specs: TagFilterDecorationSpec[] = []
  const sorted = [...matching].sort((a, b) => a.from - b.from)
  let cursor = contentFrom
  for (const range of sorted) {
    const visibleFrom = Math.max(contentFrom, range.from)
    const visibleTo = Math.min(contentTo, range.to)
    if (visibleTo <= visibleFrom) continue
    addHiddenGap(specs, cursor, visibleFrom, 'inline')
    cursor = Math.max(cursor, visibleTo)
  }
  addHiddenGap(specs, cursor, contentTo, 'inline')
  return specs
}

function isTextContainerNodeVisible(
  pos: number,
  node: ProseMirrorNode,
  doc: ProseMirrorNode,
  flat: FlatTocEntry[],
  sectionTagsMap: SectionTagsMap,
  activeTag: BlockTag,
  resolvedSpans: ResolvedTextTagSpanRange[],
  sectionTagAnchors?: Record<string, SectionTagAnchor>,
): boolean | 'partial' {
  const content = getNodeInlineContentRange(pos, node)
  if (!content) {
    return isPosVisibleBySectionTags(pos, flat, doc, sectionTagsMap, activeTag, sectionTagAnchors)
  }

  const overlapping = spansOverlappingRange(resolvedSpans, content.from, content.to)
  if (overlapping.length > 0) {
    return overlapping.some((range) => tagMatchesFilter(activeTag, range.tags)) ? 'partial' : false
  }

  return isPosVisibleBySectionTags(pos, flat, doc, sectionTagsMap, activeTag, sectionTagAnchors)
}

function isNodeVisible(
  pos: number,
  node: ProseMirrorNode,
  doc: ProseMirrorNode,
  flat: FlatTocEntry[],
  sectionTagsMap: SectionTagsMap,
  activeTag: BlockTag,
  resolvedSpans: ResolvedTextTagSpanRange[],
  sectionTagAnchors?: Record<string, SectionTagAnchor>,
): boolean {
  if (node.type.name === 'heading') {
    const content = getNodeInlineContentRange(pos, node)
    const overlapping = content
      ? spansOverlappingRange(resolvedSpans, content.from, content.to)
      : []
    if (overlapping.length > 0) {
      return overlapping.some((range) => tagMatchesFilter(activeTag, range.tags))
    }
    return isPosVisibleBySectionTags(pos, flat, doc, sectionTagsMap, activeTag, sectionTagAnchors)
  }

  if (isEmbedBlockType(node.type.name)) {
    return isEmbedNodeVisible(pos, node, doc, flat, sectionTagsMap, activeTag, sectionTagAnchors)
  }

  if (TEXT_CONTAINER_TYPES.has(node.type.name)) {
    const result = isTextContainerNodeVisible(
      pos, node, doc, flat, sectionTagsMap, activeTag, resolvedSpans, sectionTagAnchors,
    )
    return result === true || result === 'partial'
  }

  return isPosVisibleBySectionTags(pos, flat, doc, sectionTagsMap, activeTag, sectionTagAnchors)
}

function findAncestorPos(
  doc: ProseMirrorNode,
  pos: number,
  typeNames: Set<string>,
): number | null {
  const $pos = doc.resolve(pos)
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if (typeNames.has($pos.node(depth).type.name)) {
      return $pos.before(depth)
    }
  }
  return null
}

function isRangeFullyCovered(
  from: number,
  to: number,
  nodeHides: Array<{ from: number; to: number }>,
): boolean {
  return nodeHides.some((hide) => hide.from <= from && hide.to >= to)
}

/** Promote a fully-hidden leaf block to its listItem wrapper so bullets/indent hide too. */
function expandFullHideToMarkdownBlock(
  doc: ProseMirrorNode,
  pos: number,
  node: ProseMirrorNode,
): { from: number; to: number } {
  if (MARKDOWN_LEAF_BLOCK_TYPES.has(node.type.name)) {
    const listItemPos = findAncestorPos(doc, pos, LIST_ITEM_NODE_TYPES)
    if (listItemPos != null) {
      const listItem = doc.nodeAt(listItemPos)!
      return { from: listItemPos, to: listItemPos + listItem.nodeSize }
    }
  }
  return { from: pos, to: pos + node.nodeSize }
}

function mergeNodeHideRanges(
  ranges: Array<{ from: number; to: number }>,
): Array<{ from: number; to: number }> {
  if (ranges.length === 0) return ranges
  const sorted = [...ranges].sort((a, b) => a.from - b.from || a.to - b.to)
  const merged: Array<{ from: number; to: number }> = [sorted[0]]
  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index]
    const last = merged[merged.length - 1]
    if (current.from <= last.to) {
      last.to = Math.max(last.to, current.to)
    } else {
      merged.push(current)
    }
  }
  return merged
}

/** When every child of a list/blockquote is hidden, hide the container (ul/indent/border). */
function consolidateMarkdownBlockContainerHides(
  doc: ProseMirrorNode,
  nodeHides: Array<{ from: number; to: number }>,
): Array<{ from: number; to: number }> {
  const next = [...nodeHides]

  doc.descendants((node, pos) => {
    if (!BLOCK_CONTAINER_NODE_TYPES.has(node.type.name)) return true

    if (node.childCount === 0) return false

    let allChildrenHidden = true
    node.forEach((child, offset) => {
      const childPos = pos + 1 + offset
      const childEnd = childPos + child.nodeSize
      if (!isRangeFullyCovered(childPos, childEnd, next)) {
        allChildrenHidden = false
      }
    })

    if (allChildrenHidden) {
      next.push({ from: pos, to: pos + node.nodeSize })
    }

    return false
  })

  return next
}

/** ProseMirror node decorations must target one block each; split merged ranges. */
function splitNodeHideRangesToBlockNodes(
  doc: ProseMirrorNode,
  ranges: Array<{ from: number; to: number }>,
): Array<{ from: number; to: number }> {
  const specs: Array<{ from: number; to: number }> = []
  const seen = new Set<string>()

  for (const range of ranges) {
    doc.nodesBetween(range.from, range.to, (node, pos) => {
      if (!node.isBlock) return true
      const end = pos + node.nodeSize
      if (pos < range.from || end > range.to) return true
      const key = `${pos}:${end}`
      if (seen.has(key)) return false
      seen.add(key)
      specs.push({ from: pos, to: end })
      return false
    })
  }

  return specs.sort((a, b) => a.from - b.from)
}

function finalizeTagFilterNodeHides(
  doc: ProseMirrorNode,
  specs: TagFilterDecorationSpec[],
): TagFilterDecorationSpec[] {
  const inlineSpecs = specs.filter((spec) => spec.type === 'inline')
  const expandedNodeHides = specs
    .filter((spec) => spec.type === 'node')
    .map(({ from, to }) => ({ from, to }))
  const consolidated = consolidateMarkdownBlockContainerHides(doc, expandedNodeHides)
  const perNode = splitNodeHideRangesToBlockNodes(doc, consolidated)
  return [
    ...inlineSpecs,
    ...perNode.map(({ from, to }) => ({ from, to, type: 'node' as const })),
  ]
}

export function buildTagFilterDecorationSpecs(
  doc: ProseMirrorNode,
  flat: FlatTocEntry[],
  sectionTagsMap: SectionTagsMap,
  activeTag: BlockTag | null,
  textTagSpans: TextTagSpan[] = [],
  sectionTagAnchors?: Record<string, SectionTagAnchor>,
): TagFilterDecorationSpec[] {
  if (!activeTag) return []

  const resolvedSectionTagsMap = enrichSectionTagsMapWithAnchors(
    flat,
    doc,
    sectionTagsMap,
    sectionTagAnchors,
  )

  const resolvedSpans = resolveTextTagSpanRanges(doc, textTagSpans)
  const hidden: TagFilterDecorationSpec[] = []

  const applyTextContainerFilter = (offset: number, node: ProseMirrorNode) => {
    const visibility = isTextContainerNodeVisible(
      offset,
      node,
      doc,
      flat,
      resolvedSectionTagsMap,
      activeTag,
      resolvedSpans,
      sectionTagAnchors,
    )
    if (visibility === false) {
      const target = expandFullHideToMarkdownBlock(doc, offset, node)
      hidden.push({ from: target.from, to: target.to, type: 'node' })
      return
    }
    if (visibility === 'partial') {
      const content = getNodeInlineContentRange(offset, node)!
      const overlapping = spansOverlappingRange(resolvedSpans, content.from, content.to)
      hidden.push(...buildInlineHidesForTaggedBlock(content.from, content.to, overlapping, activeTag))
    }
  }

  doc.descendants((node, offset) => {
    if (node.type.name === 'heading') {
      if (!isNodeVisible(
        offset, node, doc, flat, resolvedSectionTagsMap, activeTag, resolvedSpans, sectionTagAnchors,
      )) {
        hidden.push({ from: offset, to: offset + node.nodeSize, type: 'node' })
      } else {
        const content = getNodeInlineContentRange(offset, node)
        if (content) {
          const overlapping = spansOverlappingRange(resolvedSpans, content.from, content.to)
          if (overlapping.length > 0) {
            hidden.push(...buildInlineHidesForTaggedBlock(content.from, content.to, overlapping, activeTag))
          }
        }
      }
      return false
    }

    if (node.type.name === 'paragraph' || node.type.name === 'codeBlock' || node.type.name === 'image') {
      applyTextContainerFilter(offset, node)
      return false
    }

    if (isEmbedBlockType(node.type.name)) {
      if (!isNodeVisible(
        offset, node, doc, flat, resolvedSectionTagsMap, activeTag, resolvedSpans, sectionTagAnchors,
      )) {
        hidden.push({ from: offset, to: offset + node.nodeSize, type: 'node' })
      }
      return false
    }

    return true
  })

  return finalizeTagFilterNodeHides(doc, hidden)
}

export function buildTagFilterHiddenDecorations(
  doc: ProseMirrorNode,
  flat: FlatTocEntry[],
  sectionTagsMap: SectionTagsMap,
  activeTag: BlockTag | null,
  textTagSpans: TextTagSpan[] = [],
  sectionTagAnchors?: Record<string, SectionTagAnchor>,
): TagFilterHiddenRange[] {
  return buildTagFilterDecorationSpecs(doc, flat, sectionTagsMap, activeTag, textTagSpans, sectionTagAnchors)
    .filter((spec) => spec.type === 'node')
    .map(({ from, to }) => ({ from, to }))
}

export function collectFilterableTagsOnPage(
  metadata: Record<string, unknown> | null | undefined,
  doc: ProseMirrorNode,
  _tocContext: TocCollectContext,
): BlockTag[] {
  const sectionMap = sectionTagsMapFromMetadata(metadata)
  const sectionPools = Object.values(sectionMap)

  const blockPools: BlockTag[][] = []
  doc.descendants((node) => {
    if (!isEmbedBlockType(node.type.name)) return true
    const tags = normalizeBlockTags(
      (node.attrs?.metadata as { tags?: BlockTag[] } | undefined)?.tags,
    )
    if (tags.length > 0) {
      blockPools.push(tags)
    }
    return false
  })

  return mergeTagPools(
    ...sectionPools,
    ...blockPools,
    collectTextTagSpanTags(metadata),
  )
}
