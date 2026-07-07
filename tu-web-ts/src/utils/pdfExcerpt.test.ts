import { describe, expect, it } from 'vitest'
import {
  normalizePdfPageRange,
  parsePdfExcerptComment,
  parsePdfExcerptLocator,
  resolvePageRange,
  serializePdfExcerptComment,
  formatPdfExcerptLocator,
} from './pdfExcerpt'

describe('pdfExcerpt serialization', () => {
  it('roundtrips excerpt comment attrs', () => {
    const attrs = {
      blockId: 'pe-test1',
      fileId: 'file-abc',
      fileName: 'book.pdf',
      viewMode: 'excerpt' as const,
      startPage: 3,
      endPage: 7,
      height: 480,
    }
    const comment = serializePdfExcerptComment(attrs)
    const match = comment.match(/<!--tu:pdf-excerpt\s+([^>]+)-->/)
    expect(match).not.toBeNull()
    const parsed = parsePdfExcerptComment(match![1]!)
    expect(parsed).toEqual(attrs)
  })

  it('roundtrips full mode comment attrs', () => {
    const attrs = {
      blockId: 'pe-test2',
      fileId: 'file-abc',
      fileName: 'book.pdf',
      viewMode: 'full' as const,
      startPage: 1,
      endPage: 120,
      height: 640,
    }
    const comment = serializePdfExcerptComment(attrs)
    expect(comment).toContain('mode="full"')
    const match = comment.match(/<!--tu:pdf-excerpt\s+([^>]+)-->/)
    const parsed = parsePdfExcerptComment(match![1]!)
    expect(parsed?.viewMode).toBe('full')
    expect(parsed?.endPage).toBe(120)
  })

  it('defaults missing mode to excerpt', () => {
    const parsed = parsePdfExcerptComment(
      'id="pe-old" fileId="f1" fileName="a.pdf" start="2" end="4" height="480"',
    )
    expect(parsed?.viewMode).toBe('excerpt')
  })

  it('clamps page range to total pages', () => {
    expect(normalizePdfPageRange(0, 99, 10)).toEqual({ startPage: 1, endPage: 10 })
    expect(normalizePdfPageRange(8, 3, 10)).toEqual({ startPage: 8, endPage: 8 })
  })

  it('resolvePageRange returns full document span in full mode', () => {
    expect(resolvePageRange('full', 3, 5, 42)).toEqual({ startPage: 1, endPage: 42 })
    expect(resolvePageRange('excerpt', 3, 5, 42)).toEqual({ startPage: 3, endPage: 5 })
  })

  it('roundtrips pdf excerpt locator', () => {
    const locator = formatPdfExcerptLocator('page-1', 'pe-abc', 7)
    expect(locator).toBe('page:page-1:block:pe-abc:pdfPage:7')
    expect(parsePdfExcerptLocator(locator)).toEqual({
      pageId: 'page-1',
      blockId: 'pe-abc',
      pdfPage: 7,
    })
  })
})
