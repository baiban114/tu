import { describe, expect, it } from 'vitest'
import type { TextAnnotation } from '@/api/types'
import { collectPdfRegionNotesForBlock, remountPdfRegionNotes } from '@/utils/pdfRegionNotes'

function note(partial: Partial<TextAnnotation> & { id: string }): TextAnnotation {
  return {
    selectedText: 'range',
    contextBefore: '',
    contextAfter: '',
    note: 'n',
    color: '#FFE082',
    createdAt: 1,
    updatedAt: 1,
    scope: 'pdfRegion',
    kind: 'note',
    ...partial,
  }
}

describe('pdfRegionNotes', () => {
  it('remounts by fileId onto new blockId', () => {
    const annotations = [
      note({
        id: 'a1',
        blockId: 'pe-old',
        pdfRegion: {
          blockId: 'pe-old',
          fileId: 'file-1',
          startPage: 1,
          endPage: 1,
          clipTop: 0.2,
          clipBottom: 0.8,
        },
      }),
      note({
        id: 'a2',
        blockId: 'pe-other',
        pdfRegion: {
          blockId: 'pe-other',
          fileId: 'file-2',
          startPage: 2,
          endPage: 2,
          clipTop: 0,
          clipBottom: 1,
        },
      }),
    ]
    const { annotations: next, changed } = remountPdfRegionNotes(annotations, {
      fileId: 'file-1',
      newBlockId: 'pe-new',
      previousBlockId: 'pe-old',
    })
    expect(changed).toBe(true)
    expect(next[0].pdfRegion?.blockId).toBe('pe-new')
    expect(next[0].pdfRegion?.fileId).toBe('file-1')
    expect(next[0].blockId).toBe('pe-new')
    expect(next[1].pdfRegion?.blockId).toBe('pe-other')
  })

  it('remounts legacy notes without fileId via previousBlockId', () => {
    const annotations = [
      note({
        id: 'legacy',
        blockId: 'pe-old',
        pdfRegion: {
          blockId: 'pe-old',
          startPage: 3,
          endPage: 3,
          clipTop: 0,
          clipBottom: 1,
        },
      }),
    ]
    const { annotations: next, changed } = remountPdfRegionNotes(annotations, {
      fileId: 'file-x',
      newBlockId: 'pe-new',
      previousBlockId: 'pe-old',
    })
    expect(changed).toBe(true)
    expect(next[0].pdfRegion).toMatchObject({
      blockId: 'pe-new',
      fileId: 'file-x',
    })
  })

  it('collects notes by fileId across stale blockId', () => {
    const annotations = [
      note({
        id: 'a1',
        blockId: 'pe-stale',
        pdfRegion: {
          blockId: 'pe-stale',
          fileId: 'file-1',
          startPage: 1,
          endPage: 1,
          clipTop: 0,
          clipBottom: 1,
        },
      }),
    ]
    const found = collectPdfRegionNotesForBlock(annotations, {
      blockId: 'pe-current',
      fileId: 'file-1',
    })
    expect(found.map((a) => a.id)).toEqual(['a1'])
  })
})
