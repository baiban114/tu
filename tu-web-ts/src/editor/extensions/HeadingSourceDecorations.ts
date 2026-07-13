import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { HeadingSourceBinding } from '@/api/types'
import { effectiveMarkerSource, headingSourceBadgeLabel, headingSourceBadgeTitle } from '@/utils/headingSource'

export interface HeadingSourceDecorationsOptions {
  onSourceClick: (
    binding: HeadingSourceBinding,
    context: { blockId: string; title: string; clientX: number; clientY: number },
  ) => void
}

export const headingSourceDecorationsKey = new PluginKey('headingSourceDecorations')

export const HeadingSourceDecorations = Extension.create<HeadingSourceDecorationsOptions>({
  name: 'headingSourceDecorations',

  addOptions() {
    return {
      onSourceClick: () => {},
    }
  },

  addProseMirrorPlugins() {
    const extension = this
    return [
      new Plugin({
        key: headingSourceDecorationsKey,
        props: {
          decorations(state) {
            const decorations: Decoration[] = []
            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'heading') return true
              const binding = node.attrs.sourceBinding as HeadingSourceBinding | null
              if (!binding?.resourceItemId || !binding.resourceExcerptId) return true
              const end = pos + node.nodeSize
              decorations.push(
                Decoration.widget(end - 1, () => {
                  const button = document.createElement('button')
                  button.type = 'button'
                  button.className = 'heading-source-badge'
                  if (effectiveMarkerSource(binding.markerSource) === 'ai') {
                    button.classList.add('heading-source-badge--ai')
                  }
                  button.textContent = headingSourceBadgeLabel(binding)
                  if (effectiveMarkerSource(binding.markerSource) === 'ai') {
                    const aiTag = document.createElement('span')
                    aiTag.className = 'heading-source-badge__ai'
                    aiTag.textContent = 'AI'
                    button.appendChild(aiTag)
                  }
                  button.title = headingSourceBadgeTitle(binding)
                  button.addEventListener('mousedown', (event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  })
                  button.addEventListener('click', (event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    const blockId = String(node.attrs.blockId || `heading-${pos}`)
                    const title = node.textContent?.trim() || ''
                    extension.options.onSourceClick(binding, {
                      blockId,
                      title,
                      clientX: event.clientX,
                      clientY: event.clientY,
                    })
                  })
                  return button
                }, { side: 1 }),
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
