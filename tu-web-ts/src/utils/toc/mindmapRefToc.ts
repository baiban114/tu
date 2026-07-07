import type { Graph } from '@antv/x6'
import type { Block } from '@/api/types'
import type { ContentTreeNode } from '@/api/outline'
import {
  applyRefContentHeadingShift,
  extractRichTextHeadingsFromBlocks,
  type FlatTocEntry,
  type TocSourceType,
  type TocTreeItem,
} from '@/utils/toc/headings'
import { getRefTocSectionEntryIds, isRefTocDirectoryEntry } from '@/utils/toc/tocSections'
import { buildEmbedRefChildEntryId } from '@/utils/toc/outlineTocEntries'

export type MindmapRefStructureSource = 'outline' | 'blocks'

export interface MindmapRefTocContext {
  /** @deprecated 仅 structureSource=blocks 时使用；展开目录应走 outline API */
  getPageBlocks?: (pageId: string) => Block[]
  /** @deprecated 仅 structureSource=blocks 时使用 */
  getBlock?: (id: string) => Block | undefined
  getPageTitle?: (pageId: string) => string
  getBlockMeta?: (id: string) => { pageTitle?: string } | undefined
  getPageOutline?: (pageId: string) => ContentTreeNode[] | undefined
  getBlockOutline?: (blockId: string) => ContentTreeNode[] | undefined
  /** outline：只读 GET /api/pages/{id}/outline 等结构接口，不拉整页 content */
  structureSource?: MindmapRefStructureSource
  /** 思维导图收起/可见性结算后回调（清理选中虚框等 UI 副作用） */
  onCollapseSettled?: (graph: Graph) => void
}

function buildRefTocEntryId(refNodeId: string, headingBlockId: string, text: string): string {
  return `ref-child-${refNodeId}-${headingBlockId}-${text}`
}

function mapOutlineNodesToFlatToc(
  refNodeId: string,
  refBlockId: string,
  nodes: ContentTreeNode[],
): FlatTocEntry[] {
  return nodes.map((node, index) => ({
    id: buildEmbedRefChildEntryId(refNodeId, node),
    blockId: refNodeId,
    level: node.level ?? 2,
    text: node.title,
    pos: 0,
    sortIndex: (node.sortOrder ?? index) + 1,
    sourceType: (node.sourceType ?? 'ref-child') as TocSourceType,
    refId: refBlockId,
    targetText: node.title,
    contentTreeNodeId: node.id,
    previewText: node.previewText ?? undefined,
    estimatedHours: node.estimatedHours ?? undefined,
    totalEstimatedHours: node.totalEstimatedHours ?? undefined,
  }))
}

function usesOutlineStructure(ctx: MindmapRefTocContext): boolean {
  return ctx.structureSource === 'outline'
    || Boolean(ctx.getPageOutline || ctx.getBlockOutline)
}

function getCachedOutlineNodes(
  refBlockId: string,
  refType: 'block' | 'page',
  ctx: MindmapRefTocContext,
): ContentTreeNode[] | undefined {
  return refType === 'page'
    ? ctx.getPageOutline?.(refBlockId)
    : ctx.getBlockOutline?.(refBlockId)
}

function buildFlatTocFromOutlineCache(
  refNodeId: string,
  refBlockId: string,
  refType: 'block' | 'page',
  ctx: MindmapRefTocContext,
): FlatTocEntry[] | null {
  const nodes = getCachedOutlineNodes(refBlockId, refType, ctx)
  if (nodes === undefined) return null
  return mapOutlineNodesToFlatToc(refNodeId, refBlockId, nodes)
}

function buildRefDocBlockEntryId(refNodeId: string, blockId: string): string {
  return `ref-doc-${refNodeId}-${blockId}`
}

