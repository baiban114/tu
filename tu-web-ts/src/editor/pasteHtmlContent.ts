import type { JSONContent, Extensions } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import { generateJSON } from '@tiptap/html'
import { repairIframeSrcInHtml } from './htmlEmbedUtils'

/** Strip scripts and obvious noise before HTML paste parsing. */
export function sanitizePastedHtml(html: string): string {
  return repairIframeSrcInHtml(
    html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim(),
  )
}

/** True when clipboard carries meaningful rich HTML (not an image-only paste). */
export function hasRichHtmlClipboard(clipboard: DataTransfer | null | undefined): boolean {
  const html = sanitizePastedHtml(clipboard?.getData('text/html') ?? '')
  if (!html) return false
  // Image-only / screenshot paste often has a tiny wrapper without text markup.
  const hasTextMarkup = /<(p|div|span|h[1-6]|ul|ol|li|table|tr|td|th|a|strong|em|b|i|br|iframe)\b/i.test(html)
  const plain = html.replace(/<[^>]+>/g, '').trim()
  return hasTextMarkup || plain.length > 0
}

export function contentNodesFromGenerated(json: JSONContent): JSONContent | JSONContent[] {
  if (json.type === 'doc' && Array.isArray(json.content)) {
    return json.content.length === 1 ? json.content[0]! : json.content
  }
  return json
}

/**
 * Parse clipboard HTML with the editor schema and insert at the selection.
 * Returns false when nothing was inserted (caller may fall back to default paste).
 */
export function insertHtmlFromClipboard(
  editor: Editor,
  rawHtml: string,
  schemaExtensions: Extensions,
): boolean {
  const html = sanitizePastedHtml(rawHtml)
  if (!html) return false

  try {
    const json = generateJSON(html, schemaExtensions)
    const nodes = contentNodesFromGenerated(json)
    const ok = editor.chain().focus().insertContent(nodes).run()
    if (ok) return true
  } catch (error: unknown) {
    console.warn('[TuEditor] generateJSON paste failed, trying insertContent(html)', error)
  }

  return editor.chain().focus().insertContent(html, {
    parseOptions: { preserveWhitespace: false },
  }).run()
}

/**
 * Image file from clipboard when this is an image-only paste (no rich HTML).
 */
export function findClipboardImageFileOnly(
  clipboard: DataTransfer | null | undefined,
): File | null {
  if (!clipboard || hasRichHtmlClipboard(clipboard)) return null
  const fromFiles = Array.from(clipboard.files).find((file) => file.type.startsWith('image/'))
  if (fromFiles) return fromFiles
  for (const item of Array.from(clipboard.items ?? [])) {
    if (!item.type.startsWith('image/')) continue
    const file = item.getAsFile()
    if (file) return file
  }
  return null
}
