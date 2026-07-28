/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isResourceLocatorHref,
  OPEN_CHAPTER_END_PAGE,
  resolvePdfExcerptFromResourceHref,
  resolveResourceChapterPageRange,
} from '@/editor/resourceLinkToPdf'

vi.mock('@/api/externalResource', () => ({
  getResourceItem: vi.fn(),
  listResourceChapters: vi.fn(),
}))

vi.mock('@/utils/accessUrlInsert', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/accessUrlInsert')>()
  return {
    ...actual,
    resolveAccessUrlInsertKind: vi.fn(async (url: string) => {
      if (url.includes('/api/files/') || url.endsWith('.pdf')) return 'pdf'
      return 'externalResource'
    }),
  }
})

import { getResourceItem, listResourceChapters } from '@/api/externalResource'

const pdfItem = {
  id: 'ri-1',
  typeId: 't1',
  typeName: 'document',
  identityFieldKey: 'title',
  identityFieldLabel: '标题',
  title: '书',
  accessUrls: ['/api/files/file-1'],
}

describe('resolveResourceChapterPageRange', () => {
  const chapters = [
    { id: 'c1', parentId: null, locator: 'page:1', sortOrder: 0 },
    { id: 'c1-1', parentId: 'c1', locator: 'page:3', sortOrder: 0 },
    { id: 'c1-2', parentId: 'c1', locator: 'page:8', sortOrder: 1 },
    { id: 'c2', parentId: null, locator: 'page:20', sortOrder: 1 },
    { id: 'c3', parentId: null, locator: 'page:40-55', sortOrder: 2 },
    { id: 'c4', parentId: null, locator: 'page:60', sortOrder: 3 },
  ]

  it('uses explicit pageRange locator when present', () => {
    expect(resolveResourceChapterPageRange(chapters, 'c3')).toEqual({
      startPage: 40,
      endPage: 55,
    })
  })

  it('spans to next sibling start − 1 (includes nested children)', () => {
    expect(resolveResourceChapterPageRange(chapters, 'c1')).toEqual({
      startPage: 1,
      endPage: 19,
    })
    expect(resolveResourceChapterPageRange(chapters, 'c1-1')).toEqual({
      startPage: 3,
      endPage: 7,
    })
  })

  it('uses open end for the last chapter', () => {
    expect(resolveResourceChapterPageRange(chapters, 'c4')).toEqual({
      startPage: 60,
      endPage: OPEN_CHAPTER_END_PAGE,
    })
  })

  it('returns null when chapter or locator is missing', () => {
    expect(resolveResourceChapterPageRange(chapters, 'missing')).toBeNull()
    expect(resolveResourceChapterPageRange(
      [{ id: 'x', parentId: null, locator: 'anchor:a', sortOrder: 0 }],
      'x',
    )).toBeNull()
  })
})

