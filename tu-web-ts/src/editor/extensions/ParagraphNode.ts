import { Node, mergeAttributes } from '@tiptap/core'

export const ParagraphNode = Node.create({
  name: 'paragraph',
  priority: 1000,
  group: 'block',
  content: 'inline*',

  addAttributes() {
    return {
      blockId: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'p' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['p', mergeAttributes(HTMLAttributes), 0]
  },
})
