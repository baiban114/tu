import { describe, expect, it } from 'vitest'
import type { PageItem } from '@/api/types'
import type { TocTreeItem } from '@/utils/toc/headings'
import { flattenPageSubtreeForMindmap } from '@/utils/toc/mindmapFromPageSubtreeTree'
import { outlineNodesToTocTree } from '@/utils/toc/outlineNodesToTocTree'

function toc(partial: Partial<TocTreeItem> & Pick<TocTreeItem, 'id' | 'text'>): TocTreeItem {
  return {
    blockId: partial.blockId ?? partial.id,
    level: partial.level ?? 1,
    pos: partial.pos ?? 0,
    sourceType: partial.sourceType ?? 'local',
    ...partial,
  }
}

function page(partial: Partial<PageItem> & Pick<PageItem, 'id' | 'title'>): PageItem {
  return {
    kbId: 'kb1',
    parentId: null,
    order: 0,
    ...partial,
  }
}

describe('flattenPageSubtreeForMindmap', () => {
  it('includes root TOC and nested child pages with toc-only collapse', () => {
    let seq = 0
    const createNodeId = (prefix: string) => `${prefix}-${++seq}`
    const childOutline = [toc({ id: 'c-h1', text: '子页章节', blockId: 'cb1' })]

    const rows = flattenPageSubtreeForMindmap({
      rootPageId: 'p-root',
      rootTitle: '根文档',
      rootToc: [toc({ id: 'h1', text: '第一章', blockId: 'b1' })],
      childPages: [
        page({
          id: 'p-a',
          title: '子文档 A',
          children: [page({ id: 'p-a1', title: '孙文档 A1' })],
        }),
      ],
      getPageOutlineToc: (pageId) => {
        if (pageId === 'p-a') return childOutline
        return []
      },
      createNodeId,
    })

    expect(rows[0]).toMatchObject({
      text: '根文档',
      nodeKind: 'page',
      childrenCollapsed: false,
    })
    expect(rows.find((row) => row.text === '第一章')).toMatchObject({
      nodeKind: 'heading',
      parentId: rows[0].id,
      sourceLocator: 'page:p-root:heading:b1',
    })

    const childPage = rows.find((row) => row.text === '子文档 A')
    expect(childPage).toMatchObject({
      nodeKind: 'page',
      parentId: rows[0].id,
      childrenCollapsed: true,
      collapseMode: 'toc-only',
      sourceLocator: 'page:p-a',
    })

    const grand = rows.find((row) => row.text === '孙文档 A1')
    expect(grand).toMatchObject({
      nodeKind: 'page',
      parentId: childPage!.id,
      childrenCollapsed: false,
      collapseMode: 'toc-only',
    })

    const childHeading = rows.find((row) => row.text === '子页章节')
    expect(childHeading).toMatchObject({
      nodeKind: 'heading',
      parentId: childPage!.id,
      sourceLocator: 'page:p-a:heading:cb1',
    })
  })
})

describe('outlineNodesToTocTree', () => {
  it('builds a heading tree from outline nodes', () => {
    const tree = outlineNodesToTocTree('p1', [
      {
        id: 'n1',
        scopeType: 'page',
        scopeId: 'p1',
        parentId: null,
        title: '第一章',
        sortOrder: 0,
        estimatedHours: null,
        totalEstimatedHours: null,
        sourceBlockId: 'b1',
        level: 1,
      },
      {
        id: 'n2',
        scopeType: 'page',
        scopeId: 'p1',
        parentId: 'n1',
        title: '1.1',
        sortOrder: 1,
        estimatedHours: null,
        totalEstimatedHours: null,
        sourceBlockId: 'b2',
        level: 2,
      },
    ])
    expect(tree).toHaveLength(1)
    expect(tree[0].text).toBe('第一章')
    expect(tree[0].children?.[0]?.text).toBe('1.1')
  })
})
