/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { ParagraphNode } from '@/editor/extensions/ParagraphNode'
import { BlockquoteNode } from '@/editor/extensions/BlockquoteNode'
import {
  resolveInsertedContentDelta,
  shouldOfferReuseMarkForContentAddition,
  insertCoversWholeDocument,
} from '@/editor/reuseMarkContentLifecycle'

const extensions = [
  StarterKit.configure({ paragraph: false, blockquote: false }),
  ParagraphNode,
  BlockquoteNode,
]

describe('reuse-mark whole-document hydration guard', () => {
  it('editor created empty, setContent whole doc => delta covers whole doc => guarded', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const editor = new Editor({
      element: el,
      extensions,
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    })
    const before = editor.state.doc
    // simulate backend content arriving after mount (async page open)
    editor.commands.setContent({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '这是文档标题，作为第一段标题内容。' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '第二段正文内容。' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '第三段正文内容。' }] },
      ],
    })
    const delta = resolveInsertedContentDelta(before, editor.state.doc)
    const docSize = editor.state.doc.content.size
    expect(delta).not.toBeNull()
    expect(shouldOfferReuseMarkForContentAddition(delta, { isPaste: false })).toBe(true)
    // without the guard this would offer reuse-mark over the whole document
    expect(insertCoversWholeDocument(delta, docSize)).toBe(true)
    editor.destroy()
  })

  it('normal localized paste does NOT cover whole doc => reuse-mark still offered', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const editor = new Editor({
      element: el,
      extensions,
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: '前文' }] },
          { type: 'paragraph' },
        ],
      },
    })
    const before = editor.state.doc
    const p1 = before.firstChild!.nodeSize
    editor.view.dispatch(editor.state.tr.insertText('新粘贴的内容', p1 + 1))
    const delta = resolveInsertedContentDelta(before, editor.state.doc)
    const docSize = editor.state.doc.content.size
    expect(delta).not.toBeNull()
    expect(shouldOfferReuseMarkForContentAddition(delta, { isPaste: true })).toBe(true)
    expect(insertCoversWholeDocument(delta, docSize)).toBe(false)
    editor.destroy()
  })
})