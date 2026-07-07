import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import X6BlockView from '../views/X6BlockView.vue'
import { stopNonHandleNodeViewDragEvent } from './nodeViewDragHandle'

export const X6BlockNode = Node.create({
  name: 'x6Block',
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
      graphData: { default: { nodes: [], edges: [] } },
      metadata: { default: {} },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type=\"x6-block\"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'x6-block' })]
  },

  addNodeView() {
    return VueNodeViewRenderer(X6BlockView, {
      stopEvent: stopNonHandleNodeViewDragEvent,
    })
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { empty, $from } = this.editor.state.selection
        if (!empty) return false
        const pos = $from.pos
        const nodePos = this.editor.state.doc.resolve(pos)
        if (nodePos.parent.type.name !== this.name) return false
        if (nodePos.parentOffset > 0) return false
        return this.editor.commands.deleteNode(this.name)
      },
      Delete: () => {
        const { empty, $from } = this.editor.state.selection
        if (!empty) return false
        const pos = $from.pos
        const nodePos = this.editor.state.doc.resolve(pos)
        if (nodePos.parent.type.name !== this.name) return false
        const nodeSize = nodePos.parent.nodeSize
        if (nodePos.parentOffset < nodeSize - 2) return false
        return this.editor.commands.deleteNode(this.name)
      },
    }
  },
})
