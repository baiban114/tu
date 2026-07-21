import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { TextAnnotation } from '@/api/types'

export interface AnnotationSideMarkersOptions {
  getEnabled: () => boolean
  getAnnotations: () => TextAnnotation[]
  onMarkerClick: (payload: {
    annotationId: string
    annotationIds: string[]
    event: MouseEvent
  }) => void
}

export const annotationSideMarkersKey = new PluginKey('annotationSideMarkers')
export const ANNOTATION_SIDE_MARKERS_META = 'annotationSideMarkers'

const MARKER_NODE_TYPES = new Set(['paragraph'])

function annotationOverlapsNode(
  annotation: TextAnnotation,
  pos: number,
  node: ProseMirrorNode,
): boolean {
  if (annotation.unresolved) return false
  const blockId = String(node.attrs?.blockId || '').trim()
  if (blockId && annotation.spannedBlockIds?.includes(blockId)) return true
  if (typeof annotation.from !== 'number' || typeof annotation.to !== 'number') return false
  const from = pos
  const to = pos + node.nodeSize
  return annotation.from < to && annotation.to > from
}

export function collectAnnotationsForNode(
  annotations: TextAnnotation[],
  pos: number,
  node: ProseMirrorNode,
): TextAnnotation[] {
  return annotations.filter((annotation) => annotationOverlapsNode(annotation, pos, node))
}

function markerLabel(count: number): string {
  if (count <= 1) return '标注'
  return `标注 ${count}`
}

export const AnnotationSideMarkers = Extension.create<AnnotationSideMarkersOptions>({
  name: 'annotationSideMarkers',

  addOptions() {
    return {
      getEnabled: () => false,
      getAnnotations: () => [],
      onMarkerClick: () => {},
    }
  },

  addProseMirrorPlugins() {
    const extension = this
    return [
      new Plugin({
        key: annotationSideMarkersKey,
        props: {
          decorations(state) {
            if (!extension.options.getEnabled()) {
              return DecorationSet.empty
            }
            const annotations = extension.options.getAnnotations()
            if (!annotations.length) return DecorationSet.empty

            const decorations: Decoration[] = []
            state.doc.forEach((node, pos) => {
              if (!MARKER_NODE_TYPES.has(node.type.name)) return

              const matched = collectAnnotationsForNode(annotations, pos, node)
              if (!matched.length) return

              const ids = matched.map((item) => item.id)
              decorations.push(
                Decoration.widget(pos + 1, () => {
                  const button = document.createElement('button')
                  button.type = 'button'
                  button.className = 'annotation-side-marker'
                  button.textContent = markerLabel(ids.length)
                  button.title = `查看本段标注（${ids.length}）`
                  button.addEventListener('mousedown', (event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  })
                  button.addEventListener('click', (event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    extension.options.onMarkerClick({
                      annotationId: ids[0]!,
                      annotationIds: ids,
                      event,
                    })
                  })
                  return button
                }, { side: -1 }),
              )
            })
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})
