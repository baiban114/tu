import type { ExternalResourceEmbedData, HeadingSourceBinding, KnowledgeMarkerSource } from '@/api/types'

export function effectiveMarkerSource(source?: KnowledgeMarkerSource | null): KnowledgeMarkerSource {
  return source === 'ai' ? 'ai' : 'user'
}

export function isUserProtectedMarker(source?: KnowledgeMarkerSource | null): boolean {
  return effectiveMarkerSource(source) !== 'ai'
}

export const HEADING_SOURCE_COMMENT_RE = /<!--tu:heading-source\s+([^>]+)-->/

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

export function createHeadingBlockId(): string {
  return `hs-${crypto.randomUUID().replace(/-/g, '')}`
}

export function bindingFromExternalResource(data: ExternalResourceEmbedData): HeadingSourceBinding | null {
  if (!data.resourceExcerptId) return null
  const snapshot = data.snapshot || { resourceTitle: '' }
  return {
    resourceItemId: data.resourceItemId,
    resourceExcerptId: data.resourceExcerptId,
    snapshot: {
      resourceTitle: snapshot.resourceTitle,
      resourceTypeName: snapshot.resourceTypeName,
      excerptTitle: snapshot.excerptTitle,
      excerptLocator: snapshot.excerptLocator,
    },
  }
}

/** 依据标注：可挂靠资源实体，节选可选 */
export function basisBindingFromExternalResource(data: ExternalResourceEmbedData): HeadingSourceBinding | null {
  if (!data.resourceItemId) return null
  const snapshot = data.snapshot || { resourceTitle: '' }
  return {
    resourceItemId: data.resourceItemId,
    resourceExcerptId: data.resourceExcerptId ?? null,
    snapshot: {
      resourceTitle: snapshot.resourceTitle,
      resourceTypeName: snapshot.resourceTypeName,
      excerptTitle: snapshot.excerptTitle,
      excerptLocator: snapshot.excerptLocator,
    },
  }
}

export function parseHeadingSourceComment(attrsStr: string): { blockId: string; binding: HeadingSourceBinding } | null {
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
        excerptTitle: attrs.title || undefined,
        excerptLocator: attrs.locator || undefined,
      },
      ...(markerSource ? { markerSource } : {}),
    },
  }
}

export function serializeHeadingSourceComment(blockId: string, binding: HeadingSourceBinding): string {
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
  if (snapshot.resourceTitle) parts.push(`resource-title="${escapeAttr(snapshot.resourceTitle)}"`)
  if (binding.markerSource === 'ai') parts.push('marker="ai"')
  return `<!--tu:heading-source ${parts.join(' ')}-->`
}

export function headingSourceBadgeLabel(binding: HeadingSourceBinding): string {
  const snapshot = binding.snapshot
  const label = snapshot.excerptTitle || snapshot.excerptLocator || snapshot.resourceTitle || '来源'
  return label.length > 24 ? `${label.slice(0, 24)}…` : label
}

export function headingSourceBadgeTitle(binding: HeadingSourceBinding): string {
  const snapshot = binding.snapshot
  const parts = [
    snapshot.resourceTitle,
    snapshot.resourceTypeName,
    snapshot.excerptTitle,
    snapshot.excerptLocator,
  ].filter(Boolean)
  return parts.join(' · ') || (binding.resourceExcerptId ? '外部资源节选' : '外部资源')
}
