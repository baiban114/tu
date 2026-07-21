import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import MultiTableBlockView from '../views/MultiTableBlockView.vue'
import { jsonDomAttribute } from '../jsonDomAttribute'
import { isFromNodeViewDragHandle, stopNonHandleNodeViewDragEvent } from './nodeViewDragHandle'

export const MultiTableBlockNode = Node.create({
  name: 'multiTableBlock',
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
      multiTableData: jsonDomAttribute('multiTableData', 'data-multi-table-data', {
        fields: [],
        records: [],
        views: [],
      }),
      metadata: jsonDomAttribute('metadata', 'data-metadata', {}),
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="multi-table-block"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'multi-table-block' })]
  },

  addNodeView() {
    return VueNodeViewRenderer(MultiTableBlockView, {
      stopEvent: ({ event }) => {
        if (isFromNodeViewDragHandle(event)) return false
        const target = event.target
        if (!(target instanceof Element)) return stopNonHandleNodeViewDragEvent({ event })
        if (!target.closest('.multi-table')) return stopNonHandleNodeViewDragEvent({ event })
        return [
          'contextmenu',
          'mousedown',
          'mousemove',
          'mouseup',
          'click',
          'dblclick',
          'input',
          'change',
          'keydown',
          'keyup',
          'pointerdown',
          'pointermove',
          'pointerup',
          'pointercancel',
          'touchstart',
          'touchmove',
          'touchend',
          'dragstart',
          'drag',
          'dragenter',
          'dragover',
          'dragleave',
          'drop',
          'dragend',
        ].includes(event.type)
      },
    })
  },
})
