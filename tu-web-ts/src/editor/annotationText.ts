import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { TextAnnotation } from '@/api/types'

const DEFAULT_CONTEXT_LENGTH = 50

export interface AnnotationTextSegment {
  textStart: number
  textEnd: number
  from: number
  to: number
  domainId: string
  blockId?: string
}

export interface AnnotationTextIndex {
  text: string
  segments: AnnotationTextSegment[]
}

export interface AnnotationSelectionPayload {
  selectedText: string
  contextBefore: string
  contextAfter: string
  from?: number
  to?: number
  blockId?: string
}

interface TextRange {
  startOffset: number
  endOffset: number
}

export function buildAnnotationTextIndex(doc: ProseMirrorNode): AnnotationTextIndex {
  let text = ''
  const segments: AnnotationTextSegment[] = []

  doc.descendants((node, pos) => {
    if (node.isText) {
      if (!node.text) return true

      const textStart = text.length
      text += node.text
      const blockId = getBlockIdAtDocPos(doc, pos)
      segments.push({
        textStart,
        textEnd: text.length,
        from: pos,
        to: pos + node.text.length,
        domainId: blockId ?? getTopLevelDomainId(doc, pos),
        blockId,
      })
      return true
    }

    if (node.isAtom || node.type.spec.atom) return false
    return true
  })

  return { text, segments }
}

export function getAnnotationSelectionPayload(
  doc: ProseMirrorNode,
  from: number,
  to: number,
  contextLength = DEFAULT_CONTEXT_LENGTH,
): AnnotationSelectionPayload {
  const rangeFrom = Math.max(0, Math.min(from, to))
  const rangeTo = Math.min(doc.content.size, Math.max(from, to))
  const index = buildAnnotationTextIndex(doc)
  const range = docRangeToTextRange(index, rangeFrom, rangeTo)

  if (!range || range.endOffset <= range.startOffset) {
    return {
      selectedText: '',
      contextBefore: '',
      contextAfter: '',
      from: undefined,
      to: undefined,
      blockId: getBlockIdAtDocPos(doc, rangeFrom),
    }
  }

  const selectedText = index.text.slice(range.startOffset, range.endOffset)
  return {
    selectedText,
    contextBefore: getContextBefore(index, range.startOffset, contextLength),
    contextAfter: getContextAfter(index, range.endOffset, contextLength),
    from: textOffsetToDocPos(index.segments, range.startOffset, 1) ?? rangeFrom,
    to: textOffsetToDocPos(index.segments, range.endOffset, -1) ?? rangeTo,
    blockId: getBlockIdForTextOffset(index.segments, range.startOffset) ?? getBlockIdAtDocPos(doc, rangeFrom),
  }
}

export function getAnnotationTextBetween(
  doc: ProseMirrorNode,
  from: number,
  to: number,
): string {
  const index = buildAnnotationTextIndex(doc)
  const range = docRangeToTextRange(index, from, to)
  if (!range || range.endOffset <= range.startOffset) return ''
  return index.text.slice(range.startOffset, range.endOffset)
}

export function normalizeAnnotationAnchor(
  doc: ProseMirrorNode,
  annotation: TextAnnotation,
): TextAnnotation {
  if (
    !annotation.selectedText
    || typeof annotation.from !== 'number'
    || typeof annotation.to !== 'number'
  ) {
    return annotation
  }

  const payload = getAnnotationSelectionPayload(doc, annotation.from, annotation.to)
  if (payload.selectedText !== annotation.selectedText) return annotation

  const changed = annotation.contextBefore !== payload.contextBefore
    || annotation.contextAfter !== payload.contextAfter
    || annotation.blockId !== (payload.blockId ?? annotation.blockId)

  if (!changed) return annotation

  return {
    ...annotation,
    contextBefore: payload.contextBefore,
    contextAfter: payload.contextAfter,
    blockId: payload.blockId ?? annotation.blockId,
  }
}

export function resolveAnnotationRange(
  doc: ProseMirrorNode,
  annotation: TextAnnotation,
): { from: number; to: number } | null {
  const selectedText = annotation.selectedText ?? ''
  if (!selectedText) return null

  const index = buildAnnotationTextIndex(doc)
  return relocateByText(index, annotation)
}

/** Returns stored from/to when they still match selectedText in the document. */
export function tryValidateAnnotationRange(
  doc: ProseMirrorNode,
  annotation: TextAnnotation,
): { from: number; to: number } | null {
  const index = buildAnnotationTextIndex(doc)
  return validateRange(doc, index, annotation)
}

function validateRange(
  doc: ProseMirrorNode,
  index: AnnotationTextIndex,
  annotation: TextAnnotation,
): { from: number; to: number } | null {
  const from = annotation.from
  const to = annotation.to
  if (
    typeof from !== 'number'
    || typeof to !== 'number'
    || from < 0
    || to <= from
    || to > doc.content.size
  ) {
    return null
  }

  const range = docRangeToTextRange(index, from, to)
  if (!range || range.endOffset <= range.startOffset) return null
  const text = index.text.slice(range.startOffset, range.endOffset)
  return text === annotation.selectedText ? { from, to } : null
}

