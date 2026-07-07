import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { collectFlatTocEntries, type TocCollectContext } from '@/utils/toc/collectFlatTocEntries'
import { iterTocFoldSections } from '@/utils/toc/tocSections'

/** 若光标所在顶格块是 TOC 可折叠节锚点，返回对应 entry id */
export function resolveFoldSectionEntryIdAtPos(
  doc: ProseMirrorNode,
  pos: number,
  ctx: TocCollectContext,
): string | null {
  const resolved = doc.resolve(pos)
  if (resolved.depth < 1) return null
  const topPos = resolved.before(1)
  const flat = collectFlatTocEntries(doc, ctx)
  for (const section of iterTocFoldSections(flat, doc)) {
    if (section.entry.pos === topPos) return section.entry.id
  }
  return null
}
