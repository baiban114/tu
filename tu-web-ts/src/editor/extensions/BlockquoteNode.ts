import Blockquote from '@tiptap/extension-blockquote'
import type { HeadingSourceBinding } from '@/api/types'
import { jsonDomAttribute } from '../jsonDomAttribute'

export const BlockquoteNode = Blockquote.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      blockId: { default: '' },
      excerptBinding: jsonDomAttribute<HeadingSourceBinding | null>(
        'excerptBinding',
        'data-excerpt-binding',
        null,
      ),
    }
  },
})
