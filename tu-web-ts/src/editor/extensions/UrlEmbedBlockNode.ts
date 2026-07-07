import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import UrlEmbedBlockView from '../views/UrlEmbedBlockView.vue'
import { stopNonHandleNodeViewDragEvent } from './nodeViewDragHandle'
import { createUrlEmbedBlockId, URL_EMBED_DEFAULT_HEIGHT } from '@/utils/urlDisplay'
import { parseIframeSnippet } from '../htmlEmbedUtils'

export const UrlEmbedBlockNode = Node.create({
  name: 'urlEmbedBlock',
  group: 'block',
  atom: true,
  isolating: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      blockId: { default: '' },
      url: { default: '' },
      height: { default: URL_EMBED_DEFAULT_HEIGHT },
    }
  },

  parseHTML() {
    return [
      { tag: 'div[data-type="url-embed-block"]' },
      {
        tag: 'iframe',
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false
          const parsed = parseIframeSnippet(element.outerHTML)
          if (!parsed) return false
          return {
            blockId: createUrlEmbedBlockId(),
            url: parsed.url,
            height: parsed.height,
          }
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'url-embed-block' })]
  },

  addNodeView() {
    return VueNodeViewRenderer(UrlEmbedBlockView, {
      stopEvent: stopNonHandleNodeViewDragEvent,
    })
  },
})
