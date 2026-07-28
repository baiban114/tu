import type { ExternalResourceEmbedData, HeadingSourceBinding, KnowledgeMarkerSource } from '@/api/types'
import { resourcePositionDisplay } from '@/utils/resourcePositionLocator'
import { buildResourceMetaPathParts, formatResourceMetaPath } from '@/utils/resourceMetaPath'

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
    resourceChapterId: data.resourceChapterId ?? null,
    snapshot: {
      resourceTitle: snapshot.resourceTitle,
      resourceTypeName: snapshot.resourceTypeName,
      workTitle: snapshot.workTitle,
      excerptTitle: snapshot.excerptTitle,
      excerptLocator: snapshot.excerptLocator,
      chapterTitle: snapshot.chapterTitle,
    },
  }
}

/** 依据标注：可挂靠资源实体、章节或节选 */
export function basisBindingFromExternalResource(data: ExternalResourceEmbedData): HeadingSourceBinding | null {
  if (!data.resourceItemId) return null
  const snapshot = data.snapshot || { resourceTitle: '' }
  return {
    resourceItemId: data.resourceItemId,
    resourceExcerptId: data.resourceExcerptId ?? null,
    resourceChapterId: data.resourceChapterId ?? null,
    snapshot: {
      resourceTitle: snapshot.resourceTitle,
      resourceTypeName: snapshot.resourceTypeName,
      workTitle: snapshot.workTitle,
      excerptTitle: snapshot.excerptTitle,
      excerptLocator: snapshot.excerptLocator,
      chapterTitle: snapshot.chapterTitle,
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
        workTitle: attrs['work-title'] || undefined,
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
  if (snapshot.workTitle) parts.push(`work-title="${escapeAttr(snapshot.workTitle)}"`)
  if (snapshot.resourceTitle) parts.push(`resource-title="${escapeAttr(snapshot.resourceTitle)}"`)
  if (binding.markerSource === 'ai') parts.push('marker="ai"')
  return `<!--tu:heading-source ${parts.join(' ')}-->`
}

export function headingSourceBadgeLabel(binding: HeadingSourceBinding): string {
  const snapshot = binding.snapshot
  const label = snapshot.excerptTitle
    || snapshot.chapterTitle
    || (snapshot.excerptLocator ? resourcePositionDisplay(snapshot.excerptLocator) : '')
    || snapshot.resourceTitle
    || '来源'
  return label.length > 24 ? `${label.slice(0, 24)}…` : label
}

export function headingSourceBadgeTitle(binding: HeadingSourceBinding): string {
  const path = formatResourceMetaPath(binding.snapshot)
  return path
    || (binding.resourceExcerptId ? '外部资源节选'
      : binding.resourceChapterId ? '外部资源章节'
        : '外部资源')
}

/** Structured source fields for popover / detail panels after clicking 来源 or 资源节选 meta. */
export function headingSourceInfoRows(
  binding: HeadingSourceBinding,
): Array<{ label: string; value: string }> {
  const snapshot = binding.snapshot
  const rows: Array<{ label: string; value: string }> = []
  if (snapshot.resourceTitle?.trim()) {
    rows.push({ label: '资源', value: snapshot.resourceTitle.trim() })
  }
  if (snapshot.resourceTypeName?.trim()) {
    rows.push({ label: '类型', value: snapshot.resourceTypeName.trim() })
  }
  if (snapshot.workTitle?.trim()) {
    rows.push({ label: '归类', value: snapshot.workTitle.trim() })
  }
  if (snapshot.chapterTitle?.trim()) {
    rows.push({ label: '章节', value: snapshot.chapterTitle.trim() })
  }
  if (snapshot.excerptTitle?.trim()) {
    rows.push({ label: '节选', value: snapshot.excerptTitle.trim() })
  }
  if (snapshot.excerptLocator?.trim()) {
    rows.push({
      label: '定位',
      value: resourcePositionDisplay(snapshot.excerptLocator),
    })
  }
  return rows
}

export function headingSourceInfoPrimaryTitle(binding: HeadingSourceBinding): string {
  const snapshot = binding.snapshot
  return (
    snapshot.excerptTitle?.trim()
    || snapshot.chapterTitle?.trim()
    || snapshot.resourceTitle?.trim()
    || (snapshot.excerptLocator ? resourcePositionDisplay(snapshot.excerptLocator) : '')
    || (binding.resourceExcerptId ? '外部资源节选'
      : binding.resourceChapterId ? '外部资源章节'
        : '外部资源')
  )
}

/** 正文标题节元数据条：首项为类型标识「来源」，其后为定位层级 */
export function headingSourceMetaChips(binding: HeadingSourceBinding): string[] {
  return ['来源', ...buildResourceMetaPathParts(binding.snapshot)]
}

export function headingSourceMetaRole(): string {
  return '来源'
}

/** Resource locator layers only (joined with ` > ` in UI). */
export function headingSourceMetaPathParts(binding: HeadingSourceBinding): string[] {
  return buildResourceMetaPathParts(binding.snapshot)
}

export function isAiHeadingSource(binding: HeadingSourceBinding): boolean {
  return effectiveMarkerSource(binding.markerSource) === 'ai'
}

/** Convert a heading/basis binding into embed data for ExternalResourceExcerptMeta. */
export function externalResourceFromBinding(binding: HeadingSourceBinding): ExternalResourceEmbedData {
  const hasExcerpt = Boolean(binding.resourceExcerptId)
  const hasChapter = Boolean(binding.resourceChapterId)
  return {
    resourceItemId: binding.resourceItemId,
    resourceExcerptId: binding.resourceExcerptId ?? null,
    resourceChapterId: binding.resourceChapterId ?? null,
    mode: hasExcerpt ? 'excerpt' : hasChapter ? 'chapter' : 'resource',
    snapshot: {
      resourceTitle: binding.snapshot.resourceTitle || '',
      resourceTypeName: binding.snapshot.resourceTypeName,
      workTitle: binding.snapshot.workTitle,
      excerptTitle: binding.snapshot.excerptTitle,
      excerptLocator: binding.snapshot.excerptLocator,
      chapterTitle: binding.snapshot.chapterTitle,
    },
  }
}

