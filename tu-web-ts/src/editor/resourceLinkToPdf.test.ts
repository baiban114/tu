/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isResourceLocatorHref,
  resolvePdfExcerptFromResourceHref,
} from '@/editor/resourceLinkToPdf'

vi.mock('@/api/externalResource', () => ({
  getResourceItem: vi.fn(),
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

import { getResourceItem } from '@/api/externalResource'

describe('resourceLinkToPdf', () => {
  beforeEach(() => {
    vi.mocked(getResourceItem).mockReset()
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
    })
    expect(await resolvePdfExcerptFromResourceHref('resource:ri-1#page=3-5')).toMatchObject({
      viewMode: 'excerpt',
      startPage: 3,
      endPage: 5,
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
})
