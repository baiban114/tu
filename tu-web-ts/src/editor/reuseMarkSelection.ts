import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/core'
import { getMarkRange } from '@tiptap/core'

/**
 * Diff range in `after` relative to `before` (ProseMirror findDiffStart/End).
 * TipTap applies paste/input-rule appendTransactions before emitting `transaction`,
 * so pass the live `editor.state.doc` as `after` to get the post-rule range.
 */
export function collectDocDiffRange(
  before: ProseMirrorNode,
  after: ProseMirrorNode,
): { from: number; to: number } | null {
  const from = before.content.findDiffStart(after.content)
  const to = before.content.findDiffEnd(after.content)
  if (from == null || to == null || from === to.b) return null
  const max = after.content.size
  return {
    from: Math.max(1, Math.min(from, max)),
    to: Math.max(1, Math.min(to.b, max)),
  }
}

/**
 * Prefer the link mark created at the paste site (markdown `[label](url)` → label).
 * Falls back to the provided range / caret span.
 */
export function resolveSelectionAfterPasteRules(
  editor: Editor,
  insertFrom: number,
  fallbackTo: number,
): { from: number; to: number } | null {
  const doc = editor.state.doc
  const max = doc.content.size
  if (max < 2) return null

  const from = Math.max(1, Math.min(insertFrom, max))
  const linkType = editor.schema.marks.link

  if (linkType) {
    for (let pos = Math.max(1, from - 1); pos <= Math.min(from + 2, max); pos += 1) {
      try {
        const $pos = doc.resolve(pos)
        const range = getMarkRange($pos, linkType)
        if (!range || range.to <= range.from) continue
        if (Math.abs(range.from - from) <= 1) {
          return { from: range.from, to: range.to }
        }
      } catch {
        // resolve may fail at structural boundaries
      }
    }
  }

  const sel = editor.state.selection
  if (!sel.empty && sel.to > sel.from) {
    if (Math.abs(sel.from - from) <= 1 || (sel.from >= from - 1 && sel.from <= from + 1)) {
      return { from: sel.from, to: sel.to }
    }
  }
  if (sel.empty && sel.from > from) {
    return { from, to: Math.min(sel.from, max) }
  }

  const to = Math.max(from, Math.min(fallbackTo, max))
  if (to <= from) return null
  return { from, to }
}
