import type { Editor } from '@tiptap/core'

/** True when paste should stay inline in the current text block (heading). */
export function isHeadingPasteContext(editor: Editor): boolean {
  const { $from } = editor.state.selection
  if ($from.parent.type.spec.code) return false
  return $from.parent.type.name === 'heading'
}

export function normalizePastedPlainText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

export function splitPastedPlainLines(text: string): { firstLine: string; restLines: string[] } {
  const lines = normalizePastedPlainText(text).split('\n')
  return {
    firstLine: lines[0] ?? '',
    restLines: lines.slice(1),
  }
}

function findHeadingDepth(editor: Editor): number {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'heading') return depth
  }
  return -1
}

/**
 * Paste plain text into a heading: first line stays in the heading;
 * additional lines become paragraphs after the heading block.
 */
export function pastePlainTextInHeading(editor: Editor, rawText: string): boolean {
  if (!rawText) return false

  const { firstLine, restLines } = splitPastedPlainLines(rawText)
  const { from, to } = editor.state.selection

  editor.view.dispatch(editor.state.tr.insertText(firstLine, from, to))

  if (restLines.length === 0) return true

  const headingDepth = findHeadingDepth(editor)
  if (headingDepth < 0) return true

  const insertPos = editor.state.selection.$from.after(headingDepth)
  const paragraphs = restLines.map((line) => (
    line
      ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
      : { type: 'paragraph' }
  ))

  return editor.chain().focus().insertContentAt(insertPos, paragraphs).run()
}
