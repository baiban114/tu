import { describe, expect, it } from 'vitest'
import {
  buildPdfSidebarTree,
  collectExpandableNodeIds,
  resolveDestPageNumber,
  resolveSidebarNodePage,
  type PdfSidebarNode,
} from './pdfOutline'
import type { PdfDocumentProxy } from './pdfjsSetup'

function mockDoc(options: {
  outline?: unknown[] | null
  destinations?: Record<string, unknown[]>
  pageIndexByRef?: Map<unknown, number>
}): PdfDocumentProxy {
  const pageIndexByRef = options.pageIndexByRef ?? new Map()
  return {
    getOutline: async () => options.outline ?? null,
    getDestination: async (name: string) => options.destinations?.[name] ?? null,
    getPageIndex: async (ref: unknown) => pageIndexByRef.get(ref) ?? 0,
  } as unknown as PdfDocumentProxy
}

describe('pdfOutline', () => {
  it('resolveDestPageNumber resolves named destination', async () => {
    const ref = { num: 1 }
    const doc = mockDoc({
      destinations: { chapter1: [ref, { name: 'XYZ' }, 0, 0] },
      pageIndexByRef: new Map([[ref, 4]]),
    })
    await expect(resolveDestPageNumber(doc, 'chapter1')).resolves.toBe(5)
  })

  it('buildPdfSidebarTree falls back to page list when outline missing', async () => {
    const doc = mockDoc({ outline: null })
    const { nodes, source } = await buildPdfSidebarTree(doc, 2, 4)
    expect(source).toBe('pages')
    expect(nodes).toHaveLength(3)
    expect(nodes[0].title).toBe('第 2 页')
    expect(nodes[2].pageNumber).toBe(4)
  })

  it('buildPdfSidebarTree keeps outline items in excerpt range', async () => {
    const refA = { id: 'a' }
    const refB = { id: 'b' }
    const doc = mockDoc({
      outline: [
        { title: 'Intro', dest: [refA], items: [] },
        { title: 'Chapter', dest: [refB], items: [{ title: 'Section', dest: [refB], items: [] }] },
      ],
      pageIndexByRef: new Map([[refA, 0], [refB, 4]]),
    })
    const { nodes, source } = await buildPdfSidebarTree(doc, 3, 10)
    expect(source).toBe('outline')
    expect(nodes).toHaveLength(1)
    expect(nodes[0].title).toBe('Chapter')
    expect(nodes[0].pageNumber).toBe(5)
  })

  it('resolveSidebarNodePage prefers in-range page on node', () => {
    const node: PdfSidebarNode = {
      id: '1',
      title: 'Part',
      pageNumber: 2,
      children: [{ id: '1-1', title: 'Child', pageNumber: 8, children: [] }],
    }
    expect(resolveSidebarNodePage(node, 3, 10)).toBe(8)
    expect(resolveSidebarNodePage(node, 1, 10)).toBe(2)
  })

  it('collectExpandableNodeIds returns only nodes with children', () => {
    const nodes: PdfSidebarNode[] = [
      {
        id: 'a',
        title: 'A',
        pageNumber: 1,
        children: [
          { id: 'a-1', title: 'A1', pageNumber: 2, children: [] },
        ],
      },
      { id: 'b', title: 'B', pageNumber: 3, children: [] },
    ]
    expect(collectExpandableNodeIds(nodes)).toEqual(['a'])
  })

  it('buildPdfSidebarTree skips huge page list in full mode without outline', async () => {
    const doc = mockDoc({ outline: null })
    const { nodes, source } = await buildPdfSidebarTree(doc, 1, 120, { viewMode: 'full' })
    expect(source).toBe('none')
    expect(nodes).toHaveLength(0)
  })

  it('buildPdfSidebarTree includes all outline items in full mode', async () => {
    const refA = { id: 'a' }
    const doc = mockDoc({
      outline: [{ title: 'Intro', dest: [refA], items: [] }],
      pageIndexByRef: new Map([[refA, 0]]),
    })
    const { nodes, source } = await buildPdfSidebarTree(doc, 1, 100, { viewMode: 'full' })
    expect(source).toBe('outline')
    expect(nodes).toHaveLength(1)
    expect(nodes[0].pageNumber).toBe(1)
  })
})
