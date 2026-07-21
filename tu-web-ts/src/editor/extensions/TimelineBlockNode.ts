import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import TimelineBlockView from '../views/TimelineBlockView.vue'
import { jsonDomAttribute } from '../jsonDomAttribute'
import { stopNonHandleNodeViewDragEvent } from './nodeViewDragHandle'

export const TimelineBlockNode = Node.create({
  name: 'timelineBlock',
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
      timelineData: jsonDomAttribute('timelineData', 'data-timeline-data', []),
      metadata: jsonDomAttribute('metadata', 'data-metadata', {}),
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type=\"timeline-block\"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'timeline-block' })]
  },

  addNodeView() {
    return VueNodeViewRenderer(TimelineBlockView, {
      stopEvent: stopNonHandleNodeViewDragEvent,
    })
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { empty, $from } = this.editor.state.selection
        if (!empty) return false
        const nodePos = this.editor.state.doc.resolve($from.pos)
        if (nodePos.parent.type.name !== this.name && nodePos.parentOffset === 0) {
          return this.editor.commands.deleteNode(this.name)
        }
        return false
      },
    }
  },
})
