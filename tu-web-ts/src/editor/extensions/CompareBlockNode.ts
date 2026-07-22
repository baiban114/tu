import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import CompareBlockView from '../views/CompareBlockView.vue'
import { jsonDomAttribute } from '../jsonDomAttribute'
import { stopNonHandleNodeViewDragEvent } from './nodeViewDragHandle'
import {
  COMPARE_BLOCK_DEFAULT_HEIGHT,
  createCompareBlockAttrs,
} from '@/utils/compareBlock'

export const CompareBlockNode = Node.create({
  name: 'compareBlock',
  group: 'block',
  atom: true,
  isolating: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      blockId: { default: '' },
      title: { default: '文本比较' },
      height: { default: COMPARE_BLOCK_DEFAULT_HEIGHT },
      middleText: { default: '' },
      leftSide: jsonDomAttribute('leftSide', 'data-left-side', null),
      rightSide: jsonDomAttribute('rightSide', 'data-right-side', null),
      metadata: jsonDomAttribute('metadata', 'data-metadata', {}),
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="compare-block"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'compare-block' })]
  },

  addNodeView() {
    return VueNodeViewRenderer(CompareBlockView, {
      stopEvent: stopNonHandleNodeViewDragEvent,
    })
  },
})

export { createCompareBlockAttrs }
