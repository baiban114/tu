import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { SectionTagAnchor, SectionTagsMap } from '@/utils/sectionMetadata'

export const TU_PAGE_META_MIME = 'application/x-tu-page-meta+json'

export interface TuPageClipboardMeta {
  sectionTags?: SectionTagsMap
  sectionTagAnchors?: Record<string, SectionTagAnchor>
}

function collectBlockIdsInRange(doc: ProseMirrorNode, from: number, to: number): string[] {
  const ids = new Set<string>()
  doc.nodesBetween(from, to, (node) => {
    const blockId = String(node.attrs?.blockId ?? '').trim()
    if (blockId) ids.add(blockId)
  })
  return [...ids]
}

/** Collect page-level section metadata that belongs to nodes in the copied range. */
export function collectPageMetaForRange(
  doc: ProseMirrorNode,
  from: number,
  to: number,
  sectionTags: SectionTagsMap,
  sectionTagAnchors: Record<string, SectionTagAnchor>,
): TuPageClipboardMeta | null {
  if (from === to) return null
  const blockIds = collectBlockIdsInRange(doc, from, to)
  if (!blockIds.length) return null

  const nextTags: SectionTagsMap = {}
  const nextAnchors: Record<string, SectionTagAnchor> = {}

  for (const blockId of blockIds) {
    const key = `local:${blockId}`
    const tags = sectionTags[key]
    if (tags?.length) nextTags[key] = tags.map((tag) => ({ ...tag }))
    const anchor = sectionTagAnchors[key]
    if (anchor) nextAnchors[key] = { ...anchor }
  }

  if (!Object.keys(nextTags).length && !Object.keys(nextAnchors).length) return null
  return {
    sectionTags: Object.keys(nextTags).length ? nextTags : undefined,
    sectionTagAnchors: Object.keys(nextAnchors).length ? nextAnchors : undefined,
  }
}

export function parsePageClipboardMeta(raw: string | null | undefined): TuPageClipboardMeta | null {
  if (!raw?.trim()) return null
  try {
    const parsed = JSON.parse(raw) as TuPageClipboardMeta
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

export function mergePageClipboardMeta(
  metadata: Record<string, unknown> | null | undefined,
  clipboardMeta: TuPageClipboardMeta,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(metadata ?? {}) }

  if (clipboardMeta.sectionTags && Object.keys(clipboardMeta.sectionTags).length) {
    const existing = (next.sectionTags && typeof next.sectionTags === 'object' && !Array.isArray(next.sectionTags))
      ? { ...(next.sectionTags as SectionTagsMap) }
      : {} as SectionTagsMap
    for (const [key, tags] of Object.entries(clipboardMeta.sectionTags)) {
      if (tags?.length) existing[key] = tags.map((tag) => ({ ...tag }))
    }
    next.sectionTags = existing
  }

  if (clipboardMeta.sectionTagAnchors && Object.keys(clipboardMeta.sectionTagAnchors).length) {
    const existing = (next.sectionTagAnchors && typeof next.sectionTagAnchors === 'object' && !Array.isArray(next.sectionTagAnchors))
      ? { ...(next.sectionTagAnchors as Record<string, SectionTagAnchor>) }
      : {} as Record<string, SectionTagAnchor>
    for (const [key, anchor] of Object.entries(clipboardMeta.sectionTagAnchors)) {
      if (anchor) existing[key] = { ...anchor }
    }
    next.sectionTagAnchors = existing
  }

  return next
}
