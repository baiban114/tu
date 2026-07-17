import type { HeadingSourceBinding, TextAnnotation } from '@/api/types'
import { effectiveMarkerSource } from '@/utils/headingSource'
import { resourcePositionDisplay } from '@/utils/resourcePositionLocator'

export const BLOCKQUOTE_EXCERPT_COMMENT_RE = /<!--tu:blockquote-excerpt\s+([^>]+)-->/

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

export function createBlockquoteBlockId(): string {
  return `bq-${crypto.randomUUID().replace(/-/g, '')}`
}

export function parseBlockquoteExcerptComment(attrsStr: string): { blockId: string; binding: HeadingSourceBinding } | null {
  const attrs = parseAttrString(attrsStr)
  const blockId = attrs.id
  const resourceItemId = attrs.item
  const resourceExcerptId = attrs.excerpt
  if (!blockId || !resourceItemId || !resourceExcerptId) return null
  const markerSource = attrs.marker === 'ai' ? 'ai' as const : undefined
  return {
    blockId,
    binding: {
      resourceItemId,
      resourceExcerptId,
      snapshot: {
        resourceTitle: attrs['resource-title'] || '',
        resourceTypeName: attrs.type || undefined,
        workTitle: attrs['work-title'] || undefined,
        excerptTitle: attrs.title || undefined,
        excerptLocator: attrs.locator || undefined,
      },
      ...(markerSource ? { markerSource } : {}),
    },
  }
}

export function serializeBlockquoteExcerptComment(blockId: string, binding: HeadingSourceBinding): string {
  const snapshot = binding.snapshot
  const parts = [
    `id="${escapeAttr(blockId)}"`,
    `item="${escapeAttr(binding.resourceItemId)}"`,
  ]
  if (binding.resourceExcerptId) {
    parts.push(`excerpt="${escapeAttr(binding.resourceExcerptId)}"`)
  }
  if (snapshot.excerptTitle) parts.push(`title="${escapeAttr(snapshot.excerptTitle)}"`)
  if (snapshot.excerptLocator) parts.push(`locator="${escapeAttr(snapshot.excerptLocator)}"`)
  if (snapshot.resourceTypeName) parts.push(`type="${escapeAttr(snapshot.resourceTypeName)}"`)
  if (snapshot.workTitle) parts.push(`work-title="${escapeAttr(snapshot.workTitle)}"`)
  if (snapshot.resourceTitle) parts.push(`resource-title="${escapeAttr(snapshot.resourceTitle)}"`)
  if (binding.markerSource === 'ai') parts.push('marker="ai"')
  return `<!--tu:blockquote-excerpt ${parts.join(' ')}-->`
}

export function blockquoteExcerptBadgeLabel(binding: HeadingSourceBinding): string {
  const snapshot = binding.snapshot
  const label = snapshot.workTitle
    || snapshot.resourceTypeName
    || snapshot.resourceTitle
    || '资源节选'
  return label.length > 22 ? `${label.slice(0, 22)}…` : label
}

export function blockquoteExcerptBadgeTitle(binding: HeadingSourceBinding): string {
  const snapshot = binding.snapshot
  const parts = [
    snapshot.resourceTypeName,
    snapshot.workTitle,
    snapshot.resourceTitle,
    snapshot.excerptLocator ? resourcePositionDisplay(snapshot.excerptLocator) : '',
    snapshot.excerptTitle,
  ].filter(Boolean)
  return parts.join(' · ') || '外部资源节选'
}

export function blockquoteExcerptMetaChips(binding: HeadingSourceBinding): string[] {
  const snapshot = binding.snapshot
  const chips = ['资源节选']
  if (snapshot.resourceTypeName) chips.push(snapshot.resourceTypeName)
  if (snapshot.workTitle) chips.push(snapshot.workTitle)
  else if (snapshot.resourceTitle) chips.push(snapshot.resourceTitle)
  if (snapshot.excerptLocator) chips.push(resourcePositionDisplay(snapshot.excerptLocator))
  return chips
}

export function resolveBlockquoteExcerptBinding(
  node: { attrs: Record<string, unknown>; textContent?: string },
  pos: number,
  nodeSize: number,
  annotations: TextAnnotation[],
): HeadingSourceBinding | null {
  const stored = node.attrs.excerptBinding as HeadingSourceBinding | null | undefined
  if (stored?.resourceItemId && stored.resourceExcerptId) return stored

  const blockId = String(node.attrs.blockId || '')
  const innerFrom = pos + 1
  const innerTo = pos + nodeSize - 1

  for (const ann of annotations) {
    if (ann.kind !== 'excerpt' || !ann.basisBinding?.resourceItemId || !ann.basisBinding.resourceExcerptId) continue
    if (ann.scope === 'block' && blockId && ann.spannedBlockIds?.includes(blockId)) {
      return ann.basisBinding
    }
    if (typeof ann.from === 'number' && typeof ann.to === 'number') {
      if (ann.from >= innerFrom && ann.to <= innerTo) return ann.basisBinding
      if (ann.from < innerTo && ann.to > innerFrom) return ann.basisBinding
    }
  }
  return null
}

export function isAiBlockquoteExcerpt(binding: HeadingSourceBinding): boolean {
  return effectiveMarkerSource(binding.markerSource) === 'ai'
}
