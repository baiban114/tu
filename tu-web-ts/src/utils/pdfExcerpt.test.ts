import { describe, expect, it } from 'vitest'
import {
  normalizePdfClipRatio,
  normalizePdfPageRange,
  parsePdfExcerptComment,
  parsePdfExcerptLocator,
  resolvePageRange,
  resolvePdfPageVerticalClip,
  clipAttrsFromVerticalHits,
  serializePdfExcerptComment,
  formatPdfExcerptLocator,
  formatPdfExcerptMetaLabel,
  formatPdfExcerptRangeLabel,
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
      clipTop: 0,
      clipBottom: 1,
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
      clipTop: 0,
      clipBottom: 1,
    }
    const comment = serializePdfExcerptComment(attrs)
    expect(comment).toContain('mode="full"')
    expect(comment).not.toContain('clipTop=')
    const match = comment.match(/<!--tu:pdf-excerpt\s+([^>]+)-->/)
    const parsed = parsePdfExcerptComment(match![1]!)
    expect(parsed?.viewMode).toBe('full')
    expect(parsed?.endPage).toBe(120)
  })

  it('roundtrips sourceHref/sourceLabel for link presentation', () => {
    const attrs = {
      blockId: 'pe-src',
      fileId: 'file-abc',
      fileName: 'book.pdf',
      viewMode: 'full' as const,
      startPage: 1,
      endPage: 1,
      height: 480,
      clipTop: 0,
      clipBottom: 1,
      sourceHref: 'resource:ri-1',
      sourceLabel: '王道网络',
    }
    const comment = serializePdfExcerptComment(attrs)
    expect(comment).toContain('sourceHref="resource:ri-1"')
    expect(comment).toContain('sourceLabel="王道网络"')
    const match = comment.match(/<!--tu:pdf-excerpt\s+([^>]+)-->/)
    expect(parsePdfExcerptComment(match![1]!)).toEqual(attrs)
  })

  it('roundtrips vertical clip ratios', () => {
    const attrs = {
      blockId: 'pe-clip',
      fileId: 'file-abc',
      fileName: 'book.pdf',
      viewMode: 'excerpt' as const,
      startPage: 12,
      endPage: 12,
      height: 480,
      clipTop: 0.2,
      clipBottom: 0.75,
    }
    const comment = serializePdfExcerptComment(attrs)
    expect(comment).toContain('clipTop="0.2"')
    expect(comment).toContain('clipBottom="0.75"')
    const match = comment.match(/<!--tu:pdf-excerpt\s+([^>]+)-->/)
    expect(parsePdfExcerptComment(match![1]!)).toEqual(attrs)
  })

  it('roundtrips notesVisible when enabled', () => {
    const attrs = {
      blockId: 'pe-notes',
      fileId: 'file-abc',
      fileName: 'book.pdf',
      viewMode: 'excerpt' as const,
      startPage: 1,
      endPage: 1,
      height: 480,
      clipTop: 0,
      clipBottom: 1,
      notesVisible: true,
    }
    const comment = serializePdfExcerptComment(attrs)
    expect(comment).toContain('notesVisible="true"')
    const match = comment.match(/<!--tu:pdf-excerpt\s+([^>]+)-->/)
    expect(parsePdfExcerptComment(match![1]!)).toEqual(attrs)
  })

  it('omits notesVisible when false / unset', () => {
    const comment = serializePdfExcerptComment({
      blockId: 'pe-1',
      fileId: 'f1',
      fileName: 'a.pdf',
      viewMode: 'excerpt',
      startPage: 1,
      endPage: 1,
      height: 480,
      clipTop: 0,
      clipBottom: 1,
    })
    expect(comment).not.toContain('notesVisible=')
    const parsed = parsePdfExcerptComment(
      'id="pe-1" fileId="f1" fileName="a.pdf" start="1" end="1" height="480"',
    )
    expect(parsed?.notesVisible).toBeUndefined()
  })

  it('defaults missing clip attrs to full page', () => {
    const parsed = parsePdfExcerptComment(
      'id="pe-1" fileId="f1" fileName="a.pdf" start="1" end="1" height="480"',
    )
    expect(parsed?.clipTop).toBe(0)
    expect(parsed?.clipBottom).toBe(1)
  })

  it('clamps page range to total pages', () => {
    expect(normalizePdfPageRange(0, 99, 10)).toEqual({ startPage: 1, endPage: 10 })
    expect(normalizePdfPageRange(8, 3, 10)).toEqual({ startPage: 8, endPage: 8 })
  })

  it('resolvePageRange returns full document span in full mode', () => {
    expect(resolvePageRange('full', 3, 5, 42)).toEqual({ startPage: 1, endPage: 42 })
    expect(resolvePageRange('excerpt', 3, 5, 42)).toEqual({ startPage: 3, endPage: 5 })
  })

  it('normalizes and resolves per-page vertical clip', () => {
    expect(normalizePdfClipRatio(-1, 2)).toEqual({ clipTop: 0, clipBottom: 1 })
    expect(normalizePdfClipRatio(0.2, 0.8)).toEqual({ clipTop: 0.2, clipBottom: 0.8 })
    expect(resolvePdfPageVerticalClip(3, 3, 5, 0.2, 0.8)).toEqual({ clipTop: 0.2, clipBottom: 1 })
    expect(resolvePdfPageVerticalClip(4, 3, 5, 0.2, 0.8)).toBeNull()
    expect(resolvePdfPageVerticalClip(5, 3, 5, 0.2, 0.8)).toEqual({ clipTop: 0, clipBottom: 0.8 })
    expect(resolvePdfPageVerticalClip(12, 12, 12, 0.1, 0.9)).toEqual({ clipTop: 0.1, clipBottom: 0.9 })
  })

  it('builds clip attrs from vertical drag hits', () => {
    expect(clipAttrsFromVerticalHits(
      { pageNumber: 3, ratio: 0.8 },
      { pageNumber: 3, ratio: 0.2 },
    )).toEqual({ startPage: 3, endPage: 3, clipTop: 0.2, clipBottom: 0.8 })
    expect(clipAttrsFromVerticalHits(
      { pageNumber: 5, ratio: 0.1 },
      { pageNumber: 2, ratio: 0.9 },
    )).toEqual({ startPage: 2, endPage: 5, clipTop: 0.9, clipBottom: 0.1 })
  })

  it('formats range label with page + clip together', () => {
    expect(formatPdfExcerptRangeLabel(12, 12)).toBe('第 12 页')
    expect(formatPdfExcerptRangeLabel(12, 12, 0.2, 0.75)).toBe('第 12 页 20%–75%')
    expect(formatPdfExcerptRangeLabel(3, 5)).toBe('第 3–5 页')
    expect(formatPdfExcerptRangeLabel(3, 5, 0.2, 0.8)).toBe('第 3 页 20% → 第 5 页 80%')
    expect(formatPdfExcerptMetaLabel('book.pdf', 'excerpt', 2, 4, 0.9, 0.1)).toBe(
      'book.pdf · 第 2 页 90% → 第 4 页 10%',
    )
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
