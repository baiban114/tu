import type { FlattenTreeOptions, FlatTreeEntry, TreeNode } from './types';

/** Flatten nested tree nodes with depth and label path. */
export function flattenTree<TMeta>(
  nodes: TreeNode<TMeta>[],
  options: FlattenTreeOptions = {},
): FlatTreeEntry<TMeta>[] {
  const result: FlatTreeEntry<TMeta>[] = [];

  const visit = (items: TreeNode<TMeta>[], depth: number, pathLabels: string[]) => {
    for (const node of items) {
      const nextPath = options.includePathLabels === false
        ? pathLabels
        : [...pathLabels, node.label];
      result.push({ node, depth, pathLabels: nextPath });
      if (node.children?.length) {
        visit(node.children, depth + 1, nextPath);
      }
    }
  };

  visit(nodes, 0, []);
  return result;
}
