import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { HeadingSourceBinding, TextAnnotation } from '@/api/types'
import {
  blockquoteExcerptBadgeTitle,
  blockquoteExcerptMetaPathParts,
  blockquoteExcerptMetaRole,
  isAiBlockquoteExcerpt,
  resolveBlockResourceBinding,
} from '@/utils/blockquoteExcerpt'

export interface BlockquoteExcerptDecorationsOptions {
  getAnnotations: () => TextAnnotation[]
  onExcerptClick: (
    binding: HeadingSourceBinding,
    context: { blockId: string; title: string; clientX: number; clientY: number; role: 'excerpt' | 'basis' },
  ) => void
}

export const blockquoteExcerptDecorationsKey = new PluginKey('blockquoteExcerptDecorations')

/** Nodes that can show the shared resource-excerpt / basis metadata bar. */
const META_NODE_TYPES = new Set(['blockquote', 'paragraph'])

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
              if (!META_NODE_TYPES.has(node.type.name)) return true
              // Nested paragraphs inside blockquote are covered by the outer shell meta.
              if (node.type.name === 'paragraph') {
                const $pos = state.doc.resolve(pos)
                for (let d = $pos.depth; d > 0; d -= 1) {
                  if ($pos.node(d).type.name === 'blockquote') return true
                }
              }

              const resolved = resolveBlockResourceBinding(node, pos, node.nodeSize, annotations)
              if (!resolved?.binding.resourceItemId) return true
              if (resolved.role === 'excerpt' && !resolved.binding.resourceExcerptId) return true

              const { binding, role } = resolved
              decorations.push(
                Decoration.widget(pos, () => {
                  const bar = document.createElement('button')
                  bar.type = 'button'
                  bar.className = 'blockquote-excerpt-meta'
                  if (role === 'basis') {
                    bar.classList.add('blockquote-excerpt-meta--basis')
                  }
                  if (isAiBlockquoteExcerpt(binding)) {
                    bar.classList.add('blockquote-excerpt-meta--ai')
                  }
                  bar.title = blockquoteExcerptBadgeTitle(binding, role)

                  const roleEl = document.createElement('span')
                  roleEl.className = 'blockquote-excerpt-meta__role'
                  roleEl.textContent = blockquoteExcerptMetaRole(role)
                  bar.appendChild(roleEl)

                  const pathParts = blockquoteExcerptMetaPathParts(binding, role)
                  if (pathParts.length > 0) {
                    const path = document.createElement('span')
                    path.className = 'blockquote-excerpt-meta__path'
                    path.textContent = pathParts.join(' > ')
                    bar.appendChild(path)
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
                    const blockId = String(node.attrs.blockId || `${node.type.name}-${pos}`)
                    const title = node.textContent?.trim() || ''
                    extension.options.onExcerptClick(binding, {
                      blockId,
                      title,
                      clientX: event.clientX,
                      clientY: event.clientY,
                      role,
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
