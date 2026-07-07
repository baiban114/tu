import { describe, expect, it, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { HeadingNode } from './extensions/HeadingNode'
import { ParagraphNode } from './extensions/ParagraphNode'
import { CodeBlockNode } from './extensions/CodeBlockNode'
import {
  isHeadingPasteContext,
  pastePlainTextInHeading,
  splitPastedPlainLines,
} from './pasteInTextblock'

const pasteTestExtensions = [
  StarterKit.configure({
    heading: false,
    paragraph: false,
    codeBlock: false,
  }),
  HeadingNode.configure({ levels: [1, 2, 3, 4, 5, 6] }),
  ParagraphNode,
  CodeBlockNode,
]

function createHeadingEditor(): Editor {
  return new Editor({
    extensions: pasteTestExtensions,
    content: {
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 1 }, content: [] }],
    },
  })
}

describe('pasteInTextblock', () => {
  let editor: Editor | null = null

  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  it('detects heading paste context', () => {
    editor = createHeadingEditor()
    editor.commands.focus('end')
    expect(isHeadingPasteContext(editor)).toBe(true)
  })

  it('splits pasted lines', () => {
    expect(splitPastedPlainLines('标题\n正文')).toEqual({
      firstLine: '标题',
      restLines: ['正文'],
    })
  })

  it('pastes single line into heading', () => {
    editor = createHeadingEditor()
    editor.commands.focus('end')
    pastePlainTextInHeading(editor, '标题内容')
    expect(editor.state.doc.childCount).toBe(1)
    expect(editor.state.doc.firstChild?.type.name).toBe('heading')
    expect(editor.state.doc.firstChild?.textContent).toBe('标题内容')
  })

  it('pastes first line into heading and rest as paragraphs', () => {
    editor = createHeadingEditor()
    editor.commands.focus('end')
    pastePlainTextInHeading(editor, '标题\n正文一\n正文二')
    expect(editor.state.doc.childCount).toBe(3)
    expect(editor.state.doc.child(0).type.name).toBe('heading')
    expect(editor.state.doc.child(0).textContent).toBe('标题')
    expect(editor.state.doc.child(1).type.name).toBe('paragraph')
    expect(editor.state.doc.child(1).textContent).toBe('正文一')
    expect(editor.state.doc.child(2).textContent).toBe('正文二')
  })
})
