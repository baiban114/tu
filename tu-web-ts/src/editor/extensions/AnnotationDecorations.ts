import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Mapping } from '@tiptap/pm/transform'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import type { TextAnnotation } from '@/api/types'
import { normalizeAnnotationAnchor, resolveAnnotationRange } from '@/editor/annotationText'

export interface AnnotationDecorationsOptions {
  annotations: TextAnnotation[]
  onAnnotationClick: (payload: { annotationId: string; annotationIds?: string[]; event: MouseEvent }) => void
  onAnnotationsMapped: (annotations: TextAnnotation[]) => void
}

interface AnnotationPluginState {
  annotations: TextAnnotation[]
  decorations: DecorationSet
}

export const annotationDecorationsKey = new PluginKey<AnnotationPluginState>('annotationDecorations')

export const AnnotationDecorations = Extension.create<AnnotationDecorationsOptions>({
  name: 'annotationDecorations',

  addOptions() {
    return {
      annotations: [],
      onAnnotationClick: () => {},
      onAnnotationsMapped: () => {},
    }
  },

  addProseMirrorPlugins() {
    const extension = this
    return [
      new Plugin<AnnotationPluginState>({
        key: annotationDecorationsKey,
        state: {
          init: (_, state) => {
            const pluginState = buildPluginState(state.doc, extension.options.annotations)
            notifyMappedIfChanged(extension.options.annotations, pluginState.annotations, extension.options.onAnnotationsMapped)
            return pluginState
          },
          apply: (tr, previous, _oldState, newState) => {
            const meta = tr.getMeta(annotationDecorationsKey)
            if (meta?.annotations) {
              const pluginState = buildPluginState(newState.doc, meta.annotations)
              notifyMappedIfChanged(meta.annotations, pluginState.annotations, extension.options.onAnnotationsMapped)
              return pluginState
            }

            if (!tr.docChanged) return previous

            const mapped = previous.annotations.map((annotation) => mapAnnotation(annotation, tr.mapping))
            const resolved = resolveAnnotations(newState.doc, mapped)
            notifyMappedIfChanged(previous.annotations, resolved, extension.options.onAnnotationsMapped)
            return buildPluginState(newState.doc, resolved)
          },
        },
        props: {
          decorations(state) {
            return annotationDecorationsKey.getState(state)?.decorations ?? null
          },
          handleClick: (view: EditorView, pos: number, event: MouseEvent) => {
            const target = event.target as HTMLElement | null
            const annotationEl = target?.closest('[data-tu-annotation-id]') as HTMLElement | null
            const annotationId = annotationEl?.dataset.tuAnnotationId
            if (!annotationId) return false
            const pluginState = annotationDecorationsKey.getState(view.state)
            const clicked = pluginState?.annotations.find(annotation => annotation.id === annotationId)
            const hitPos = Math.max(0, pos - 1)
            const annotationIds = (pluginState?.annotations ?? [])
              .filter(annotation => (
                !annotation.unresolved
                && typeof annotation.from === 'number'
                && typeof annotation.to === 'number'
                && (
                  (hitPos >= annotation.from && hitPos < annotation.to)
                  || (clicked && rangesOverlap(annotation, clicked))
                )
              ))
              .map(annotation => annotation.id)
            extension.options.onAnnotationClick({
              annotationId,
              annotationIds: annotationIds.includes(annotationId) ? annotationIds : [annotationId, ...annotationIds],
              event,
            })
            return true
          },
        },
      }),
    ]
  },
})

function buildPluginState(doc: ProseMirrorNode, annotations: TextAnnotation[]): AnnotationPluginState {
  const resolved = resolveAnnotations(doc, annotations)
  return {
    annotations: resolved,
    decorations: createDecorations(doc, resolved),
  }
}

function notifyMappedIfChanged(
  previous: TextAnnotation[],
  next: TextAnnotation[],
  callback: (annotations: TextAnnotation[]) => void,
) {
  if (!annotationsChanged(previous, next)) return
  window.setTimeout(() => callback(next), 0)
}

function annotationsChanged(previous: TextAnnotation[], next: TextAnnotation[]): boolean {
  if (previous.length !== next.length) return true
  return next.some((annotation, index) => {
    const prev = previous[index]
    if (!prev || prev.id !== annotation.id) return true
    const nextIsOnlyRuntimeUnresolved = annotation.unresolved === true
      && prev.from === annotation.from
      && prev.to === annotation.to
      && prev.anchorVersion === annotation.anchorVersion
      && prev.lastResolvedAt === annotation.lastResolvedAt
      && prev.blockId === annotation.blockId
      && prev.contextBefore === annotation.contextBefore
      && prev.contextAfter === annotation.contextAfter
      && prev.scope === annotation.scope
      && JSON.stringify(prev.spannedBlockIds ?? []) === JSON.stringify(annotation.spannedBlockIds ?? [])
      && JSON.stringify(prev.spannedBlockMetadata ?? []) === JSON.stringify(annotation.spannedBlockMetadata ?? [])
    if (nextIsOnlyRuntimeUnresolved) return false

    return prev.from !== annotation.from
      || prev.to !== annotation.to
      || prev.unresolved !== annotation.unresolved
      || prev.anchorVersion !== annotation.anchorVersion
      || prev.lastResolvedAt !== annotation.lastResolvedAt
      || prev.blockId !== annotation.blockId
      || prev.contextBefore !== annotation.contextBefore
      || prev.contextAfter !== annotation.contextAfter
      || prev.scope !== annotation.scope
      || JSON.stringify(prev.spannedBlockIds ?? []) !== JSON.stringify(annotation.spannedBlockIds ?? [])
      || JSON.stringify(prev.spannedBlockMetadata ?? []) !== JSON.stringify(annotation.spannedBlockMetadata ?? [])
  })
}

