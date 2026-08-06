import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { TextAnnotation } from '@/api/types'
import {
  resolveBlockResourceBinding,
  type ResolvedBlockResourceBinding,
} from '@/utils/blockquoteExcerpt'

/**
 * Newly inserted plain text between two document snapshots (reuse-mark lifecycle).
 *
 * Performance contract:
 * - Diffs only the changed span via ProseMirror `findDiffStart` / `findDiffEnd`
 *   (unchanged subtrees often share node identity and short-circuit).
 * - Calls `textBetween` only on that span — never serializes or walks the full doc
 *   as markdown/JSON.
 * - String prefix/suffix work is O(span text), not O(document).
 */
export interface InsertedContentDelta {
  /** Inclusive-exclusive range in the **after** doc covering the change window. */
  from: number
  to: number
  /** Plain text that appears in `after` but not as the matching before-span text. */
  insertedText: string
}

const BLOCK_SEP = '\n'
const META_NODE_TYPES = new Set(['blockquote', 'paragraph'])

function hasVisibleResourceMeta(resolved: ResolvedBlockResourceBinding | null): boolean {
  if (!resolved?.binding.resourceItemId) return false
  // Excerpt meta requires an excerpt id (same rule as BlockquoteExcerptDecorations).
  if (resolved.role === 'excerpt' && !resolved.binding.resourceExcerptId) return false
  return true
}

/**
 * True when the insert range sits in a paragraph/blockquote that already shows
 * resource-excerpt / basis metadata — paste into such a block should not offer reuse-mark.
 */
export function rangeTouchesExistingResourceMeta(
  doc: ProseMirrorNode,
  from: number,
  to: number,
  annotations: TextAnnotation[],
): boolean {
  const lo = Math.max(0, Math.min(from, to))
  const hi = Math.min(doc.content.size, Math.max(from, to))
  if (hi < lo) return false

  let touches = false
  const checkNode = (node: ProseMirrorNode, pos: number) => {
    if (!META_NODE_TYPES.has(node.type.name)) return
    if (node.type.name === 'paragraph') {
      const $pos = doc.resolve(Math.min(pos + 1, doc.content.size))
      for (let d = $pos.depth; d > 0; d -= 1) {
        if ($pos.node(d).type.name === 'blockquote') {
          const bq = $pos.node(d)
          const bqPos = $pos.before(d)
          if (hasVisibleResourceMeta(resolveBlockResourceBinding(bq, bqPos, bq.nodeSize, annotations))) {
            touches = true
          }
          return
        }
      }
    }
    if (hasVisibleResourceMeta(resolveBlockResourceBinding(node, pos, node.nodeSize, annotations))) {
      touches = true
    }
  }

  doc.nodesBetween(lo, Math.max(lo + 1, hi), (node, pos) => {
    if (touches) return false
    checkNode(node, pos)
    return !touches
  })

  // Cursor-only / collapsed inserts: also resolve the parent textblock at `from`.
  if (!touches && lo <= doc.content.size) {
    const $from = doc.resolve(Math.min(Math.max(lo, 1), doc.content.size))
    for (let d = $from.depth; d > 0; d -= 1) {
      const node = $from.node(d)
      if (!META_NODE_TYPES.has(node.type.name)) continue
      const pos = $from.before(d)
      checkNode(node, pos)
      if (touches) break
    }
  }

  return touches
}

/** Common-prefix / common-suffix extraction of text newly present in `afterText`. */
export function extractInsertedPlainText(beforeText: string, afterText: string): string {
  if (afterText === beforeText) return ''
  if (!beforeText) return afterText
  if (!afterText) return ''

  let prefix = 0
  const minLen = Math.min(beforeText.length, afterText.length)
  while (prefix < minLen && beforeText.charCodeAt(prefix) === afterText.charCodeAt(prefix)) {
    prefix += 1
  }

  let suffix = 0
  while (
    suffix < beforeText.length - prefix
    && suffix < afterText.length - prefix
    && beforeText.charCodeAt(beforeText.length - 1 - suffix)
      === afterText.charCodeAt(afterText.length - 1 - suffix)
  ) {
    suffix += 1
  }

  return afterText.slice(prefix, afterText.length - suffix)
}

/**
 * Map a character offset within `doc.textBetween(spanFrom, spanTo, BLOCK_SEP)` 
 * back to a document position. Only walks nodes inside the span.
 */
