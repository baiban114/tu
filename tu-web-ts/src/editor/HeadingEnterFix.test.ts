import { describe, expect, it, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { HeadingNode } from './extensions/HeadingNode'
import { HeadingEnterFix, handleHeadingEnter } from './extensions/HeadingEnterFix'
import { ParagraphNode } from './extensions/ParagraphNode'

const extensions = [
  StarterKit.configure({
    heading: false,
    paragraph: false,
  }),
  HeadingNode.configure({ levels: [1, 2, 3, 4, 5, 6] }),
  HeadingEnterFix,
  ParagraphNode,
]

function setCursorInHeading(editor: Editor, offset: number) {
  // doc pos 1 is first character inside the heading textblock
  editor.commands.setTextSelection(1 + offset)
}

describe('HeadingEnterFix', () => {
  let editor: Editor | null = null

  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  it('creates a paragraph after Enter at the end of a heading', () => {
    editor = new Editor({
      extensions,
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: '标题' }],
          },
        ],
      },
    })

    setCursorInHeading(editor, 2)
    expect(handleHeadingEnter(editor)).toBe(true)

    expect(editor.state.doc.childCount).toBe(2)
    expect(editor.state.doc.child(0).type.name).toBe('heading')
    expect(editor.state.doc.child(0).textContent).toBe('标题')
    expect(editor.state.doc.child(1).type.name).toBe('paragraph')
    expect(editor.state.doc.child(1).textContent).toBe('')
  })

  it('keeps text before the cursor as heading and moves the rest to a paragraph', () => {
    editor = new Editor({
      extensions,
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: '前半后半' }],
          },
        ],
      },
    })

    setCursorInHeading(editor, 2)
    expect(handleHeadingEnter(editor)).toBe(true)

    expect(editor.state.doc.child(0).type.name).toBe('heading')
    expect(editor.state.doc.child(0).textContent).toBe('前半')
    expect(editor.state.doc.child(1).type.name).toBe('paragraph')
    expect(editor.state.doc.child(1).textContent).toBe('后半')
  })

  it('converts an empty heading to a paragraph on Enter', () => {
    editor = new Editor({
      extensions,
      content: {
        type: 'doc',
        content: [{ type: 'heading', attrs: { level: 3 }, content: [] }],
      },
    })

    editor.commands.setTextSelection(1)
    expect(handleHeadingEnter(editor)).toBe(true)

    expect(editor.state.doc.childCount).toBe(1)
    expect(editor.state.doc.child(0).type.name).toBe('paragraph')
  })

  it('ignores Enter when not in a heading', () => {
    editor = new Editor({
      extensions,
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '正文' }],
          },
        ],
      },
    })

    editor.commands.setTextSelection(1 + 2)
    expect(handleHeadingEnter(editor)).toBe(false)
    expect(editor.state.doc.childCount).toBe(1)
    expect(editor.state.doc.child(0).type.name).toBe('paragraph')
  })
})
