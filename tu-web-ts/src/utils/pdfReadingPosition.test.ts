import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PDF_READING_POSITION_TTL_MS,
  clearPdfReadingPosition,
  loadPdfReadingPosition,
  savePdfReadingPosition,
} from './pdfReadingPosition'

function createLocalStorageMock() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear(),
  }
}

describe('pdfReadingPosition', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps reading positions separate by PDF block', () => {
    vi.stubGlobal('localStorage', createLocalStorageMock())
    const now = 1_800_000_000_000

    savePdfReadingPosition({
      blockId: 'pdf-a',
      fileId: 'file-a',
      pageNumber: 7,
      pageOffset: 0.35,
      updatedAt: now,
    }, now)
    savePdfReadingPosition({
      blockId: 'pdf-b',
      fileId: 'file-a',
      pageNumber: 2,
      pageOffset: 0.8,
      updatedAt: now,
    }, now)

    expect(loadPdfReadingPosition('pdf-a', 'file-a', now)).toEqual({
      blockId: 'pdf-a',
      fileId: 'file-a',
      pageNumber: 7,
      pageOffset: 0.35,
      updatedAt: now,
    })
    expect(loadPdfReadingPosition('pdf-b', 'file-a', now)?.pageNumber).toBe(2)
  })

  it('ignores positions from another file or after the TTL', () => {
    vi.stubGlobal('localStorage', createLocalStorageMock())
    const now = 1_800_000_000_000
    savePdfReadingPosition({
      blockId: 'pdf-a',
      fileId: 'old-file',
      pageNumber: 9,
      pageOffset: 0.5,
      updatedAt: now,
    }, now)

    expect(loadPdfReadingPosition('pdf-a', 'new-file', now)).toBeNull()
    expect(loadPdfReadingPosition(
      'pdf-a',
      'old-file',
      now + PDF_READING_POSITION_TTL_MS + 1,
    )).toBeNull()
  })

  it('clears one block without affecting the others', () => {
    vi.stubGlobal('localStorage', createLocalStorageMock())
    const now = 1_800_000_000_000
    for (const blockId of ['pdf-a', 'pdf-b']) {
      savePdfReadingPosition({
        blockId,
        fileId: 'file-a',
        pageNumber: 1,
        pageOffset: 0,
        updatedAt: now,
      }, now)
    }

    clearPdfReadingPosition('pdf-a')

    expect(loadPdfReadingPosition('pdf-a', 'file-a', now)).toBeNull()
    expect(loadPdfReadingPosition('pdf-b', 'file-a', now)).not.toBeNull()
  })
})
