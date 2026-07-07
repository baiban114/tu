import type { Editor } from '@tiptap/core'
import { collectFlatTocEntries, type TocCollectContext } from '@/utils/toc/collectFlatTocEntries'
import type { FlatTocEntry } from '@/utils/toc/headings'

function findLocalHeadingEntry(
  flat: FlatTocEntry[],
  headingPos: number,
  headingBlockId: string,
): FlatTocEntry | null {
  const byPos = flat.find((entry) => entry.sourceType === 'local' && entry.pos === headingPos)
  if (byPos) return byPos

  if (headingBlockId) {
    const byBlockId = flat.find((entry) => (
      entry.sourceType === 'local' && entry.blockId === headingBlockId
    ))
    if (byBlockId) return byBlockId
  }

  return null
}

function findHeadingContextAtSelection(editor: Editor): { pos: number; blockId: string } | null {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name !== 'heading') continue
    return {
      pos: $from.before(depth),
      blockId: String(node.attrs.blockId || ''),
    }
  }
  return null
}

/** Resolve the TOC section entry for the current editor selection (local heading in main document). */
export function resolveSectionEntryAtEditor(
  editor: Editor,
  ctx: TocCollectContext,
): FlatTocEntry | null {
  const heading = findHeadingContextAtSelection(editor)
  if (!heading) return null

  const flat = collectFlatTocEntries(editor.state.doc, ctx)
  return findLocalHeadingEntry(flat, heading.pos, heading.blockId)
}

export function resolveRefGroupSectionEntry(
  editor: Editor,
  ctx: TocCollectContext,
  embedBlockId: string,
): FlatTocEntry | null {
  if (!embedBlockId) return null
  const flat = collectFlatTocEntries(editor.state.doc, ctx)
  return flat.find((entry) => (
    entry.sourceType === 'ref-group' && entry.blockId === embedBlockId
  )) ?? null
}

export function isSelectionInLocalHeading(editor: Editor): boolean {
  return findHeadingContextAtSelection(editor) !== null
}
