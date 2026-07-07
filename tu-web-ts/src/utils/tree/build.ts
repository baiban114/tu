import type { FlatTreeNode, TreeNode } from './types';

function sortFlatNodes<TMeta>(nodes: FlatTreeNode<TMeta>[]): FlatTreeNode<TMeta>[] {
  return [...nodes].sort((a, b) => {
    const orderA = a.order ?? 0;
    const orderB = b.order ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return a.label.localeCompare(b.label, 'zh-CN');
  });
}

/** Build a forest from flat nodes with parentId references. */
export function buildTreeFromFlat<TMeta>(
  flat: FlatTreeNode<TMeta>[],
  rootParentId: string | null = null,
): TreeNode<TMeta>[] {
  const byParent = new Map<string | null, FlatTreeNode<TMeta>[]>();

  for (const node of flat) {
    const parentId = node.parentId ?? null;
    const bucket = byParent.get(parentId) ?? [];
    bucket.push(node);
    byParent.set(parentId, bucket);
  }

  const buildLevel = (parentId: string | null): TreeNode<TMeta>[] => {
    const siblings = sortFlatNodes(byParent.get(parentId) ?? []);
    return siblings.map((entry) => {
      const children = buildLevel(entry.id);
      return {
        id: entry.id,
        label: entry.label,
        meta: entry.meta,
        ...(children.length > 0 ? { children } : {}),
      };
    });
  };

  return buildLevel(rootParentId);
}
