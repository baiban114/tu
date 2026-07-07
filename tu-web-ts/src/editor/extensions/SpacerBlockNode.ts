import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import SpacerBlockView from '../views/SpacerBlockView.vue'
import { stopNonHandleNodeViewDragEvent } from './nodeViewDragHandle'

export const SpacerBlockNode = Node.create({
  name: 'spacerBlock',
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
      spacerHeight: { default: 40 },
      width: { default: null },
      height: { default: 40 },
      metadata: { default: {} },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type=\"spacer-block\"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'spacer-block' })]
  },

  addNodeView() {
    return VueNodeViewRenderer(SpacerBlockView, {
      stopEvent: stopNonHandleNodeViewDragEvent,
    })
  },
})
