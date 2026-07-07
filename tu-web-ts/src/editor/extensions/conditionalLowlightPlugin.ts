import { findChildren } from '@tiptap/core'
import type { Node as ProsemirrorNode } from '@tiptap/pm/model'
import type { Selection, Transaction } from '@tiptap/pm/state'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import highlight from 'highlight.js/lib/core'

const IDLE_HIGHLIGHT_MS = 500

interface ConditionalLowlightState {
  lastEditAt: number
  decorations: DecorationSet
}

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

function selectionInsideBlock(blockPos: number, blockSize: number, selection: Selection): boolean {
  const head = selection.head
  return head > blockPos && head < blockPos + blockSize
}

function isSelectionInNamedBlock(doc: ProsemirrorNode, selection: Selection, name: string): boolean {
  let inside = false
  doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    if (node.type.name !== name) return
    if (selectionInsideBlock(pos, node.nodeSize, selection)) {
      inside = true
      return false
    }
  })
  return inside
}

function shouldSkipActiveBlockHighlight(
  blockPos: number,
  blockSize: number,
  selection: Selection,
  lastEditAt: number,
  now: number,
): boolean {
  if (!selectionInsideBlock(blockPos, blockSize, selection)) return false
  return now - lastEditAt < IDLE_HIGHLIGHT_MS
}

function getDecorations({
  doc,
  name,
  lowlight,
  defaultLanguage,
  selection,
  lastEditAt,
  now,
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
  selection: Selection
  lastEditAt: number
  now: number
}) {
  const decorations: Decoration[] = []

  findChildren(doc, (node) => node.type.name === name).forEach((block) => {
    if (shouldSkipActiveBlockHighlight(block.pos, block.node.nodeSize, selection, lastEditAt, now)) {
      return
    }

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
 * The block containing the cursor stays plain while typing; highlights after a short idle
 * or when the cursor leaves the block (avoids DOM span churn and cursor drift).
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

  const pluginKey = new PluginKey<ConditionalLowlightState>('conditionalLowlight')

  return new Plugin<ConditionalLowlightState>({
    key: pluginKey,
    state: {
      init: (_, { doc, selection }) => ({
        lastEditAt: 0,
        decorations: getDecorations({
          doc,
          name,
          lowlight,
          defaultLanguage,
          selection,
          lastEditAt: 0,
          now: Date.now(),
        }),
      }),
      apply: (transaction: Transaction, pluginState, _oldState, newState) => {
        const idleRefresh = transaction.getMeta(pluginKey)?.idleRefresh === true
        let lastEditAt = pluginState.lastEditAt
        if (transaction.docChanged && isSelectionInNamedBlock(newState.doc, newState.selection, name)) {
          lastEditAt = Date.now()
        }
        if (!transaction.docChanged && !transaction.selectionSet && !idleRefresh) {
          return pluginState
        }
        return {
          lastEditAt,
          decorations: getDecorations({
            doc: newState.doc,
            name,
            lowlight,
            defaultLanguage,
            selection: newState.selection,
            lastEditAt,
            now: Date.now(),
          }),
        }
      },
    },
    props: {
      decorations(state) {
        return pluginKey.getState(state)?.decorations ?? null
      },
    },
    view() {
      let idleTimer: ReturnType<typeof setTimeout> | null = null

      const scheduleIdleRefresh = (view: import('@tiptap/pm/view').EditorView) => {
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = setTimeout(() => {
          idleTimer = null
          if (!isSelectionInNamedBlock(view.state.doc, view.state.selection, name)) return
          const tr = view.state.tr
            .setMeta(pluginKey, { idleRefresh: true })
            .setMeta('addToHistory', false)
          view.dispatch(tr)
        }, IDLE_HIGHLIGHT_MS)
      }

      return {
        update(view, prevState) {
          const changed = !prevState.doc.eq(view.state.doc) || !prevState.selection.eq(view.state.selection)
          if (!changed) return
          if (isSelectionInNamedBlock(view.state.doc, view.state.selection, name)) {
            scheduleIdleRefresh(view)
          } else if (idleTimer) {
            clearTimeout(idleTimer)
            idleTimer = null
          }
        },
        destroy() {
          if (idleTimer) clearTimeout(idleTimer)
        },
      }
    },
  })
}
