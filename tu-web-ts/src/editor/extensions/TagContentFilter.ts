import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { BlockTag } from '@/api/types'
import {
  collectFlatTocEntries,
  collectFlatTocEntriesFromHeadingsOnly,
  type TocCollectContext,
} from '@/utils/toc/collectFlatTocEntries'
import { buildTagFilterDecorationSpecs } from '@/utils/tagFilter'
import type { SectionTagsMap, SectionTagAnchor } from '@/utils/sectionMetadata'
import type { TextTagSpan } from '@/api/types'

export interface TagContentFilterOptions {
  getTocContext: () => TocCollectContext | null | undefined
  getSectionTagsMap: () => SectionTagsMap
  getSectionTagAnchors: () => Record<string, SectionTagAnchor>
  getTextTagSpans: () => TextTagSpan[]
  getActiveTagFilter: () => BlockTag | null
  getFilterRevision: () => number
}

export const tagContentFilterKey = new PluginKey<TagContentFilterPluginState>('tagContentFilter')
export const TAG_CONTENT_FILTER_META = 'tagContentFilter'

interface TagContentFilterPluginState {
  revision: number
  decorations: DecorationSet
}

function collectFlatForFilter(
  doc: import('@tiptap/pm/model').Node,
  getTocContext: () => TocCollectContext | null | undefined,
) {
  const ctx = getTocContext()
  if (ctx) return collectFlatTocEntries(doc, ctx)
  return collectFlatTocEntriesFromHeadingsOnly(doc)
}

function buildDecorations(
  state: import('@tiptap/pm/state').EditorState,
  options: TagContentFilterOptions,
): DecorationSet {
  const activeTag = options.getActiveTagFilter()
  if (!activeTag) return DecorationSet.empty

  const { doc } = state
  const flat = collectFlatForFilter(doc, options.getTocContext)
  const specs = buildTagFilterDecorationSpecs(
    doc,
    flat,
    options.getSectionTagsMap(),
    activeTag,
    options.getTextTagSpans(),
    options.getSectionTagAnchors(),
  )

  const decorations = specs.map((spec) => (
    spec.type === 'node'
      ? Decoration.node(spec.from, spec.to, { class: 'tag-filter--hidden' })
      : Decoration.inline(spec.from, spec.to, { class: 'tag-filter--hidden-inline' })
  ))

  return DecorationSet.create(doc, decorations)
}

function buildPluginState(
  state: import('@tiptap/pm/state').EditorState,
  options: TagContentFilterOptions,
  revision: number,
): TagContentFilterPluginState {
  return {
    revision,
    decorations: buildDecorations(state, options),
  }
}

export const TagContentFilter = Extension.create<TagContentFilterOptions>({
  name: 'tagContentFilter',

  addOptions() {
    return {
      getTocContext: () => null,
      getSectionTagsMap: () => ({}),
      getSectionTagAnchors: () => ({}),
      getTextTagSpans: () => [],
      getActiveTagFilter: () => null,
      getFilterRevision: () => 0,
    }
  },

  addProseMirrorPlugins() {
    const extension = this
    return [
      new Plugin<TagContentFilterPluginState>({
        key: tagContentFilterKey,
        state: {
          init: (_, state) => buildPluginState(
            state,
            extension.options,
            extension.options.getFilterRevision(),
          ),
          apply: (tr, previous, _oldState, newState) => {
            const force = Boolean(tr.getMeta(TAG_CONTENT_FILTER_META))
            const revision = extension.options.getFilterRevision()
            if (!tr.docChanged && !force && revision === previous.revision) {
              return previous
            }
            return buildPluginState(newState, extension.options, revision)
          },
        },
        props: {
          decorations(state) {
            void extension.options.getFilterRevision()
            return tagContentFilterKey.getState(state)?.decorations ?? DecorationSet.empty
          },
        },
      }),
    ]
  },
})
