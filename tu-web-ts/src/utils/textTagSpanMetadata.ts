import type { BlockTag, TextAnnotation, TextTagSpan } from '@/api/types'
import type { AnnotationSelectionPayload } from '@/editor/annotationText'
import {
  normalizeAnnotationAnchor,
  resolveAnnotationRange,
  tryValidateAnnotationRange,
} from '@/editor/annotationText'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { normalizeBlockTags } from '@/utils/blockMetadata'
import { mergeTagPools } from '@/utils/pageMetadata'

const METADATA_KEY = 'textTagSpans'

function isTextTagSpanArray(value: unknown): value is TextTagSpan[] {
  return Array.isArray(value)
}

export function getTextTagSpans(
  metadata: Record<string, unknown> | null | undefined,
): TextTagSpan[] {
  if (!metadata) return []
  const raw = metadata[METADATA_KEY]
  if (!isTextTagSpanArray(raw)) return []
  return raw.map(normalizeTextTagSpan).filter((span): span is TextTagSpan => span !== null)
}

function normalizeTextTagSpan(span: TextTagSpan): TextTagSpan | null {
  const selectedText = span.selectedText?.trim() ?? ''
  if (!span.id || !selectedText) return null
  const tags = normalizeBlockTags(span.tags)
  return {
    ...span,
    selectedText,
    tags,
    contextBefore: span.contextBefore ?? '',
    contextAfter: span.contextAfter ?? '',
  }
}

export function setTextTagSpansInMetadata(
  metadata: Record<string, unknown> | null | undefined,
  spans: TextTagSpan[],
): Record<string, unknown> {
  const next = { ...(metadata ?? {}) }
  const normalized = spans
    .map(normalizeTextTagSpan)
    .filter((span): span is TextTagSpan => span !== null)
  if (normalized.length > 0) {
    next[METADATA_KEY] = normalized
  } else {
    delete next[METADATA_KEY]
  }
  return next
}

export function upsertTextTagSpan(
  metadata: Record<string, unknown> | null | undefined,
  span: TextTagSpan,
): Record<string, unknown> {
  const normalized = normalizeTextTagSpan(span)
  if (!normalized) return { ...(metadata ?? {}) }
  const existing = getTextTagSpans(metadata)
  const index = existing.findIndex((item) => item.id === normalized.id)
  const nextSpans = [...existing]
  if (index >= 0) {
    nextSpans[index] = normalized
  } else {
    nextSpans.push(normalized)
  }
  return setTextTagSpansInMetadata(metadata, nextSpans)
}

export function removeTextTagSpan(
  metadata: Record<string, unknown> | null | undefined,
  spanId: string,
): Record<string, unknown> {
  const existing = getTextTagSpans(metadata).filter((item) => item.id !== spanId)
  return setTextTagSpansInMetadata(metadata, existing)
}

export function collectTextTagSpanTags(
  metadata: Record<string, unknown> | null | undefined,
): BlockTag[] {
  const spans = getTextTagSpans(metadata)
  return mergeTagPools(...spans.map((span) => span.tags))
}

export function createTextTagSpanFromSelection(
  payload: AnnotationSelectionPayload,
  tags: Array<Partial<BlockTag> | string> = [],
): TextTagSpan {
  const now = Date.now()
  return {
    id: `tts-${now}-${Math.random().toString(36).slice(2, 8)}`,
    tags: normalizeBlockTags(tags),
    selectedText: payload.selectedText,
    contextBefore: payload.contextBefore,
    contextAfter: payload.contextAfter,
    from: payload.from,
    to: payload.to,
    blockId: payload.blockId,
    anchorVersion: 1,
    lastResolvedAt: now,
    unresolved: false,
  }
}

function asAnnotationLike(span: TextTagSpan): TextAnnotation {
  return {
    id: span.id,
    selectedText: span.selectedText,
    contextBefore: span.contextBefore,
    contextAfter: span.contextAfter,
    note: '',
    color: '',
    createdAt: 0,
    updatedAt: 0,
    from: span.from,
    to: span.to,
    blockId: span.blockId,
    anchorVersion: span.anchorVersion,
    lastResolvedAt: span.lastResolvedAt,
    unresolved: span.unresolved,
    scope: 'text',
  }
}

export function resolveTextTagSpan(doc: ProseMirrorNode, span: TextTagSpan): TextTagSpan {
  const selectedText = span.selectedText?.trim() ?? ''
  if (!selectedText) {
    return { ...span, unresolved: true }
  }

  const annotationLike = asAnnotationLike(span)
  const validated = tryValidateAnnotationRange(doc, annotationLike)
  const relocatedRange = validated ? null : resolveAnnotationRange(doc, annotationLike)
  const resolvedRange = validated ?? relocatedRange
  if (!resolvedRange) {
    return { ...span, unresolved: true }
  }

  const wasRelocated = span.from !== resolvedRange.from || span.to !== resolvedRange.to
  const normalized = normalizeAnnotationAnchor(doc, {
    ...asAnnotationLike(span),
    from: resolvedRange.from,
    to: resolvedRange.to,
    unresolved: false,
  })

  return {
    ...span,
    from: normalized.from,
    to: normalized.to,
    blockId: normalized.blockId ?? span.blockId,
    contextBefore: normalized.contextBefore,
    contextAfter: normalized.contextAfter,
    anchorVersion: wasRelocated
      ? (span.anchorVersion ?? 1) + 1
      : span.anchorVersion ?? 1,
    lastResolvedAt: Date.now(),
    unresolved: false,
  }
}

export function resolveTextTagSpans(
  doc: ProseMirrorNode,
  spans: TextTagSpan[],
): TextTagSpan[] {
  return spans.map((span) => resolveTextTagSpan(doc, span))
}

export interface ResolvedTextTagSpanRange {
  spanId: string
  from: number
  to: number
  tags: BlockTag[]
}

export function resolveTextTagSpanRanges(
  doc: ProseMirrorNode,
  spans: TextTagSpan[],
): ResolvedTextTagSpanRange[] {
  const resolved: ResolvedTextTagSpanRange[] = []
  for (const span of resolveTextTagSpans(doc, spans)) {
    if (span.unresolved || typeof span.from !== 'number' || typeof span.to !== 'number') continue
    if (span.to <= span.from) continue
    if (span.tags.length === 0) continue
    resolved.push({
      spanId: span.id,
      from: span.from,
      to: span.to,
      tags: span.tags,
    })
  }
  return resolved
}

export function findTextTagSpanAtRange(
  spans: TextTagSpan[],
  from: number,
  to: number,
): TextTagSpan | null {
  const rangeFrom = Math.min(from, to)
  const rangeTo = Math.max(from, to)
  for (const span of spans) {
    if (typeof span.from !== 'number' || typeof span.to !== 'number') continue
    if (span.from < rangeTo && rangeFrom < span.to) {
      return span
    }
  }
  return null
}