export function mapPlainOffsetToPos(
  doc: ProseMirrorNode,
  spanFrom: number,
  spanTo: number,
  plainOffset: number,
): number {
  if (plainOffset <= 0) return spanFrom
  let seen = 0
  let mapped = spanFrom
  let prevTextblock: number | null = null

  doc.nodesBetween(spanFrom, spanTo, (node, pos) => {
    if (seen >= plainOffset) return false

    if (node.isTextblock) {
      if (prevTextblock != null) {
        const sepLen = BLOCK_SEP.length
        if (seen + sepLen >= plainOffset) {
          mapped = Math.min(pos, spanTo)
          seen = plainOffset
          return false
        }
        seen += sepLen
      }
      prevTextblock = pos
      return true
    }

    if (!node.isText) return true

    const from = Math.max(spanFrom, pos)
    const to = Math.min(spanTo, pos + node.nodeSize)
    const len = Math.max(0, to - from)
    if (len <= 0) return true

    if (seen + len >= plainOffset) {
      mapped = from + (plainOffset - seen)
      seen = plainOffset
      return false
    }
    seen += len
    mapped = to
    return true
  })

  return Math.max(spanFrom, Math.min(mapped, spanTo))
}

/**
 * Resolve whether `after` gained plain text relative to `before`.
 * Structural-only edits (wrap/lift/split quotes, empty `>`) yield null or blank insertedText.
 */
export function resolveInsertedContentDelta(
  before: ProseMirrorNode,
  after: ProseMirrorNode,
): InsertedContentDelta | null {
  if (before.eq(after)) return null

  const diffFrom = before.content.findDiffStart(after.content)
  const diffEnd = before.content.findDiffEnd(after.content)
  if (diffFrom == null || diffEnd == null) return null

  const afterFrom = Math.max(0, Math.min(diffFrom, after.content.size))
  const afterTo = Math.max(afterFrom, Math.min(diffEnd.b, after.content.size))
  const beforeFrom = Math.max(0, Math.min(diffFrom, before.content.size))
  const beforeTo = Math.max(beforeFrom, Math.min(diffEnd.a, before.content.size))

  if (afterFrom === afterTo && beforeFrom === beforeTo) return null

  const beforeText = before.textBetween(beforeFrom, beforeTo, BLOCK_SEP, BLOCK_SEP)
  const afterText = after.textBetween(afterFrom, afterTo, BLOCK_SEP, BLOCK_SEP)
  const insertedText = extractInsertedPlainText(beforeText, afterText)
  if (!insertedText.trim()) return null

  // Locate the inserted slice inside the after span (prefix of afterText vs beforeText).
  let prefix = 0
  const minLen = Math.min(beforeText.length, afterText.length)
  while (prefix < minLen && beforeText.charCodeAt(prefix) === afterText.charCodeAt(prefix)) {
    prefix += 1
  }

  const from = mapPlainOffsetToPos(after, afterFrom, afterTo, prefix)
  const to = mapPlainOffsetToPos(after, afterFrom, afterTo, prefix + insertedText.length)
  if (to <= from) {
    // Fallback: whole after-side change window (still span-local, not full doc).
    if (afterTo <= afterFrom) return null
    return {
      from: Math.max(1, afterFrom),
      to: Math.max(1, afterTo),
      insertedText,
    }
  }

  const max = after.content.size
  return {
    from: Math.max(1, Math.min(from, max)),
    to: Math.max(1, Math.min(to, max)),
    insertedText,
  }
}

/**
 * True when an insert delta replaces essentially the entire document (spans all
 * but the terminal 2 positions). Used to skip the load-time `setContent` hydration
 * (async page open from an empty editor), which would otherwise be offered as a
 * reuse-mark over the whole document and select all text on entry. A genuine user
 * paste/bulk-insert produces a localized delta and is not affected.
 */
export function insertCoversWholeDocument(
  delta: InsertedContentDelta | null,
  docSize: number,
): boolean {
  if (!delta) return false
  const span = Math.max(0, delta.to - delta.from)
  return docSize > 0 && span >= docSize - 2
}

export interface ReuseMarkOfferPolicy {
  isPaste: boolean
  /** Non-paste bulk inserts (drop / insertContent) must reach this length. Default 8. */
  minCharsForNonPaste?: number
}

/**
 * Lifecycle gate: only offer reuse-mark when **new** plain content was added.
 * Does not care about blockquote / structural node counts.
 */
export function shouldOfferReuseMarkForContentAddition(
  delta: InsertedContentDelta | null,
  policy: ReuseMarkOfferPolicy,
): delta is InsertedContentDelta {
  if (!delta) return false
  const text = delta.insertedText.trim()
  if (!text) return false
  if (policy.isPaste) return true
  const min = policy.minCharsForNonPaste ?? 8
  return text.length >= min
}
