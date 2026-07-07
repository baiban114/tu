import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Mapping } from '@tiptap/pm/transform'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import type { TextTagSpan } from '@/api/types'
import { resolveTextTagSpans } from '@/utils/textTagSpanMetadata'

export interface TextTagSpanDecorationsOptions {
  getTextTagSpans: () => TextTagSpan[]
  getRevision: () => number
  onSpansMapped?: (spans: TextTagSpan[]) => void
  onSpanClick?: (spanId: string) => void
}

interface TextTagSpanPluginState {
  spans: TextTagSpan[]
  decorations: DecorationSet
}

export const textTagSpanDecorationsKey = new PluginKey<TextTagSpanPluginState>('textTagSpanDecorations')
export const textTagSpanDecorationsMetaKey = 'textTagSpanDecorations'

function mapTextTagSpan(span: TextTagSpan, mapping: Mapping): TextTagSpan {
  if (typeof span.from !== 'number' || typeof span.to !== 'number') {
    return span
  }

  const from = mapping.mapResult(span.from, 1)
  const to = mapping.mapResult(span.to, -1)
  if (from.deleted && to.deleted) {
    return { ...span, unresolved: true }
  }

  const nextFrom = from.pos
  const nextTo = to.pos
  if (nextTo <= nextFrom) {
    return { ...span, unresolved: true }
  }

  if (span.from === nextFrom && span.to === nextTo && !span.unresolved) {
    return span
  }

  return {
    ...span,
    from: nextFrom,
    to: nextTo,
    unresolved: false,
  }
}

function createDecorations(doc: ProseMirrorNode, spans: TextTagSpan[]): DecorationSet {
  const decorations: Decoration[] = []
  for (const span of spans) {
    if (span.unresolved || typeof span.from !== 'number' || typeof span.to !== 'number') continue
    if (span.to <= span.from || span.tags.length === 0) continue
    const color = span.tags[0]?.color || '#1677ff'
    decorations.push(
      Decoration.inline(span.from, span.to, {
        class: 'tu-text-tag-span',
        'data-tu-text-tag-span-id': span.id,
        style: `--tu-text-tag-color:${color}`,
      }),
    )
  }
  return DecorationSet.create(doc, decorations)
}

function buildPluginState(
  doc: ProseMirrorNode,
  spans: TextTagSpan[],
  onMapped?: (spans: TextTagSpan[]) => void,
  previous?: TextTagSpan[],
): TextTagSpanPluginState {
  const resolved = resolveTextTagSpans(doc, spans)
  if (previous && onMapped && spansChanged(previous, resolved)) {
    window.setTimeout(() => onMapped(resolved), 0)
  }
  return {
    spans: resolved,
    decorations: createDecorations(doc, resolved),
  }
}

function spansChanged(previous: TextTagSpan[], next: TextTagSpan[]): boolean {
  if (previous.length !== next.length) return true
  return next.some((span, index) => {
    const prev = previous[index]
    if (!prev || prev.id !== span.id) return true
    return prev.from !== span.from
      || prev.to !== span.to
      || prev.unresolved !== span.unresolved
      || JSON.stringify(prev.tags) !== JSON.stringify(span.tags)
  })
}

export const TextTagSpanDecorations = Extension.create<TextTagSpanDecorationsOptions>({
  name: 'textTagSpanDecorations',

  addOptions() {
    return {
      getTextTagSpans: () => [],
      getRevision: () => 0,
      onSpanClick: undefined,
    }
  },

  addProseMirrorPlugins() {
    const extension = this
    return [
      new Plugin<TextTagSpanPluginState>({
        key: textTagSpanDecorationsKey,
        state: {
          init: (_, state) => buildPluginState(
            state.doc,
            extension.options.getTextTagSpans(),
            extension.options.onSpansMapped,
          ),
          apply: (tr, previous, _oldState, newState) => {
            const meta = tr.getMeta(textTagSpanDecorationsMetaKey)
            if (meta?.spans) {
              return buildPluginState(
                newState.doc,
                meta.spans,
                extension.options.onSpansMapped,
                previous.spans,
              )
            }

            if (!tr.docChanged) {
              void extension.options.getRevision()
              return previous
            }

            const mapped = previous.spans.map((span) => mapTextTagSpan(span, tr.mapping))
            return buildPluginState(
              newState.doc,
              mapped,
              extension.options.onSpansMapped,
              previous.spans,
            )
          },
        },
        props: {
          decorations(state) {
            void extension.options.getRevision()
            return textTagSpanDecorationsKey.getState(state)?.decorations ?? null
          },
          handleClick: (view: EditorView, _pos: number, event: MouseEvent) => {
            const target = event.target as HTMLElement | null
            const spanEl = target?.closest('[data-tu-text-tag-span-id]') as HTMLElement | null
            const spanId = spanEl?.dataset.tuTextTagSpanId
            if (!spanId || !extension.options.onSpanClick) return false
            extension.options.onSpanClick(spanId)
            return true
          },
        },
      }),
    ]
  },
})
