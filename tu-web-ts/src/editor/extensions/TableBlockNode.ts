import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import TableBlockView from '../views/TableBlockView.vue'
import { stopNonHandleNodeViewDragEvent } from './nodeViewDragHandle'

export const TableBlockNode = Node.create({
  name: 'tableBlock',
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
      tableData: { default: { headers: [], rows: [] } },
      metadata: { default: {} },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="table-block"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'table-block' })]
  },

  addNodeView() {
    return VueNodeViewRenderer(TableBlockView, {
      stopEvent: stopNonHandleNodeViewDragEvent,
    })
  },
})
