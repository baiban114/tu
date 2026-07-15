import Blockquote from '@tiptap/extension-blockquote'

export const BlockquoteNode = Blockquote.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      blockId: { default: '' },
    }
  },
})
