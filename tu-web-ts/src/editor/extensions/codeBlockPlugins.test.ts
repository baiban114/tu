import type { Editor } from '@tiptap/core'
import { GapCursor } from '@tiptap/pm/gapcursor'
import { Schema } from '@tiptap/pm/model'
import { EditorState, TextSelection, type Transaction } from '@tiptap/pm/state'
import { describe, expect, it } from 'vitest'
import { createCodeBlockBoundaryShortcuts } from './codeBlockPlugins'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'text*', group: 'block' },
    codeBlock: { content: 'text*', group: 'block', code: true, isolating: true },
    text: { group: 'inline' },
  },
})

function createEditor(state: EditorState): Editor {
  const editor = {
    state,
    view: {
      dispatch(transaction: Transaction) {
        editor.state = editor.state.apply(transaction)
      },
    },
  }
  return editor as unknown as Editor
}

describe('createCodeBlockBoundaryShortcuts', () => {
  it('places a gap cursor before a leading code block on ArrowLeft', () => {
    const doc = schema.node('doc', null, [
      schema.node('codeBlock', null, schema.text('alpha')),
    ])
    const editor = createEditor(EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, 1),
    }))
    const shortcuts = createCodeBlockBoundaryShortcuts() as Record<string, (context: { editor: Editor }) => boolean>

    expect(shortcuts.ArrowLeft({ editor })).toBe(true)
    expect(editor.state.doc.childCount).toBe(1)
    expect(editor.state.doc.firstChild?.type.name).toBe('codeBlock')
    expect(editor.state.selection).toBeInstanceOf(GapCursor)
    expect(editor.state.selection.from).toBe(0)
  })

  it('moves to the preceding body block on ArrowUp from the first code line', () => {
    const paragraph = schema.node('paragraph', null, schema.text('before'))
    const doc = schema.node('doc', null, [
      paragraph,
      schema.node('codeBlock', null, schema.text('alpha')),
    ])
    const codeStart = paragraph.nodeSize + 1
    const editor = createEditor(EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, codeStart + 2),
    }))
    const shortcuts = createCodeBlockBoundaryShortcuts() as Record<string, (context: { editor: Editor }) => boolean>

    expect(shortcuts.ArrowUp({ editor })).toBe(true)
    expect(editor.state.selection.$from.parent.type.name).toBe('paragraph')
  })

  it('keeps normal navigation inside later code lines', () => {
    const doc = schema.node('doc', null, [
      schema.node('codeBlock', null, schema.text('first\nsecond')),
    ])
    const editor = createEditor(EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, 8),
    }))
    const shortcuts = createCodeBlockBoundaryShortcuts() as Record<string, (context: { editor: Editor }) => boolean>

    expect(shortcuts.ArrowUp({ editor })).toBe(false)
    expect(shortcuts.ArrowLeft({ editor })).toBe(false)
  })
})
