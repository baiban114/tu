import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorView, ViewMutationRecord } from '@tiptap/pm/view'
import { codeBlockNodeText, CODE_BLOCK_EMPTY_CHAR, isCodeBlockEffectivelyEmpty } from '../utils/codeBlockText'

const CODE_BLOCK_NAME = 'codeBlock'

function collectCodeBlockTextFixes(
  doc: ProseMirrorNode,
  nodeName: string,
): { from: number; to: number; text: string }[] {
  const updates: { from: number; to: number; text: string }[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== nodeName) return
    const raw = node.textContent
    if (!raw) return
    const next = codeBlockNodeText(raw)
    if (next === raw) return
    updates.push({
      from: pos + 1,
      to: pos + node.nodeSize - 1,
      text: next,
    })
  })
  return updates
}

export function createCodeBlockNormalizePlugin(nodeName = CODE_BLOCK_NAME) {
  return new Plugin({
    key: new PluginKey('codeBlockNormalize'),
    appendTransaction: (_transactions, _oldState, newState) => {
      const updates = collectCodeBlockTextFixes(newState.doc, nodeName)
      if (!updates.length) return null

      let tr = newState.tr
      for (const update of updates.reverse()) {
        tr = tr.replaceWith(update.from, update.to, newState.schema.text(update.text))
      }
      tr.setSelection(newState.selection.map(tr.doc, tr.mapping))
      return tr
    },
  })
}

function resolveCodeBlockSelection(
  view: EditorView,
  contentEl: Element,
  bias: -1 | 1,
): boolean {
  const rawPos = view.posAtDOM(contentEl, bias < 0 ? 0 : contentEl.childNodes.length)
  const pos = Math.max(0, Math.min(rawPos, view.state.doc.content.size))
  const $pos = view.state.doc.resolve(pos)

  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name !== CODE_BLOCK_NAME) continue
    const start = $pos.start(depth)
    const end = $pos.end(depth)
    const anchor = bias < 0
      ? Math.min(start + 1, end - 1)
      : Math.max(start + 1, end - 1)
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, anchor)))
    return true
  }
  return false
}

function isCodeBlockHackNode(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false
  return target.classList.contains('ProseMirror-trailingBreak')
    || target.classList.contains('ProseMirror-separator')
}

export function createCodeBlockSelectionPlugin() {
  return new Plugin({
    key: new PluginKey('codeBlockSelection'),
    props: {
      handleDOMEvents: {
        mousedown(view, event) {
          if (!isCodeBlockHackNode(event.target)) return false
          const contentEl = event.target.closest('[data-node-view-content]')
          if (!contentEl) return false
          event.preventDefault()
          const bias = event.target.classList.contains('ProseMirror-separator') ? -1 : 1
          return resolveCodeBlockSelection(view, contentEl, bias)
        },
      },
    },
  })
}

export function createCodeBlockBoundaryShortcuts(nodeName = CODE_BLOCK_NAME) {
  return {
    Delete: ({ editor }: { editor: import('@tiptap/core').Editor }) => {
      const { state } = editor
      const { $from, empty } = state.selection
      if (!empty || $from.parent.type.name !== nodeName) return false

      const isAtEnd = $from.parentOffset === $from.parent.content.size
      if (!isAtEnd) return false

      // Consume Delete at block end so joinForward cannot pull the next block in.
      return true
    },
    Backspace: ({ editor }: { editor: import('@tiptap/core').Editor }) => {
      const { state } = editor
      const { $from, empty } = state.selection
      if (!empty || $from.parent.type.name !== nodeName) return false

      const isAtStart = $from.parentOffset === 0
      if (!isAtStart) return false

      if (!isCodeBlockEffectivelyEmpty($from.parent.textContent)) return false

      return editor.commands.deleteNode(nodeName)
    },
  }
}

export function createCodeBlockEmptyPlaceholderPlugin(nodeName = CODE_BLOCK_NAME) {
  return new Plugin({
    key: new PluginKey('codeBlockEmptyPlaceholder'),
    appendTransaction: (_transactions, _oldState, newState) => {
      let tr = newState.tr
      let changed = false
      newState.doc.descendants((node, pos) => {
        if (node.type.name !== nodeName || node.textContent.length > 0) return
        tr = tr.insert(pos + 1, newState.schema.text(CODE_BLOCK_EMPTY_CHAR))
        changed = true
      })
      if (changed) {
        tr.setSelection(newState.selection.map(tr.doc, tr.mapping))
      }
      return changed ? tr : null
    },
  })
}

export function shouldIgnoreCodeBlockContentMutation(mutation: ViewMutationRecord): boolean {
  if (mutation.type !== 'childList') return false
  const nodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)]
  return nodes.some((node) => (
    node instanceof HTMLElement
    && (node.classList.contains('ProseMirror-trailingBreak')
      || node.classList.contains('ProseMirror-separator'))
  ))
}
