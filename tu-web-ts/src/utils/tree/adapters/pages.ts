import type { PageItem } from '@/api/types';
import { buildTreeFromFlat } from '../build';
import type { FlatTreeNode, TreeNode } from '../types';

export interface PageTreeMeta {
  pageId: string;
  kbId: string;
  parentId: string | null;
  order: number;
}

/** Convert nested PageItem tree to canonical TreeNode forest. */
export function pagesToTreeNodes(pages: PageItem[]): TreeNode<PageTreeMeta>[] {
  const visit = (nodes: PageItem[]): TreeNode<PageTreeMeta>[] => nodes.map((page) => ({
    id: page.id,
    label: page.title,
    ...(page.children?.length ? { children: visit(page.children) } : {}),
    meta: {
      pageId: page.id,
      kbId: page.kbId,
      parentId: page.parentId,
      order: page.order,
    },
  }));

  return visit(pages);
}

/** Convert flat PageItem rows (parentId + order) to TreeNode forest. */
export function flatPagesToTreeNodes(pages: Array<Omit<PageItem, 'children'>>): TreeNode<PageTreeMeta>[] {
  const flat: FlatTreeNode<PageTreeMeta>[] = pages.map((page) => ({
    id: page.id,
    parentId: page.parentId,
    label: page.title,
    order: page.order,
    meta: {
      pageId: page.id,
      kbId: page.kbId,
      parentId: page.parentId,
      order: page.order,
    },
  }));
  return buildTreeFromFlat(flat);
}
