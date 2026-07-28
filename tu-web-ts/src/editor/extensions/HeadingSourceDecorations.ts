import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { BlockTag, HeadingSourceBinding } from '@/api/types'
import {
  headingSourceBadgeTitle,
  headingSourceMetaPathParts,
  headingSourceMetaRole,
  isAiHeadingSource,
} from '@/utils/headingSource'
import type { SectionTagsMap } from '@/utils/sectionMetadata'

export interface HeadingSourceDecorationsOptions {
  getSectionTagsMap: () => SectionTagsMap
  onSourceClick: (
    binding: HeadingSourceBinding,
    context: { blockId: string; title: string; clientX: number; clientY: number },
  ) => void
}

export const headingSourceDecorationsKey = new PluginKey('headingSourceDecorations')

function resolveHeadingTags(blockId: string, sectionTagsMap: SectionTagsMap): BlockTag[] {
  const id = blockId.trim()
  if (!id) return []
  return sectionTagsMap[`local:${id}`] ?? []
}

export const HeadingSourceDecorations = Extension.create<HeadingSourceDecorationsOptions>({
  name: 'headingSourceDecorations',

  addOptions() {
    return {
      getSectionTagsMap: () => ({}),
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
            const sectionTagsMap = extension.options.getSectionTagsMap()
            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'heading') return true
              const binding = node.attrs.sourceBinding as HeadingSourceBinding | null
              const blockId = String(node.attrs.blockId || `heading-${pos}`)
              const hasSource = Boolean(binding?.resourceItemId && binding.resourceExcerptId)
              const tags = resolveHeadingTags(blockId, sectionTagsMap)
              if (!hasSource && tags.length === 0) return true

              const end = pos + node.nodeSize
              decorations.push(
                Decoration.widget(end, () => {
                  const bar = document.createElement(hasSource ? 'button' : 'div')
                  if (hasSource) {
                    ;(bar as HTMLButtonElement).type = 'button'
                  }
                  bar.className = 'heading-section-meta'
                  if (hasSource && binding && isAiHeadingSource(binding)) {
                    bar.classList.add('heading-section-meta--ai')
                  }
                  if (hasSource && binding) {
                    bar.title = headingSourceBadgeTitle(binding)
                    bar.classList.add('heading-source-badge')
                  }

                  if (hasSource && binding) {
                    const roleEl = document.createElement('span')
                    roleEl.className = 'heading-section-meta__role'
                    roleEl.textContent = headingSourceMetaRole()
                    bar.appendChild(roleEl)

                    const pathParts = headingSourceMetaPathParts(binding)
                    if (pathParts.length > 0) {
                      const path = document.createElement('span')
                      path.className = 'heading-section-meta__path'
                      path.textContent = pathParts.join(' > ')
                      bar.appendChild(path)
                    }
                    if (isAiHeadingSource(binding)) {
                      const aiTag = document.createElement('span')
                      aiTag.className = 'heading-section-meta__ai'
                      aiTag.textContent = 'AI'
                      bar.appendChild(aiTag)
                    }
                  }

                  for (const tag of tags.slice(0, 4)) {
                    const span = document.createElement('span')
                    span.className = 'heading-section-meta__tag'
                    span.style.setProperty('--tag-chip-color', tag.color || '#1677ff')
                    span.textContent = tag.label
                    bar.appendChild(span)
                  }
                  if (tags.length > 4) {
                    const more = document.createElement('span')
                    more.className = 'heading-section-meta__tag-more'
                    more.textContent = `+${tags.length - 4}`
                    bar.appendChild(more)
                  }

                  if (hasSource && binding) {
                    bar.addEventListener('mousedown', (event) => {
                      event.preventDefault()
                      event.stopPropagation()
                    })
                    bar.addEventListener('click', (event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      const mouseEvent = event as MouseEvent
                      const title = node.textContent?.trim() || ''
                      extension.options.onSourceClick(binding, {
                        blockId,
                        title,
                        clientX: mouseEvent.clientX,
                        clientY: mouseEvent.clientY,
                      })
                    })
                  }
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
