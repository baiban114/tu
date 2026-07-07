import { Extension } from '@tiptap/core'
import type { Extensions } from '@tiptap/core'
import { generateJSON } from '@tiptap/html'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Fragment } from '@tiptap/pm/model'
import { contentNodesFromGenerated } from '../pasteHtmlContent'
import { findIframeSnippetsInText, parseIframeSnippet, clipboardHtmlHasCorruptedIframeSrc } from '../htmlEmbedUtils'
import { createUrlEmbedBlockId } from '@/utils/urlDisplay'

/** Completed inline HTML snippets typed in a text block, e.g. <b>访问</b> */
const INLINE_HTML_SNIPPET_RE = /<(?:b|strong|i|em|u|s|strike|code)>([^<]*)<\/(?:b|strong|i|em|u|s|strike|code)>/gi

export function decodeHtmlEntitiesForPaste(html: string): string {
  if (!html.includes('&lt;') && !html.includes('&gt;') && !html.includes('&amp;')) {
    return html
  }
  if (typeof document !== 'undefined') {
    const el = document.createElement('textarea')
    el.innerHTML = html
    return el.value
  }
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

/** Prefer unescaped plain text when clipboard HTML only contains entity-escaped tags. */
export function resolveClipboardHtmlSource(html: string, plain: string): string {
  const decoded = decodeHtmlEntitiesForPaste(html)
  const plainTrim = plain.trim()
  const plainLooksLikeHtml = /<[a-z][\s\S]*>/i.test(plainTrim)
  const decodedHasRealTags = /<[a-z][\s\S]*>/i.test(decoded)
  if (plainLooksLikeHtml && !decodedHasRealTags) {
    return plainTrim
  }
  const plainIframe = plainLooksLikeHtml ? parseIframeSnippet(plainTrim) : null
  if (plainIframe?.url && clipboardHtmlHasCorruptedIframeSrc(decoded)) {
    return plainTrim
  }
  return decoded
}

let cachedSchemaExtensions: Extensions = []

function fragmentFromSnippet(snippet: string, schema: ProseMirrorNode['type']['schema']): Fragment | null {
  try {
    const wrapped = `<p>${snippet}</p>`
    const json = generateJSON(wrapped, cachedSchemaExtensions)
    const nodes = contentNodesFromGenerated(json)
    const list = Array.isArray(nodes) ? nodes : [nodes]
    const first = list[0]
    if (!first?.type) return null

    if (first.type === 'paragraph' && Array.isArray(first.content) && first.content.length > 0) {
      const children = first.content.map((child) => schema.nodeFromJSON(child))
      return Fragment.from(children)
    }
  } catch {
    return null
  }
  return null
}

function buildBlockTextIndex(
  block: ProseMirrorNode,
  blockPos: number,
): { text: string; indexToDocPos: number[] } {
  let text = ''
  const indexToDocPos: number[] = []
  block.descendants((child, childPos) => {
    if (!child.isText || !child.text) return true
    for (let i = 0; i < child.text.length; i++) {
      indexToDocPos.push(blockPos + 1 + childPos + i)
      text += child.text[i]
    }
    return true
  })
  return { text, indexToDocPos }
}

function collectReplacements(
  doc: ProseMirrorNode,
  schema: ProseMirrorNode['type']['schema'],
): Array<{ from: number; to: number; fragment: Fragment }> {
  const replacements: Array<{ from: number; to: number; fragment: Fragment }> = []

  doc.descendants((node, pos) => {
    if (!node.isTextblock || !node.textContent.includes('<')) return true

    const { text, indexToDocPos } = buildBlockTextIndex(node, pos)
    const matches: Array<{ start: number; end: number; html: string }> = []

    INLINE_HTML_SNIPPET_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = INLINE_HTML_SNIPPET_RE.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        html: match[0],
      })
    }

    if (matches.length === 0) return true

    matches.sort((a, b) => b.start - a.start)
    for (const item of matches) {
      const fragment = fragmentFromSnippet(item.html, schema)
      if (!fragment || fragment.size === 0) continue
      const from = indexToDocPos[item.start]
      const to = indexToDocPos[item.end - 1]
      if (from === undefined || to === undefined) continue
      replacements.push({ from, to: to + 1, fragment })
    }
    return false
  })

  return replacements
}

function collectBlockEmbedReplacements(
  doc: ProseMirrorNode,
  schema: ProseMirrorNode['type']['schema'],
): Array<{ from: number; to: number; node: ProseMirrorNode }> {
  const replacements: Array<{ from: number; to: number; node: ProseMirrorNode }> = []
  const embedType = schema.nodes.urlEmbedBlock
  if (!embedType) return replacements

  doc.descendants((node, pos) => {
    if (!node.isTextblock || !node.textContent.includes('iframe')) return true

    const text = node.textContent
    const snippets = findIframeSnippetsInText(text)
    if (snippets.length !== 1) return true
    const snippet = snippets[0]!
    if (text.trim() !== snippet.html.trim()) return true

    const parsed = parseIframeSnippet(snippet.html)
    if (!parsed) return true

    const embedNode = embedType.create({
      blockId: createUrlEmbedBlockId(),
      url: parsed.url,
      height: parsed.height,
    })
    replacements.push({ from: pos, to: pos + node.nodeSize, node: embedNode })
    return false
  })

  return replacements
}

type DocReplacement =
  | { kind: 'block'; from: number; to: number; node: ProseMirrorNode }
  | { kind: 'inline'; from: number; to: number; fragment: Fragment }

function collectAllReplacements(
  doc: ProseMirrorNode,
  schema: ProseMirrorNode['type']['schema'],
): DocReplacement[] {
  return [
    ...collectBlockEmbedReplacements(doc, schema).map((item) => ({ ...item, kind: 'block' as const })),
    ...collectReplacements(doc, schema).map((item) => ({ ...item, kind: 'inline' as const })),
  ].sort((a, b) => b.from - a.from)
}

export const htmlInlineRenderKey = new PluginKey('htmlInlineRender')

export function createHtmlInlineRenderExtension(getExtensions: () => Extensions) {
  return Extension.create({
    name: 'htmlInlineRender',

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: htmlInlineRenderKey,
          appendTransaction(transactions, _oldState, newState) {
            if (!transactions.some((tr) => tr.docChanged)) return null
            cachedSchemaExtensions = getExtensions()
            const { schema, doc } = newState
            const replacements = collectAllReplacements(doc, schema)
            if (replacements.length === 0) return null

            let tr = newState.tr
            for (const item of replacements) {
              if (item.kind === 'block') {
                tr = tr.replaceWith(item.from, item.to, item.node)
              } else {
                tr = tr.replaceWith(item.from, item.to, item.fragment)
              }
            }

            return tr
          },
        }),
      ]
    },
  })
}
