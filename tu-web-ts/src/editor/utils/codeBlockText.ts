/** Invisible placeholder so empty code blocks avoid ProseMirror trailingBreak hacks. */
export const CODE_BLOCK_EMPTY_CHAR = '\u200b'

/** Strip placeholder and leading/trailing newlines for storage/export. */
export function normalizeCodeBlockText(text: string): string {
  return text.replace(/\u200b/g, '').replace(/^\n+/, '').replace(/\n+$/, '')
}

/** Text persisted inside a code block node (never truly empty). */
export function codeBlockNodeText(text: string): string {
  const normalized = normalizeCodeBlockText(text)
  return normalized || CODE_BLOCK_EMPTY_CHAR
}

export function isCodeBlockEffectivelyEmpty(text: string): boolean {
  return normalizeCodeBlockText(text) === ''
}
