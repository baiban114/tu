import type { KbResourceLink } from '@/api/kbResourceLink'
import type { PageTreeDisplayItem } from '@/utils/tree/adapters/outline'
import { resourceDocumentTreeId } from '@/utils/resourceDocumentContent'

function toResourceNode(
  link: KbResourceLink,
  parentId: string | null,
  index: number,
): PageTreeDisplayItem {
  return {
    id: resourceDocumentTreeId(link.resourceItemId),
    kbId: link.kbId,
    parentId,
    title: link.title || '未命名文档资源',
    order: 1_000_000 + index,
    pageType: 'document',
    nodeKind: 'resource-document',
    resourceMeta: {
      resourceItemId: link.resourceItemId,
      parentPageId: link.parentPageId ?? null,
    },
  }
}

/**
 * Merge KB-linked resource documents into the page tree.
 * - Links without parentPageId → top-level after real pages
 * - Links with parentPageId → children under that page (same hierarchy level as subpages)
 */
export function mergeResourceDocumentsIntoPageTree(
  pages: PageTreeDisplayItem[],
  links: KbResourceLink[],
): PageTreeDisplayItem[] {
  if (!links.length) return pages

  const sorted = [...links].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title),
  )
  const rootLinks = sorted.filter((link) => !link.parentPageId)
  const nestedByParent = new Map<string, KbResourceLink[]>()
  for (const link of sorted) {
    const parentId = link.parentPageId?.trim()
    if (!parentId) continue
    const list = nestedByParent.get(parentId) ?? []
    list.push(link)
    nestedByParent.set(parentId, list)
  }

  const attachNested = (nodes: PageTreeDisplayItem[]): PageTreeDisplayItem[] => (
    nodes.map((node) => {
      const childPages = node.children?.length ? attachNested(node.children) : []
      const nestedLinks = nestedByParent.get(node.id) ?? []
      const resourceChildren = nestedLinks.map((link, index) => toResourceNode(link, node.id, index))
      const children = [...childPages, ...resourceChildren]
      return {
        ...node,
        children: children.length > 0 ? children : undefined,
      }
    })
  )

  const withNested = attachNested(pages)
  const rootNodes = rootLinks.map((link, index) => toResourceNode(link, null, index))
  return [...withNested, ...rootNodes]
}
