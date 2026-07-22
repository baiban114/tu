import { describe, expect, it, vi } from 'vitest'

vi.mock('@/api/fileStorage', () => ({
  buildFileUrl: (fileId: string) => `/api/files/${fileId}`,
}))

vi.mock('@/utils/pdfDocumentCache', () => ({
  acquirePdfDocument: vi.fn(),
  releasePdfDocument: vi.fn(),
}))

vi.mock('@/utils/pdfOutline', () => ({
  buildPdfSidebarTree: vi.fn(),
}))

import {
  chapterFieldsFromOutlineNode,
  countOutlineNodes,
  resolvePdfLoadUrl,
} from '@/utils/chapterResourceRecognition'
import type { PdfSidebarNode } from '@/utils/pdfOutline'

describe('chapterResourceRecognition', () => {
  it('resolves pdf load url from stored file access address', () => {
    expect(resolvePdfLoadUrl('http://localhost/api/files/file-1#page=3')).toBe('/api/files/file-1')
    expect(resolvePdfLoadUrl('https://cdn.example/a.pdf')).toBe('https://cdn.example/a.pdf')
  })

  it('maps outline node to chapter title/locator', () => {
    expect(chapterFieldsFromOutlineNode({
      id: 'o-1',
      title: '第一章 绪论',
      pageNumber: 12,
      children: [],
    })).toEqual({
      title: '第一章 绪论',
      locator: 'page:12',
    })

    expect(chapterFieldsFromOutlineNode({
      id: 'o-2',
      title: '附录',
      pageNumber: null,
      children: [],
    })).toEqual({
      title: '附录',
      locator: undefined,
    })
  })

  it('counts outline nodes', () => {
    const nodes: PdfSidebarNode[] = [
      {
        id: 'a',
        title: 'A',
        pageNumber: 1,
        children: [
          { id: 'a1', title: 'A1', pageNumber: 2, children: [] },
        ],
      },
      { id: 'b', title: 'B', pageNumber: 3, children: [] },
    ]
    expect(countOutlineNodes(nodes)).toBe(3)
  })
})