function relocateByText(
  index: AnnotationTextIndex,
  annotation: TextAnnotation,
): { from: number; to: number } | null {
  const selected = annotation.selectedText
  if (!selected) return null

  const before = annotation.contextBefore ?? ''
  const after = annotation.contextAfter ?? ''
  const oldFrom = typeof annotation.from === 'number' && annotation.from >= 0
    ? annotation.from
    : null

  const exactContextCandidate = findExactContextMatch(index, before, selected, after, oldFrom)
  if (exactContextCandidate) return exactContextCandidate

  const candidates: Array<{ from: number; to: number; score: number; reliable: boolean }> = []
  let matchIndex = index.text.indexOf(selected)
  while (matchIndex >= 0) {
    const from = matchIndex
    const to = from + selected.length
    const segment = getSegmentAtTextOffset(index.segments, from, 1)?.segment
    const beforeScore = commonSuffixLength(index.text.slice(0, from), before)
    const afterScore = commonPrefixLength(index.text.slice(to), after)
    const exactBefore = before && index.text.slice(Math.max(0, from - before.length), from) === before
    const exactAfter = after && index.text.slice(to, to + after.length) === after
    const contextScore = beforeScore + afterScore
    const distancePenalty = oldFrom == null ? 0 : Math.abs(from - oldFrom) / 100000
    const sameBlockBonus = annotation.blockId && segment?.blockId === annotation.blockId ? 0.5 : 0
    const exactBonus = (exactBefore ? 2 : 0) + (exactAfter ? 2 : 0)
    const score = contextScore + exactBonus + sameBlockBonus - distancePenalty
    candidates.push({
      from,
      to,
      score,
      reliable: contextScore > 0 || Boolean(exactBefore || exactAfter),
    })
    matchIndex = index.text.indexOf(selected, matchIndex + Math.max(1, selected.length))
  }

  const reliableCandidates = candidates.filter(candidate => candidate.reliable)
  const selectedOnlyCandidates = candidates.filter(candidate => !candidate.reliable)
  const pool = reliableCandidates.length
    ? reliableCandidates
    : selectedOnlyCandidates.length === 1
      ? selectedOnlyCandidates
      : []

  pool.sort((a, b) => b.score - a.score)
  const best = pool[0]
  if (!best) return null

  const from = textOffsetToDocPos(index.segments, best.from, 1)
  const to = textOffsetToDocPos(index.segments, best.to, -1)
  if (from === null || to === null || to <= from) return null
  return { from, to }
}

function rangeContextMatches(
  index: AnnotationTextIndex,
  range: { from: number; to: number },
  annotation: TextAnnotation,
): boolean {
  const textRange = docRangeToTextRange(index, range.from, range.to)
  if (!textRange) return false

  const before = annotation.contextBefore ?? ''
  const after = annotation.contextAfter ?? ''
  const hasContext = before.length > 0 || after.length > 0
  if (!hasContext) return true

  const exactBefore = !before
    || index.text.slice(Math.max(0, textRange.startOffset - before.length), textRange.startOffset) === before
  const exactAfter = !after
    || index.text.slice(textRange.endOffset, textRange.endOffset + after.length) === after
  return exactBefore && exactAfter
}

function findExactContextMatch(
  index: AnnotationTextIndex,
  before: string,
  selected: string,
  after: string,
  oldFrom: number | null,
): { from: number; to: number } | null {
  const queries: Array<{ query: string; selectedOffset: number }> = []
  if (before || after) queries.push({ query: before + selected + after, selectedOffset: before.length })
  if (before) queries.push({ query: before + selected, selectedOffset: before.length })
  if (after) queries.push({ query: selected + after, selectedOffset: 0 })

  const candidates: Array<{ from: number; to: number; distance: number }> = []
  for (const item of queries) {
    if (!item.query) continue
    let matchIndex = index.text.indexOf(item.query)
    while (matchIndex >= 0) {
      const from = matchIndex + item.selectedOffset
      const to = from + selected.length
      if (index.text.slice(from, to) === selected) {
        candidates.push({
          from,
          to,
          distance: oldFrom == null ? 0 : Math.abs(from - oldFrom),
        })
      }
      matchIndex = index.text.indexOf(item.query, matchIndex + 1)
    }
    if (candidates.length) break
  }

  candidates.sort((a, b) => a.distance - b.distance)
  const best = candidates[0]
  if (!best) return null

  const from = textOffsetToDocPos(index.segments, best.from, 1)
  const to = textOffsetToDocPos(index.segments, best.to, -1)
  if (from === null || to === null || to <= from) return null
  return { from, to }
}

function docRangeToTextRange(
  index: AnnotationTextIndex,
  from: number,
  to: number,
): TextRange | null {
  let startOffset: number | null = null
  let endOffset: number | null = null

  for (const segment of index.segments) {
    const overlapFrom = Math.max(from, segment.from)
    const overlapTo = Math.min(to, segment.to)
    if (overlapTo <= overlapFrom) continue

    const segmentStartOffset = segment.textStart + overlapFrom - segment.from
    const segmentEndOffset = segment.textStart + overlapTo - segment.from
    startOffset = startOffset === null ? segmentStartOffset : Math.min(startOffset, segmentStartOffset)
    endOffset = endOffset === null ? segmentEndOffset : Math.max(endOffset, segmentEndOffset)
  }

  if (startOffset === null || endOffset === null) return null
  return { startOffset, endOffset }
}

