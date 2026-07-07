import Link from '@tiptap/extension-link'

export const TuLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      displayMode: {
        default: 'link',
        parseHTML: (element) => element.getAttribute('data-display-mode') || 'link',
        renderHTML: (attributes) => {
          if (!attributes.displayMode || attributes.displayMode === 'link') {
            return {}
          }
          return { 'data-display-mode': attributes.displayMode }
        },
      },
    }
  },
})
