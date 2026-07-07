import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import ExternalResourceBlockView from '../views/ExternalResourceBlockView.vue'
import { stopNonHandleNodeViewDragEvent } from './nodeViewDragHandle'

export const ExternalResourceBlockNode = Node.create({
  name: 'externalResourceBlock',
  group: 'block',
  atom: true,
  isolating: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      blockId: { default: '' },
      title: { default: '' },
      headingLevel: { default: 0 },
      width: { default: null },
      height: { default: null },
      externalResource: {
        default: {
          resourceItemId: '',
          resourceExcerptId: null,
          mode: 'resource',
          snapshot: { resourceTitle: '' },
        },
      },
      metadata: { default: {} },
      sectionCollapsed: { default: false },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="external-resource-block"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'external-resource-block' })]
  },

  addNodeView() {
    return VueNodeViewRenderer(ExternalResourceBlockView, {
      stopEvent: stopNonHandleNodeViewDragEvent,
    })
  },
})