function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length)
  let count = 0
  while (count < max && a[count] === b[count]) count += 1
  return count
}

function commonSuffixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length)
  let count = 0
  while (count < max && a[a.length - 1 - count] === b[b.length - 1 - count]) count += 1
  return count
}

function getContextBefore(
  index: AnnotationTextIndex,
  offset: number,
  contextLength: number,
): string {
  const anchor = getSegmentAtTextOffset(index.segments, offset, 1)
    ?? getSegmentAtTextOffset(index.segments, offset, -1)
  if (!anchor) return ''

  const parts: string[] = []
  let remaining = contextLength
  for (let i = anchor.index; i >= 0 && remaining > 0; i -= 1) {
    const segment = index.segments[i]
    if (segment.domainId !== anchor.segment.domainId) break

    const end = i === anchor.index ? Math.min(offset, segment.textEnd) : segment.textEnd
    const start = Math.max(segment.textStart, end - remaining)
    if (end > start) {
      parts.unshift(index.text.slice(start, end))
      remaining -= end - start
    }
  }
  return parts.join('')
}

function getContextAfter(
  index: AnnotationTextIndex,
  offset: number,
  contextLength: number,
): string {
  const anchor = getSegmentAtTextOffset(index.segments, offset, -1)
    ?? getSegmentAtTextOffset(index.segments, offset, 1)
  if (!anchor) return ''

  const parts: string[] = []
  let remaining = contextLength
  for (let i = anchor.index; i < index.segments.length && remaining > 0; i += 1) {
    const segment = index.segments[i]
    if (segment.domainId !== anchor.segment.domainId) break

    const start = i === anchor.index ? Math.max(offset, segment.textStart) : segment.textStart
    const end = Math.min(segment.textEnd, start + remaining)
    if (end > start) {
      parts.push(index.text.slice(start, end))
      remaining -= end - start
    }
  }
  return parts.join('')
}

function getSegmentAtTextOffset(
  segments: AnnotationTextSegment[],
  offset: number,
  assoc: -1 | 1,
): { segment: AnnotationTextSegment; index: number } | null {
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]
    const within = assoc > 0
      ? offset >= segment.textStart && offset < segment.textEnd
      : offset > segment.textStart && offset <= segment.textEnd
    if (within) return { segment, index: i }
  }
  return null
}

function textOffsetToDocPos(
  segments: AnnotationTextSegment[],
  offset: number,
  assoc: -1 | 1,
): number | null {
  if (!segments.length) return null

  for (const segment of segments) {
    const within = assoc > 0
      ? offset >= segment.textStart && offset < segment.textEnd
      : offset > segment.textStart && offset <= segment.textEnd
    if (within) {
      return segment.from + offset - segment.textStart
    }
  }

  if (offset === 0) return segments[0].from
  const last = segments[segments.length - 1]
  if (offset === last.textEnd) return last.to
  return null
}

function docPosToTextOffset(
  segments: AnnotationTextSegment[],
  pos: number,
  assoc: -1 | 1,
): number | null {
  for (const segment of segments) {
    if (pos >= segment.from && pos <= segment.to) {
      return segment.textStart + pos - segment.from
    }
  }

  if (assoc > 0) {
    const next = segments.find(segment => segment.from > pos)
    return next?.textStart ?? null
  }

  for (let i = segments.length - 1; i >= 0; i -= 1) {
    if (segments[i].to < pos) return segments[i].textEnd
  }
  return null
}

function getBlockIdForTextOffset(
  segments: AnnotationTextSegment[],
  offset: number,
): string | undefined {
  for (const segment of segments) {
    if (offset >= segment.textStart && offset < segment.textEnd) return segment.blockId
  }
  return segments[segments.length - 1]?.blockId
}

function getBlockIdAtDocPos(doc: ProseMirrorNode, pos: number): string | undefined {
  const clamped = Math.max(0, Math.min(pos, doc.content.size))
  const resolved = doc.resolve(clamped)

  for (let depth = resolved.depth; depth >= 1; depth -= 1) {
    const blockId = resolved.node(depth).attrs?.blockId
    if (typeof blockId === 'string' && blockId) return blockId
  }

  const afterBlockId = resolved.nodeAfter?.attrs?.blockId
  if (typeof afterBlockId === 'string' && afterBlockId) return afterBlockId

  const beforeBlockId = resolved.nodeBefore?.attrs?.blockId
  if (typeof beforeBlockId === 'string' && beforeBlockId) return beforeBlockId

  return undefined
}

function getTopLevelDomainId(doc: ProseMirrorNode, pos: number): string {
  const clamped = Math.max(0, Math.min(pos, doc.content.size))
  const resolved = doc.resolve(clamped)
  if (resolved.depth >= 1) return `top:${resolved.before(1)}`
  return `doc:${clamped}`
}