describe('resourceLinkToPdf', () => {
  beforeEach(() => {
    vi.mocked(getResourceItem).mockReset()
    vi.mocked(listResourceChapters).mockReset()
  })

  it('detects resource locator hrefs', () => {
    expect(isResourceLocatorHref('resource:ri-1')).toBe(true)
    expect(isResourceLocatorHref('resource:ri-1#page=3')).toBe(true)
    expect(isResourceLocatorHref('resource:ri-1:chapter:c1')).toBe(true)
    expect(isResourceLocatorHref('https://example.com')).toBe(false)
    expect(isResourceLocatorHref('page:p1')).toBe(false)
  })

  it('resolves PDF excerpt input from resource accessUrls without registering', async () => {
    vi.mocked(getResourceItem).mockResolvedValue({
      id: 'ri-a9f32a2947d24be0a43db8c59b844e76',
      typeId: 't1',
      typeName: 'document',
      identityFieldKey: 'title',
      identityFieldLabel: '标题',
      title: '王道2027计算机网络',
      accessUrls: ['/api/files/file-pdf-1'],
    })

    const result = await resolvePdfExcerptFromResourceHref(
      'resource:ri-a9f32a2947d24be0a43db8c59b844e76',
    )
    expect(result).toMatchObject({
      fileId: 'file-pdf-1',
      fileName: '王道2027计算机网络.pdf',
      viewMode: 'full',
      startPage: 1,
      endPage: 1,
    })
    expect(getResourceItem).toHaveBeenCalledWith('ri-a9f32a2947d24be0a43db8c59b844e76')
  })

  it('maps #page= fragment to excerpt page range', async () => {
    vi.mocked(getResourceItem).mockResolvedValue({
      id: 'ri-1',
      typeId: 't1',
      typeName: 'document',
      identityFieldKey: 'title',
      identityFieldLabel: '标题',
      title: '书',
      accessUrls: ['/api/files/file-1'],
    })

    expect(await resolvePdfExcerptFromResourceHref('resource:ri-1#page=12')).toMatchObject({
      viewMode: 'excerpt',
      startPage: 12,
      endPage: 12,
      clipTop: 0,
      clipBottom: 1,
    })
    expect(await resolvePdfExcerptFromResourceHref('resource:ri-1#page=3-5')).toMatchObject({
      viewMode: 'excerpt',
      startPage: 3,
      endPage: 5,
      clipTop: 0,
      clipBottom: 1,
    })
  })

  it('maps #page=&clip= fragment to excerpt clip ratios', async () => {
    vi.mocked(getResourceItem).mockResolvedValue({
      id: 'ri-1',
      typeId: 't1',
      typeName: 'document',
      identityFieldKey: 'title',
      identityFieldLabel: '标题',
      title: '书',
      accessUrls: ['/api/files/file-1'],
    })

    expect(
      await resolvePdfExcerptFromResourceHref('resource:ri-1#page=12&clip=0.2-0.75'),
    ).toMatchObject({
      viewMode: 'excerpt',
      startPage: 12,
      endPage: 12,
      clipTop: 0.2,
      clipBottom: 0.75,
    })
    expect(
      await resolvePdfExcerptFromResourceHref('resource:ri-1#page=3-5&clip=0.2-0.8'),
    ).toMatchObject({
      viewMode: 'excerpt',
      startPage: 3,
      endPage: 5,
      clipTop: 0.2,
      clipBottom: 0.8,
    })
  })

  it('returns null when resource has no PDF access URL', async () => {
    vi.mocked(getResourceItem).mockResolvedValue({
      id: 'ri-1',
      typeId: 't1',
      typeName: 'web-link',
      identityFieldKey: 'url',
      identityFieldLabel: 'URL',
      title: '外链',
      accessUrls: ['https://example.com'],
    })
    expect(await resolvePdfExcerptFromResourceHref('resource:ri-1')).toBeNull()
  })

  it('maps chapter locator to chapter page span when converting to PDF', async () => {
    vi.mocked(getResourceItem).mockResolvedValue(pdfItem)
    vi.mocked(listResourceChapters).mockResolvedValue([
      {
        id: 'c1',
        resourceItemId: 'ri-1',
        resourceItemTitle: '书',
        parentId: null,
        title: '第1章',
        locator: 'page:1',
        sortOrder: 0,
      },
      {
        id: 'c2',
        resourceItemId: 'ri-1',
        resourceItemTitle: '书',
        parentId: null,
        title: '第2章',
        locator: 'page:20',
        sortOrder: 1,
      },
    ])

    expect(await resolvePdfExcerptFromResourceHref('resource:ri-1:chapter:c1')).toMatchObject({
      viewMode: 'excerpt',
      startPage: 1,
      endPage: 19,
    })
    expect(listResourceChapters).toHaveBeenCalledWith('ri-1')
  })

  it('prefers explicit #page= over chapter inference', async () => {
    vi.mocked(getResourceItem).mockResolvedValue(pdfItem)
    vi.mocked(listResourceChapters).mockResolvedValue([
      {
        id: 'c1',
        resourceItemId: 'ri-1',
        resourceItemTitle: '书',
        parentId: null,
        title: '第1章',
        locator: 'page:1',
        sortOrder: 0,
      },
      {
        id: 'c2',
        resourceItemId: 'ri-1',
        resourceItemTitle: '书',
        parentId: null,
        title: '第2章',
        locator: 'page:20',
        sortOrder: 1,
      },
    ])

    expect(
      await resolvePdfExcerptFromResourceHref('resource:ri-1:chapter:c1#page=3-5'),
    ).toMatchObject({
      viewMode: 'excerpt',
      startPage: 3,
      endPage: 5,
    })
    expect(listResourceChapters).not.toHaveBeenCalled()
  })
})
