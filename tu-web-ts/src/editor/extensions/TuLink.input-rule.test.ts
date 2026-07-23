/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TuLink } from '@/editor/extensions/TuLink'

function typeClosingParen(editor: Editor) {
  const from = editor.state.selection.from
  return editor.view.someProp('handleTextInput', (f) => f(editor.view, from, from, ')', undefined as never))
}

describe('TuLink markdown input rule', () => {
  let editor: Editor | null = null

  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  it('converts [fwe](fwa) when typing closing paren', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    editor = new Editor({
      element: el,
      extensions: [
        StarterKit.configure({ link: false }),
        TuLink.configure({ openOnClick: false }),
      ],
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    })
    editor.commands.setTextSelection(1)
    editor.view.dispatch(editor.state.tr.insertText('[fwe](fwa', 1))
    expect(typeClosingParen(editor)).toBe(true)
    expect(editor.getHTML()).toContain('href="fwa"')
    expect(editor.getText()).toBe('fwe')
  })

  it('converts when markdown link follows text without a space', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    editor = new Editor({
      element: el,
      extensions: [
        StarterKit.configure({ link: false }),
        TuLink.configure({ openOnClick: false }),
      ],
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    })
    editor.commands.setTextSelection(1)
    editor.view.dispatch(editor.state.tr.insertText('你好[fwe](fwa', 1))
    expect(typeClosingParen(editor)).toBe(true)
    expect(editor.getText()).toBe('你好fwe')
    expect(editor.getHTML()).toContain('href="fwa"')
  })
})
