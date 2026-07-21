import { describe, expect, it } from 'vitest'
import type { KbResourceLink } from '@/api/kbResourceLink'
import type { PageTreeDisplayItem } from './outline'
import { isResourceDocumentTreeNode, isVirtualPageTreeExtra } from './outline'
import { mergeResourceDocumentsIntoPageTree } from './resourceDocuments'

const pages: PageTreeDisplayItem[] = [
  {
    id: 'p1',
    kbId: 'kb1',
    parentId: null,
    title: '真实页面',
    order: 0,
    pageType: 'document',
    children: [
      {
        id: 'p1-child',
        kbId: 'kb1',
        parentId: 'p1',
        title: '子页面',
        order: 0,
        pageType: 'document',
      },
    ],
  },
]

function link(partial: Partial<KbResourceLink> & Pick<KbResourceLink, 'resourceItemId' | 'title' | 'sortOrder'>): KbResourceLink {
  return {
    id: `krl-${partial.resourceItemId}`,
    kbId: 'kb1',
    typeId: 'rt-document',
    typeCode: 'document',
    typeName: '文档',
    ...partial,
  }
}

describe('mergeResourceDocumentsIntoPageTree', () => {
  it('appends root-linked resources after pages sorted by sortOrder', () => {
    const merged = mergeResourceDocumentsIntoPageTree(pages, [
      link({ resourceItemId: 'ri-b', title: '文档 B', sortOrder: 2 }),
      link({ resourceItemId: 'ri-a', title: '文档 A', sortOrder: 1 }),
    ])

    expect(merged).toHaveLength(3)
    expect(merged[0].id).toBe('p1')
    expect(merged[1].id).toBe('ri:ri-a')
    expect(merged[1].title).toBe('文档 A')
    expect(merged[2].id).toBe('ri:ri-b')
  })

  it('nests page-linked resources under that page', () => {
    const merged = mergeResourceDocumentsIntoPageTree(pages, [
      link({ resourceItemId: 'ri-nested', title: '挂在页面下', sortOrder: 0, parentPageId: 'p1' }),
    ])

    expect(merged).toHaveLength(1)
    const children = merged[0].children ?? []
    expect(children.map((c) => c.id)).toEqual(['p1-child', 'ri:ri-nested'])
    const nested = children[1] as PageTreeDisplayItem
    expect(isResourceDocumentTreeNode(nested)).toBe(true)
    expect(nested.parentId).toBe('p1')
    expect(nested.resourceMeta?.parentPageId).toBe('p1')
  })

  it('marks resource nodes as virtual resource-document', () => {
    const merged = mergeResourceDocumentsIntoPageTree(pages, [
      link({ resourceItemId: 'ri-1', title: '只读文档', sortOrder: 0 }),
    ])
    const node = merged[1]
    expect(isResourceDocumentTreeNode(node)).toBe(true)
    expect(isVirtualPageTreeExtra(node)).toBe(true)
    expect(node.resourceMeta?.resourceItemId).toBe('ri-1')
    expect(node.nodeKind).toBe('resource-document')
  })

  it('returns pages unchanged when no links', () => {
    expect(mergeResourceDocumentsIntoPageTree(pages, [])).toEqual(pages)
  })
})
