import Blockquote from '@tiptap/extension-blockquote'
import type { HeadingSourceBinding } from '@/api/types'

export const BlockquoteNode = Blockquote.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      blockId: { default: '' },
      excerptBinding: {
        default: null,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
    }
  },
})
