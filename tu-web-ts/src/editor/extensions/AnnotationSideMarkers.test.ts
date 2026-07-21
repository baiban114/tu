import { describe, expect, it } from 'vitest'
import { Schema } from '@tiptap/pm/model'
import type { TextAnnotation } from '@/api/types'
import { collectAnnotationsForNode } from './AnnotationSideMarkers'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      attrs: { blockId: { default: '' } },
    },
  },
})

function ann(partial: Partial<TextAnnotation> & Pick<TextAnnotation, 'id'>): TextAnnotation {
  return {
    selectedText: '',
    contextBefore: '',
    contextAfter: '',
    note: '',
    color: '#ff0',
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  }
}

describe('collectAnnotationsForNode', () => {
  it('matches text-range overlap and spanned block ids', () => {
    const para = schema.nodes.paragraph.create({ blockId: 'p1' }, schema.text('hello world'))
    const doc = schema.nodes.doc.create(null, para)
    const pos = 0
    const node = doc.child(0)

    const annotations = [
      ann({ id: 'a1', from: 1, to: 6 }),
      ann({ id: 'a2', from: 20, to: 25 }),
      ann({ id: 'a3', scope: 'block', spannedBlockIds: ['p1'] }),
      ann({ id: 'a4', unresolved: true, from: 1, to: 3 }),
    ]

    const matched = collectAnnotationsForNode(annotations, pos, node)
    expect(matched.map((item) => item.id).sort()).toEqual(['a1', 'a3'])
  })
})
