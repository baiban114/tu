/** Invisible placeholder so empty code blocks avoid ProseMirror trailingBreak hacks. */
export const CODE_BLOCK_EMPTY_CHAR = '\u200b'

/** Strip the editor-only placeholder while retaining intentional code lines. */
export function normalizeCodeBlockText(text: string): string {
  return text.replace(/\u200b/g, '')
}

/** Text persisted inside a code block node (never truly empty). */
export function codeBlockNodeText(text: string): string {
  // Pressing Enter at the start or end creates a deliberate boundary newline.
  // Only the invisible empty-block placeholder is editor implementation state.
  const editableText = normalizeCodeBlockText(text)
  return editableText || CODE_BLOCK_EMPTY_CHAR
}

export function isCodeBlockEffectivelyEmpty(text: string): boolean {
  return normalizeCodeBlockText(text).replace(/\n/g, '') === ''
}
