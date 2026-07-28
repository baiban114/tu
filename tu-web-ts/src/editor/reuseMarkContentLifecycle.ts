import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

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
