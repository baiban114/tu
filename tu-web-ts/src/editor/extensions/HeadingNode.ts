import Heading from '@tiptap/extension-heading'
import { mergeAttributes } from '@tiptap/core'
import type { HeadingSourceBinding } from '@/api/types'

export const HeadingNode = Heading.extend({
  name: 'heading',

  addAttributes() {
    return {
      ...this.parent?.(),
      blockId: { default: '' },
      sectionCollapsed: { default: false },
      sourceBinding: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-source-binding')
          if (!raw) return null
          try {
            return JSON.parse(raw) as HeadingSourceBinding
          } catch {
            return null
          }
        },
        renderHTML: (attributes) => {
          if (!attributes.sourceBinding) return {}
          return {
            'data-source-binding': JSON.stringify(attributes.sourceBinding),
          }
        },
      },
    }
  },

  renderHTML({ node, HTMLAttributes }) {
    const hasLevel = this.options.levels.includes(node.attrs.level)
    const level = hasLevel ? node.attrs.level : this.options.levels[0]
    return [`h${level}`, mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },
})
