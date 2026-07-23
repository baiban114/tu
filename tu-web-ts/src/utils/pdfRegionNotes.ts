import type { PdfRegionAnchor, TextAnnotation } from '@/api/types'

/**
 * Remount pdfRegion notes onto a (re)created PDF excerpt block.
 * Identity is `fileId` (stable across PDF↔link conversion); `blockId` is runtime.
 * Notes without fileId that still point at previousBlockId are also remounted.
 */
export function remountPdfRegionNotes(
  annotations: TextAnnotation[],
  input: {
    fileId: string
    newBlockId: string
    previousBlockId?: string
  },
): { annotations: TextAnnotation[]; changed: boolean } {
  const fileId = String(input.fileId || '').trim()
  const newBlockId = String(input.newBlockId || '').trim()
  if (!fileId || !newBlockId) {
    return { annotations, changed: false }
  }
  const previousBlockId = String(input.previousBlockId || '').trim()
  let changed = false
  const next = annotations.map((ann) => {
    if (ann.scope !== 'pdfRegion' || !ann.pdfRegion) return ann
    const region = ann.pdfRegion
    const regionFileId = String(region.fileId || '').trim()
    const regionBlockId = String(region.blockId || '').trim()
    const matchByFile = regionFileId === fileId
    const matchByPrevBlock = !regionFileId && !!previousBlockId && regionBlockId === previousBlockId
    if (!matchByFile && !matchByPrevBlock) return ann
    if (regionBlockId === newBlockId && regionFileId === fileId && ann.blockId === newBlockId) {
      return ann
    }
    changed = true
    const pdfRegion: PdfRegionAnchor = {
      ...region,
      blockId: newBlockId,
      fileId,
    }
    return {
      ...ann,
      blockId: newBlockId,
      pdfRegion,
      updatedAt: Date.now(),
    }
  })
  return { annotations: changed ? next : annotations, changed }
}

/** Collect pdfRegion notes for a PDF block by stable fileId (preferred) or blockId. */
export function collectPdfRegionNotesForBlock(
  annotations: TextAnnotation[],
  input: { blockId: string; fileId: string },
): TextAnnotation[] {
  const blockId = String(input.blockId || '').trim()
  const fileId = String(input.fileId || '').trim()
  const byId = new Map<string, TextAnnotation>()
  for (const ann of annotations) {
    if (ann.scope !== 'pdfRegion' || !ann.pdfRegion) continue
    const regionFileId = String(ann.pdfRegion.fileId || '').trim()
    const regionBlockId = String(ann.pdfRegion.blockId || '').trim()
    const match = (fileId && regionFileId === fileId)
      || (!!blockId && regionBlockId === blockId)
    if (!match) continue
    byId.set(ann.id, ann)
  }
  return [...byId.values()]
}