function rangesOverlap(a: TextAnnotation, b: TextAnnotation): boolean {
  if (
    typeof a.from !== 'number'
    || typeof a.to !== 'number'
    || typeof b.from !== 'number'
    || typeof b.to !== 'number'
  ) {
    return false
  }
  return a.from < b.to && b.from < a.to
}

function mapAnnotation(annotation: TextAnnotation, mapping: Mapping): TextAnnotation {
  if (annotation.scope === 'block' || (annotation.scope === 'compound' && typeof annotation.from !== 'number')) {
    return annotation
  }
  if (typeof annotation.from !== 'number' || typeof annotation.to !== 'number') {
    return annotation
  }

  const from = mapping.mapResult(annotation.from, 1)
  const to = mapping.mapResult(annotation.to, -1)
  if (from.deleted && to.deleted) {
    return markUnresolved(annotation)
  }

  const nextFrom = from.pos
  const nextTo = to.pos
  if (nextTo <= nextFrom) {
    return markUnresolved(annotation)
  }

  if (annotation.from === nextFrom && annotation.to === nextTo && annotation.unresolved === false) {
    return annotation
  }

  return {
    ...annotation,
    from: nextFrom,
    to: nextTo,
    unresolved: false,
  }
}

function resolveAnnotations(doc: ProseMirrorNode, annotations: TextAnnotation[]): TextAnnotation[] {
  return annotations.map((annotation) => resolveAnnotation(doc, annotation))
}

function resolveAnnotation(doc: ProseMirrorNode, annotation: TextAnnotation): TextAnnotation {
  if (annotation.scope === 'block' || (annotation.scope === 'compound' && !annotation.selectedText)) {
    return annotation.unresolved === false ? annotation : { ...annotation, unresolved: false }
  }

  const selectedText = annotation.selectedText ?? ''
  if (!selectedText) return markUnresolved(annotation)

  const resolvedRange = resolveAnnotationRange(doc, annotation)
  if (resolvedRange) {
    const relocated = annotation.from !== resolvedRange.from || annotation.to !== resolvedRange.to
    return normalizeAnnotationAnchor(doc, markResolved(annotation, resolvedRange, relocated))
  }

  return markUnresolved(annotation)
}

function markResolved(
  annotation: TextAnnotation,
  range: { from: number; to: number },
  relocated: boolean,
): TextAnnotation {
  const hasAnchorVersion = typeof annotation.anchorVersion === 'number'
  const changed = annotation.from !== range.from
    || annotation.to !== range.to
    || annotation.unresolved !== false
    || !hasAnchorVersion

  if (!changed) return annotation

  return {
    ...annotation,
    ...range,
    unresolved: false,
    anchorVersion: hasAnchorVersion ? annotation.anchorVersion : 1,
    lastResolvedAt: relocated ? Date.now() : annotation.lastResolvedAt,
  }
}

function markUnresolved(annotation: TextAnnotation): TextAnnotation {
  return {
    ...annotation,
    unresolved: true,
    lastResolvedAt: annotation.lastResolvedAt,
  }
}

function createDecorations(doc: ProseMirrorNode, annotations: TextAnnotation[]): DecorationSet {
  const decorations: Decoration[] = []
  for (const annotation of annotations) {
    const from = annotation.from
    const to = annotation.to
    if (
      annotation.unresolved
      || typeof from !== 'number'
      || typeof to !== 'number'
      || from < 0
      || to <= from
      || to > doc.content.size
    ) {
      continue
    }

    decorations.push(Decoration.inline(from, to, {
      class: annotation.kind === 'basis' ? 'tu-tiptap-annotation tu-tiptap-annotation--basis' : 'tu-tiptap-annotation',
      'data-tu-annotation-id': annotation.id,
      style: [
        `--tu-annotation-color:${annotation.color || (annotation.kind === 'basis' ? '#A5D6A7' : '#FFEB3B')}`,
        `background:${annotation.color || (annotation.kind === 'basis' ? '#A5D6A7' : '#FFEB3B')}`,
        annotation.kind === 'basis'
          ? 'box-shadow:0 0 0 2px rgba(76,175,80,0.45)'
          : 'box-shadow:0 0 0 2px rgba(255,193,7,0.55)',
        'cursor:pointer',
        'border-radius:3px',
      ].join(';'),
    }))
  }
  return DecorationSet.create(doc, decorations)
}
