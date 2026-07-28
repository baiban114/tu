import type { HeadingSourceBinding, TextAnnotation } from '@/api/types'
import { effectiveMarkerSource } from '@/utils/headingSource'
import { buildResourceMetaPathParts, formatResourceMetaPath } from '@/utils/resourceMetaPath'

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

export function blockquoteExcerptBadgeTitle(
  binding: HeadingSourceBinding,
  role: BlockResourceBindingRole = 'excerpt',
): string {
  const path = formatResourceMetaPath(binding.snapshot)
  if (path) return path
  return role === 'basis'
    ? (binding.resourceExcerptId ? '外部资源依据' : '外部资源')
    : '外部资源节选'
}

export function blockquoteExcerptMetaChips(
  binding: HeadingSourceBinding,
  role: BlockResourceBindingRole = 'excerpt',
): string[] {
  return [role === 'basis' ? '依据' : '资源节选', ...buildResourceMetaPathParts(binding.snapshot)]
}

/** Role label (依据 / 资源节选) — not part of the locator path. */
export function blockquoteExcerptMetaRole(
  role: BlockResourceBindingRole = 'excerpt',
): string {
  return role === 'basis' ? '依据' : '资源节选'
}

/** Resource locator layers only (joined with ` > ` in UI). */
export function blockquoteExcerptMetaPathParts(
  binding: HeadingSourceBinding,
  _role: BlockResourceBindingRole = 'excerpt',
): string[] {
  return buildResourceMetaPathParts(binding.snapshot)
}

export type BlockResourceBindingRole = 'excerpt' | 'basis'

export interface ResolvedBlockResourceBinding {
  binding: HeadingSourceBinding
  role: BlockResourceBindingRole
}

function annotationMatchesBlock(
  ann: TextAnnotation,
  blockId: string,
  innerFrom: number,
  innerTo: number,
): boolean {
  if (ann.scope === 'block' && blockId && ann.spannedBlockIds?.includes(blockId)) return true
  if (ann.scope === 'compound' && blockId && ann.spannedBlockIds?.includes(blockId)) return true
  if (typeof ann.from === 'number' && typeof ann.to === 'number') {
    if (ann.from >= innerFrom && ann.to <= innerTo) return true
    if (ann.from < innerTo && ann.to > innerFrom) return true
  }
  return false
}

/**
 * Resolve resource meta for a blockquote (or similar shell):
 * prefer stored excerptBinding / excerpt annotations, then basis annotations.
 */
export function resolveBlockResourceBinding(
  node: { attrs: Record<string, unknown>; textContent?: string },
  pos: number,
  nodeSize: number,
  annotations: TextAnnotation[],
): ResolvedBlockResourceBinding | null {
  const stored = node.attrs.excerptBinding as HeadingSourceBinding | null | undefined
  if (stored?.resourceItemId && stored.resourceExcerptId) {
    return { binding: stored, role: 'excerpt' }
  }

  const blockId = String(node.attrs.blockId || '')
  const innerFrom = pos + 1
  const innerTo = pos + nodeSize - 1

  for (const ann of annotations) {
    if (ann.kind !== 'excerpt' || !ann.basisBinding?.resourceItemId || !ann.basisBinding.resourceExcerptId) continue
    if (annotationMatchesBlock(ann, blockId, innerFrom, innerTo)) {
      return { binding: ann.basisBinding, role: 'excerpt' }
    }
  }

  for (const ann of annotations) {
    if (ann.kind !== 'basis' || !ann.basisBinding?.resourceItemId) continue
    if (annotationMatchesBlock(ann, blockId, innerFrom, innerTo)) {
      return { binding: ann.basisBinding, role: 'basis' }
    }
  }

  return null
}

/** @deprecated Prefer resolveBlockResourceBinding */
export function resolveBlockquoteExcerptBinding(
  node: { attrs: Record<string, unknown>; textContent?: string },
  pos: number,
  nodeSize: number,
  annotations: TextAnnotation[],
): HeadingSourceBinding | null {
  const resolved = resolveBlockResourceBinding(node, pos, nodeSize, annotations)
  if (!resolved) return null
  if (resolved.role === 'excerpt') return resolved.binding
  // Legacy callers only rendered excerpt meta (required excerpt id).
  if (resolved.binding.resourceExcerptId) return resolved.binding
  return null
}

export function isAiBlockquoteExcerpt(binding: HeadingSourceBinding): boolean {
  return effectiveMarkerSource(binding.markerSource) === 'ai'
}
