/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import {
  extractInsertedPlainText,
  resolveInsertedContentDelta,
  shouldOfferReuseMarkForContentAddition,
} from '@/editor/reuseMarkContentLifecycle'

const extensions = [StarterKit]

function insertPlainText(editor: Editor, pos: number, text: string) {
  editor.view.dispatch(editor.state.tr.insertText(text, pos))
}

describe('extractInsertedPlainText', () => {
  it('returns empty when texts are equal', () => {
    expect(extractInsertedPlainText('abc', 'abc')).toBe('')
  })

  it('returns full after when before is empty', () => {
    expect(extractInsertedPlainText('', 'hello')).toBe('hello')
  })

  it('returns middle insertion', () => {
    expect(extractInsertedPlainText('ab', 'aXYb')).toBe('XY')
  })
})

describe('resolveInsertedContentDelta', () => {
  let editor: Editor | null = null

  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  it('detects pasted text into an empty paragraph', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    editor = new Editor({
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
    insertPlainText(editor, p1 + 1, '新粘贴的内容')
    const delta = resolveInsertedContentDelta(before, editor.state.doc)
    expect(delta).not.toBeNull()
    expect(delta!.insertedText).toContain('新粘贴的内容')
    expect(
      shouldOfferReuseMarkForContentAddition(delta, { isPaste: true }),
    ).toBe(true)
  })

  it('ignores wrapping existing text in a blockquote (no new plain text)', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    editor = new Editor({
      element: el,
      extensions,
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: '旧正文' }] },
        ],
      },
    })
    const before = editor.state.doc
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: '旧正文' }] },
          ],
        },
      ],
    })
    const delta = resolveInsertedContentDelta(before, editor.state.doc)
    expect(shouldOfferReuseMarkForContentAddition(delta, { isPaste: true })).toBe(false)
  })

  it('ignores Enter-split of a quote into two with a plain gap', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    editor = new Editor({
      element: el,
      extensions,
      content: {
        type: 'doc',
        content: [
          {
            type: 'blockquote',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: '第一段' }] },
              { type: 'paragraph', content: [{ type: 'text', text: '第二段' }] },
            ],
          },
        ],
      },
    })
    const before = editor.state.doc
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '第一段' }] }],
        },
        { type: 'paragraph' },
        {
          type: 'blockquote',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '第二段' }] }],
        },
      ],
    })
    const delta = resolveInsertedContentDelta(before, editor.state.doc)
    expect(shouldOfferReuseMarkForContentAddition(delta, { isPaste: false })).toBe(false)
  })

  it('ignores single-character typing when not paste', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    editor = new Editor({
      element: el,
      extensions,
      content: {
        type: 'doc',
        content: [{ type: 'paragraph' }],
      },
    })
    const before = editor.state.doc
    insertPlainText(editor, 1, '字')
    const delta = resolveInsertedContentDelta(before, editor.state.doc)
    expect(delta?.insertedText).toBe('字')
    expect(shouldOfferReuseMarkForContentAddition(delta, { isPaste: false })).toBe(false)
    expect(shouldOfferReuseMarkForContentAddition(delta, { isPaste: true })).toBe(true)
  })

  it('allows long non-paste bulk insert', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    editor = new Editor({
      element: el,
      extensions,
      content: {
        type: 'doc',
        content: [{ type: 'paragraph' }],
      },
    })
    const before = editor.state.doc
    const bulk = '一二三四五六七八九十'
    insertPlainText(editor, 1, bulk)
    const delta = resolveInsertedContentDelta(before, editor.state.doc)
    expect(shouldOfferReuseMarkForContentAddition(delta, { isPaste: false })).toBe(true)
  })
})
