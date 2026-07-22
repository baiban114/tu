import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { HeadingNode } from '@/editor/extensions/HeadingNode'
import { ParagraphNode } from '@/editor/extensions/ParagraphNode'
import {
  findNearestPrecedingHeadingText,
  findParentHeadingLevel,
} from '@/utils/toc/headings'
import {
  excerptTitleFromText,
  resolveExcerptDefaultTitle,
} from '@/utils/blockExcerptContent'

const extensions = [
  StarterKit.configure({ heading: false, paragraph: false }),
  HeadingNode.configure({ levels: [1, 2, 3, 4, 5, 6] }),
  ParagraphNode,
]

function createDocEditor() {
  return new Editor({
    extensions,
    content: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: '第一章' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '段落甲内容很长' }],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: '第二节' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '段落乙内容' }],
        },
      ],
    },
  })
}

describe('nearest heading excerpt title', () => {
  it('finds nearest preceding heading text and level', () => {
    const editor = createDocEditor()
    const doc = editor.state.doc
    // Position inside second paragraph (after 「第二节」)
    let para2Pos = -1
    doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && node.textContent === '段落乙内容') {
        para2Pos = pos
      }
    })
    expect(para2Pos).toBeGreaterThan(0)
    expect(findNearestPrecedingHeadingText(doc, para2Pos)).toBe('第二节')
    expect(findParentHeadingLevel(doc, para2Pos)).toBe(3)

    let para1Pos = -1
    doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && node.textContent.startsWith('段落甲')) {
        para1Pos = pos
      }
    })
    expect(findNearestPrecedingHeadingText(doc, para1Pos)).toBe('第一章')
    editor.destroy()
  })

  it('resolveExcerptDefaultTitle prefers nearest heading over selection text', () => {
    const editor = createDocEditor()
    const doc = editor.state.doc
    let para2Pos = -1
    doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && node.textContent === '段落乙内容') {
        para2Pos = pos
      }
    })
    expect(resolveExcerptDefaultTitle(doc, para2Pos, '段落乙内容')).toBe('第二节')
    expect(excerptTitleFromText('段落乙内容')).toBe('段落乙内容')
    editor.destroy()
  })

  it('falls back to first line when no heading precedes', () => {
    const editor = new Editor({
      extensions,
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '开篇段落' }],
          },
        ],
      },
    })
    expect(resolveExcerptDefaultTitle(editor.state.doc, 1, '开篇段落')).toBe('开篇段落')
    editor.destroy()
  })
})
