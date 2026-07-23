import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import PdfExcerptBlockView from '../views/PdfExcerptBlockView.vue'
import { stopNonHandleNodeViewDragEvent } from './nodeViewDragHandle'
import {
  createPdfExcerptBlockId,
  normalizePdfClipRatio,
  PDF_EXCERPT_DEFAULT_HEIGHT,
} from '@/utils/pdfExcerpt'

export const PdfExcerptBlockNode = Node.create({
  name: 'pdfExcerptBlock',
  group: 'block',
  atom: true,
  isolating: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      blockId: { default: '' },
      fileId: { default: '' },
      fileName: { default: '' },
      viewMode: { default: 'excerpt' },
      startPage: { default: 1 },
      endPage: { default: 1 },
      height: { default: PDF_EXCERPT_DEFAULT_HEIGHT },
      clipTop: { default: 0 },
      clipBottom: { default: 1 },
      notesVisible: { default: false },
      sourceHref: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-source-href') || '',
        renderHTML: (attributes) => {
          const value = String(attributes.sourceHref || '').trim()
          return value ? { 'data-source-href': value } : {}
        },
      },
      sourceLabel: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-source-label') || '',
        renderHTML: (attributes) => {
          const value = String(attributes.sourceLabel || '').trim()
          return value ? { 'data-source-label': value } : {}
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="pdf-excerpt-block"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'pdf-excerpt-block' })]
  },

  addNodeView() {
    return VueNodeViewRenderer(PdfExcerptBlockView, {
      stopEvent: stopNonHandleNodeViewDragEvent,
    })
  },
})

export function createPdfExcerptNodeAttrs(input: {
  fileId: string
  fileName: string
  viewMode?: 'excerpt' | 'full'
  startPage: number
  endPage: number
  height?: number
  clipTop?: number
  clipBottom?: number
  blockId?: string
  sourceHref?: string
  sourceLabel?: string
  notesVisible?: boolean
}) {
  const clip = normalizePdfClipRatio(input.clipTop ?? 0, input.clipBottom ?? 1)
  return {
    blockId: input.blockId || createPdfExcerptBlockId(),
    fileId: input.fileId,
    fileName: input.fileName,
    viewMode: input.viewMode ?? 'excerpt',
    startPage: input.startPage,
    endPage: input.endPage,
    height: input.height ?? PDF_EXCERPT_DEFAULT_HEIGHT,
    clipTop: clip.clipTop,
    clipBottom: clip.clipBottom,
    notesVisible: Boolean(input.notesVisible),
    sourceHref: input.sourceHref || '',
    sourceLabel: input.sourceLabel || '',
  }
}
