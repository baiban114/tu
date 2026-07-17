import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { HeadingSourceBinding, TextAnnotation } from '@/api/types'
import {
  blockquoteExcerptBadgeTitle,
  blockquoteExcerptMetaChips,
  isAiBlockquoteExcerpt,
  resolveBlockquoteExcerptBinding,
} from '@/utils/blockquoteExcerpt'

export interface BlockquoteExcerptDecorationsOptions {
  getAnnotations: () => TextAnnotation[]
  onExcerptClick: (
    binding: HeadingSourceBinding,
    context: { blockId: string; title: string; clientX: number; clientY: number },
  ) => void
}

export const blockquoteExcerptDecorationsKey = new PluginKey('blockquoteExcerptDecorations')

export const BlockquoteExcerptDecorations = Extension.create<BlockquoteExcerptDecorationsOptions>({
  name: 'blockquoteExcerptDecorations',

  addOptions() {
    return {
      getAnnotations: () => [],
      onExcerptClick: () => {},
    }
  },

  addProseMirrorPlugins() {
    const extension = this
    return [
      new Plugin({
        key: blockquoteExcerptDecorationsKey,
        props: {
          decorations(state) {
            const decorations: Decoration[] = []
            const annotations = extension.options.getAnnotations()
            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'blockquote') return true
              const binding = resolveBlockquoteExcerptBinding(node, pos, node.nodeSize, annotations)
              if (!binding?.resourceItemId || !binding.resourceExcerptId) return true

              decorations.push(
                Decoration.widget(pos, () => {
                  const bar = document.createElement('button')
                  bar.type = 'button'
                  bar.className = 'blockquote-excerpt-meta'
                  if (isAiBlockquoteExcerpt(binding)) {
                    bar.classList.add('blockquote-excerpt-meta--ai')
                  }
                  bar.title = blockquoteExcerptBadgeTitle(binding)

                  for (const chip of blockquoteExcerptMetaChips(binding)) {
                    const span = document.createElement('span')
                    span.className = 'blockquote-excerpt-meta__chip'
                    span.textContent = chip
                    bar.appendChild(span)
                  }

                  if (isAiBlockquoteExcerpt(binding)) {
                    const aiTag = document.createElement('span')
                    aiTag.className = 'blockquote-excerpt-meta__ai'
                    aiTag.textContent = 'AI'
                    bar.appendChild(aiTag)
                  }

                  bar.addEventListener('mousedown', (event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  })
                  bar.addEventListener('click', (event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    const blockId = String(node.attrs.blockId || `blockquote-${pos}`)
                    const title = node.textContent?.trim() || ''
                    extension.options.onExcerptClick(binding, {
                      blockId,
                      title,
                      clientX: event.clientX,
                      clientY: event.clientY,
                    })
                  })
                  return bar
                }, { side: -1 }),
              )
              return true
            })
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})