function getBlockPreviewLabel(block: Block): string {
  if (block.title?.trim()) return block.title.trim()
  if (block.type === 'x6') return '画板'
  if (block.type === 'table') return '表格'
  if (block.type === 'line') return '时间轴'
  if (block.type === 'externalResource') {
    return block.externalResource?.snapshot?.excerptTitle
      || block.externalResource?.snapshot?.resourceTitle
      || '外部资源'
  }
  if (block.type === 'richtext' || block.type === 'richText') {
    const plain = (block.content ?? '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/[#*`>\-_\[\]]/g, '')
      .trim()
    if (plain) return plain.length > 40 ? `${plain.slice(0, 40)}…` : plain
  }
  return block.type
}

/**
 * Build flat TOC for a mindmap ref node — mirrors collectFlatTocEntries refBlock rules
 * (without ProseMirror). Mindmap ref node acts as the ref wrapper; includeGroup=false.
 */
function buildFlatTocFromBlocks(
  refNodeId: string,
  refBlockId: string,
  refType: 'block' | 'page',
  ctx: MindmapRefTocContext,
): FlatTocEntry[] {
  let refBlocks: Block[] = []
  if (refType === 'page') {
    refBlocks = ctx.getPageBlocks?.(refBlockId) ?? []
  } else {
    const refBlock = ctx.getBlock?.(refBlockId)
    if (refBlock) refBlocks = [refBlock]
  }

  const contentParentLevel = 1
  const shiftedBlocks = applyRefContentHeadingShift(refBlocks, contentParentLevel)
  const contentHeadings = extractRichTextHeadingsFromBlocks(shiftedBlocks)
  const flat: FlatTocEntry[] = []

  contentHeadings.forEach((heading, index) => {
    flat.push({
      id: buildRefTocEntryId(refNodeId, heading.blockId, heading.text),
      blockId: refNodeId,
      level: heading.level,
      text: heading.text,
      pos: 0,
      sortIndex: index + 1,
      sourceType: 'ref-child',
      refId: refBlockId,
      targetText: heading.text,
    })
  })

  if (flat.length === 0 && refType === 'page' && refBlocks.length > 0) {
    refBlocks.forEach((block, index) => {
      flat.push({
        id: buildRefDocBlockEntryId(refNodeId, block.id),
        blockId: refNodeId,
        level: 2,
        text: getBlockPreviewLabel(block),
        pos: 0,
        sortIndex: index + 1,
        sourceType: 'ref-doc-block',
        refId: refBlockId,
      })
    })
  }

  return flat
}

export function buildMindmapRefBlockFlatToc(
  refNodeId: string,
  refBlockId: string,
  refType: 'block' | 'page',
  ctx: MindmapRefTocContext,
): FlatTocEntry[] {
  const fromOutline = buildFlatTocFromOutlineCache(refNodeId, refBlockId, refType, ctx)
  if (fromOutline !== null) return fromOutline
  if (usesOutlineStructure(ctx)) return []
  return buildFlatTocFromBlocks(refNodeId, refBlockId, refType, ctx)
}

export function getMindmapRefBlockFlatToc(
  refNode: { id: string; getData: () => Record<string, any> | undefined },
  ctx: MindmapRefTocContext,
): FlatTocEntry[] {
  const data = refNode.getData() ?? {}
  const refBlockId = typeof data.refBlockId === 'string' ? data.refBlockId : ''
  const refType: 'block' | 'page' = data.refType === 'page' ? 'page' : 'block'
  if (!refBlockId) return []
  return buildMindmapRefBlockFlatToc(refNode.id, refBlockId, refType, ctx)
}

export function refBlockHasExpandableStructure(
  refNodeId: string,
  refBlockId: string,
  refType: 'block' | 'page',
  ctx: MindmapRefTocContext,
): boolean {
  if (!refBlockId) return false
  const fromOutline = buildFlatTocFromOutlineCache(refNodeId, refBlockId, refType, ctx)
  if (fromOutline !== null) {
    return fromOutline.length > 0 || refType === 'page'
  }
  if (usesOutlineStructure(ctx)) {
    return refType === 'page' || Boolean(refBlockId)
  }
  return buildFlatTocFromBlocks(refNodeId, refBlockId, refType, ctx).length > 0
    || (refType === 'page')
    || Boolean(ctx.getBlock?.(refBlockId))
}

export function refTocEntryHasExpandableDescendants(flat: FlatTocEntry[], entryId: string): boolean {
  return getRefTocSectionEntryIds(flat, entryId).length > 1
}

export function findTocTreeEntry(tree: TocTreeItem[], entryId: string): TocTreeItem | null {
  for (const item of tree) {
    if (item.id === entryId) return item
    if (item.children?.length) {
      const nested = findTocTreeEntry(item.children, entryId)
      if (nested) return nested
    }
  }
  return null
}

export function setRefTocSectionCollapsed(
  collapsedMap: Record<string, boolean>,
  flat: FlatTocEntry[],
  entryId: string,
  collapsed: boolean,
) {
  getRefTocSectionEntryIds(flat, entryId).forEach((id) => {
    collapsedMap[id] = collapsed
  })
}

export function isRefTocEntryDirectoryLevel(entry: FlatTocEntry): boolean {
  return isRefTocDirectoryEntry(entry)
}

export { getRefTocSectionEntryIds }
