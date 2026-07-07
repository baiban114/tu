import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { TocCollectContext } from '@/utils/toc/collectFlatTocEntries'
import { collectFlatTocEntries, collectFlatTocEntriesFromHeadingsOnly } from '@/utils/toc/collectFlatTocEntries'
import {
  getCollapsedSectionDecorations,
  isEntryCollapsed,
  isRangeOverlappingSection,
} from '@/utils/toc/tocSections'

export interface HeadingSectionFoldOptions {
  getTocContext: () => TocCollectContext | null | undefined
  getFoldRevision: () => number
}

export const headingSectionFoldKey = new PluginKey('headingSectionFold')

function collectFlatEntries(
  doc: import('@tiptap/pm/model').Node,
  getTocContext: () => TocCollectContext | null | undefined,
) {
  const ctx = getTocContext()
  if (ctx) return collectFlatTocEntries(doc, ctx)
  return collectFlatTocEntriesFromHeadingsOnly(doc)
}

function buildSectionFoldDecorations(
  state: import('@tiptap/pm/state').EditorState,
  getTocContext: () => TocCollectContext | null | undefined,
): DecorationSet {
  const { doc } = state
  const decorations: Decoration[] = []
  const flat = collectFlatEntries(doc, getTocContext)
  const collapsedSections = getCollapsedSectionDecorations(flat, doc, (entry) => isEntryCollapsed(entry, doc))

  doc.forEach((node, offset) => {
    for (const section of collapsedSections) {
      if (!section.contentRange) continue
      if (isRangeOverlappingSection(offset, node.nodeSize, section.contentRange)) {
        decorations.push(
          Decoration.node(offset, offset + node.nodeSize, {
            class: 'heading-section--collapsed',
          }),
        )
        break
      }
    }
  })

  for (const section of collapsedSections) {
    if (!section.collapseEmbedBody || section.embedPos == null) continue
    const embedNode = doc.nodeAt(section.embedPos)
    if (!embedNode) continue
    decorations.push(
      Decoration.node(section.embedPos, section.embedPos + embedNode.nodeSize, {
        class: 'heading-section--collapsed-embed',
      }),
    )
  }

  return DecorationSet.create(doc, decorations)
}

export const HeadingSectionFold = Extension.create<HeadingSectionFoldOptions>({
  name: 'headingSectionFold',

  addOptions() {
    return {
      getTocContext: () => null,
      getFoldRevision: () => 0,
    }
  },

  addProseMirrorPlugins() {
    const extension = this
    return [
      new Plugin({
        key: headingSectionFoldKey,
        props: {
          decorations(state) {
            // Touch revision so ref-section fold state refreshes without a content save.
            void extension.options.getFoldRevision()
            return buildSectionFoldDecorations(state, () => extension.options.getTocContext())
          },
        },
      }),
    ]
  },
})
