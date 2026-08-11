import { findChildren } from '@tiptap/core'
import type { Node as ProsemirrorNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import highlight from 'highlight.js/lib/core'

function parseNodes(nodes: unknown[], className: string[] = []): { text: string; classes: string[] }[] {
  return nodes.flatMap((node) => {
    if (!node || typeof node !== 'object') return []
    const record = node as { properties?: { className?: string | string[] }; children?: unknown[]; value?: string }
    const nodeClasses = record.properties?.className
    const extra = Array.isArray(nodeClasses) ? nodeClasses : nodeClasses ? [nodeClasses] : []
    const classes = [...className, ...extra]
    if (record.children) return parseNodes(record.children, classes)
    if (typeof record.value !== 'string') return []
    return [{ text: record.value, classes }]
  })
}

function getHighlightNodes(result: { children?: unknown[]; value?: unknown }) {
  return result.children ?? (typeof result.value === 'object' && result.value !== null
    ? (result.value as { children?: unknown[] }).children
  : []) ?? []
}

function registered(aliasOrLanguage: string) {
  return Boolean(highlight.getLanguage(aliasOrLanguage))
}

function getDecorations({
  doc,
  name,
  lowlight,
  defaultLanguage,
}: {
  doc: ProsemirrorNode
  name: string
  lowlight: {
    highlight: (language: string, value: string) => unknown
    highlightAuto: (value: string) => unknown
    listLanguages: () => string[]
    registered?: (language: string) => boolean
  }
  defaultLanguage: string | null | undefined
}) {
  const decorations: Decoration[] = []

  findChildren(doc, (node) => node.type.name === name).forEach((block) => {
    let from = block.pos + 1
    const language = block.node.attrs.language || defaultLanguage
    const languages = lowlight.listLanguages()

    const nodes =
      language && (languages.includes(language) || registered(language) || lowlight.registered?.(language))
        ? getHighlightNodes(lowlight.highlight(language, block.node.textContent) as { children?: unknown[] })
        : getHighlightNodes(lowlight.highlightAuto(block.node.textContent) as { children?: unknown[] })

    parseNodes(nodes).forEach((node) => {
      const to = from + node.text.length
      if (node.classes.length) {
        decorations.push(Decoration.inline(from, to, { class: node.classes.join(' ') }))
      }
      from = to
    })
  })

  return DecorationSet.create(doc, decorations)
}

function isFunction(param: unknown): param is (...args: never[]) => unknown {
  return typeof param === 'function'
}

/**
 * lowlight decorations on code blocks.
 *
 * Decorations are always applied to every code block and only recalculated
 * when the document content changes — never on pure cursor moves. This keeps
 * already-rendered highlight styles stable and avoids flicker.
 */
export function createConditionalLowlightPlugin({
  name,
  lowlight,
  defaultLanguage,
}: {
  name: string
  lowlight: {
    highlight: (language: string, value: string) => unknown
    highlightAuto: (value: string) => unknown
    listLanguages: () => string[]
    registered?: (language: string) => boolean
  }
  defaultLanguage?: string | null
}) {
  if (!['highlight', 'highlightAuto', 'listLanguages'].every((api) => isFunction(lowlight[api as keyof typeof lowlight]))) {
    throw Error('You should provide an instance of lowlight to use the code-block-lowlight extension')
  }

  const pluginKey = new PluginKey<DecorationSet>('conditionalLowlight')

  return new Plugin<DecorationSet>({
    key: pluginKey,
    state: {
      init: (_, { doc }) => getDecorations({ doc, name, lowlight, defaultLanguage }),
      apply: (transaction: Transaction, pluginState: DecorationSet, _oldState, newState) => {
        if (!transaction.docChanged) return pluginState
        return getDecorations({ doc: newState.doc, name, lowlight, defaultLanguage })
      },
    },
    props: {
      decorations(state) {
        return pluginKey.getState(state) ?? null
      },
    },
  })
}
