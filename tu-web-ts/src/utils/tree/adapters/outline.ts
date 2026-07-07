import type { ContentTreeNode } from '@/api/outline';
import type { PageItem, PageType } from '@/api/types';
import { buildTreeFromFlat } from '../build';
import type { FlatTreeNode, TreeNode } from '../types';

export interface OutlineTreeMeta {
  pageId: string;
  outlineNodeId: string;
  level: number | null;
  sourceType: string | null;
  blockType: string | null;
}

export type PageTreeNodeKind = 'page' | 'outline' | 'outline-placeholder';

/** Page tree row: real page or virtual document-outline node. */
export interface PageTreeDisplayItem extends PageItem {
  nodeKind?: PageTreeNodeKind;
  outlineMeta?: OutlineTreeMeta;
}

export function isOutlinePlaceholderNode(
  node: Pick<PageTreeDisplayItem, 'nodeKind' | 'id'> | null | undefined,
): boolean {
  return node?.nodeKind === 'outline-placeholder' || (node?.id?.startsWith('outline-pending:') ?? false);
}

export function isOutlineTreeNode(
  node: Pick<PageTreeDisplayItem, 'nodeKind' | 'id'> | null | undefined,
): boolean {
  return node?.nodeKind === 'outline' || (node?.id?.startsWith('outline:') ?? false);
}

/** Virtual rows injected under pages (outline headings or load placeholder). */
export function isVirtualPageTreeExtra(
  node: Pick<PageTreeDisplayItem, 'nodeKind' | 'id'> | null | undefined,
): boolean {
  return isOutlineTreeNode(node) || isOutlinePlaceholderNode(node);
}

function createOutlinePlaceholder(page: PageItem, title: string): PageTreeDisplayItem {
  return {
    id: `outline-pending:${page.id}`,
    kbId: page.kbId,
    parentId: page.id,
    title,
    order: 1_000_000,
    nodeKind: 'outline-placeholder',
  };
}

export function isDocumentPage(page: Pick<PageItem, 'pageType'>): boolean {
  return !page.pageType || page.pageType === 'document';
}

export function outlineNodeTreeId(pageId: string, outlineNodeId: string): string {
  return `outline:${pageId}:${outlineNodeId}`;
}

export function contentOutlineToTreeNodes(
  pageId: string,
  nodes: ContentTreeNode[],
): TreeNode<OutlineTreeMeta>[] {
  if (nodes.length === 0) return [];

  const flat: FlatTreeNode<OutlineTreeMeta>[] = nodes.map((node) => ({
    id: outlineNodeTreeId(pageId, node.id),
    parentId: node.parentId ? outlineNodeTreeId(pageId, node.parentId) : null,
    order: node.sortOrder,
    label: node.title?.trim() || '（无标题）',
    meta: {
      pageId,
      outlineNodeId: node.id,
      level: node.level ?? null,
      sourceType: node.sourceType ?? null,
      blockType: node.blockType ?? null,
    },
  }));

  return buildTreeFromFlat(flat);
}

function outlineTreeNodesToPageItems(
  page: PageItem,
  nodes: TreeNode<OutlineTreeMeta>[],
): PageTreeDisplayItem[] {
  return nodes.map((node) => ({
    id: node.id,
    kbId: page.kbId,
    parentId: page.id,
    title: node.label,
    order: 0,
    pageType: undefined as PageType | undefined,
    nodeKind: 'outline' as const,
    outlineMeta: node.meta,
    children: node.children?.length
      ? outlineTreeNodesToPageItems(page, node.children)
      : undefined,
  }));
}

export function mergeDocumentOutlinesIntoPageTree(
  pages: PageItem[],
  options: {
    /** Per-page: whether to inject outline rows under this document page */
    isOutlineExpanded: (pageId: string) => boolean;
    /** undefined = not loaded; [] = loaded empty */
    getOutlineNodes: (pageId: string) => ContentTreeNode[] | undefined;
    isOutlineLoading?: (pageId: string) => boolean;
  },
): PageTreeDisplayItem[] {
  return pages.map((page) => {
    const pageChildren = page.children?.length
      ? mergeDocumentOutlinesIntoPageTree(page.children, options)
      : [];

    let outlineChildren: PageTreeDisplayItem[] = [];
    if (options.isOutlineExpanded(page.id) && isDocumentPage(page)) {
      const nodes = options.getOutlineNodes(page.id);
      if (nodes === undefined) {
        const loading = options.isOutlineLoading?.(page.id) ?? false;
        outlineChildren = [createOutlinePlaceholder(page, loading ? '加载目录…' : '（展开查看目录）')];
      } else if (nodes.length > 0) {
        outlineChildren = outlineTreeNodesToPageItems(
          page,
          contentOutlineToTreeNodes(page.id, nodes),
        );
      }
    }

    const children = [...pageChildren, ...outlineChildren];
    return {
      ...page,
      nodeKind: 'page' as const,
      children: children.length > 0 ? children : undefined,
    };
  });
}
