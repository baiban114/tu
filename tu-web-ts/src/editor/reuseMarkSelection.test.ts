import { describe, expect, it, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TuLink } from '@/editor/extensions/TuLink'
import {
  collectDocDiffRange,
  resolveSelectionAfterPasteRules,
} from '@/editor/reuseMarkSelection'

const extensions = [
  StarterKit.configure({
    link: false,
  }),
  TuLink.configure({ openOnClick: false, autolink: false }),
]

describe('collectDocDiffRange', () => {
  let editor: Editor | null = null

  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  it('returns post-transform range against live doc', () => {
    editor = new Editor({
      extensions,
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
      },
    })
    const before = editor.state.doc
    editor.commands.insertContentAt(6, {
      type: 'text',
      text: '百度',
      marks: [{ type: 'link', attrs: { href: 'https://www.baidu.com' } }],
    })
    const diff = collectDocDiffRange(before, editor.state.doc)
    expect(diff).not.toBeNull()
    expect(diff!.to - diff!.from).toBe(2)
  })
})

describe('resolveSelectionAfterPasteRules', () => {
  let editor: Editor | null = null

  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  it('selects link mark at paste site after markdown shrinks', () => {
    editor = new Editor({
      extensions,
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '你好' },
              {
                type: 'text',
                text: '百度',
                marks: [{ type: 'link', attrs: { href: 'https://www.baidu.com', title: '百度首页' } }],
              },
              { type: 'text', text: '世界' },
            ],
          },
        ],
      },
    })

    let linkFrom = -1
    let linkTo = -1
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.marks.some((m) => m.type.name === 'link')) return true
      linkFrom = pos
      linkTo = pos + node.nodeSize
      return false
    })
    expect(linkFrom).toBeGreaterThan(0)

    const resolved = resolveSelectionAfterPasteRules(editor, linkFrom, linkFrom + 40)
    expect(resolved).toEqual({ from: linkFrom, to: linkTo })
  })

  it('falls back to caret-to-insert span when no link', () => {
    editor = new Editor({
      extensions,
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'abcdef' }],
          },
        ],
      },
    })
    editor.commands.setTextSelection(7)
    const resolved = resolveSelectionAfterPasteRules(editor, 2, 20)
    expect(resolved).toEqual({ from: 2, to: 7 })
  })
})
