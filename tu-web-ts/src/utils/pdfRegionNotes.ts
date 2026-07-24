import type { PdfRegionAnchor, TextAnnotation } from '@/api/types'
import { formatPdfExcerptRangeLabel } from '@/utils/pdfExcerpt'

export interface PdfRegionGeometry {
  startPage: number
  endPage: number
  clipTop: number
  clipBottom: number
}

/** Normalize region to a 1D interval on the page+ratio axis. */
export function pdfRegionInterval(region: PdfRegionGeometry): { start: number; end: number } {
  const startPage = Math.max(1, Math.floor(Number(region.startPage) || 1))
  const endPage = Math.max(startPage, Math.floor(Number(region.endPage) || startPage))
  const clipTop = Math.min(1, Math.max(0, Number(region.clipTop) || 0))
  const clipBottom = Math.min(1, Math.max(0, Number(region.clipBottom) || 1))
  return {
    start: startPage + clipTop,
    end: endPage + clipBottom,
  }
}

export function pdfRegionsOverlap(a: PdfRegionGeometry, b: PdfRegionGeometry): boolean {
  const left = pdfRegionInterval(a)
  const right = pdfRegionInterval(b)
  return left.start < right.end && right.start < left.end
}

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

/** Filter notes that overlap the current PDF block viewport (full = all pages). */
export function filterNotesOverlappingViewport(
  annotations: TextAnnotation[],
  viewport: PdfRegionGeometry & { viewMode?: 'excerpt' | 'full' },
): TextAnnotation[] {
  if (viewport.viewMode === 'full') return annotations
  return annotations.filter((ann) => {
    const region = ann.pdfRegion
    if (!region) return false
    return pdfRegionsOverlap(region, viewport)
  })
}

export function resourcePdfNoteToAnnotation(
  note: {
    id: string
    resourceItemId: string
    fileId?: string | null
    startPage: number
    endPage: number
    clipTop: number
    clipBottom: number
    note: string
    color?: string | null
    createdAt?: string | number | Date | null
    updatedAt?: string | number | Date | null
  },
  blockId: string,
): TextAnnotation {
  const createdAt = toEpochMs(note.createdAt) || Date.now()
  const updatedAt = toEpochMs(note.updatedAt) || createdAt
  const fileId = String(note.fileId || '').trim()
  return {
    id: note.id,
    selectedText: formatPdfExcerptRangeLabel(
      note.startPage,
      note.endPage,
      note.clipTop,
      note.clipBottom,
    ),
    contextBefore: '',
    contextAfter: '',
    note: note.note,
    color: note.color || '#FFE082',
    createdAt,
    updatedAt,
    blockId,
    scope: 'pdfRegion',
    kind: 'note',
    pdfRegion: {
      blockId,
      fileId: fileId || undefined,
      resourceItemId: note.resourceItemId,
      startPage: note.startPage,
      endPage: note.endPage,
      clipTop: note.clipTop,
      clipBottom: note.clipBottom,
    },
  }
}

function toEpochMs(value: string | number | Date | null | undefined): number {
  if (value == null) return 0
  if (typeof value === 'number') return value
  if (value instanceof Date) return value.getTime()
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : 0
}
